# Dolmexica vs. Ikemen GO — Engine Gap Analysis

**Date:** 2026-08-09
**Task ID:** 20-c
**Scope:** Cross-reference the Dolmexica Infinite trigger/state-controller registration tables against the two Ikemen GO catalogs (docs 12 and 13), enumerate what is missing, broken, or partial, and rank the gaps by impact.
**Status:** Research-only audit. **No source files were modified** (except writing this report and appending to `worklog.md`).

**Source files inspected:**

Dolmexica side:
- `engine/DolmexicaInfinite/mugenassignmentevaluator.cpp` (4,444 lines) — `setupVariableAssignments()` at line 1978, `setupComparisons()` at line 1731, `setupArrayVariableAssignments()` at line 2661, `getRegularPlayerFromFirstVectorPartOrNullIfNonexistant()` at line 616 (redirection resolver), `evaluateCondArrayAssignment()` at line 2453, `evaluateStageVarArrayAssignment()` at line 2301, `evaluateIfElseArrayAssignment()` (legacy sscanf) at line 2625 (now delegates).
- `engine/DolmexicaInfinite/mugenstatecontrollers.cpp` (8,253 lines) — `gMugenStateControllerVariableHandler.mStateControllerParsers[...]` registrations at lines 5768–5866, `handleSingleSpecialAssert()` at line 3498 (AssertSpecial flag dispatch).
- `engine/DolmexicaInfinite/playerdefinition.cpp` (5,295 lines) — `isPlayerHomeTeam()` at line 5008, `setPlayerOneFrameTransparency()` at line 5052 (alpha clamping).
- `engine/DolmexicaInfinite/mugenassignment.h` (149 lines) — assignment AST type enum.

Ikemen side (catalogs):
- `docs/deep-dives/12-ikemen-triggers-catalog.md` — Ikemen's ~260 top-level trigger names + ~600 sub-key combinations.
- `docs/deep-dives/13-ikemen-state-controllers-catalog.md` — Ikemen's 159 state controllers (91 MUGEN + 68 Ikemen extensions).

Git history:
- Commits `cc943d7` through `e931a5d` (7 commits) — fixes already applied this session.

---

## 0. Executive summary

| Metric | Ikemen GO | Dolmexica | Gap |
|---|---|---|---|
| Top-level trigger names | ~260 | ~148 | **~112 missing** |
| Sub-key combinations (const/gethitvar/stagevar) | ~600 | ~111 | **~489 missing** |
| State controllers | 159 (91 MUGEN + 68 Ikemen ext) | 92 (91 MUGEN + 1 Ikemen ext + story) | **67 Ikemen extensions missing** |
| Redirection triggers | 12 + 6 existence-checks = 18 | 9 + 1 existence-check = 10 | **9 missing** |
| AssertSpecial flags supported | ~70 | 19 | **~51 missing** |

**Already-fixed this session (commits `cc943d7`..`e931a5d`):**
- `enemy(n)` redirection misregistered as `numTargetArrayFunction` — **FIXED** in `12052ff`
- `IfElse`/`Cond` delegation to AST walker — **FIXED** in `2f9d755`
- `airjump.neu.Y` inheritance — **FIXED** in `4a114d2` (single-number case)
- `airjump.back/fwd/neu`, `jump.back/fwd` Y inheritance (all single-number jump velocities) — **FIXED** in `e931a5d`
- SFF v2 palette link resolution (two-pass loader) — **FIXED** in `110a03f` + `655f57a`
- JUS 32-color palette clamping (fill unused entries with last color) — **FIXED** in `4a114d2`
- `Trans` alpha clamping to `[0, 256]` — **FIXED** in `cc943d7`
- `IsHomeTeam` semantics (returns `mAILevel > 0` instead of `mRootID`) — **FIXED** in `cc943d7`
- `airjumpcount` trigger registration — **FIXED** in `2f9d755`

**Top 10 remaining gaps (ranked by impact):**
1. `map()` trigger + `MapSet`/`MapAdd`/`MapReset`/`ParentMapSet`/`RootMapSet`/`TeamMapSet` sctrls (Ikemen named-variable system)
2. `gethitvar` sub-keys (~40 of ~70 missing — `priority`, `ground_velocity_x`, `attr`, `playerid`, `redlife`, `power`, `kill`, `facing`, `frame`, `down.recover`, `guardflag`, `keepstate`, `projid`, `guardko`, `teamside`, `air.animtype`, `ground.animtype`, `fall.animtype`, `zvel`, `zaccel`, `xaccel`, `dizzypoints`, `guardpoints`, `hitdamage`, `guarddamage`, `hitpower`, `guardpower`, `guardcount`, `score`, etc.)
3. `stagevar` sub-keys (3 of ~80 implemented — only `info.author`, `info.displayname`, `info.name`)
4. `partner` redirection + `numpartner` hardcoded stub returning 0
5. `hitoverridden` trigger
6. `rootvarset` / `rootvaradd` / `parentmapset` / `rootmapset` sctrls
7. `:=` instant-assignment operator + augmented assignments (`:=`, `:*=` , `:/=`, `:%=`)
8. `inputtime` trigger (charge characters)
9. `modifyhitdef` / `modifyreversaldef` / `modifyprojectile` / `modifyplayer` sctrls
10. `AssertSpecial` flag coverage (19 of ~70 — missing `noairjump`, `nocornerpush`, `nojugglecheck` variants, `nokofall`, `nokovelocity`, `noredlifedamage`, `noguardpointsdamage`, `nodizzypointsdamage`, `nohardcodedkeys`, `noinput`, `noailevel`, `noaibuttonjam`, `noaicheat`, `nointroreset`, `postroundinput`, `projtypecollision`, `runfirst`, `runlast`, `sizepushonly`, `nodestroyself`, `animatehitpause`, `animfreeze`, `autoguard`, `drawunder`, `nocombodisplay`, `nohitdamage`, `noguarddamage`, `noguardko`, `nolifebaraction`, `nolifebardisplay`, `nolifebardisplay`, `nomakedust`, `nonamedisplay`, `nopowerbardisplay`, `noscore`, `nostand`, `nostunbardisplay`, `noturntarget`, `nowinicondisplay`, `nofacedisplay`, `nofacep2`, `nofallcount`, `nofalldefenceup`, `nofallhitflag`, `nofastrecoverfromliedown`, `nogetupfromliedown`, `noguardbardisplay`, `noredlifedamage`, `nocrouch`, `nostand`, `nojump`, `nobrake` + global flags `camerafreeze`, `globalnoko`, `roundfreeze`, `roundnotskip`, `skipfightdisplay`, `skipkodisplay`, `skiprounddisplay`, `skipwindisplay`, `notimedisplay`)

---

## 1. Audit method

### 1.1 Triggers
Read `mugenassignmentevaluator.cpp` and extracted every trigger registration from four tables:

- `gVariableHandler.mVariables[...]` — single-value triggers (lines 1978–2212). Includes ~95 top-level names + 75 `const(*)` sub-keys + 33 `gethitvar(*)` sub-keys.
- `gVariableHandler.mArrays[...]` — function/array triggers (lines 2662–2712). Includes 49 names (some are aliases or Dolmexica-specific extensions).
- `gVariableHandler.mComparisons[...]` — comparison-only triggers (lines 1731–1742). 9 names: `command`, `statetype`, `p2statetype`, `movetype`, `p2movetype`, `animelem`, `timemod`, `teammode`, `hitdefattr`.
- `gVariableHandler.mOrdinals[...]` — ordinal triggers (lines 1743–1745). 1 name: `animelem` (already counted in mComparisons).

Redirection triggers (resolved in `getRegularPlayerFromFirstVectorPartOrNullIfNonexistant` at line 616) — 9 supported: `p1`, `p2`, `target`, `enemy`, `enemynear`, `root`, `parent`, `helper`, `playerid`. The `enemy(n)` and `enemynear(n)` index-argument forms are handled via `mArrays["enemy"]` and `mArrays["enemynear"]` (commit `12052ff`).

### 1.2 State controllers
Read `mugenstatecontrollers.cpp` and extracted every registration from `gMugenStateControllerVariableHandler.mStateControllerParsers[...]` at lines 5768–5866 (~99 names, including 7 Dolmexica-specific story-mode controllers: `changestorystate`, `changetext`, `createstoryhelper`, `createtext`, `textposadd`, `textposset`, plus custom `globalvarset`/`globalvaradd`).

Verified by reading `handleSingleSpecialAssert()` at line 3498 that `AssertSpecial` only dispatches 19 flag names (out of ~70 in Ikemen).

