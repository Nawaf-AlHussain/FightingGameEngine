# HANDOFF.md — Start Here

**Read this file first, every session, regardless of which agent you are.** It's the map. Once
oriented, `TODO.md` has the full itemized fix history (95+ items across many sessions) and
`docs/deep-dives/` has deep technical audits. Don't duplicate effort re-deriving things that are
already documented — but also don't trust any doc (including this one) without spot-checking it
against the actual current source first. That single habit is why this project has made real
progress across agent handoffs instead of going in circles. See Section 4.

---

## 1. PROJECT GOAL

**Make Dolmexica Infinite (this repo's C++ → WebAssembly MUGEN engine) handle standard MUGEN
1.0/1.1 characters correctly in the browser — no freezes, no glitches, no missing features.**
Not "byte-identical to Ikemen GO," but: a character that works in MUGEN 1.1 on Windows should
work here too. Ikemen GO (a complete open-source MUGEN reimplementation in Go) is the reference
for correct behavior whenever this engine's behavior is ambiguous or disputed — "when in doubt,
check what Ikemen does" — though Ikemen's own source isn't currently checked into this repo.

There is a **second, separate track** of this project: `FightingGameEngine-Web`, a from-scratch
port of *Ikemen GO itself* (not Dolmexica) to WebAssembly via Go's native WASM target, on the
`energyjp/ikemen-go-web` upstream fork. That's a different repo — this document is entirely about
the Dolmexica Infinite engine in *this* repo (`Nawaf-AlHussain/FightingGameEngine`). Don't
conflate the two if you're picking up context from elsewhere.

---

## 2. ARCHITECTURE

- **Engine:** C++ → WebAssembly via Emscripten. Source at `engine/DolmexicaInfinite/`.
  - `playerdefinition.cpp` (~5600+ lines) — player state, physics, helpers, projectiles, hit
    resolution (including hitpause, reversal, juggle logic)
  - `mugenanimationhandler.cpp` (`addons/prism/`) — animation/sprite timing system
  - `mugenstatehandler.cpp` — CNS state machine execution (state controller dispatch, persistence,
    hitpause gating)
  - `mugenstatereader.cpp`/`.h` — state file (.cns) parser, defines `DreamMugenStateController`
  - `mugenstatecontrollers.cpp` (~8700+ lines) — every MUGEN state controller's parse + execute
  - `mugenassignmentevaluator.cpp` — every MUGEN trigger/expression
  - `playerhitdata.cpp`/`.h` — HitDef / HitBy / ReversalDef data storage and accessors
  - `ai.cpp` — AI difficulty system (custom, not part of MUGEN spec)
  - `gamelogic.cpp` — round logic, win conditions
  - `addons/prism/` — platform layer: physics, input, sound, and **rendering**
    (`addons/prism/windows/drawing_win.cpp` — the OpenGL/WebGL layer)
- **Frontend:** Next.js 14 + TypeScript. Character select, stage select, game canvas.
- **Assets:** Characters/stages hosted on GitHub (`FightingGameEngine/Assets`), downloaded to
  browser IndexedDB on demand.
- **Deployed:** Vercel, auto-deploys from `main`.

### ⚠️ Critical build fact, easy to forget

**`public/game/game.wasm` / `.data` / `.js` are prebuilt binaries checked into the repo.**
Vercel's build step only runs `next build` (the frontend) — it does **not** recompile the C++
engine. **Every C++ source change in this repo is inert on the live site until someone manually
rebuilds the WASM and commits the new binaries.** Check `public/game/build-version.json` after any
deploy to confirm what's actually live: `curl https://fighting-game-engine.vercel.app/game/build-version.json`.

**Also don't assume a push = a live deploy.** As of this writing, the repo's latest commit
(`556e737`) has build `dev-1787656270` in `public/game/build-version.json`, but the actual live
site at `fighting-game-engine.vercel.app/game/build-version.json` was still serving
`dev-1787635702` (an *older* build, several commits back — still has the `GL_CONSTANT_ALPHA`
black-rectangle bug this repo has since fixed). Whoever picks this up next: check the live
`build-version.json` against the repo's before trusting that anything described as "fixed" here is
actually what a user testing the live site will see, and check the Vercel dashboard/deploy logs if
they don't match — this needs a human with Vercel access to investigate, it's not something fixable
from source.

---

## 3. HOW TO BUILD AND TEST

```bash
# Install emsdk — DELETED ON EVERY ENVIRONMENT RESTART, reinstall every session
git clone https://github.com/emscripten-core/emsdk.git /home/z/emsdk
cd /home/z/emsdk && ./emsdk install latest && ./emsdk activate latest

# Pre-download ports — Python's urllib is flaky/rate-limited (HTTP 429). Use curl.
mkdir -p /home/z/emsdk/upstream/emscripten/cache/ports
cd /home/z/emsdk/upstream/emscripten/cache/ports
curl -sL -o zlib.tar.gz       "https://github.com/madler/zlib/archive/refs/tags/v1.3.2.tar.gz"
curl -sL -o harfbuzz.tar.xz   "https://github.com/harfbuzz/harfbuzz/releases/download/3.2.0/harfbuzz-3.2.0.tar.xz"
curl -sL -o sdl2.zip          "https://github.com/libsdl-org/SDL/archive/release-2.32.10.zip"
curl -sL -o sdl2_image.zip    "https://github.com/libsdl-org/SDL_image/archive/refs/tags/release-2.6.0.zip"
curl -sL -o sdl2_mixer.zip    "https://github.com/libsdl-org/SDL_mixer/archive/release-2.8.0.zip"
curl -sL -o sdl2_ttf.zip      "https://github.com/libsdl-org/SDL_ttf/archive/release-2.20.2.zip"
curl -sL -o ogg.zip           "https://github.com/xiph/ogg/releases/download/v1.3.5/libogg-1.3.5.zip"
curl -sL -o vorbis.zip        "https://github.com/xiph/vorbis/releases/download/v1.3.7/libvorbis-1.3.7.zip"
curl -sL -o freetype.zip      "https://github.com/freetype/freetype/archive/VER-2-13-3.zip"

cd /home/z/emsdk/upstream/emscripten
python3 ./embuilder.py build zlib harfbuzz sdl2 sdl2_image sdl2_mixer sdl2_ttf ogg vorbis freetype

# Build WASM (3-5 min). Use nohup if your session has a command timeout.
cd /home/z/my-project/fight-engine   # or wherever this repo is checked out
nohup bash scripts/build-wasm.sh > /tmp/build.log 2>&1 &
sleep 200; tail -30 /tmp/build.log
```

**Testing checklist — do not skip characters, this has bitten every session so far:**
1. Friction — walk, stop, turn. Should feel normal, not like wading through mud.
2. An `ignorehitpause=1` armor/counter character — should actually act mid-hitstop, not freeze.
3. Tien or Vegetto's charge move — should be visible (glowing aura), not invisible or a black
   rectangle over the character.
4. A character with a `ReversalDef`-based parry/counter — power meter should build on a landed
   reversal.
5. Cooler's back dash — check if it still gets stuck (animation-time fix status is unverified,
   see Section 5).
