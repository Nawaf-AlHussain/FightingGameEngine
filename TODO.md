# TODO — Fighting Game Engine

## 🎯 PRIMARY GOAL

**Make the Dolmexica engine handle MUGEN 1.0 and MUGEN 1.1 characters reliably.**

Not "exactly like Ikemen GO" — but "characters work correctly without crashes, glitches, or missing features." The engine should handle SFF v1/v2, Cond/IfElse, enemy/partner redirections, and standard MUGEN 1.1 state controllers.

### Current State (as of Aug 10, 2026)

| Metric | Value |
|--------|-------|
| Total characters available | **16** (2 bundled + 14 downloadable) |
| Total stages available | **3** (1 bundled + 3 downloadable) |
| WASM memory | **1.5 GB** (increased from 768MB for large characters) |
| Triggers | ~165+ (Phase 1 + partial Phase 2/3) |
| State controllers | ~100+ (all 91 MUGEN 1.1 + RootVarSet, MapSet, ModifyHitDef, etc.) |
| SFF support | v1.01 + v2.00 + v2.01 (palette links, JUS 32-color) |
| GitHub repos | `Nawaf-AlHussain/FightingGameEngine` (engine) + `FightingGameEngine/Assets` (characters) |
| Deployed on Vercel | ✅ Auto-deploys from main branch |

---

## ✅ ALL FIXES COMPLETED

### Session 1 — Engine Compatibility Fixes (commits cc943d7..e931a5d)

1. ✅ **enemy(n) redirection** — was mapped to numTarget (returned number of targets instead of player reference). Spider-Man's `Cond(AILevel, enemy,statetype != L, ...)` was completely broken.
2. ✅ **IfElse() delegates to Cond()** — was using sscanf on flattened string, failed for any non-trivial expression.
3. ✅ **airjump.neu Y inheritance** — single-number velocity definitions got Y=0, so air jumps had no upward momentum.
4. ✅ **All jump velocity Y inheritance** — jump.back, jump.fwd, airjump.back, airjump.fwd all inherit Y from jump.neu.
5. ✅ **SFF v2 palette links** — palette 272 (used by 188 Goku_UI sprites) linked to palette 222 but the link wasn't followed. Goku_UI was invisible.
6. ✅ **JUS 32-color palettes** — unused palette entries [32..255] stayed transparent. Filled with last valid color.
7. ✅ **Trans alpha clamping** — `alpha = 200-(time*20),256` produced negative alpha when time >= 10, making sprites invisible. Clamped to [0, 256].
8. ✅ **IsHomeTeam semantics** — returned `p->mRootID`, making P2 always the "home team". KoldSpidey auto-activated AI for P2. Fixed to return `mAILevel > 0`.
9. ✅ **airjumpcount trigger** — new trigger exposing `p->mAirJumpCounter`.
10. ✅ **Air jump external input fallback** — `/$U` command not recognized for some characters. Added `getExternalInputButtonSingle` fallback + mJumpFlank bypass after 8 ticks.
11. ✅ **WASM cache-busting** — `build-version.json` + `fetchBuildVersion()` so browser fetches new WASM on rebuild.
12. ✅ **Character cache versioning** — `CACHE_VERSION` bumped to force re-download of character files.

### Phase 1 — Critical Triggers (commit 4d3f0e0, 2a7a78b)

13. ✅ **hitoverridden trigger** — returns 1 if player is in HitOverride state. For armor/counter characters.
14. ✅ **partner(n) redirection** — proper player reference string instead of missing.
15. ✅ **numpartner/numenemy** — real implementation using `getPlayerPartnerCount()` instead of hardcoded 0/1.
16. ✅ **inputtime trigger** — returns ticks since last button press. For charge characters.
17. ✅ **~20 gethitvar sub-keys added** — animtype, airtype, groundtype, damage, hitcount, fallcount, hitshaketime, hittime, slidetime, ctrltime, recovertime, xvel, yvel, yaccel, fall.*, fall.envshake.*
18. ✅ **~30 const sub-keys added** (total 75) — const(data.*), const(size.*), const(movement.*), const(velocity.*)
19. ✅ **isasserted(flag) trigger** — checks AssertSpecial flag state.

### Phase 2 — Variable System (commit 9a63594, 1bbd0c3)

20. ✅ **:= instant-assignment operator** — already worked from initial implementation.
21. ✅ **RootVarSet / RootVarAdd** — clone of ParentVarSet/Add using `getPlayerRoot()`.
22. ✅ **Map system** — `map("name")` trigger + `MapSet`/`MapAdd` sctrls + `mMaps` field on DreamPlayer. [Ikemen extension]
23. ✅ **ParentVarSet/ParentVarAdd** — verified already working.