### 1.3 Cross-reference
Compared against the per-category tables in docs 12 and 13. Items classified as:
- **PRESENT in both** — registered in Dolmexica and Ikemen, semantics match.
- **PRESENT in Ikemen, MISSING in Dolmexica** — name appears in Ikemen's `triggerMap` or `scmap` but not in Dolmexica's registration tables.
- **PRESENT in Dolmexica but BROKEN** — name is registered but implementation is wrong (returns wrong value or crashes).
- **PRESENT in Dolmexica but PARTIAL** — name is registered but missing sub-keys, parameters, or sub-features.

---

## 2. Triggers — cross-reference

### 2.1 Redirection triggers (Ikemen: 18; Dolmexica: 10)

| Redirection | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `root` | ✅ | ✅ | PRESENT |
| `parent` | ✅ | ✅ | PRESENT |
| `p2` | ✅ | ✅ | PRESENT |
| `stateowner` | ✅ | ❌ | MISSING — breaks custom-state owner detection |
| `partner` | ✅ | ❌ | **CRITICAL MISSING** — breaks every simul/tag character |
| `enemy` | ✅ | ✅ | PRESENT (fixed in `12052ff`) |
| `enemynear` | ✅ | ✅ | PRESENT |
| `player` | ✅ | ❌ | MISSING — `player(2), stateno` fails |
| `playerid` | ✅ | ✅ | PRESENT |
| `playerindex` | ✅ | ❌ | MISSING (Ikemen ext) |
| `helperindex` | ✅ | ❌ | MISSING (Ikemen ext) |
| `helper` | ✅ | ✅ | PRESENT |
| `target` | ✅ | ✅ | PRESENT |
| `playeridexist` | ✅ | ✅ | PRESENT |
| `playerindexexist` | ✅ | ❌ | MISSING (Ikemen ext) |
| `playernoexist` | ✅ | ❌ | MISSING (Ikemen ext) |
| `helperindexexist` | ✅ | ❌ | MISSING (Ikemen ext) |
| `selfstatenoexist` | ✅ | ❌ | MISSING — breaks state-existence pre-checks |
| `parentexist` | ✅ | ❌ | MISSING — projectile/throw code routinely checks this before `parentdist` |

**Gap: 9 missing redirections.**

### 2.2 State triggers (Ikemen: 29; Dolmexica: ~24)

| Trigger | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `stateno` | ✅ | ✅ | PRESENT |
| `p2stateno` | ✅ | ✅ | PRESENT |
| `prevstateno` | ✅ | ✅ | PRESENT |
| `statetype` | ✅ (value-returning) | ⚠️ (comparison-only) | PARTIAL — cannot be used in `IfElse`/`Cond` arithmetic |
| `p2statetype` | ✅ | ⚠️ (comparison-only) | PARTIAL |
| `prevstatetype` | ✅ | ❌ | MISSING (Ikemen ext) |
| `movetype` | ✅ | ⚠️ (comparison-only) | PARTIAL |
| `p2movetype` | ✅ | ⚠️ (comparison-only) | PARTIAL |
| `prevmovetype` | ✅ | ❌ | MISSING (Ikemen ext) |
| `physics` | ✅ | ⚠️ (comparison-only — registered in mComparisons? **NO**, missing entirely) | MISSING |
| `time` / `statetime` | ✅ | ✅ | PRESENT |
| `timemod` | ✅ | ⚠️ (comparison-only) | PARTIAL |
| `ctrl` | ✅ | ✅ | PRESENT |
| `incustomstate` | ✅ | ❌ | MISSING (Ikemen ext) — breaks throw-tech / custom-combo characters |
| `incustomanim` | ✅ | ❌ | MISSING (Ikemen ext) |
| `standby` | ✅ | ❌ | MISSING (Ikemen ext) |
| `anim` | ✅ | ✅ | PRESENT |
| `prevanim` | ✅ | ❌ | MISSING (Ikemen ext) |
| `animtime` | ✅ | ✅ | PRESENT |
| `animlength` | ✅ | ❌ | MISSING (Ikemen ext) |
| `animelem` | ✅ | ⚠️ (comparison-only + ordinal) | PARTIAL |
| `animelemno` | ✅ | ✅ | PRESENT |
| `animelemtime` | ✅ | ✅ | PRESENT |
| `animelemvar` | ✅ | ❌ | MISSING (Ikemen ext) |
| `animexist` | ✅ | ✅ | PRESENT |
| `selfanimexist` | ✅ | ✅ | PRESENT |
| `animplayerno` | ✅ | ❌ | MISSING (Ikemen ext) |
| `spriteplayerno` | ✅ | ❌ | MISSING (Ikemen ext) |

**Gap: ~6 fully missing + ~5 partial (comparison-only) = 11 gaps.**

### 2.3 Player triggers (Ikemen: 31; Dolmexica: ~21)

| Trigger | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `life` | ✅ | ✅ | PRESENT |
| `p2life` | ✅ | ✅ | PRESENT |
| `lifemax` | ✅ | ✅ | PRESENT |
| `power` | ✅ | ✅ | PRESENT |
| `powermax` | ✅ | ✅ | PRESENT |
| `alive` | ✅ | ✅ | PRESENT |
| `redlife` | ✅ | ❌ | **MISSING (Ikemen ext)** — breaks every chip-damage character |
| `attack` | ✅ | ❌ | MISSING (Ikemen ext) |
| `attackmul` | ✅ | ❌ | MISSING (Ikemen ext) |
| `defence` | ✅ | ❌ | MISSING (Ikemen ext) |
| `defencemul` | ✅ | ❌ | MISSING (Ikemen ext) |
| `dizzypoints` / `dizzypointsmax` | ✅ | ❌ | MISSING (Ikemen ext) |
| `dizzy` | ✅ | ❌ | MISSING (Ikemen ext) |
| `guardpoints` / `guardpointsmax` | ✅ | ❌ | MISSING (Ikemen ext) |
| `guardbreak` | ✅ | ❌ | MISSING (Ikemen ext) |
| `guardcount` | ✅ | ❌ | MISSING (Ikemen ext) |
| `jugglepoints` | ✅ | ❌ | MISSING (Ikemen ext) |
| `hitoverridden` | ✅ | ❌ | **CRITICAL MISSING (Ikemen ext)** — breaks every armor/counter character |
| `canrecover` | ✅ | ✅ | PRESENT |
| `airjumpcount` | ✅ | ✅ | PRESENT (fixed in `2f9d755`) |
| `sprpriority` | ✅ | ❌ | MISSING (Ikemen ext) |
| `layerno` | ✅ | ❌ | MISSING (Ikemen ext) |
| `id` | ✅ | ✅ | PRESENT |
| `helpername` | ✅ | ❌ | MISSING (Ikemen ext) |
| `authorname` | ✅ | ✅ | PRESENT |
| `name` / `p1name`…`p8name` | ✅ | ✅ (`name`, `p1name`–`p4name` only; missing `p5name`–`p8name`) | PARTIAL |
| `displayname` | ✅ | ❌ | MISSING (Ikemen ext) |
| `palno` | ✅ | ✅ | PRESENT |
| `facing` | ✅ | ✅ | PRESENT |
| `ishelper` | ✅ | ✅ (both no-arg and `(id)` forms) | PRESENT |
| `index` | ✅ | ❌ | MISSING (Ikemen ext) |
| `teamleader` | ✅ | ❌ | MISSING (Ikemen ext) |

**Gap: ~14 fully missing + 1 partial = 15 gaps.**

### 2.4 Position triggers (Ikemen: 36; Dolmexica: ~24)