6. **Regression pass on 2-3 unrelated characters** (Songoku, Vegeta, Cell are commonly used) —
   jumps, normal attacks, blocking. Every single-issue fix in this project's history has had a
   real chance of breaking something else; this step is not optional.

Commit the new `game.wasm`/`game.data`/`game.js`/`build-version.json`, push, then verify:
`curl https://fighting-game-engine.vercel.app/game/build-version.json`.

---

## 4. ⚠️ READ THIS BEFORE TOUCHING GIT — LESSON FROM THIS PROJECT'S HISTORY

This repo's `main` branch got force-pushed to a **single orphan commit** at one point (all
history collapsed, presumably from a squash/re-init in some session), and a different agent's
local clone — still holding the *real*, older, multi-commit history — got force-pushed back over
that later, silently discarding several hours of a different agent's committed-and-pushed work in
the process. Neither agent noticed until a third session compared timestamps and commit ancestry
and found the two histories had **zero common ancestor**.

**Rules to actually prevent a repeat:**
- **Never `git push --force` to `main`**, full stop, no exceptions "just this once."
- **Before starting work, verify your local checkout actually matches `origin/main`** —
  `git fetch origin && git log --oneline -5 origin/main` and eyeball it against what you're about
  to build on. Don't assume a clone you made is current, and don't assume a clone someone handed
  you (or that a prior handoff doc describes) is complete — check `git rev-list --count` and the
  root commit (`git log --max-parents=0`) if anything looks suspicious. A repo with a suspiciously
  short history or an unfamiliar root commit is a sign something got squashed or reset.
- **A prior handoff document's description of "current state" can be stale or simply wrong** —
  always verify specific claims (a bug is/isn't fixed, a commit is/isn't on `main`) against the
  actual source or actual git log, not the document's prose. This document included: don't take
  Section 5 below on faith either.