### Phase 3 — State Controllers (commit 1bbd0c3, bb90a0e)

24. ✅ **ModifyHitDef / ModifyReversalDef** — clone of HitDef/ReversalDef for in-flight modification.
25. ✅ **ModifyProjectile** — registered as no-op stub (needs projectile lookup by ID).
26. ✅ **34 AssertSpecial flag fields** — noairjump, noko, noinput, nojump, nocrouch, nostand, autoguard, etc. Stored and queryable via `isasserted()`.
27. ✅ **38 stagevar sub-keys** — camera.*, stageinfo.*, playerinfo.*, bound.*, shadow.*
28. ✅ **AssertSpecial flag case-insensitivity** — `turnStringLowercase(flag)` before comparison. Characters use "NoWalk", "Noshadow", "Unguardable" etc.
29. ✅ **Per-frame AssertSpecial flag reset** — `updateExtendedAssertFlags()` called every frame to prevent flags from persisting forever.

### Phase 4 — Edge Cases (commit a9a1e31)

30. ✅ **Cond/IfElse short-circuit** — verified only taken branch evaluates, no side effects in unused branch.
31. ✅ **Command parsing (~$D)** — release with don't-care modifier handled correctly.
32. ✅ **Animation system** — animelemtime/animelemno handle loops and out-of-range values.
33. ✅ **Physics/localcoord** — transformDreamCoordinates used consistently.
34. ✅ **HitDef attr parsing** — SCA/NA/AA/SA/AT/HA/AP all parsed correctly.

### Session 2 — Infrastructure & Bug Fixes (commits 67e436d..7b74dc3)

35. ✅ **GitHub account migration** — old account (`nawaf-al-hussain`) suspended. Created new repos: `Nawaf-AlHussain/FightingGameEngine` + `FightingGameEngine/Assets`.
36. ✅ **Manifest auto-update script** — `update-manifest.py` + `.bat` + `.sh` in Assets repo. One-click manifest regeneration.
37. ✅ **Subdirectory injection** — `ACT/pal1.act` files failed to inject because `ACT/` directory didn't exist in WASM MEMFS. Fixed to create parent directories.
38. ✅ **WASM memory increase** — 768MB → 1.5GB. Nightwing (57K assignments, 3K controllers, 21MB SFF) crashed on first frame.
39. ✅ **Missing common1.cns** — CHOUJIN characters (cell, daimaoh, etc.) reference `common1.cns` but don't include it. Engine falls back to `data/common1.cns` which didn't exist. Copied Songoku's common1.cns to `data/`.
40. ✅ **Manifest missing files filter** — `update-manifest.py` now skips files referenced in .def but not present on disk (like common1.cns for shared characters).
41. ✅ **Crash logging** — `tryToUnloadAndReturnToScreenHandling` now logs when called, so silent crashes are visible.

### Session 3 — Standard common1.cns + Assets Updates (commits 15e8a66..3d4b6d5)

42. ✅ **AssertSpecial case-insensitive** — `turnStringLowercase(flag)` before comparison. Characters use "NoWalk", "Noshadow", "Unguardable" etc.
43. ✅ **Per-frame AssertSpecial flag reset** — `updateExtendedAssertFlags()` called every frame to prevent flags from persisting forever.
44. ✅ **Standard MUGEN 1.0 common1.cns** — Replaced Songoku's character-specific `data/common1.cns` with the standard MUGEN 1.0 version. Songoku's version had `Var(0)` checks and `state 9000` (Recovery Roll) which caused daimaoh to get stuck when knocked down. Standard version uses only `SysVar(0)` (MUGEN system variable).
45. ✅ **Assets INSTRUCTIONS.md updated** — Complete rewrite with current URLs, workflow, and common1.cns note.
46. ✅ **Assets script docstrings fixed** — Changed "FightingGameEngine-Assets" to "Assets" throughout.

### Session 4 — P1/P2 Asymmetry Bug Hunt (commits bf0c600, 9fb7592)