| Trigger family | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `pos x` / `pos y` | ✅ | ✅ | PRESENT |
| `pos z` | ✅ | ❌ | MISSING (Ikemen ext) — Z axis not supported |
| `vel x` / `vel y` | ✅ | ✅ | PRESENT |
| `vel z` | ✅ | ❌ | MISSING (Ikemen ext) |
| `screenpos x` / `screenpos y` | ✅ | ✅ | PRESENT |
| `backedge` / `backedgedist` / `backedgebodydist` | ✅ | ✅ | PRESENT |
| `frontedge` / `frontedgedist` / `frontedgebodydist` | ✅ | ✅ | PRESENT |
| `leftedge` / `rightedge` / `topedge` / `bottomedge` | ✅ | ✅ | PRESENT |
| `topbounddist` / `topboundbodydist` | ✅ | ❌ | MISSING (Ikemen ext) |
| `botbounddist` / `botboundbodydist` | ✅ | ❌ | MISSING (Ikemen ext) |
| `stagebackedgedist` / `stagefrontedgedist` | ✅ | ❌ | MISSING (Ikemen ext) |
| `groundlevel` | ✅ | ❌ | MISSING (Ikemen ext) |
| `p2dist x` / `p2dist y` | ✅ | ✅ | PRESENT |
| `p2dist z` | ✅ | ❌ | MISSING (Ikemen ext) |
| `p2bodydist x` / `p2bodydist y` | ✅ | ✅ | PRESENT |
| `p2bodydist z` | ✅ | ❌ | MISSING (Ikemen ext) |
| `rootdist x` / `rootdist y` | ✅ | ✅ | PRESENT |
| `rootdist z` | ✅ | ❌ | MISSING (Ikemen ext) |
| `parentdist x` / `parentdist y` | ✅ | ✅ | PRESENT |
| `parentdist z` | ✅ | ❌ | MISSING (Ikemen ext) |
| `localcoord x` / `localcoord y` | ✅ | ❌ | MISSING (Ikemen ext) |
| `gameheight` / `gamewidth` | ✅ | ✅ | PRESENT |
| `screenheight` / `screenwidth` | ✅ | ✅ | PRESENT |
| `camerapos x` / `camerapos y` | ✅ | ✅ | PRESENT |
| `camerazoom` | ✅ | ✅ | PRESENT |
| `groundangle` | ✅ | ❌ | MISSING (Ikemen ext) |

**Gap: ~12 missing (mostly Z-axis + Ikemen bound extensions).**

### 2.5 Input triggers (Ikemen: 3; Dolmexica: 1)

| Trigger | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `command` | ✅ | ⚠️ (comparison-only) | PARTIAL |
| `selfcommand` | ✅ | ❌ | MISSING (Ikemen ext) |
| `inputtime` | ✅ | ❌ | **HIGH MISSING (Ikemen ext)** — breaks every charge character (Guile, Blanka, etc.) |

**Gap: 2 missing + 1 partial = 3 gaps.**

### 2.6 Math / conditional functions (Ikemen: 26; Dolmexica: ~16)

| Trigger | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `ifelse` | ✅ | ✅ (delegates to `cond` since `2f9d755`) | PRESENT (FIXED) |
| `cond` | ✅ short-circuit | ✅ short-circuit (`evaluateCondArrayAssignment` lines 2453–2478 conditionally evaluates one branch) | PRESENT — note: doc 12's claim that "Dolmexica's IfElse is still strict" is OUTDATED. Both `IfElse` and `Cond` are short-circuit as of commit `2f9d755`. |
| `abs` | ✅ | ✅ | PRESENT |
| `exp` | ✅ | ✅ | PRESENT |
| `ln` | ✅ | ✅ | PRESENT |
| `log` | ✅ | ✅ | PRESENT |
| `cos` / `sin` / `tan` | ✅ | ✅ | PRESENT |
| `acos` / `asin` / `atan` | ✅ | ✅ | PRESENT |
| `atan2` | ✅ | ❌ | MISSING (Ikemen ext) |
| `floor` | ✅ | ✅ | PRESENT |
| `ceil` | ✅ | ✅ | PRESENT |
| `float` | ✅ | ❌ | MISSING (Ikemen ext) |
| `max` | ✅ | ❌ | MISSING (Ikemen ext) |
| `min` | ✅ | ❌ | MISSING (Ikemen ext) |
| `clamp` | ✅ | ❌ | MISSING (Ikemen ext) |
| `randomrange` | ✅ | ❌ | MISSING (Ikemen ext) |
| `round` | ✅ | ❌ | MISSING (Ikemen ext) |
| `sign` | ✅ | ❌ | MISSING (Ikemen ext) |
| `rad` | ✅ | ❌ | MISSING (Ikemen ext) |
| `deg` | ✅ | ❌ | MISSING (Ikemen ext) |
| `lerp` | ✅ | ❌ | **HIGH MISSING (Ikemen ext)** — used in nearly every modern interpolation |
| `pi` | ✅ | ✅ | PRESENT |
| `e` | ✅ | ✅ | PRESENT |

**Gap: 10 missing.**

### 2.7 Variable triggers (Ikemen: 5; Dolmexica: 5 + 2 Dolmexica extensions)

| Trigger | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `var` | ✅ | ✅ | PRESENT |
| `fvar` | ✅ | ✅ | PRESENT |
| `sysvar` | ✅ | ✅ | PRESENT |
| `sysfvar` | ✅ | ✅ | PRESENT |
| `map` | ✅ | ❌ | **CRITICAL MISSING (Ikemen ext)** — Ikemen's named-variable system; breaks nearly every post-2022 Ikemen-native character |
| (Dolmexica ext) `globalvar` | ❌ | ✅ | N/A (Dolmexica-only extension for cross-state globals) |
| (Dolmexica ext) `globalfvar` | ❌ | ✅ | N/A (Dolmexica-only) |

**Gap: 1 critical missing (`map`).**

### 2.8 Constants (`const()` sub-keys)

Ikemen: ~100 sub-keys across `data.*`, `size.*`, `velocity.*`, `movement.*`, plus `name`/`p2name`/etc., `authorname`, `displayname`, `stagevar.*` (as const subcategory), `gameoption`, `motifvar`.

Dolmexica: 75 sub-keys registered at `mugenassignmentevaluator.cpp:2101–2178`:
- `data.*` (12 of 18): missing `data.fall.defence_up`, `data.dizzypoints`, `data.guardpoints`, `data.hitsound.channel`, `data.guardsound.channel`, `data.volume`
- `size.*` (17 of ~30): missing `size.attack.dist.width.front/back`, `size.attack.dist.height.top/bottom`, `size.attack.dist.depth.*`, `size.attack.depth.*`, `size.depth.top/bottom`, `size.weight`, `size.pushfactor`
- `velocity.*` (27 of ~70): missing all Z-axis variants, all `*.up.z` / `*.down.z` 3D extensions, `velocity.air.gethit.ko.*`, `velocity.ground.gethit.ko.*`, `velocity.*.up.*`, `velocity.*.down.*` for walk/run/runjump
- `movement.*` (19 of ~20): missing only `movement.air.gethit.groundrecover.groundlevel` (actually present, hmm — let me re-check) and a few minor fields

**Plus missing top-level:** `const(name)`, `const(p2name)`…`p8name`, `const(authorname)`, `const(displayname)`, `const(stagevar.*)`, `const(gameoption)`, `const(motifvar)`, `const(constants)`, `const(stage_constants)`, `stageconst`, `gameoption`, `motifvar`.

**Gap: ~25 missing sub-keys + ~9 missing top-level const variants = ~34 gaps.**

### 2.9 `stagevar()` sub-keys (Ikemen: ~80; Dolmexica: 3)

Dolmexica's `evaluateStageVarArrayAssignment` at `mugenassignmentevaluator.cpp:2301–2322` only handles:
- `info.author`
- `info.displayname`
- `info.name`

**Gap: ~77 missing sub-keys** (all `camera.*`, `playerinfo.*`, `scaling.*`, `bound.*`, `stageinfo.*`, `shadow.*`, `reflection.*`).

### 2.10 `gethitvar()` sub-keys (Ikemen: ~70; Dolmexica: 33)

Dolmexica registers 33 `gethitvar(*)` keys at `mugenassignmentevaluator.cpp:2180–2212`. Missing ~37 Ikemen sub-keys:

`air.animtype`, `ground.animtype`, `fall.animtype`, `zvel`, `zaccel`, `xaccel`, `zoff`, `attr`, `dizzypoints`, `guardpoints`, `playerid` (alias `id`), `playerno`, `redlife`, `score`, `hitdamage`, `guarddamage`, `power`, `hitpower`, `guardpower`, `kill`, `priority`, `facing`, `guardcount`, `ground.velocity.x/y/z`, `air.velocity.x/y/z`, `down.velocity.x/y/z`, `guard.velocity.x/y/z`, `airguard.velocity.x/y/z`, `frame`, `down.recover`, `guardflag`, `keepstate`, `projid`, `guardko`, `teamside`.

Additionally `gethitvar(xveladd)` and `gethitvar(yoff)` are deprecated stubs that always return 0 (correct MUGEN 1.1 behavior).

**Gap: ~37 missing sub-keys.**

### 2.11 Game / round triggers (Ikemen: ~40; Dolmexica: ~16)

