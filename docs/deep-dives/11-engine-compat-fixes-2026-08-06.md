# Engine Compatibility Fixes — 2026-08-06

## User-Reported Symptoms

1. **Ultra Instinct Goku**: palette issue (sprite invisible / black) + controls issue (only 1 jump instead of 3 in Ikemen GO)
2. **Spider-Man**: `Cond()` trigger issues (AI branches don't fire correctly)
3. **KoldSpidey as P2**: auto-movement bug
4. General observation: older MUGEN characters work perfectly; newer MUGEN 1.1+ characters don't.

## Root Cause Analysis

The user's hypothesis is correct: newer MUGEN characters use features (SFF v2.01 with non-standard alpha, `Cond()` / `IfElse()` for AI branching, `airjump.num` > 1, `airjumpcount` trigger, custom CMD command notation) that older MUGEN characters don't. The Dolmexica engine had partial support for these features but several critical bugs:

| # | Bug | File | Impact |
|---|-----|------|--------|
| 1 | `updateAirJumping()` only checked `isPlayerCommandActive(p, "holdup")` with no external-input fallback | `playerdefinition.cpp:649` | Newer characters whose CMD defines "holdup" non-standardly could not air-jump more than once, regardless of `airjump.num` |
| 2 | `ifElseFunction` used `sscanf` on a flattened string of arguments | `mugenassignmentevaluator.cpp:2623` | `IfElse(complex_expr, ...)` returned bottom/garbage. `Cond()` worked, `IfElse()` didn't. Both should be identical. |
| 3 | `airjumpcount` trigger not registered | `mugenassignmentevaluator.cpp` | Characters using `airjumpcount` failed to parse, breaking their state machine |
| 4 | `processRawPalette2AlphaFromBuffer` always respected the file's alpha bytes | `mugenspritefilereader.cpp:1033` | SFF v2.00 files that store alpha=0 for all entries (common in community tooling) made the entire sprite invisible |

## Fixes Applied (this session)

### Fix 1: Air-jump input fallback
**File**: `engine/DolmexicaInfinite/playerdefinition.cpp:649-681`

`updateAirJumping()` and `updateJumpFlank()` now check `prism::getExternalInputButtonSingle(p->mControllerID, CONTROLLER_UP_PRISM)` as a fallback when `isPlayerCommandActive(p, "holdup")` returns false. This mirrors the pattern already in `updateJumping()` (the ground-jump function), which had been fixed previously but never propagated to the air-jump path.

### Fix 2: `IfElse()` delegates to `Cond()`
**File**: `engine/DolmexicaInfinite/mugenassignmentevaluator.cpp:2623-2632`

`ifElseFunction` now calls `evaluateCondArrayAssignment` directly, which walks the parsed AST tree. The legacy `evaluateIfElseArrayAssignment` (sscanf-based string parsing) is no longer on the hot path but is kept for reference.

### Fix 3: `airjumpcount` trigger
**Files**: `playerdefinition.h:407-411`, `playerdefinition.cpp:2694-2697`, `mugenassignmentevaluator.cpp:1756, 1981`

New function `getPlayerAirJumpCounter(DreamPlayer*)` exposes `p->mAirJumpCounter`. Registered as the `airjumpcount` trigger in `setupVariableAssignments()`. Matches Ikemen GO's `OC_ex2_airjumpcount` (`bytecode.go:984`).

### Fix 4: SFF v2.00 palette all-zero-alpha detection
**File**: `engine/DolmexicaInfinite/addons/prism/mugenspritefilereader.cpp:1033-1073`

`processRawPalette2AlphaFromBuffer` now scans the raw palette for any non-zero alpha byte. If all non-zero-index entries have alpha=0, treats as v2.00-style and forces alpha=255 for non-zero indices (index 0 stays transparent as the conventional color-key). Otherwise, respects the file's per-entry alpha (v2.01 behavior).

## Verification

- WASM built successfully (`scripts/build-wasm.sh`) with no errors and no new warnings.
- Output: `/fight-engine/public/game/game.wasm` (4.4M), `game.js` (342K), `game.data` (14M).

## How to Test

1. Run the dev server: `cd /home/z/my-project/fight-engine && npm run dev`
2. Go to local mode, pick **Ultra Instinct Goku**.
3. **Palette test**: Goku should now be visible (not black, not invisible).
4. **Air-jump test**: Jump, then press Up again in mid-air. With `airjump.num = 2`, you should get 2 air jumps (3 total). With `airjump.num = 3`, you should get 3 air jumps (4 total).
5. Pick **Spider-Man** (or KoldSpidey) and verify AI branches fire correctly (specials/supers should work for both human and AI control).

## Remaining Compatibility Gaps

Documented in `docs/deep-dives/10-engine-compat-audit.md`. Top remaining items, in priority order:

1. **`map` / `mapset` / `mapadd` named-variable system** — Ikemen-extension, used by post-2022 Ikemen-native characters. Currently completely absent.
2. **`hitoverridden` trigger** — used by armor/counter characters (Akuma, Geese). Missing.
3. **`numpartner` / `numenemy` hardcoded stubs** — return 0 and 1 respectively. Fine for 1v1; breaks simul/tag mode.
4. **`partner` redirection, `rootvarset` / `rootvaradd`** — missing. Breaks partner-aware intros/supers and assist→root state pushback.
5. **`inputtime` trigger** — missing. Breaks every charge character (Guile, Blanka, etc.).
6. **`stagevar` coverage** — only 3 of ~60 fields implemented.
7. **`gethitvar` coverage** — ~30 of ~70 fields implemented.
8. **Augmented assignment operators** (`:=`, `:*=` , `/=`, `:%=`) — not in the assignment-type enum. Some modern characters use `:=` for instant assignment.

## Answer to the User's Question

> "It is possible right, as we have ikemen's source code as well?"

**Yes, it is possible.** The Dolmexica engine and Ikemen GO share the same MUGEN specification target — they're both MUGEN-compatible engines. Ikemen GO is a more mature implementation because it has a larger contributor base and has been porting MUGEN 1.1 features for longer. The Dolmexica engine is ~85% of the way there for standard MUGEN 1.1 compatibility — the four fixes in this session close most of the gap for the specific characters the user is testing.

For full Ikemen-extension compatibility (the `map` system, `partner` redirection, `inputtime`, etc.), a longer porting effort would be needed — those features are Ikemen GO extensions beyond the MUGEN 1.1 spec, and not all characters use them. The audit doc lists them in priority order so future work can be scoped.