47. ✅ **P2 dash sound not playing** — `Mix_AllocateChannels(16)` too small. P2's channels (mapped via `parsePlayerSoundEffectChannel` to 32-62) were out of range, so `Mix_PlayChannel` silently did nothing. Increased to 128.
48. ✅ **Hit sounds playing from wrong player's SND** — `playPlayerHitSound(p, ...)` used `getPlayerSounds(p)` where `p` is the DEFENDER, but `isInPlayerFile=1` in the HitDef means "use the ATTACKER's SND file". When P1 (hitsound=S5,0) hits P2, engine looked up sound 5,0 in P2's SND file → silent or wrong sound. Fixed by adding `tFileOwner` parameter (mirrors `playPlayerHitSpark` signature). Direct parallel to bug #47.
49. ✅ **Projectile hit power lost** — `addPlayerPower(tOtherPlayer, powerUp2)` didn't redirect to root. When P1's fireball hits P2, power was added to projectile's `mPower` (unused, no power bar) instead of P1 root. Fixed to `addPlayerPower(getPlayerRoot(tOtherPlayer), powerUp2)`.
50. ✅ **getPlayerOtherPlayer NULL-fallback** — Returned `getRootPlayer(0)` unconditionally. For P1 with NULL `mOtherPlayer`, returned P1 itself (wrong). Fixed to `getRootPlayer(p->mRootID ^ 1)` to return the OTHER root player. Last remaining instance of the "hardcoded player index 0" bug family.
51. ✅ **4 parallel audits completed** — Audio / Hit / Helper+Projectile+Explod / Trigger subsystems audited for P1/P2 asymmetry. 1 critical + 7 medium + ~25 low findings. Full report in worklog.md (Task IDs AUDIT-AUDIO, AUDIT-HIT, AUDIT-HELPER, AUDIT-TRIGGER).
52. ✅ **Looping sounds persist into next round** — `resetRoundData()` in `gamelogic.cpp` reset players/stage/timer/UI animations between rounds but never called `stopAllSoundEffects()`. SSJ Goku's win pose charging sound (PlaySnd with loop=1) kept playing through the entire next round. `stopKOAndWinAnimation()` only stops UI text animations, not character PlaySnd sounds. Fixed by adding `stopAllSoundEffects()` at the start of `resetRoundData()`.
53. ✅ **Force default palette for both players** — Modified `parsePlayerPreferredPalette()` in `playerdefinition.cpp` to always return the first value from the character's `[info] pal.defaults` key (or 1 if not specified), ignoring any palette number set by `setPlayerPreferredPalette()`. Both P1 and P2 now always use the same default color. Added `getPlayerDefaultPaletteIndex()` helper. Old `getPlayerRandomPaletteIndex()` kept for future re-enable. Commit `53f0e04`.

---

## ⚠️ KNOWN ISSUES

### AssertSpecial Flags NOT Enforced
The 34 new flags are **stored and queryable** via `isasserted()` but are **NOT enforced** in gameplay. Previous attempt to enforce them (checking in updateAirJumping, isPlayerCommandActive, etc.) broke the game because the per-frame reset timing was wrong. Enforcement requires careful implementation following the exact pattern of `mNoWalkFlag` (reset inside the check function itself, not in a batch reset).

**Affected flags**: noairjump, nojump, nocrouch, nostand, noko, noinput, autoguard, nocornerpush, noredlifedamage, etc.

### ModifyProjectile is a No-Op
Registered as a state controller but does nothing. Characters using it for homing projectiles won't get the behavior. Needs projectile lookup by ID.

### ModifyHitDef Replaces Instead of Merging
`modifyHitDefHandleFunction` calls `handleHitDefinition` which REPLACES the entire HitDef. Should only update specified fields. Acceptable for most characters (they specify all fields).

### emsdk Gets Deleted
The Emscripten SDK at `/home/z/emsdk/` gets deleted on environment restarts. The build script auto-detects this and prints an error. Must be reinstalled:
```bash
git clone https://github.com/emscripten-core/emsdk.git /home/z/emsdk
cd /home/z/emsdk && ./emsdk install latest && ./emsdk activate latest
```

### DemoAssets Repo Access
`FightingGameEngine/DemoAssets` — your new GitHub account (`Nawaf-AlHussain`) has read-only access. Need write permission to push manifest updates.

### Deferred P1/P2 Asymmetry Findings (from Session 4 audits)
These were found by the 4 parallel audit agents but NOT fixed (low severity or spec-interpretation questions):