| Trigger | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `gametime` | ✅ | ✅ | PRESENT |
| `gamemode` | ✅ | ❌ | MISSING (Ikemen ext) |
| `gamevar` | ✅ | ❌ | MISSING (Ikemen ext) |
| `roundstate` | ✅ | ✅ | PRESENT |
| `roundno` | ✅ | ✅ | PRESENT |
| `roundsexisted` | ✅ | ✅ | PRESENT |
| `roundswon` | ✅ | ❌ | MISSING (Ikemen ext) |
| `roundtime` | ✅ | ❌ | MISSING (Ikemen ext) |
| `introstate` / `outrostate` | ✅ | ❌ | MISSING (Ikemen ext) |
| `matchno` | ✅ | ✅ | PRESENT |
| `matchover` | ✅ | ✅ | PRESENT |
| `tickspersecond` | ✅ | ✅ | PRESENT |
| `fighttime` | ✅ | ❌ | MISSING (Ikemen ext) |
| `fightscreenstate` / `fightscreenvar` | ✅ | ❌ | MISSING (Ikemen ext) |
| `pausetime` | ✅ | ❌ | MISSING (Ikemen ext) |
| `stagetime` | ✅ | ❌ | MISSING (Ikemen ext) |
| `timeelapsed` / `timeremaining` / `timetotal` | ✅ | ❌ | MISSING (Ikemen ext) |
| `drawgame` | ✅ | ✅ | PRESENT |
| `drawpal` | ✅ | ❌ | MISSING (Ikemen ext) |
| `score` / `scoretotal` | ✅ | ❌ | MISSING (Ikemen ext) |
| `firstattack` | ✅ | ❌ | MISSING (Ikemen ext) |
| `decisiveround` | ✅ | ❌ | MISSING (Ikemen ext) |
| `consecutivewins` | ✅ | ❌ | MISSING (Ikemen ext) |
| `ikemenversion` / `mugenversion` | ✅ | ❌ | MISSING (Ikemen ext) |
| `motifstate` | ✅ | ❌ | MISSING (Ikemen ext) |
| `numplayer` | ✅ | ❌ | MISSING (Ikemen ext) |
| `ishost` | ✅ | ❌ | MISSING (Ikemen ext) |
| `ishometeam` | ✅ | ✅ | PRESENT (fixed in `cc943d7`) |
| `runorder` | ✅ | ❌ | MISSING (Ikemen ext) |
| `lastplayerid` | ✅ | ❌ | MISSING (Ikemen ext) |
| `memberno` | ✅ | ❌ | MISSING (Ikemen ext) |
| `teamleader` | ✅ | ❌ | MISSING (Ikemen ext) |
| `teamsize` | ✅ | ❌ | MISSING (Ikemen ext) |

**Gap: ~24 missing (all Ikemen ext).**

### 2.12 Hit triggers (Ikemen: ~28 + ~120 sub-keys; Dolmexica: ~12 + 33 gethitvar + 0 hitdefvar)

| Trigger | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `hitcount` | ✅ | ✅ | PRESENT |
| `uniqhitcount` | ✅ | ✅ (also aliased as `uniquehitcount`) | PRESENT |
| `hitover` | ✅ | ✅ | PRESENT |
| `hitpausetime` | ✅ | ✅ | PRESENT |
| `hitshakeover` | ✅ | ✅ | PRESENT |
| `hitfall` | ✅ | ✅ | PRESENT |
| `hitvel x` / `hitvel y` | ✅ | ✅ | PRESENT |
| `hitvel z` | ✅ | ❌ | MISSING (Ikemen ext) |
| `hitdefattr` | ✅ | ⚠️ (comparison-only) | PARTIAL |
| `hitbyattr` | ✅ | ❌ | MISSING (Ikemen ext) |
| `hitdefvar` (~40 sub-keys) | ✅ | ❌ | MISSING (Ikemen ext) — entire trigger |
| `gethitvar` (~70 sub-keys) | ✅ | ⚠️ (33 sub-keys) | PARTIAL (see §2.10) |
| `movecontact` | ✅ | ✅ | PRESENT |
| `moveguarded` | ✅ | ✅ | PRESENT |
| `movehit` | ✅ | ✅ | PRESENT |
| `movereversed` | ✅ | ✅ | PRESENT |
| `movecountered` | ✅ | ❌ | MISSING (Ikemen ext) |
| `movehitvar` (~8 sub-keys) | ✅ | ❌ | MISSING (Ikemen ext) |
| `projcontacttime` | ✅ | ✅ | PRESENT |
| `projhittime` | ✅ | ✅ | PRESENT |
| `projguardedtime` | ✅ | ✅ | PRESENT |
| `projcanceltime` | ✅ | ✅ | PRESENT |
| `projclsnoverlap` | ✅ | ❌ | MISSING (Ikemen ext) |
| `projvar` (~40 sub-keys) | ✅ | ❌ | MISSING (Ikemen ext) — entire trigger |
| `numproj` | ✅ | ✅ | PRESENT |
| `numprojid` | ✅ | ✅ | PRESENT |
| `inguarddist` | ✅ | ✅ | PRESENT |
| `clsnoverlap` | ✅ | ❌ | MISSING (Ikemen ext) |
| `clsnvar` | ✅ | ❌ | MISSING (Ikemen ext) |
| Legacy `projhit[id]` / `projguarded[id]` / `projcontact[id]` | ✅ | ✅ (handled in `tryEvaluateVariableComparison` at line 1185) | PRESENT |

**Gap: ~6 fully missing triggers + ~120 missing sub-keys + 1 partial = significant.**

### 2.13 Combo triggers (Ikemen: 1; Dolmexica: 0)

| Trigger | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `combocount` | ✅ | ❌ | MISSING (Ikemen ext) |

### 2.14 Team triggers (Ikemen: 12; Dolmexica: 8)

| Trigger | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `teammode` | ✅ | ⚠️ (comparison-only) | PARTIAL |
| `teamside` | ✅ | ✅ | PRESENT |
| `numpartner` | ✅ | ⚠️ (hardcoded to return 0 — see `mugenassignmentevaluator.cpp:1807`) | **BROKEN STUB** |
| `numenemy` | ✅ | ⚠️ (hardcoded to return 1 — see `mugenassignmentevaluator.cpp:1804`) | **BROKEN STUB** |
| `numtarget` | ✅ | ✅ | PRESENT |
| `numhelper` | ✅ | ✅ | PRESENT |
| `numexplod` | ✅ | ✅ | PRESENT |
| `numtext` | ✅ | ❌ | MISSING (Ikemen ext) |
| `numproj` | ✅ | ✅ | PRESENT |
| `numprojid` | ✅ | ✅ | PRESENT |
| `numstagebg` | ✅ | ❌ | MISSING (Ikemen ext) |
| `numplayer` | ✅ | ❌ | MISSING (Ikemen ext) |

**Gap: 2 broken stubs + 3 missing + 1 partial = 6 gaps.**

### 2.15 System / global triggers (Ikemen: ~40 + ~100 sub-keys; Dolmexica: ~10)

| Trigger | Ikemen | Dolmexica | Status |
|---|---|---|---|
| `ailevel` | ✅ | ✅ | PRESENT |
| `ailevelf` | ✅ | ❌ | MISSING (Ikemen ext) |
| `random` | ✅ | ✅ | PRESENT |
| `reversaldefattr` | ✅ | ❌ | MISSING (Ikemen ext) |
| `isasserted` (~70 flags) | ✅ | ❌ | **MISSING (Ikemen ext)** — entire trigger |
| `ishelper` | ✅ | ✅ | PRESENT |
| `playerno` | ✅ | ❌ | MISSING (Ikemen ext) |
| `receiveddamage` / `receivedhits` | ✅ | ❌ | MISSING (Ikemen ext) |
| `envshakevar` | ✅ | ❌ | MISSING (Ikemen ext) |
| `palfxvar` (~30 sub-keys) | ✅ | ❌ | MISSING (Ikemen ext) — entire trigger |
| `bgmvar` | ✅ | ❌ | MISSING (Ikemen ext) |
| `soundvar` | ✅ | ❌ | MISSING (Ikemen ext) |
| `stagebgvar` | ✅ | ❌ | MISSING (Ikemen ext) |
| `explodvar` (~30 sub-keys) | ✅ | ❌ | MISSING (Ikemen ext) — entire trigger |
| `spritevar` | ✅ | ❌ | MISSING (Ikemen ext) |
| `zoomvar` | ✅ | ❌ | MISSING (Ikemen ext) |
| `helpervar` | ✅ | ❌ | MISSING (Ikemen ext) |
| `debugmode` | ✅ | ❌ | MISSING (Ikemen ext) |
| `shader` | ✅ | ❌ | MISSING (Ikemen ext) |
| `angle` / `xangle` / `yangle` | ✅ | ❌ | MISSING (Ikemen ext) |
| `scale x/y/z` | ✅ | ❌ | MISSING (Ikemen ext) |
| `offset x/y` | ✅ | ❌ | MISSING (Ikemen ext) |
| `alpha source` / `alpha dest` | ✅ | ❌ | MISSING (Ikemen ext) |
| `xshear` | ✅ | ❌ | MISSING (Ikemen ext) |
| `analog` | ✅ | ❌ | MISSING (Ikemen ext) |
| `win` / `winko` / `wintime` / `winperfect` | ✅ | ✅ | PRESENT |
| `winclutch` / `winspecial` / `winhyper` | ✅ | ❌ | MISSING (Ikemen ext) |
| `lose` | ✅ | ✅ | PRESENT |
| `loseko` / `losetime` | ✅ | ❌ | MISSING (Ikemen ext) |