- If you ever do find two divergent histories, don't just force-push one over the other. Diff the
  trees, figure out what's unique to each side, and reconcile deliberately (cherry-pick, not
  discard) — exactly like was eventually done to recover the fixes described in Section 5.

---

## 5. CURRENT STATE OF FIXES (as of this handoff)

Full itemized history (95+ fixes, sessions 1 through the present) is in `TODO.md`. High-signal
summary of what's happened most recently and what its *verification status* actually is —
verification status is the part every prior handoff has been weakest on, so it's called out
explicitly here:

| Fix | Status | Verified how |
|---|---|---|
| Friction 6x too fast (`stand.friction`/`crouch.friction` inverted) | ✅ Fixed | Source-traced against `physics.cpp`'s actual drag-coefficient math. **Not yet visually tested in a build.** |
| `ignorehitpause` (was entirely unimplemented) | ✅ Fixed | Source-traced, only-caller-of-the-pause-API verified. **Not yet visually tested in a build.** |
| Helper variables inheriting parent's var/sysvar/fvar | ✅ Fixed | Confirmed via `clonePlayerAsHelper`'s struct-copy semantics. **Not yet visually tested.** |
| `ReversalDef` grants no power | ✅ Fixed | Implemented `damage`/`getpower`/`givepower` CNS parsing + application, matching HitDef's existing pattern. **Not yet tested at all — this is the newest fix, treat it with the most suspicion.** |
| Animation time off-by-one (Cooler back-dash freeze) | ⚠️ Partially addressed | A narrower patch than the full 0-indexed rewrite this problem really needs (see the "correct fix" description in `docs/deep-dives/` and old worklog entries) — keeps the animation element alive past its nominal duration instead of unloading it, letting `animelemtime` reach values it couldn't before. Debug-log-verified against Cooler specifically. **No evidence it's been regression-tested against other characters' jump/attack animations, which is exactly the failure mode this kind of patch has broken before.** Test this specifically before trusting it. |
| Tien/Vegetto charge additive blend (A1) invisible/wrong | ✅ Fixed, simplified | Went through `GL_DST_ALPHA` (invisible) → `GL_ONE` (visible, but reported as still not working) → `GL_CONSTANT_ALPHA` + `glBlendColor` (theoretically correct A1 semantics, but empirically caused a black rectangle over every sprite's transparent quad padding — a real structural limit of fixed-function blending, not a state-leak bug) → back to `GL_ONE` (final: correct visibility, no artifact, A and A1 render identically — an accepted, minor simplification). **Not yet visually re-verified after the final revert.** See the commit message on `ae780e5` for the full mechanism. |
| HitOverride ignored when HitDef sets `p2stateno` (armor characters getting thrown) | ✅ Fixed | In `setPlayerHitStatesPlayer()` (`playerdefinition.cpp`), the `tHasMatchingHitOverride` check was nested inside the `p2stateno == -1` branch, so a throw's `p2stateno` redirect bypassed HitOverride entirely. Fixed by checking `tHasMatchingHitOverride` first, unconditionally, before the `p2stateno == -1` / `p2getp1state` / plain-`p2stateno` branches. `setPlayerHitStatesNonPlayer()` (helpers/projectiles) was already correct and untouched — note it doesn't handle `p2stateno` for helpers at all, a possible separate gap, not investigated. **Source-traced only — this is the newest fix, not built or run at all yet. Test specifically: an armor/counter character with a HitOverride against a throw-type attack.** |
| OOB read after animation end (`mStep` growing unbounded past the animation's step count) | ✅ Fixed | Root cause: `loadNextStepAndReturnIfShouldBeRemoved`'s non-looping "keep alive" branch (added by the animelemtime fix above) only matched `mStep == vector_size(...)` on the *first* overrun; every later call to this function (which keeps happening — that's the whole point of "kept alive") incremented `mStep` again with nothing to catch it, so it grew by 1 forever, unbounded, for as long as the finished animation stayed alive. Two call sites (`getMugenAnimationElementFromTimeOffset` and its `...Loop` helper) read `e->mStep` directly via `vector_get()` with **no** clamping — unlike `getCurrentAnimationStep()`'s safe `min(mStep, count-1)` read — so this was a real out-of-bounds memory read once an animation had been finished for more than an instant, not just a theoretical one. Fixed by pinning `mStep` at the last valid index every time instead of leaving it to drift, and changed the guard from `==` to `>=` for defense in depth. **Source-traced only, not built or run.** |

**None of the above has ever been built and tested all together in one pass.** Do that before
trusting any of it further, per the checklist in Section 3.

---

## 6. WHAT'S NEXT, IN PRIORITY ORDER

1. **Build and run the full regression checklist in Section 3.** Nothing below this matters if
   the current fixes haven't actually been verified to work (and not break other things) together.
2. ~~HitOverride + p2stateno logic wrong~~ — **Fixed in source this session, see Section 5. Not yet
   built or tested — verifying this (armor/counter character with a HitOverride vs. a throw) should
   be part of the Section 3 regression pass, not a separate task.**
3. ~~OOB read after animation end~~ — **Fixed in source this session, see Section 5.** Root cause
   was `mStep` drifting unbounded past the step-vector size once a finished animation is kept
   alive (needed for the animelemtime fix), read without clamping at two call sites. Not yet
   built or tested — add to the Section 3 regression pass: a character whose animation finishes
   and sits idle for a while, then check `AnimElemNo`/backward-offset triggers still behave.
4. **Animation time system — the real fix.** The current patch (Section 5) is a narrower, less
   risky change than the full rewrite this problem actually calls for. The full fix means making
   `mOverallTime` genuinely 0-indexed (matching Ikemen), which touches
   `startNewAnimationWithStartStep`, `getTimeWhenStepStarts`, `getTimeFromMugenAnimationElement`,
   `getMugenAnimationRemainingAnimationTime`, and `getMugenAnimationTime` together, as one unit —
   **not incrementally**. This exact area has broken other characters on *every* previous
   incremental attempt across this project's history. Give it a dedicated session with real
   regression testing (multiple characters' jumps/attacks/animelemtime-based combos), not a quick
   patch between other tasks.
5. **34 AssertSpecial flags** — stored and queryable via `isasserted()`, but not enforced (nothing
   actually reads them to change behavior, e.g. the `invisible` flag doesn't make anything
   invisible). Needs per-flag enforcement, likely spread across rendering, hit detection, and
   physics depending on the flag.
6. Medium/low items in `TODO.md`'s "Known Issues" section — `facep2` unapplied, physics-before-
   controllers ordering, `ModifyProjectile` no-op, missing `ChangeAnim` params, no
   `looptime`/`prelooptime`, no `animatehitpause` flag, etc. Lower urgency, check `TODO.md` for
   the current list before starting any of these (it may have grown or shrunk since this was
   written).

---

## 7. KEY FILES TO READ, IN ORDER

1. **This file.**
2. `TODO.md` — full itemized fix history + current "Known Issues" list. Check its date/session
   count against what you'd expect; if it looks stale relative to `git log`, something's
   inconsistent and worth investigating before proceeding (see Section 4).
3. `docs/deep-dives/14-engine-gap-analysis.md` and `15-mugen11-compatibility-plan.md` — most
   recent comprehensive trigger/state-controller gap audits.
4. `engine/DolmexicaInfinite/addons/prism/mugenanimationhandler.cpp` — animation system, relevant
   to items #3/#4 in Section 6.
5. `engine/DolmexicaInfinite/playerdefinition.cpp` — player physics, helpers, hit/reversal
   resolution.
6. `engine/DolmexicaInfinite/mugenstatehandler.cpp` — state machine execution, hitpause gating.
7. `PROGRESS.md` — session-by-session narrative log, useful for historical context but treat dates/
   claims the same way as any other doc: verify before relying on them.

---

## 8. STANDING RULES

- Never `git push --force` to `main` (Section 4 explains why this matters more than it sounds).
- Verify claims — this document's, `TODO.md`'s, or your own reasoning — against actual source
  before building on them, especially for anything touching hitpause, animation timing, or blend
  state, all of which have a history of "looks right, isn't" in this codebase.
- Test multiple characters, not just the one you're fixing. Every regression in this project's
  history came from skipping this.
- The Edit tool in some environments silently converts tabs to 8-space sequences on files that
  use tabs (this codebase does). Verify with `git diff` before committing; use Python
  string-replace or `sed` if you hit this.
- `emsdk` gets deleted on environment restarts — expect to reinstall it every session.
- Always verify a deploy actually landed via `build-version.json` rather than assuming a push
  succeeded and Vercel picked it up.

---

## 9. CONTACT

- **User:** Nawaf Al-Hussain
- **GitHub:** `github.com/Nawaf-AlHussain/FightingGameEngine`
- **Deployed:** `fighting-game-engine.vercel.app`
- **Character Assets repo:** `github.com/FightingGameEngine/Assets`