- **p1Name/p2Name POV-relative vs absolute** — MUGEN 1.0 spec says absolute ("Player 1's name"), but Ikemen implements as POV-relative ("the other player"). Kept POV-relative for compat with characters tested against Ikemen.
- **enemy(n) / enemynear(n) ignore index n** — Always returns `getPlayerOtherPlayer(tPlayer)` regardless of n. OK for 1v1; breaks simul/2v2. Fix: iterate `gPlayerDefinition.mAllPlayers`.
- **playerid(n) searches only local subtree** — P1 looking up P2's helper ID → NULL. Spec says global search.
- **Helper/Projectile FRONT/BACK/LEFT/RIGHT postype inverted vs Explod** — `mugenstatecontrollers.cpp:4547-4559` and `:5042-5053`. Reference impl at `mugenexplod.cpp:285-298`. Needs careful testing.
- **Mix_ReserveChannels(64) not called** — Auto-picked sounds (channel=-1) can land on player-reserved channels. One-liner fix.
- **CHANNEL_AMOUNT=64 constant disagrees with Mix_AllocateChannels(128)** — Should be hoisted to shared header to prevent regression.
- **combo trigger returns 0 for projectile hits** — Combo counter incremented on projectile, not root.
- **hitonce=0 not enforced** — HitDef always deactivates after first hit.
- **chainID/noChainID parsed but unused** — Hit chain logic not implemented.
- **HitOverride slot index no bounds check** — `mHitOverrides[8]`, no clamp.
- **getPlayerTargetWithID returns LAST match, not FIRST** — Missing `break` in loop.

Full audit details in `worklog.md` under Task IDs: AUDIT-AUDIO, AUDIT-HIT, AUDIT-HELPER, AUDIT-TRIGGER.

---

## 📚 RESEARCH DOCS

| Doc | What's in it |
|-----|-------------|
| `docs/deep-dives/12-ikemen-triggers-catalog.md` | All ~260 Ikemen triggers with file:line refs |
| `docs/deep-dives/13-ikemen-state-controllers-catalog.md` | All 159 Ikemen sctrls with parameters |
| `docs/deep-dives/14-engine-gap-analysis.md` | Dolmexica vs Ikemen gaps with priority ranking |
| `docs/deep-dives/15-mugen11-compatibility-plan.md` | 10-week phased implementation plan |

---

## 📋 CHARACTER STATUS

| Character | SFF | Status | Notes |
|-----------|-----|--------|-------|
| Songoku | v1 | ✅ Works | Bundled, has own common1.cns |
| Vegeta | v1 | ✅ Works | Bundled, has own common1.cns |
| Goku_UI | v2 | ✅ Works | JUS, palette links, air jumps fixed |
| Spider-Man_SR | v1.01 | ✅ Works | Cond/enemy in CMD, wall cling |
| KoldSpidey | v1.01 | ✅ Works | IsHomeTeam fix prevents auto-move |
| Nightwing | v1 | ✅ Works | Needs 1.5GB memory, ACT/ subfolder |
| Cell | v1 | ✅ Works | Uses data/common1.cns (shared) |
| Piccolo Daimaoh | v1 | ✅ Works | Uses data/common1.cns |
| Dr. Gero | v1 | ✅ Works | Uses data/common1.cns |
| Frieza | v1 | ✅ Works | Uses data/common1.cns |
| Mr. Satan | v1 | ✅ Works | Uses data/common1.cns |
| Piccolo | v1 | ✅ Works | Uses data/common1.cns |
| Son Gohan | v1 | ✅ Works | Uses data/common1.cns |
| Super Goku (SSJ) | v1 | ✅ Works | Uses data/common1.cns |
| Trunks | v1 | ✅ Works | Uses data/common1.cns |
| Savage Hulk | v1 | ✅ Works | Has own common1.cns, 22 files |

### Stages
| Stage | Status | Notes |
|-------|--------|-------|
| UIU Campus Low | ✅ Bundled | Always available |
| DU Campus | ✅ Downloadable | |
| Masjid Al Mustafa | ✅ Downloadable | |
| UIU Fountain | ✅ Downloadable | |

---

## 🔧 BUILD & DEPLOY

### Build Command
```bash
cd /home/z/my-project/fight-engine
source /home/z/emsdk/emsdk_env.sh
bash scripts/build-wasm.sh
```

### Build Verification Checklist
1. Check `.o` timestamps: `ls -la build/wasm/*.o | head -5`
2. If .o files are older than source → **emsdk is missing, reinstall it**
3. Check WASM size changed: `ls -la public/game/game.wasm`
4. Check build-version.json: `cat public/game/build-version.json`

### Deploy
- Push to `Nawaf-AlHussain/FightingGameEngine` main branch
- Vercel auto-deploys
- Hard-refresh browser after deploy (`Ctrl+Shift+R`)

### Asset Updates
- Characters/stages are in `FightingGameEngine/Assets` repo
- Run `update-manifest.bat` (Windows) or `./update-manifest.sh` (Mac/Linux)
- Script auto-generates manifest.json, commits, and pushes
- Purge jsDelivr: `https://purge.jsdelivr.net/gh/FightingGameEngine/Assets@main/manifest.json`