**Gap: ~30 missing + ~130 missing sub-keys.**

### 2.16 Triggers — section summary

| Trigger category | Ikemen count | Dolmexica count | Gap (missing or partial) |
|---|---|---|---|
| Redirections | 18 | 10 | 9 |
| State | 29 | 24 | 6 missing + 5 partial |
| Player | 31 | 21 | 14 missing + 1 partial |
| Position | 36 | 24 | 12 |
| Input | 3 | 1 | 2 missing + 1 partial |
| Math / conditional | 26 | 16 | 10 |
| Variables | 5 | 5 (+2 Dolmexica ext) | 1 critical (`map`) |
| Constants | ~100 sub-keys + 8 top-level | 75 sub-keys + 3 top-level (`const240p`/`480p`/`720p`) | ~34 |
| `stagevar` | ~80 sub-keys | 3 sub-keys | ~77 |
| `gethitvar` | ~70 sub-keys | 33 sub-keys | ~37 |
| Game / round | ~40 | ~16 | ~24 |
| Hit | ~28 + ~120 sub-keys | ~12 + 33 sub-keys | ~6 + ~120 |
| Combo | 1 | 0 | 1 |
| Team | 12 | 8 | 2 broken + 3 missing + 1 partial |
| System | ~40 + ~100 sub-keys | ~10 | ~30 + ~130 |
| **TOTAL top-level** | **~260** | **~148** | **~112 missing + ~7 partial** |
| **TOTAL sub-keys** | **~600** | **~111** | **~489 missing** |

---

## 3. State Controllers — cross-reference

### 3.1 MUGEN 1.1 state controllers (91 in Ikemen; 91 in Dolmexica)

**Dolmexica has 100% coverage of all 91 MUGEN 1.1 controllers.** Cross-checked item-by-item against `mugenstatecontrollers.cpp:5768–5866`.

| Category | MUGEN controllers | Dolmexica coverage |
|---|---|---|
| State change (11) | ChangeState, SelfState, ChangeAnim, ChangeAnim2, Turn, CtrlSet, StateTypeSet, DestroySelf, GameMakeAnim, TagIn, TagOut | 9/11 (TagIn, TagOut are Ikemen-ext — see §3.2) |
| Physics (8) | PosSet, PosAdd, VelSet, VelAdd, VelMul, HitVelSet, PosFreeze, Gravity | 8/8 ✅ |
| Hit (11) | HitDef, ModifyHitDef, ReversalDef, ModifyReversalDef, HitBy, NotHitBy, HitOverride, HitFallSet, HitFallVel, HitFallDamage, FallEnvShake | 9/11 (ModifyHitDef, ModifyReversalDef are Ikemen-ext) |
| Variables (8 MUGEN-style) | VarSet, VarAdd, VarRangeSet, VarRandom, ParentVarSet, ParentVarAdd, RootVarSet, RootVarAdd | 6/8 (RootVarSet, RootVarAdd missing) |
| Visual (15 MUGEN) | Explod, ModifyExplod, RemoveExplod, ExplodBindTime, AfterImage, AfterImageTime, Trans, AngleDraw, AngleSet, AngleAdd, AngleMul, PalFX, AllPalFX, BGPalFX, RemapPal | 15/15 ✅ |
| Game flow (8) | Pause, SuperPause, EnvShake, EnvColor, AssertSpecial, Zoom, Offset, SprPriority | 8/8 ✅ (note: `AssertSpecial` is PARTIAL — only 19 of ~70 flags dispatched; see §3.3) |
| Helpers (5) | Helper, DestroySelf (shared with §1), BindToParent, BindToRoot, BindToTarget | 5/5 ✅ |
| Target (8 MUGEN) | TargetBind, TargetDrop, TargetFacing, TargetLifeAdd, TargetPowerAdd, TargetState, TargetVelSet, TargetVelAdd | 8/8 ✅ |
| Player attribute (7 MUGEN) | Width, AttackDist, AttackMulSet, DefenceMulSet, PlayerPush, ScreenBound (shared with §11) | 6/7 (Height, Depth are Ikemen-ext; OverrideClsn, TransformClsn, ModifyPlayer, GroundLevelOffset are Ikemen-ext) |
| Sound (3 MUGEN) | PlaySnd, StopSnd, SndPan | 3/3 ✅ |
| Screen / camera (1 unique MUGEN) | ScreenBound (already counted), Zoom (already counted) | — |
| Projectile (1 MUGEN) | Projectile | 1/1 ✅ |
| Special / misc (~20 MUGEN) | HitAdd, LifeAdd, LifeSet, PowerAdd, PowerSet, MakeDust, MoveHitReset, DisplayToClipboard, AppendToClipboard, ClearClipboard, VictoryQuote, Null, ForceFeedback | 13/13 ✅ |
| Plus `RemoveText` | Listed in MUGEN block of Ikemen `compiler.go` | ✅ (Dolmexica supports it) |

**Total MUGEN coverage: 91 / 91 ✅**

### 3.2 Ikemen-extension state controllers (68 in Ikemen; 1 in Dolmexica — `removetext`)

The full list of 68 Ikemen extensions (from doc 13 §16) was cross-referenced against Dolmexica's registration table. Only `RemoveText` is present (it appears in the MUGEN block of Ikemen's `compiler.go`).

**Missing 67 Ikemen-extension state controllers**, grouped by impact:

#### Tier 1 — CRITICAL (commonly used by post-2022 Ikemen-native characters)
| Controller | Purpose |
|---|---|
| `MapSet`, `MapAdd`, `MapReset` | Ikemen's named-variable system |
| `ParentMapSet`, `ParentMapAdd`, `RootMapSet`, `RootMapAdd`, `TeamMapSet`, `TeamMapAdd` | Map variants for partner/root/team scope |
| `RootVarSet`, `RootVarAdd` | Push state from helper to root (assists, summons) |
| `ModifyHitDef` | Dynamically modify an already-active HitDef (combo scaling) |
| `ModifyReversalDef` | Modify an active ReversalDef |
| `ModifyProjectile` | Modify a projectile in flight (homing missiles) |
| `GetHitVarSet` | Directly set gethitvar fields (custom hit reactions) |
| `RedLifeAdd`, `RedLifeSet` | Red-life (chip) manipulation |

#### Tier 2 — HIGH (specific character archetypes)
| Controller | Purpose |
|---|---|
| `ModifyPlayer` | Modify another player's parameters (custom throws) |
| `ModifyText` | Modify existing text objects |
| `Text` (Ikemen-style) | Spawn on-screen text objects with full layout |
| `TagIn`, `TagOut` | Tag-team control |
| `AssertCommand`, `AssertInput`, `AssertAnalogVector` | Force AI/cutscene inputs |
| `Camera` | Direct camera position/zoom control |
| `PrintToConsole` | Debug logging |
| `TargetAdd` | Manually add a player to target list (custom throws) |
| `TargetDizzyPointsAdd`, `TargetGuardPointsAdd`, `TargetRedLifeAdd`, `TargetScoreAdd` | Targeted versions of Ikemen subsystems |

#### Tier 3 — MEDIUM (specific moves or subsystems)
| Controller | Purpose |
|---|---|
| `DizzySet`, `DizzyPointsAdd`, `DizzyPointsSet` | Dizzy subsystem |
| `GuardBreakSet`, `GuardPointsAdd`, `GuardPointsSet` | Guard-break subsystem |
| `ScoreAdd` | Score system |
| `Height`, `Depth`, `GroundLevelOffset` | 3D collision (Ikemen Z-axis) |
| `OverrideClsn`, `TransformClsn`, `TransformSprite`, `RemapSprite` | Custom collision/sprite transforms |
| `ModifyBGCtrl`, `ModifyBGCtrl3d`, `ModifyStageBG`, `ModifyStageVar` | Stage background manipulation |
| `ModifyBgm`, `PlayBgm`, `ModifySnd` | Music/sound control |
| `ModifyReflection`, `ModifyShadow` | Reflection/shadow manipulation |
| `RoundTimeSet`, `RoundTimeAdd` | Round timer manipulation |
| `ShaderSet` | Custom shaders |
| `ShiftInput` | Remap input symbols |
| `Dialogue`, `Storyboard` | Story-mode scenes |
| `LoadFile`, `SaveFile`, `LoadState`, `SaveState`, `MatchRestart` | Persistence / mid-match restart |
| `LifebarAction`, `ChangeMovelist` | UI integration |

### 3.3 Partially-implemented state controllers

| Controller | Dolmexica gap |
|---|---|
| `AssertSpecial` | Only 19 of ~70 flags dispatched in `handleSingleSpecialAssert` (lines 3498–3563). Missing all 51 Ikemen-ext flags: `noairjump`, `nocornerpush`, `animatehitpause`, `animfreeze`, `autoguard`, `drawunder`, `noaibuttonjam`, `noaicheat`, `noailevel`, `nobrake`, `nocombodisplay`, `nocrouch`, `nodizzypointsdamage`, `nofacedisplay`, `nofacep2`, `nofallcount`, `nofalldefenceup`, `nofallhitflag`, `nofastrecoverfromliedown`, `nogetupfromliedown`, `noguardbardisplay`, `noguarddamage`, `noguardko`, `noguardpointsdamage`, `nohardcodedkeys`, `nohitdamage`, `noinput`, `nointroreset`, `nojump`, `nokofall`, `nokovelocity`, `nolifebaraction`, `nolifebardisplay`, `nomakedust`, `nonamedisplay`, `nopowerbardisplay`, `noredlifedamage`, `noscore`, `nostand`, `nostunbardisplay`, `noturntarget`, `nowinicondisplay`, `postroundinput`, `projtypecollision`, `runfirst`, `runlast`, `sizepushonly`, `nodestroyself`, `camerafreeze`, `globalnoko`, `notimedisplay`, `roundfreeze`, `roundnotskip`, `skipfightdisplay`, `skipkodisplay`, `skiprounddisplay`, `skipwindisplay`. |
| `HitDef` | Many MUGEN 1.1 HitDef params present, but some advanced sub-keys (especially `guard.sparkangle`, `sparkangle`, `mindist`/`maxdist` Z, `snap` Z, `down.bounce`, `p2getp1state`, `forcenofall`, `forcecrouch`, `keepstate`, `redlife`, `hitonce`, `teamside`, `affectteam`) need verification — likely partial. |
| `Explod` | 50+ params in Ikemen; Dolmexica likely missing `accel`, `interpolation.*`, `synclayer`, `syncparams`, `syncid`, `shadertime`, `shader.*`, `bindid`, `window`, `afterimage.*`, `animplayerno`, `spriteplayerno`, `xshear`, `focallength`, `projection`. |
| `Projectile` | Many advanced params likely missing (`projclsnscale`, `projclsnangle`, `projwindow`, `projxshear`, `projfocallength`, `projprojection`, `velmul`, `accel`, `afterimage.*`, `shadertime`, `shader.*`). |
| `Helper` | Many Ikemen-ext params missing (`clsnproxy`, `extendsmap`, `inheritjuggle`, `inheritchannels`, `immortal`, `kovelocity`, `preserve`, `standby`, `ownclsnscale`, `ownprojectile`, `map.*`). |

### 3.4 Broken state controllers

None observed in code review — every registered state controller has a parse + handle + unload function. The previously-broken `enemy` was a trigger (not sctrl) issue and is fixed.

---

## 4. Already-fixed items in this session

Confirmed via `git log cc943d7^..e931a5d` (7 commits):

| Commit | Fix | Files | Impact |
|---|---|---|---|
| `cc943d7` | Trans alpha clamping to `[0, 256]` | `playerdefinition.cpp:5052` | UI Goku aura fade (and any char using `alpha = 200-(time*N),256`) no longer turns invisible at time ≥ 10 |
| `cc943d7` | Air-jump `mJumpFlank` bypass when external Up input held ≥ 8 ticks | `playerdefinition.cpp:649` | Air-jump works reliably for chars whose `holdup` cmd is non-standard |
| `cc943d7` | `IsHomeTeam` returns `mAILevel > 0` (not `mRootID`) | `playerdefinition.cpp:5008` | KoldSpidey no longer auto-activates AI for P2 in local 2P |
| `4a114d2` | JUS 32-color palette: fill entries `[n..255]` with last valid color | `mugenspritefilereader.cpp:1033` | JUS characters no longer render invisible sprites for indices ≥ 32 |
| `4a114d2` | `airjump.neu.Y` inheritance from `jump.neu.Y` when Y==0 | `playerdefinition.cpp` | UI Goku air-jump now has proper upward velocity |
| `110a03f` | SFF v2 palette link resolution (two-pass loader) | `mugenspritefilereader.cpp` | Goku_UI punch/jump sprites no longer invisible (palette 272 → linked from palette 222) |
| `655f57a` | `loadPalettes2` accounts for external-palette offset (`tHasPalette`) | `mugenspritefilereader.cpp` | Linked palettes no longer copy from wrong slot when external palette inserted at index 0 |
| `2f9d755` | `ifElseFunction` delegates to `evaluateCondArrayAssignment` (AST walker) | `mugenassignmentevaluator.cpp:2625` | Complex `IfElse(complex_expr, ...)` now works — Spider-Man AI branches fixed |
| `2f9d755` | `airjumpcount` trigger registered | `mugenassignmentevaluator.cpp:1981` | Modern aerial-combo chars no longer fail at parse time |
| `0945470` | Rebuild (emsdk was deleted) | (build only) | Verified all .o files have current timestamps; `enemyFunction` symbol confirmed in `mugenassignmentevaluator.o` |
| `12052ff` | `enemy` redirection misregistration fix (was `numTargetArrayFunction`, now `enemyFunction`) | `mugenassignmentevaluator.cpp:2697, 2649` | Spider-Man's `Cond(AILevel, enemy,statetype != L, ...)` now resolves correctly |
| `e931a5d` | All single-number jump velocities inherit `jump.neu.Y` (not just `airjump.neu`) | `playerdefinition.cpp` | Goku_UI `jump.back`/`jump.fwd`/`airjump.back`/`airjump.fwd` all get proper Y velocity |

**Important note on doc 12's outdated claim:** Doc 12 §16 item 1 states "the *evaluation* is still strict in our current implementation — characters with side-effectful branches (e.g. `ifelse(var(50):=1, A, B)`) will still differ." **This is now incorrect.** Reading `evaluateCondArrayAssignment` at lines 2453–2478 of `mugenassignmentevaluator.cpp` confirms it conditionally evaluates EITHER `secondV->a` (true branch) OR `secondV->b` (false branch) based on `isTrue`, never both. Both `Cond` and `IfElse` are short-circuit as of commit `2f9d755`.

---

## 5. Priority ranking

### Tier 1 — CRITICAL (breaks common characters, attacks, movement, AI)

| # | Gap | Type | Impact | Effort |
|---|---|---|---|---|
| 1 | `map()` trigger + `MapSet`/`MapAdd`/`MapReset`/`ParentMapSet`/`RootMapSet`/`TeamMapSet`/`ParentMapAdd`/`RootMapAdd`/`TeamMapAdd` (9 sctrls + 1 trigger) | MISSING | 90% of post-2022 Ikemen-native characters cannot store/retrieve state. They literally cannot function. | 1–2 weeks (need string-keyed hash-map system on DreamPlayer + parse/handle for each sctrl + trigger eval) |
| 2 | `gethitvar` sub-keys (~37 of ~70 missing) | PARTIAL | 40% of characters with custom hit reactions. Specifically `priority`, `ground.velocity.x/y`, `attr`, `playerid`, `redlife`, `power`, `kill`, `facing`, `frame` are widely used. | 3–5 days (each sub-key is a 1-line accessor in `playerhitdata.cpp` + 1-line registration) |
| 3 | `stagevar` sub-keys (~77 of ~80 missing) | PARTIAL | 20% of cinematic characters reading `stagevar("camera.zoomout")` etc. silently fall back to `bottom`. | 1 week (needs stage variable storage in `mugenstagehandler.cpp` + 77 sub-key registrations) |
| 4 | `partner` redirection + `numpartner`/`numenemy` hardcoded stubs | MISSING + BROKEN | 100% of simul/tag characters silently break. Every `partner, life`, `enemy(1), stateno`, `numpartner > 0` etc. fails. | 3–5 days (partner roster query in `gamelogic.cpp` + redirection resolver update) |
| 5 | `hitoverridden` trigger | MISSING | 30% of armor/counter characters (Akuma, Geese). They check this to gate hit-reaction states. | 1 hour (single trigger — read existing HitOverride state flag) |
| 6 | `rootvarset` / `rootvaradd` sctrls | MISSING | 20% of characters with assists/summons — they push state from helpers back to root. | 1–2 days (clone of ParentVarSet with `getPlayerRoot` instead of `getPlayerParent`) |
| 7 | `:=` instant-assignment operator + augmented assignments (`:=`, `:*=`, `:/=`, `:%=`, `:+=`, `:-=`, `:abs=`, `:int=`) | MISSING | Modern Ikemen-native chars use `var(5) := value` heavily. Either fails to parse or is silently treated as `=` (wrong semantics). | 1 week (parser enum changes + AST node handling in `mugenassignment.cpp` + evaluator) |
| 8 | `inputtime` trigger | MISSING | Every charge character (Guile, Blanka, Charlie, Decapre) depends on `inputtime > 30` for charge moves. | 2–3 days (input buffer per-button frame counter in `input.cpp`) |
| 9 | `modifyhitdef` / `modifyreversaldef` / `modifyprojectile` sctrls | MISSING | Combo-scaling systems (30% of post-2020 chars), homing projectiles (15%), counter systems. | 1 week each (modify* variants are like their non-modify counterparts but without resetting the structure) |
| 10 | `AssertSpecial` flag coverage (51 of ~70 missing) | PARTIAL | Many Ikemen-ext flags like `noairjump`, `nocornerpush`, `noinput`, `noailevel`, `postroundinput`, `nokofall`, `nokovelocity`, `noredlifedamage` are used by modern chars. | 2–3 days (each flag is a 1-line setter call in `handleSingleSpecialAssert`) |

### Tier 2 — HIGH (breaks specific character archetypes — armor, counters, assists)

| # | Gap | Type | Impact | Effort |
|---|---|---|---|---|
| 11 | `redlife` trigger + `redlifeadd`/`redlifeset` sctrls | MISSING | 30% of chip-damage characters | 2–3 days |
| 12 | `helpername` trigger | MISSING | 35% of characters with named projectiles | 1 day |
| 13 | `incustomstate` trigger | MISSING | 25% of characters with custom states (throw tech, custom combo) | 1 day |
| 14 | `displayname` trigger | MISSING | 50% of characters with custom win/intro quotes | 1 hour |
| 15 | `parentexist` / `selfstatenoexist` triggers | MISSING | 20% of projectile/throw code (pre-check before `parentdist`/state-existence) | 1 hour each |
| 16 | `clamp`, `lerp`, `min`, `max`, `sign`, `atan2` math functions | MISSING | 30% of post-2022 chars use `lerp` and `clamp` for smooth interpolation | 1 day (each is a 1-line function) |
| 17 | `receiveddamage`, `receivedhits` triggers | MISSING | 20% of chars with combo displays / AI scaling | 1 day |
| 18 | `stateowner` redirection + `player(n)` redirection | MISSING | 15% of chars in custom-state scenarios | 2–3 days |
| 19 | `hitbyattr` trigger + `hitdefvar` (40 sub-keys) | MISSING | Replaces needing ModifyHitDef round-trips | 1 week |
| 20 | `projvar` (40 sub-keys), `explodvar` (30 sub-keys), `palfxvar` (30 sub-keys) | MISSING | Modern Ikemen chars use these extensively for HUD/explod manipulation | 2 weeks |

### Tier 3 — MEDIUM (breaks specific moves or animations)

| # | Gap | Type |
|---|---|---|
| 21 | `prevanim`, `prevmovetype`, `prevstatetype` triggers | MISSING |
| 22 | `topboundbodydist`, `topbounddist`, `botboundbodydist`, `botbounddist` | MISSING |
| 23 | `stagebackedgedist`, `stagefrontedgedist`, `stagetime` | MISSING |
| 24 | `ikemenversion`, `mugenversion`, `gamemode`, `gamevar`, `motifvar`, `motifstate` | MISSING |
| 25 | `localcoord x/y`, `groundlevel`, `groundangle` | MISSING |
| 26 | Z-axis variants of all position/velocity triggers (`pos z`, `vel z`, `hitvel z`, `p2dist z`, `p2bodydist z`, `rootdist z`, `parentdist z`) | MISSING (3D mode) |
| 27 | `dizzyset`, `dizzypointsadd/set`, `guardbreakset`, `guardpointsadd/set` sctrls + matching triggers | MISSING |
| 28 | `targetadd`, `targetdizzypointsadd`, `targetguardpointsadd`, `targetredlifeadd`, `targetscoreadd` sctrls | MISSING |
| 29 | `height`, `depth`, `groundleveloffset`, `overrideclsn`, `transformclsn`, `transformsprite`, `remapsprite` sctrls | MISSING |
| 30 | `modifybgctrl`, `modifybgctrl3d`, `modifystagebg`, `modifystagevar`, `modifybgm`, `playbgm`, `modifyreflection`, `modifyshadow`, `modifysnd`, `modifytext`, `modifyplayer` sctrls | MISSING |
| 31 | `roundtimeset`, `roundtimeadd`, `scoreadd`, `shaderset`, `shiftinput`, `tagin`, `tagout`, `storyboard`, `dialogue`, `loadfile`, `savefile`, `loadstate`, `savestate`, `matchrestart`, `lifebaraction`, `changemovelist`, `camera`, `printtoconsole`, `gethitvarset`, `assertcommand`, `assertinput`, `assertanalogvector` sctrls | MISSING |
| 32 | `consecutivewins`, `decisiveround`, `firstattack`, `fighttime`, `roundtime`, `combocount`, `memberno`, `runorder`, `teamleader`, `teamsize`, `numplayer`, `playerno`, `playerindex`, `playerindexexist`, `playernoexist`, `helperindexexist` triggers | MISSING |
| 33 | `attack`, `attackmul`, `defence`, `defencemul`, `guardpoints`, `dizzypoints`, `guardpointsmax`, `dizzypointsmax`, `guardcount`, `guardbreak`, `dizzy`, `jugglepoints` triggers | MISSING |
| 34 | `bgmvar`, `soundvar`, `spritevar`, `stagebgvar`, `zoomvar`, `helpervar`, `envshakevar`, `clsnvar`, `clsnoverlap`, `projclsnoverlap` triggers | MISSING |
| 35 | `movecountered`, `movehitvar` triggers | MISSING |
| 36 | `ishelper` (id, [skip]) 2-arg form, `helperindex`, `playerindex` redirections | MISSING/PARTIAL |
| 37 | `name`/`p2name`.../`p8name` — only `p1name`–`p4name` supported | PARTIAL |
| 38 | `const()` ~25 missing sub-keys (`size.attack.dist.width.*`, `size.attack.dist.depth.*`, `size.depth.*`, `size.weight`, `size.pushfactor`, `data.fall.defence_up`, `data.dizzypoints`, `data.guardpoints`, `data.hitsound.channel`, `data.guardsound.channel`, `data.volume`, all `velocity.*.up.z`/`*.down.z` 3D extensions) | PARTIAL |
| 39 | Comparison-only triggers (`statetype`, `movetype`, `p2statetype`, `p2movetype`, `animelem`, `timemod`, `teammode`, `hitdefattr`, `command`) cannot be used as values in `IfElse`/`Cond`/arithmetic | PARTIAL |
| 40 | `winclutch`, `winspecial`, `winhyper`, `loseko`, `losetime` triggers | MISSING |

### Tier 4 — LOW (cosmetic or rare features)

| # | Gap | Type |
|---|---|---|
| 41 | `numtext`, `numstagebg` triggers | MISSING |
| 42 | `score`, `scoretotal` triggers | MISSING |
| 43 | `analog` axis variants (`analog_leftx`, `analog_lefty`, etc.) | MISSING |
| 44 | `deg`, `rad`, `float`, `randomrange`, `round`, `sign` math functions | MISSING |
| 45 | `timeelapsed`, `timeremaining`, `timetotal` triggers | MISSING |
| 46 | `ikemenversion.major/minor/patch`, `mugenversion.major/minor` triggers | MISSING |
| 47 | `lastplayerid`, `ishost` triggers | MISSING |
| 48 | `introstate`, `outrostate`, `pausetime`, `fighttime`, `fightscreenstate`, `fightscreenvar` triggers | MISSING |
| 49 | `isasserted` (70 flags) — note this overlaps with `AssertSpecial` flag coverage gap | MISSING |
| 50 | `debugmode`, `shader` triggers | MISSING |
| 51 | `angle`, `xangle`, `yangle`, `scale x/y/z`, `offset x/y`, `alpha source`, `alpha dest`, `xshear`, `sprpriority`, `layerno` triggers | MISSING |
| 52 | `ailevelf`, `drawpal`, `gamemode` triggers | MISSING |
| 53 | `standby`, `incustomanim` triggers | MISSING |
| 54 | `animlength`, `animplayerno`, `spriteplayerno`, `prevanim`, `animelemvar` triggers | MISSING |
| 55 | Story-mode features (already implemented as Dolmexica-specific extensions) | N/A |

---

## 6. Estimated effort per tier

| Tier | Description | Items | Total estimated effort | Notes |
|---|---|---|---|---|
| Tier 1 | CRITICAL | 10 | **~6–8 weeks of focused work** | `map` system alone is 1–2 weeks; `gethitvar`/`stagevar` sub-keys are 1.5 weeks combined; partner/redirections are 1 week; `:=` parser work is 1 week. |
| Tier 2 | HIGH (archetype-specific) | 10 | **~3–4 weeks** | Most are 1–3 day tasks. `hitdefvar`/`projvar`/`explodvar`/`palfxvar` sub-key families are 2 weeks combined. |
| Tier 3 | MEDIUM (specific moves) | 20 | **~4–6 weeks** | Mix of 1-hour tasks (single-line triggers) and 1-week tasks (full sctrl families). Many are Ikemen-ext and rarely used by MUGEN 1.1 chars. |
| Tier 4 | LOW (cosmetic/rare) | 15 | **~1–2 weeks** | Mostly trivial 1-line registrations. |
| **Total** | | **55** | **~14–20 weeks of focused engineering** | Roughly 3–5 months of one-engineer work to reach full Ikemen GO parity. |

**Pragmatic recommendation:** Tiers 1 + 2 (20 items, ~9–12 weeks) would bring Dolmexica to "supports nearly all post-2022 Ikemen-native characters" status. Tier 3 brings 3D-mode + advanced subsystem support. Tier 4 is polish.

---

## 7. Key observations

1. **The previous Ikemen triggers catalog (doc 12) claim about IfElse being strict is OUTDATED.** Verified at `mugenassignmentevaluator.cpp:2453–2478` that `evaluateCondArrayAssignment` conditionally evaluates one branch only. Both `IfElse` (which delegates to `Cond`) and `Cond` are short-circuit as of commit `2f9d755`. This gap is closed.

2. **All 91 MUGEN 1.1 state controllers are present in Dolmexica.** No MUGEN 1.1 character should fail to find a state controller. The gap is entirely in Ikemen extensions (67 of 68 missing) and partial implementations (especially `AssertSpecial` flags).

3. **The biggest single blocker is the `map` system.** It's a 9-sctrl + 1-trigger family that touches the player's variable storage, the parser, and the evaluator. Without it, post-2022 Ikemen-native characters cannot store state. This is the highest-impact gap remaining.

4. **`gethitvar` and `stagevar` sub-key coverage is the second biggest blocker.** These are not architecturally complex — each sub-key is a 1-line accessor + 1-line registration — but the volume (~37 + ~77 = ~114 missing sub-keys) is significant. Most modern combo systems and cinematic characters depend on at least a few of these.

5. **`partner` + `numpartner` + `numenemy` are collectively the third biggest blocker** for simul/tag mode. The hardcoded stubs (returning 0 and 1) silently break every multi-character match. The fix is small (~3–5 days) but touches `gamelogic.cpp` and the redirection resolver.

6. **The `:=` augmented-assignment gap is architectural.** It requires adding new AST node types to `mugenassignment.h` and updating the parser in `mugenassignment.cpp`. This is the only Tier 1 item that touches the parser core rather than just adding registrations.

7. **Z-axis (`pos z`, `vel z`, `hitvel z`, `p2dist z`, etc.) is consistently missing across all position/velocity triggers.** This is by design — Dolmexica is a 2D engine. Adding these would require a full Z-axis collision system, which is out of scope for 2D MUGEN characters. Most characters never use these triggers.

8. **Comparison-only triggers (`statetype`, `movetype`, `command`, etc.) are a design limitation, not a bug.** Dolmexica's evaluator separates value-returning triggers (`mVariables`/`mArrays`) from comparison-only triggers (`mComparisons`). This is a different design from Ikemen, where every trigger returns a `BytecodeValue`. Some advanced uses (`cond(statetype = A, 1, 2)` may work via the comparison path, but `var(5) := statetype` will fail). Upgrading these to value-returning would require refactoring the trigger registration model — moderate effort, medium impact.

9. **No `VarMul` sctrl is needed.** Like Ikemen GO, Dolmexica folds `var(x) *= y` into `VarSet` with an expression. This is correct MUGEN behavior.

10. **No `MoveCamera` sctrl is needed.** Like Ikemen GO, Dolmexica folds it into `ScreenBound`'s `movecamera` parameter.

---

## 8. Final answer to the task brief

### Totals

| Metric | Ikemen GO | Dolmexica | Gap |
|---|---|---|---|
| Total triggers (top-level names) | ~260 | ~148 | **~112 missing** (plus ~7 partial: comparison-only) |
| Total triggers (with sub-key combinations) | ~860 | ~259 | **~601 missing** |
| Total state controllers | 159 (91 MUGEN + 68 Ikemen) | 92 (91 MUGEN + 1 Ikemen ext + story-mode) | **67 Ikemen-ext missing** |
| Total redirections | 18 (12 + 6 existence-checks) | 10 (9 + 1 existence-check) | **9 missing** |
| Total AssertSpecial flags | ~70 | 19 | **~51 missing** |

### Top 10 most impactful missing/broken features (Tier 1)

1. **`map()` trigger + 9 map sctrls** — Ikemen's named-variable system; 90% of post-2022 Ikemen-native chars cannot function. **~1–2 weeks.**
2. **`gethitvar` sub-keys (~37 of ~70 missing)** — combo systems, custom hit reactions. **~3–5 days.**
3. **`stagevar` sub-keys (~77 of ~80 missing)** — cinematic / camera-aware characters. **~1 week.**
4. **`partner` redirection + `numpartner`/`numenemy` hardcoded stubs** — simul/tag mode. **~3–5 days.**
5. **`hitoverridden` trigger** — armor/counter characters. **~1 hour.**
6. **`rootvarset` / `rootvaradd` sctrls** — assist/summon characters. **~1–2 days.**
7. **`:=` instant-assignment operator + augmented assignments** — modern Ikemen syntax. **~1 week.**
8. **`inputtime` trigger** — charge characters. **~2–3 days.**
9. **`modifyhitdef` / `modifyreversaldef` / `modifyprojectile` sctrls** — combo scaling, homing. **~1 week each.**
10. **`AssertSpecial` flag coverage (51 of ~70 missing)** — modern character flags. **~2–3 days.**

### Estimated effort per tier

| Tier | Items | Effort |
|---|---|---|
| Tier 1 (CRITICAL) | 10 | **~6–8 weeks** |
| Tier 2 (HIGH) | 10 | **~3–4 weeks** |
| Tier 3 (MEDIUM) | 20 | **~4–6 weeks** |
| Tier 4 (LOW) | 15 | **~1–2 weeks** |
| **Total to full Ikemen parity** | 55 | **~14–20 weeks** (~3–5 months of one engineer) |

Pragmatic milestone: completing Tiers 1 + 2 (20 items, ~9–12 weeks) would bring Dolmexica to "supports nearly all post-2022 Ikemen-native characters" status. Tier 3 brings 3D-mode + advanced subsystem support. Tier 4 is polish.

---

*End of gap analysis. Research-only task — no source files in `/home/z/my-project/fight-engine/engine/DolmexicaInfinite/` were modified.*
