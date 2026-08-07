# Dolmexica → MUGEN 1.1 Compatibility Plan

**Date:** 2026-08-09
**Task ID:** 20-d
**Scope:** Phased implementation plan to bring the Dolmexica Infinite engine to full **MUGEN 1.1** specification parity with Ikemen GO. This document is the actionable successor to the gap analysis in `14-engine-gap-analysis.md` — every task listed here traces directly to a Tier 1–4 gap identified in that audit.
**Status:** Planning document. No source files modified.

**Source materials:**
- `12-ikemen-triggers-catalog.md` — Ikemen GO's ~260 top-level triggers + ~600 sub-key combinations.
- `13-ikemen-state-controllers-catalog.md` — Ikemen GO's 159 state controllers (91 MUGEN + 68 Ikemen).
- `14-engine-gap-analysis.md` — Per-item cross-reference (Dolmexica PRESENT / MISSING / PARTIAL / BROKEN).
- Ikemen GO source: `ikemen-go/src/{compiler,compiler_functions,bytecode,char}.go`.
- Dolmexica source: `engine/DolmexicaInfinite/{mugenassignment,mugenassignmentevaluator,mugenstatecontrollers,playerdefinition}.cpp`.

---

## 1. Executive summary

### Current state (post-task 20-c audit)

| Metric | Ikemen GO | Dolmexica | Coverage | Gap |
|---|---|---|---|---|
| Top-level trigger names | ~260 | ~148 | **57%** | ~112 missing + ~7 partial |
| Trigger sub-key combinations | ~860 | ~259 | ~30% | ~601 missing |
| State controllers | 159 (91 MUGEN + 68 Ikemen) | 92 (91 MUGEN + 1 Ikemen ext + story) | **58%** overall / **100% MUGEN** / **1.5% Ikemen** | 67 Ikemen extensions missing |
| Redirection triggers | 18 | 10 | 56% | 9 missing |
| AssertSpecial flags | ~70 | 19 | 27% | ~51 missing |

### Goal

**100% MUGEN 1.1 compatibility** — every behavior defined in the MUGEN 1.1 specification (the language spoken by every MUGEN character written between 2011 and the present) must work identically to Ikemen GO. Concretely:

1. Every trigger documented in the MUGEN 1.1 trigger list (everything in `12-ikemen-triggers-catalog.md` that is **NOT marked `[Ikemen]`**) is registered, value-returning, and semantically correct.
2. Every state controller in the MUGEN block of Ikemen's `scmap` (`compiler.go:38–129`, 91 controllers) is registered with all of its MUGEN 1.1 parameters parsed and applied correctly.
3. Every MUGEN 1.1 AssertSpecial flag (compiler_functions.go:171–172 — 10 char flags + 10 global flags = 20) is dispatched.
4. CNS syntax edge cases that Ikemen handles (legacy `projhit[id]`, `var(x) := y`, range expressions `[a,b]`, comparison triggers used in value contexts) all parse without warnings.

### Out of scope (OPTIONAL stretch goals)

Ikemen-only extensions are **not** required for MUGEN 1.1 compatibility. They are tracked here only because some characters cross the line and use them anyway. They are explicitly marked **[STRETCH]** throughout:

- **Map system** — `map()` trigger + `MapSet/MapAdd/MapReset/ParentMapSet/ParentMapAdd/RootMapSet/RootMapAdd/TeamMapSet/TeamMapAdd` sctrls. Used by ~90% of post-2022 Ikemen-native characters but **not** by any pure MUGEN 1.1 character.
- **Z axis** — `pos z`, `vel z`, `hitvel z`, `p2dist z`, `size.depth.*`, `velocity.*.down.z/.up.z`. MUGEN 1.1 is 2D; Z is Ikemen's 3D mode.
- **Text sctrls** — `Text`, `ModifyText` (Ikemen's generalization of `DisplayToClipboard`). `RemoveText` is already in Dolmexica.
- **MatchRestart** — mid-match character swaps. Cutscene-only.
- **TagIn/TagOut** — tag-team control. Ikemen-mode feature.
- **Score/Dizzy/GuardPoints subsystems** — Ikemen score/dizzy/guard meters.
- **StageVar beyond MUGEN 1.1** — the ~77 missing sub-keys are mostly Ikemen's stage enhancements (camera zoom indelay, shadow.xshear, reflection.*). MUGEN 1.1 only defines `info.author`, `info.name`, `info.displayname`, plus a few camera.* fields.

These items appear in the plan as `[STRETCH]` tasks at the end of each phase. They can be skipped without affecting the MUGEN 1.1 milestone.

### Already-fixed items (this session, commits `cc943d7`..`e931a5d`)

See `14-engine-gap-analysis.md` §4 for the full table. These are the baselines we build on; **they are not re-listed in the phases below**:
- `enemy(n)` redirection — fixed in `12052ff`
- `IfElse` delegates to `Cond` (short-circuit) — fixed in `2f9d755`
- `airjumpcount` trigger — fixed in `2f9d755`
- All single-number jump velocities inherit `jump.neu.Y` — fixed in `e931a5d`
- SFF v2 palette link resolution (two-pass loader) — fixed in `110a03f` + `655f57a`
- JUS 32-color palette: fill entries `[n..255]` with last valid color — fixed in `4a114d2`
- Trans alpha clamping to `[0, 256]` — fixed in `cc943d7`
- `IsHomeTeam` returns `mAILevel > 0` (not `mRootID`) — fixed in `cc943d7`
- Air-jump `mJumpFlank` bypass when external Up input held ≥ 8 ticks — fixed in `cc943d7`

---

## 2. Architecture overview

### 2.1 How Dolmexica parses CNS

The Dolmexica pipeline is **AST + runtime evaluation**:

```
 CNS source text
      │
      ▼
mugenscriptparser  ──── parses [State], [Statedef], [Command] blocks
      │                  into MugenDefScriptGroup objects
      ▼
mugenassignment    ──── parses RHS expressions ("trigger expressions")
      │                  into a DreamMugenAssignment* AST tree.
      │                  See mugenassignment.h for the 33-variant enum:
      │                  MUGEN_ASSIGNMENT_TYPE_{VARIABLE,ARRAY,COMPARISON,
      │                  AND,OR,ADDITION,MULTIPLICATION,SET_VARIABLE,...}
      ▼
mugenassignmentevaluator  ── evaluates AST trees at runtime against a
      │                       DreamPlayer*. Four lookup tables:
      │                       gVariableHandler.mVariables   (single-value triggers)
      │                       gVariableHandler.mArrays      (function triggers)
      │                       gVariableHandler.mComparisons (comparison-only)
      │                       gVariableHandler.mOrdinals    (animelem)
      ▼
AssignmentReturnValue  ── tagged-union (NUMBER/FLOAT/STRING/BOOLEAN/VECTOR/
                          RANGE/BOTTOM), 200-byte buffer, returned by value
                          from each evaluateXxx() function.
```

For state controllers:

```
mugenstatecontrollers.cpp:5765  setupStateControllerParsers()
   gMugenStateControllerParsers["sctrlname"] = parseFunction
      │
      ▼
parseXxxController(tController, tGroup)  ── extracts named parameters from
      │                                     the MugenDefScriptGroup into a
      │                                     XxxController* struct.
      ▼
handleXxxController(tController, tPlayer)  ── called per-frame by the state
                                              machine; runs the sctrl.
unloadXxxController(tController)            ── frees memory.
```

### 2.2 How Ikemen GO parses CNS

The Ikemen pipeline is **bytecode compilation + VM execution**:

```
CNS source text
      │
      ▼
compiler.go:tokenizer()  ── char-by-char token stream
      │
      ▼
CharCompiler.expValue()  (compiler.go:1272–5329)
   switch c.token { case "trigger_name": emit OC_* opcodes }
      │
      ▼
BytecodeExp  (a []byte of opcodes + constant pool)
      │
      ▼
bytecode.go:BytecodeExp.run() / runExternal()
   sys.bcStack.PushI(...); switch opc { case OC_ex_hitoverridden: ... }
      │
      ▼
mutates *Char (char.go)
```

For state controllers, Ikemen uses a *different* mechanism — `scmap` (compiler.go:37–199) registers a parser function per sctrl name, the parser packs parameters into a `StateControllerBase` (just a `[]byte`), and the runtime dispatches via `StateControllerBase.run(c, func(paramID, exp) bool { ... })`. No opcodes for sctrls — only for triggers.

### 2.3 Key difference: AST vs bytecode

| Aspect | Dolmexica (AST) | Ikemen (bytecode) |
|---|---|---|
| Parse cost | Low (just build a tree) | Medium (build tree + emit opcodes) |
| Runtime cost | High (walks tree, dispatches through std::map lookups per node) | Low (linear scan over []byte, jump table dispatch) |
| Memory per trigger expr | One node per operator + leaf, allocated on a `MemoryStack` | One contiguous `[]byte` per expr |
| Branch side effects in `IfElse`/`Cond` | Easy to skip — just don't recurse into the unused branch (already implemented in `evaluateCondArrayAssignment` lines 2453–2478) | Requires bytecode `jz`/`jmp` |
| WASM suitability | Good — flat memory layout, no JIT | Good — but bytecode dispatch needs an indirect-jump table, which emscripten handles fine |
| Extensibility | Adding a trigger = register a `static AssignmentReturnValue* func(DreamPlayer*)` and one line in `setupVariableAssignments()`. Adding an sctrl = 3 functions (`parse`/`handle`/`unload`) and one line in `setupStateControllerParsers()`. | Adding a trigger = emit a new `OC_*` opcode, add a case in `expValue`, add a case in `BytecodeExp.run`. Adding an sctrl = a new entry in `scmap` + a parser function + a runtime case. |

### 2.4 Recommendation: keep Dolmexica's AST approach

**Decision:** Do NOT rewrite Dolmexica to use Ikemen-style bytecode. The AST approach is:

1. **Simpler to extend** — each new trigger is ~5 lines (1 static function + 1 registration line), no opcode bookkeeping.
2. **Already works for WASM** — emscripten handles `std::map<string, func>` and recursive AST walks fine; the binary size cost is negligible.
3. **Already short-circuit** — the `Cond`/`IfElse` short-circuit fix (commit `2f9d755`) is implemented by AST traversal, no need for jz/jmp.
4. **Performance is acceptable** — Dolmexica already runs at 60 FPS for 4-player simul + helpers; the bottleneck is rendering, not expression evaluation.

The **only** architectural change required is in Phase 2 (variable system): the `:=` augmented-assignment operator needs new AST node types because the current `MUGEN_ASSIGNMENT_TYPE_SET_VARIABLE` node only supports plain assignment (`=`). This is a *localized* parser change, not a rewrite.

### 2.5 Where to add things — quick reference

| What you're adding | File | Function / table | Pattern to copy |
|---|---|---|---|
| Single-value trigger (`hitoverridden`, `inputtime`, `redlife`, …) | `mugenassignmentevaluator.cpp` | `setupVariableAssignments()` at line 1978; new `static AssignmentReturnValue* func(DreamPlayer*)` near line 1780 | `numEnemyFunction` (line 1805) or `moveHitFunction` (line 1801) |
| Function trigger with arg (`map(name)`, `clamp(x,lo,hi)`, …) | `mugenassignmentevaluator.cpp` | `setupArrayAssignments()` at line 2661; new `static AssignmentReturnValue* func(DreamMugenAssignment** tIndexAssignment, DreamPlayer* tPlayer, int* tIsStatic)` near line 2620 | `floorFunction` (line 2621) or `condFunction` (line 2635) |
| Comparison-only trigger (`statetype`, `command`, …) | `mugenassignmentevaluator.cpp` | `setupComparisons()` at line 1731 | `evaluateStateTypeComparison` family |
| `gethitvar(xxx)` sub-key | `mugenassignmentevaluator.cpp` | block at lines 2180–2212; new function in `playerhitdata.cpp` that reads from the cached hit struct | `getHitVarHitTimeFunction` |
| `const(xxx)` sub-key | `mugenassignmentevaluator.cpp` | block at lines 2101–2178 | `data.life` registration |
| `stagevar(xxx)` sub-key | `mugenassignmentevaluator.cpp` | `evaluateStageVarArrayAssignment` at line 2301 — extend the `if/else if` chain | `info.author` branch (line 2306) |
| Redirection (`partner`, `player`, `stateowner`, …) | `mugenassignmentevaluator.cpp` | `getRegularPlayerFromFirstVectorPartOrNullIfNonexistant` at line 616; register the array form in `setupArrayAssignments()` near line 2697 | `enemyFunction` (line 2649) + the `strcmp("enemy", text)` branch at line 664 |
| State controller | `mugenstatecontrollers.cpp` | `setupStateControllerParsers()` at line 5765; add `parseXxx`/`handleXxx`/`unloadXxx` triplet | `parentVarSetParseFunction` family |
| AssertSpecial flag | `mugenstatecontrollers.cpp` | `handleSingleSpecialAssert` at line 3498 — extend the `if/else if` chain | `"intro"` branch (line 3502) |

---

## 3. Phased implementation plan

### Phase 1 — Critical trigger fixes (Weeks 1–2)

**Objective:** Close the trigger-level gaps that silently break common characters (attacks, movement, AI, charge moves, armor). Every item here is in Tier 1 of `14-engine-gap-analysis.md` §5. No architecture changes — every fix is "add a function + register it in a table".

**Total estimated effort:** 9–13 engineer-days.

---

#### Phase 1.1 — `hitoverridden` trigger

| Field | Value |
|---|---|
| **Objective** | Allow armor/counter characters (Akuma, Geese, KoldSpidey) to gate their hit-reaction states. Without this trigger, characters that use `ifelse(hitoverridden, stateno_A, stateno_B)` parse-fail or silently evaluate to bottom. |
| **Files to modify** | `mugenassignmentevaluator.cpp` (1-line function + 1-line registration) |
| **Implementation** | Add a static function `hitOverriddenFunction(DreamPlayer* tPlayer)` near line 1805 that returns `makeBooleanAssignmentReturn(isPlayerHitOverrideActive(tPlayer))`. Register `gVariableHandler.mVariables["hitoverridden"] = hitOverriddenFunction;` inside `setupVariableAssignments()` near the existing `hitover`/`hitpausetime` block. Add `isPlayerHitOverrideActive()` to `playerdefinition.cpp` — returns true if the player's `mHitOverrideTime > 0` (the existing HitOverride state already tracks this; see `setPlayerHitOverrideFlag` in `playerdefinition.cpp`). |
| **Ikemen GO reference** | `compiler.go:4657` — `case "hitoverridden": out.append(OC_ex_, OC_ex_hitoverridden)`. Runtime: `bytecode.go:3333` — `case OC_ex_hitoverridden: sys.bcStack.PushB(c.hoverIdx >= 0)`. The Ikemen semantics: returns true if any HitOverride slot is currently active (i.e. the player would enter the override state rather than the gethit state on the next hit). |
| **Test characters** | KoldSpidey (uses `hitoverridden` to gate counter state), any Akuma/Geese armor char. |
| **Risk** | None — pure additive. No existing behavior changes. |
| **Effort** | 1 hour (including test). |

---

#### Phase 1.2 — `partner` redirection + `numpartner`/`numenemy` real implementation

| Field | Value |
|---|---|
| **Objective** | Fix simul/tag mode. Currently `numpartner` returns hardcoded 0 (line 1808) and `numenemy` returns hardcoded 1 (line 1805), and `partner,` redirection doesn't resolve (not in `getRegularPlayerFromFirstVectorPartOrNullIfNonexistant`). This breaks every character that branches on team size or queries partner state. |
| **Files to modify** | `mugenassignmentevaluator.cpp` (3 functions + 1 redirection branch + 2 registrations + 1 array registration), `gamelogic.cpp` (new query functions `getPartnerCount`, `getEnemyCount`, `getPlayerPartnerByIndex`). |
| **Implementation** | **(a)** Replace `numEnemyFunction` body (line 1805) to call `getEnemyCount(tPlayer)` — returns the number of players on the opposite team that are alive and not in standby. **(b)** Replace `numPartnerFunction` body (line 1808) to call `getPartnerCount(tPlayer)` — returns the number of players on the same team (excluding self) that are alive and not in standby. **(c)** Add `partnerFunction` (array form, like `enemyFunction` at line 2649): `return evaluateTargetArrayAssignment(evaluateAssignmentDependency(tIndexAssignment, tPlayer, tIsStatic), "partner");` and register `gVariableHandler.mArrays["partner"] = partnerFunction;`. **(d)** Extend `getRegularPlayerFromFirstVectorPartOrNullIfNonexistant` (line 616) to handle the array case: add `else if (arrayVar->mFunc == partnerFunction) { strcpy(text, "partner"); }` to the dispatch block at lines 628–642. **(e)** Add `else if (!strcmp("partner", text)) { return getPlayerPartnerByIndex(tPlayer, id); }` to the resolution block at lines 651–689. **(f)** Implement `getPartnerCount`, `getEnemyCount`, `getPlayerPartnerByIndex` in `gamelogic.cpp` — they iterate the existing player roster (already accessible via `getRootPlayer(idx)` and `getPlayerHelperAmount()` patterns). Use the same team-side test as `teamSideFunction` (line 1849: `tPlayer->mRootID + 1`). |
| **Ikemen GO reference** | `compiler.go:1466` — `case "partner", "enemy", "enemynear", ...`. `compiler.go:1470` — `case "partner": opc = OC_partner`. Runtime: `bytecode.go:1964` — `case OC_partner:`. `compiler.go:3188` — `numpartner` returns `len(c.teamPartners)`. `compiler.go:3176` — `numenemy` returns enemy count from `sys.chars` filtered by team side. |
| **Test characters** | Any 2v2 simul match with Spider-Man_SR or Nightwing on both sides. Verify `numpartner > 0` returns 1, `partner, life` returns the partner's HP, `enemy(1), stateno` returns the second enemy's state. |
| **Risk** | Medium. The "team side" calculation in Dolmexica relies on `mRootID` which has subtle semantics around helpers. Need to filter out helpers from the partner/enemy counts (use `isPlayerHelper(tPlayer)` check, already exists). Also need to handle turns mode (where `numpartner` should be `teamSize - 1` but the partner is off-screen). |
| **Effort** | 3–5 days. |

---

#### Phase 1.3 — `inputtime` trigger

| Field | Value |
|---|---|
| **Objective** | Enable charge characters (Guile, Blanka, Charlie, Decapre) that gate moves on `inputtime(B) > 30`. |
| **Files to modify** | `mugenassignmentevaluator.cpp` (1 function + 1 array registration + key-name dispatch), `input.cpp` or `playerdefinition.cpp` (per-button frame counter accessors). |
| **Implementation** | Ikemen's `inputtime` takes a single key-name argument (`B`, `D`, `F`, `U`, `L`, `R`, `N`, `a`–`z`, `s`, `d`, `w`, `m`) and returns the number of frames since that key was last pressed (0 if currently down, higher = longer ago). Add `inputTimeFunction(DreamMugenAssignment** tIndexAssignment, DreamPlayer* tPlayer, int* tIsStatic)` near line 2620: evaluate the index assignment to a string, then dispatch on the key name to a new `getInputBufferTimeForKey(tPlayer, key)` function. Register `gVariableHandler.mArrays["inputtime"] = inputTimeFunction;`. The per-button frame counter already exists in Dolmexica's input buffer — verify by reading `playerdefinition.cpp`'s input handling (look for `mInputBuffer` or similar; the `command` trigger at line 1185 of the evaluator reads from this buffer, so the data is there). |
| **Ikemen GO reference** | `compiler.go:4681` — `case "inputtime":` parses a key name and emits one of 17 `OC_ex_inputtime_X` opcodes. Runtime: `bytecode.go:3346–3380` — reads `c.cmd[0].Buffer.{Bb,Db,Fb,Ub,...}`. The Ikemen buffer counts *frames since last press*, so a key currently held returns 0, a key released 5 frames ago returns 5. |
| **Test characters** | Guile MUGEN 1.1 (charge Sonic Boom: `inputtime(B) > 30 && command("QCF")`). |
| **Risk** | Low-medium. Need to confirm Dolmexica's input buffer counts "frames since release" (Ikemen semantics) vs "frames held" (different semantics). If the buffer counts frames-held, invert: `inputtime = MAX_BUFFER - framesHeld` when released, or 0 when held. |
| **Effort** | 2–3 days. |

---

#### Phase 1.4 — Remaining `gethitvar` sub-keys (~37 missing)

| Field | Value |
|---|---|
| **Objective** | Close the 37 of ~70 missing `gethitvar(*)` sub-keys so combo systems, custom hit reactions, and hit-tracking HUDs work. |
| **Files to modify** | `mugenassignmentevaluator.cpp` (extend the registration block at lines 2180–2212 with ~37 new lines + ~37 new `getHitVarXxxFunction` definitions near line 2180), `playerhitdata.cpp` (the actual accessors — read from the cached `PlayerHitData` struct that already stores these fields). |
| **Implementation** | Each sub-key is a 2-line patch: (1) a `static AssignmentReturnValue* getHitVarXxxFunction(DreamPlayer* tPlayer) { return makeNumberAssignmentReturn(getPlayerHitVarXxx(tPlayer)); }` and (2) a registration line `gVariableHandler.mVariables["gethitvar(xxx)"] = getHitVarXxxFunction;`. The accessor in `playerhitdata.cpp` reads a field from `mCurrentHitData` (the existing struct populated by `applyHitDef` — verify these fields are populated, not just declared). Sub-keys to add (priority order): **(a) high-traffic** `priority`, `ground.velocity.x`, `ground.velocity.y`, `air.velocity.x`, `air.velocity.y`, `attr`, `playerid`, `kill`, `facing`, `frame`, `power`, `hitpower`. **(b) medium-traffic** `redlife`, `hitdamage`, `guarddamage`, `dizzypoints`, `guardpoints`, `guardcount`, `score`. **(c) low-traffic** `air.animtype`, `ground.animtype`, `fall.animtype`, `xaccel`, `yaccel`, `zvel`, `zaccel`, `zoff`, `down.recover`, `guardflag`, `keepstate`, `projid`, `guardko`, `teamside`, `playerno`, `down.velocity.x/y`, `guard.velocity.x/y`, `airguard.velocity.x/y`. |
| **Ikemen GO reference** | `compiler.go:2562–2777` — the entire `gethitvar(...)` sub-key switch. Each `case "xxx":` block emits one `OC_gethitvar` variant. Runtime: `bytecode.go` — `case OC_gethitvar_xxx:` reads from `c.hitVar`. The exact field list is in `char.go` struct `Char` — search for `hitVar`. |
| **Test characters** | Nightwing (uses `gethitvar(priority)` for combo scaling), Goku_UI (uses `gethitvar(power)` for power steal), any character with `gethitvar(attr)` checks for "is this a throw?" branching. |
| **Risk** | Low for the simple sub-keys. Medium for `attr` (it's a flag, not a number — needs special return type handling, returns the attribute bitfield as an int that the CNS `&` operator can mask). Medium for `ground.velocity.x` because Dolmexica currently stores the gethit velocity as a Vector2D and the sub-key extracts just the X component — need to verify the sign convention matches Ikemen (leftward velocity is negative). |
| **Effort** | 3–5 days (37 sub-keys × ~30 minutes each, plus 1 day for `attr`/`flag` handling). |

---

#### Phase 1.5 — Remaining `const(xxx)` sub-keys

| Field | Value |
|---|---|
| **Objective** | Close the ~25 missing `const()` sub-keys that are part of MUGEN 1.1's `[Data]`, `[Size]`, `[Velocity]`, `[Movement]` definitions. Skip the Z-axis variants (`size.depth.*`, `velocity.*.down.z`, `velocity.*.up.z`) — those are Ikemen-only 3D extensions. |
| **Files to modify** | `mugenassignmentevaluator.cpp` (extend the registration block at lines 2101–2178 with ~15 new entries), `playerdefinition.cpp` (accessors for the missing `[Size]` and `[Data]` fields). |
| **Implementation** | Same pattern as `gethitvar` — 2-line patch per sub-key. Missing MUGEN 1.1 sub-keys: `data.fall.defence_up`, `data.fall.defence_mul`, `data.hitsound.channel`, `data.guardsound.channel`, `data.volume`, `size.attack.dist.width.front`, `size.attack.dist.width.back`, `size.attack.dist.height.top`, `size.attack.dist.height.bottom`, `size.proj.attack.dist.width.front`, `size.proj.attack.dist.width.back`, `size.proj.doscale`. (Skip `size.depth.*`, `size.weight`, `size.pushfactor`, `size.attack.dist.depth.*`, `size.attack.depth.*`, all `velocity.*.z` — those are Ikemen 3D extensions.) |
| **Ikemen GO reference** | `compiler.go:2044–2331` — `const(...)` switch. Each sub-key reads from `c.gi().constants` (a struct populated from the .def file's `[Size]`/`[Data]`/`[Velocity]`/`[Movement]` sections). |
| **Test characters** | Any character with `const(size.attack.dist)` checks (most modern characters use the .width.front/.width.back split for crouch/stand detection). |
| **Risk** | Low — read-only accessors. The .def parser already loads these fields; just expose them. |
| **Effort** | 1–2 days. |

---

#### Phase 1.6 — `isasserted` trigger + AssertSpecial flag coverage (Part 1: trigger)

| Field | Value |
|---|---|
| **Objective** | Add the `isasserted(flag)` trigger so characters can query AssertSpecial state. The 51 missing flags are added in Phase 3.2; this task only adds the trigger itself + the 19 already-dispatched flags. |
| **Files to modify** | `mugenassignmentevaluator.cpp` (new array function + registration). |
| **Implementation** | Add `isAssertedFunction(DreamMugenAssignment** tIndexAssignment, DreamPlayer* tPlayer, int* tIsStatic)` near line 2620: evaluate the index assignment to a string (the flag name), then dispatch via `isPlayerAssertedFlagActive(tPlayer, flagName)`. Register `gVariableHandler.mArrays["isasserted"] = isAssertedFunction;`. The `isPlayerAssertedFlagActive` function (new, in `playerdefinition.cpp`) checks the player's per-frame flag store — for the 19 already-dispatched flags, just query the same state that `setPlayerXxxFlag` writes. For the 51 not-yet-dispatched flags, return false until Phase 3.2. **Important: also handle global flags** (`nobardisplay`, `nobg`, `nofg`, `nomusic`, `roundnotover`, `timerfreeze`, `globalnoshadow`, `noko`, `nokoslow`, `nokosnd`) via `isDreamGlobalAssertedFlagActive(flagName)` — these are stored globally, not per-player. |
| **Ikemen GO reference** | `compiler.go:4728–4898` — `case "isasserted":` switch on the flag name (60+ cases). Runtime: `bytecode.go` reads `c.sf.getassertflag` / `sys.sf.getassertflag`. The flag store is in `char.go` struct `Char` — `sf` field (a bitset of 64+ flags). |
| **Test characters** | Characters that check `isasserted(noko)` (used in survival modes), `isasserted(timerfreeze)` (cutscene chars). |
| **Risk** | Low. The trigger is read-only. Future flag additions in Phase 3.2 will automatically be queryable once `isPlayerAssertedFlagActive` is extended. |
| **Effort** | 1 day. |

---

#### Phase 1.7 — `[STRETCH]` Ikemen-only `parentexist` and `selfstatenoexist` existence-checks

| Field | Value |
|---|---|
| **Objective** | Add 2 existence-check triggers used by projectile/throw code before calling `parentdist`/state-existence pre-checks. Technically Ikemen extensions but trivial and used by many MUGEN 1.1-era characters. |
| **Files to modify** | `mugenassignmentevaluator.cpp` (2 functions + 2 registrations). |
| **Implementation** | `parentExistFunction(DreamPlayer* tPlayer)` returns `makeBooleanAssignmentReturn(getPlayerParent(tPlayer) != NULL)`. `selfStateNoExistFunction(DreamMugenAssignment** tIndexAssignment, DreamPlayer* tPlayer, int* tIsStatic)` evaluates the index to a state number and returns true if the player's state file defines that state. Register both in `setupVariableAssignments()` near the existing `playeridexist` block. |
| **Ikemen GO reference** | `compiler.go:4091` (`parentexist`), `compiler.go:5099` (`selfstatenoexist`). |
| **Test characters** | Most projectile-using characters check `parentexist` before calling `parent, pos x` to avoid null-deref warnings. |
| **Risk** | None. |
| **Effort** | 1 hour. |

---

### Phase 2 — Variable system enhancements (Weeks 3–4)

**Objective:** Modernize the variable system. The `:=` instant-assignment operator is used by nearly every post-2015 character. The map system is the single biggest remaining blocker for post-2022 Ikemen-native characters (but is **[STRETCH]** — not required for MUGEN 1.1 parity).

**Total estimated effort:** 1.5–2.5 weeks (1 week for `:=` + 3 days for RootVar sctrls + 1 day for ParentVar verification + 1–2 weeks for [STRETCH] map system).

---

#### Phase 2.1 — `:=` instant-assignment operator + augmented assignments

| Field | Value |
|---|---|
| **Objective** | Support `var(5) := value` syntax (instant assignment that returns the assigned value, so it can be nested inside `Cond`/`IfElse`/arithmetic). Also support augmented variants `:*=`, `:/=`, `:%=`, `:+=`, `:-=` (the last two are syntactic sugar — Ikemen supports them too). |
| **Files to modify** | `mugenassignment.h` (new enum values for augmented assignment AST nodes), `mugenassignment.cpp` (parser — recognize `:=` token in the assignment-rule of the grammar), `mugenassignmentevaluator.cpp` (evaluate the new node types — they call `setPlayerVariable`/`setPlayerFloatVariable` and return the assigned value). |
| **Implementation** | **(a)** Add 5 new enum values to `DreamMugenAssignmentType` (mugenassignment.h:27): `MUGEN_ASSIGNMENT_TYPE_INSTANT_SET_VARIABLE`, `MUGEN_ASSIGNMENT_TYPE_INSTANT_MUL_VARIABLE`, `MUGEN_ASSIGNMENT_TYPE_INSTANT_DIV_VARIABLE`, `MUGEN_ASSIGNMENT_TYPE_INSTANT_MOD_VARIABLE`, `MUGEN_ASSIGNMENT_TYPE_INSTANT_ADD_VARIABLE`, `MUGEN_ASSIGNMENT_TYPE_INSTANT_SUB_VARIABLE`. **(b)** In `mugenassignment.cpp`, extend the assignment parser: when the next token after a variable-reference node is `:=` (or `:*=` etc.), build a new `DreamMugenDependOnTwoAssignment` node with the new type, where `a` is the variable reference and `b` is the RHS expression. **(c)** In `mugenassignmentevaluator.cpp`, extend `evaluateAssignmentStart` (or wherever the `MUGEN_ASSIGNMENT_TYPE_SET_VARIABLE` case is handled) to handle the new types: evaluate `b`, then apply the operation to the variable's current value (for `:=`, just use `b` directly; for `:*=`, read current value, multiply by `b`; etc.), write back, and return the new value as the assignment return. **Critical:** the `:=` operator must NOT be confused with the existing `=` operator used in `var(x) = value` VarSet parameter syntax. The parser must only recognize `:=` when it appears in a *trigger expression context* (RHS of `trigger = expr`, or inside `Cond(...)`/`IfElse(...)` arguments), not in sctrl parameter assignments. |
| **Ikemen GO reference** | `compiler.go:1676` — `case "var":` emits `OC_var` plus an `OC_st_var` after a `:=` token (similar for fvar/sysvar/sysfvar). `compiler.go:4918` — `case "map":` does the same for map. The augmented forms `:*=`, `:/=`, `:%=` are handled in `compiler.go`'s `expAssign` helper. Runtime: `bytecode.go` — `case OC_st_var: c.varSet(...)` performs the assignment and pushes the new value back on the stack. |
| **Test characters** | Spider-Man_SR (uses `var(50) := 1` in Cond branches), any modern character with `var(time) := time + 1` patterns. |
| **Risk** | High. This is the only Phase 2 task that touches the parser core. Risks: (1) the `:=` token may already be lexically consumed elsewhere (need to audit `mugenassignment.cpp`'s tokenizer); (2) the augmented forms `:+=`/`:-=` are 3-character tokens that may need explicit tokenizer support; (3) the assignment must be evaluated for side effects even when nested inside an `IfElse` branch that's NOT taken — wait, no, with short-circuit `Cond`, the un-taken branch is NOT evaluated, so `var(50):=1` in the false branch of a Cond will NOT execute. This matches Ikemen's semantics (verified in `14-engine-gap-analysis.md` §7 item 1). Test thoroughly with `Cond(AILevel > 0, var(50):=1, var(50):=0)`. |
| **Effort** | 1 week (parser changes + evaluator + comprehensive Cond/IfElse-nested tests). |

---

#### Phase 2.2 — `RootVarSet` / `RootVarAdd` sctrls

| Field | Value |
|---|---|
| **Objective** | Add the 2 missing MUGEN 1.1 variable controllers that push state from a helper back to the root player. |
| **Files to modify** | `mugenstatecontrollers.cpp` (2 new parse/handle/unload triplets + 2 registrations in `setupStateControllerParsers()` at line 5765). |
| **Implementation** | **Clone** the existing `parentVarSetParseFunction`/`parentVarSetHandleFunction`/`parentVarSetUnloadFunction` triplet (search for `parentVarSet` in mugenstatecontrollers.cpp). Rename to `rootVarSet`. In the handle function, replace `getPlayerParent(tPlayer)` with `getPlayerRoot(tPlayer)` (both accessors already exist). Same for `RootVarAdd`. Register both: `gMugenStateControllerVariableHandler.mStateControllerParsers["rootvarset"] = rootVarSetParseFunction;` and `["rootvaradd"] = rootVarAddParseFunction;`. |
| **Ikemen GO reference** | `compiler.go:177` — `"rootvarset": c.rootVarSet,` and `:178` — `"rootvaradd": c.rootVarAdd,`. Parser: `compiler_functions.go:2885` (`rootVarSet`) and `:2896` (`rootVarAdd`) — both call the same `varSetSub` helper as ParentVarSet. Runtime: `bytecode.go:9579` — reuses `varSet` with a `sctrltype` byte discriminator (4=RootVarSet, 5=RootVarAdd). |
| **Test characters** | Goku_UI (uses `rootvarset` to push combo-count state from a projectile helper back to the root), any assist-style character where the assist helper reports damage to the root. |
| **Risk** | Low — `getPlayerRoot` already works (used by `rootDistXFunction` at line 1837). The only risk is if `getPlayerRoot` returns NULL for a top-level player (it should return `tPlayer` itself in that case — verify). |
| **Effort** | 1–2 days. |

---

#### Phase 2.3 — Verify `ParentVarSet` / `ParentVarAdd` already work

| Field | Value |
|---|---|
| **Objective** | Confirm the existing `parentvarset`/`parentvaradd` registrations actually work end-to-end. The gap analysis says they're PRESENT, but no test character has exercised them post-rebuild. |
| **Files to modify** | None (verification-only). If broken, debug. |
| **Implementation** | Load a character that uses `parent, varset` (e.g., Spider-Man_SR's web-ball helper). Set a breakpoint in `parentVarSetHandleFunction`. Verify the parent's variable is updated. Cross-check with Ikemen GO running the same character. |
| **Ikemen GO reference** | `compiler.go:88–89`, `compiler_functions.go:2863`/`2874`, `bytecode.go:9579` (sctrltype=2 for ParentVarSet, 3 for ParentVarAdd). |
| **Test characters** | Spider-Man_SR (web-ball helper uses `parent, varset` to flag "web deployed"). |
| **Risk** | None — verification-only. |
| **Effort** | 1 day (including any bug fixes discovered). |

---

#### Phase 2.4 — `[STRETCH]` Map system (Ikemen extension)

| Field | Value |
|---|---|
| **Objective** | Add Ikemen's named-variable (string-keyed float) map system. **[STRETCH]** — not required for MUGEN 1.1, but enables ~90% of post-2022 Ikemen-native characters. |
| **Files to modify** | `playerdefinition.h` (new `std::map<std::string, double> mMaps` field on `DreamPlayer`), `playerdefinition.cpp` (accessors: `setPlayerMap(tPlayer, name, value)`, `addPlayerMap(tPlayer, name, value)`, `getPlayerMap(tPlayer, name)`, `resetPlayerMaps(tPlayer, excludeList, excludeCount)`), `mugenassignmentevaluator.cpp` (new `mapFunction` + registration), `mugenstatecontrollers.cpp` (9 new sctrl triplets: MapSet, MapAdd, MapReset, ParentMapSet, ParentMapAdd, RootMapSet, RootMapAdd, TeamMapSet, TeamMapAdd). |
| **Implementation** | **(a)** Add `mMaps` field — initialized empty when player spawns, persisted across state changes (in the same way `mVariables` is persisted), cleared on round end. **(b)** Implement `mapFunction(DreamMugenAssignment** tIndexAssignment, DreamPlayer* tPlayer, int* tIsStatic)` — evaluate the index to a string (the map name), return `makeFloatAssignmentReturn(getPlayerMap(tPlayer, name))`. Register `gVariableHandler.mArrays["map"] = mapFunction;`. **(c)** Also support the `map(name) := value` syntax — when the parser sees `map("foo") := 5`, it should build an instant-assignment node (Phase 2.1) whose target is the map. **(d)** Implement the 9 sctrls — each is a clone of `varSet`/`varAdd` with a string-keyed target instead of an int-indexed one. `MapReset` takes up to 8 `exclude`/`exclude2`/.../`exclude8` string parameters. `TeamMapSet`/`TeamMapAdd` iterate all players on the same team. |
| **Ikemen GO reference** | `compiler.go:4918` — `case "map":`. `compiler.go:150–152, 168–169, 175–176, 194–195` — scmap entries for the 9 map sctrls. Parser: `compiler_functions.go:4891–4987`. Runtime: `bytecode.go:12258` (`varSet` with `map` flag) and `bytecode.go:15413` (`mapReset`). Storage: `char.go` struct `Char` field `mapArray` of type `map[string]float32`. |
| **Test characters** | Any post-2022 Ikemen-native character — e.g., a recent Goku UI variant, or any character with `map("combo_count")` patterns. |
| **Risk** | High. Risks: (1) std::map<string,double> on DreamPlayer may bloat the struct (acceptable — maps are usually small); (2) the `map(name) := value` parser integration with Phase 2.1 must be tested carefully; (3) TeamMapSet must filter by team side (same as Phase 1.2 partner logic); (4) MapReset's 8-exclude-list parsing needs a flexible parser. |
| **Effort** | 1–2 weeks. |

---

### Phase 3 — State controller completeness (Weeks 5–6)

**Objective:** Close the state-controller gaps that affect common character archetypes: combo scaling (`ModifyHitDef`), homing projectiles (`ModifyProjectile`), counter systems (`ModifyReversalDef`), modern character flags (`AssertSpecial`), cinematic stages (`stagevar`), and explod polish.

**Total estimated effort:** 3–4 weeks.

---

#### Phase 3.1 — `ModifyHitDef` / `ModifyReversalDef` / `ModifyProjectile` sctrls

| Field | Value |
|---|---|
| **Objective** | Add the 3 "Modify*" sctrls that mutate an already-active HitDef/ReversalDef/Projectile in flight. Used by: combo-scaling systems (reduce damage on the 5th hit of a combo), homing projectiles (update target each frame), counter systems (change reversal.attr to catch different attack types). |
| **Files to modify** | `mugenstatecontrollers.cpp` (3 new parse/handle/unload triplets + 3 registrations). The parse functions can be **clones** of the existing `hitDefParseFunction`/`reversalDefParseFunction`/`projectileParseFunction` — they share the same parameter list. The handle functions differ: instead of replacing the HitDef, they merge the new fields into the existing one. |
| **Implementation** | **(a)** `ModifyHitDef` — clone `hitDefParseFunction`/`handleHitDef`/`unloadHitDef`. In the handle function, change `setPlayerHitDef(tPlayer, newHitDef)` to `modifyPlayerHitDef(tPlayer, partialHitDef)` — a new function that overwrites only the fields the user specified (use the existing per-parameter "was-this-set?" flags, which the parser already tracks via the `mHasXxx` bools). Register: `gMugenStateControllerVariableHandler.mStateControllerParsers["modifyhitdef"] = modifyHitDefParseFunction;`. **(b)** `ModifyReversalDef` — same pattern, clone of `reversalDef`. **(c)** `ModifyProjectile` — clone of `projectileParseFunction`. In the handle function, look up the active projectile by `id` (the user provides `id` and optionally `index`) and update its fields. This requires a new `getProjectileByIdAndIndex(tPlayer, id, index)` accessor in `gamelogic.cpp` (or wherever projectiles are tracked). |
| **Ikemen GO reference** | `compiler.go:157` — `"modifyhitdef": c.modifyHitDef,`. Parser: `compiler_functions.go:2286` (`modifyHitDef`) — calls the same `hitDefSub` helper as `hitDef`. Runtime: `bytecode.go:8330` — same dispatch as HitDef but with a `modify` flag. `compiler.go:161` — `"modifyreversaldef": c.modifyReversalDef,`. Parser: `compiler_functions.go:2331`. Runtime: `bytecode.go:8360`. `compiler.go:159` — `"modifyprojectile": c.modifyProjectile,`. Parser: `compiler_functions.go:2558`. Runtime: `bytecode.go:8397`. |
| **Test characters** | Nightwing (uses `ModifyHitDef` to scale damage during multi-hit combos), any homing-projectile character (uses `ModifyProjectile` to update `vel` toward target each frame). |
| **Risk** | Medium. The `Modify*` pattern requires careful "only update fields the user specified" logic — if the parser initializes unset fields to 0, the modify would zero them out. Solution: the parse function must track per-field "was set?" booleans (the existing HitDef parser already does this for many fields; verify and extend to all). `ModifyProjectile` also requires projectile lookup by ID, which may need a new data structure if projectiles aren't currently indexed by ID. |
| **Effort** | 1 week each = 3 weeks total. ModifyHitDef is the easiest (no new lookups), ModifyProjectile the hardest (needs projectile indexing). |

---

#### Phase 3.2 — Remaining AssertSpecial flags (~51 missing)

| Field | Value |
|---|---|
| **Objective** | Extend `handleSingleSpecialAssert` (mugenstatecontrollers.cpp:3498) to dispatch all ~70 Ikemen flags. The MUGEN 1.1 subset (20 flags: 10 char + 10 global) is the priority; the rest are Ikemen extensions but commonly used. |
| **Files to modify** | `mugenstatecontrollers.cpp` (extend `handleSingleSpecialAssert` with ~51 new `else if` branches), `playerdefinition.cpp` (new flag setters — most can be simple per-player bool fields like `mNoAirJump`, `mNoCornerPush`, etc.). |
| **Implementation** | For each new flag: **(a)** add a per-player (or global) bool field on `DreamPlayer` (or wherever special flags are stored); **(b)** add a setter `setPlayerXxxFlag(tPlayer)`; **(c)** add the `else if ("xxx" == flag) { setPlayerXxxFlag(tPlayer); }` branch in `handleSingleSpecialAssert`. **(d)** Then wire the flag into the relevant gameplay system — e.g. `noairjump` should be checked in `canPlayerAirJump()` (probably in `playerdefinition.cpp` near the existing air-jump logic), `nocornerpush` should be checked in the cornerpush velocity application, `noko` should make the player's HP non-reducible to 0, `noguarddamage` should suppress guard damage, etc. **Priority flags** (most common in MUGEN 1.1 chars): `noairjump`, `nocornerpush`, `nojugglecheck` (already done — verify), `noko` (global), `noredlifedamage`, `noguardpointsdamage`, `nodizzypointsdamage`, `noinput`, `noailevel`, `postroundinput`, `nokofall`, `nokovelocity`, `nohitdamage`, `noguarddamage`, `noguardko`, `nomakedust`, `nonamedisplay`, `nolifebardisplay`, `nopowerbardisplay`, `nostunbardisplay`, `nowinicondisplay`, `nofacedisplay`, `nofacep2`, `nocombodisplay`, `drawunder`, `animatehitpause`, `animfreeze`, `autoguard`, `nohardcodedkeys`, `nointroreset`, `projtypecollision`, `runfirst`, `runlast`, `sizepushonly`, `nodestroyself`, `nobrake`, `nocrouch`, `nojump`, `nostand`, `nofallcount`, `nofalldefenceup`, `nofallhitflag`, `nofastrecoverfromliedown`, `nogetupfromliedown`, `noguardbardisplay`, `nolifebaraction`, `noturntarget`, `noaibuttonjam`, `noaicheat`. Global flags: `camerafreeze`, `globalnoko`, `notimedisplay`, `roundfreeze`, `roundnotskip`, `skipfightdisplay`, `skipkodisplay`, `skiprounddisplay`, `skipwindisplay`. |
| **Ikemen GO reference** | `compiler_functions.go:143–301` — the AssertSpecial flag list (split into MUGEN char flags at lines 171–172 first 10, MUGEN global flags second 10, Ikemen char flags lines 173, Ikemen global flags line 174). Runtime: `bytecode.go:5010` — `case assertSpecial_flag:` sets the bit in `c.sf` (char flags) or `sys.sf` (global flags). The flag bitset is in `char.go` — struct `Char` field `sf` is a `SpecialFlag` bitset with 64+ bits. |
| **Test characters** | Goku_UI (uses `noairjump` during intro states), any character with `noko` boss states, characters that use `animatehitpause` for custom hit-pause handling. |
| **Risk** | Medium. The mechanical addition is trivial (51 if-branches). The risk is that each flag must be **enforced** somewhere in the engine to have any effect — and missing enforcement is silent (the flag is set but nothing checks it). Mitigation: implement a single `isPlayerAssertedFlagActive(tPlayer, flagName)` accessor (which Phase 1.6 already needs for `isasserted`) and use it at every relevant decision point. Build a test character per flag to verify behavior. |
| **Effort** | 2–3 days for the parse dispatch + flag setters. 1 week for enforcement wiring (this is the bulk of the work — each flag needs to be hooked into the right engine subsystem). |

---

#### Phase 3.3 — Remaining `stagevar` sub-keys (~77 missing)

| Field | Value |
|---|---|
| **Objective** | Extend `evaluateStageVarArrayAssignment` (mugenassignmentevaluator.cpp:2301) to handle all ~80 sub-keys. The MUGEN 1.1 subset is small (`info.author`, `info.name`, `info.displayname` — already present) plus a handful of `camera.*` fields used by characters that read the stage's camera bounds. The Ikemen extensions (~70 sub-keys) are needed for cinematic characters. |
| **Files to modify** | `mugenassignmentevaluator.cpp` (extend the if/else chain at lines 2305–2318), `mugenstagehandler.cpp` (accessors for stage fields — most already exist, just need to be exposed by name). |
| **Implementation** | For each sub-key: add an `else if ("camera.boundleft" == var) { ret = makeNumberAssignmentReturn(getDreamStageCameraBoundLeft()); }` branch. The stage handler already stores these fields (they're parsed from the .def file at stage load time). Group sub-keys by category for systematic implementation: **(a) camera.\*** (~25 sub-keys): `boundleft`, `boundright`, `boundhigh`, `boundlow`, `verticalfollow`, `floortension`, `tension`, `tensionhigh`, `tensionlow`, `tensionvel`, `cuthigh`, `cutlow`, `startzoom`, `zoomout`, `zoomin`, `zoomindelay`, `zoominspeed`, `zoomoutspeed`, `yscrollspeed`, `ytension.enable`, `autocenter`, `lowestcap` [Ikemen only]. **(b) playerinfo.\*** (8): `leftbound`, `rightbound`, `topbound`, `botbound`, `p1startx`, `p2startx`, `p1starty`, `p2starty`, `p1facing`, `p2facing`. **(c) scaling.\*** (4): `topz`, `botz`, `topscale`, `botscale` [Ikemen 3D — skip if not implementing Z]. **(d) bound.\*** (2): `screenleft`, `screenright`. **(e) stageinfo.\*** (6): `autoturn`, `localcoord.x`, `localcoord.y`, `resetbg`, `zoffset`, `zoffsetlink`, `xscale`, `yscale`. **(f) shadow.\*** (~9): `intensity`, `color.r`, `color.g`, `color.b`, `yscale`, `fade.range.begin`, `fade.range.end`, `xshear`, `offset.x`, `offset.y` [last 2 are Ikemen]. **(g) reflection.\*** (~10) [all Ikemen]: `intensity`, `yscale`, `ydelta`, `fade.range.begin`, `fade.range.end`, `offset.x`, `offset.y`, `xshear`, `color.r`, `color.g`, `color.b`. **(h) info.ikemenversion.\*** and `info.mugenversion.\*** (5) [Ikemen]. |
| **Ikemen GO reference** | `compiler.go:3773–3935` — `stagevar(...)` switch. Runtime: `bytecode.go` — `case OC_stagevar_*:` reads from `sys.stage`. The stage struct in `char.go` / `stage.go` holds all these fields, populated from the stage .def file at load. |
| **Test characters** | Any character reading `stagevar("camera.zoomout")` for cinematic zooms. Most MUGEN 1.1 characters only use `info.author`/`info.name`/`info.displayname` (already supported); the camera.* fields are mostly used by Ikemen-native chars. |
| **Risk** | Low. Each sub-key is a 2-line read accessor. The only risk is mismatched types (some return string, some return int, some return float) — Ikemen's `compiler.go:3773–3935` shows the expected type per sub-key. |
| **Effort** | 1 week (77 sub-keys × ~30 min each, plus 1 day to verify stage .def fields are actually loaded — if not, extend `mugenstagehandler.cpp` to parse them). |

---

#### Phase 3.4 — Explod / ModifyExplod parameter completeness

| Field | Value |
|---|---|
| **Objective** | Audit the existing `explod`/`modifyexplod` parse functions against Ikemen's 50+ parameter list. Add any missing MUGEN 1.1 parameters. Skip Ikemen-only ones (shader.*, afterimage.*, syncid, etc.) unless implementing [STRETCH]. |
| **Files to modify** | `mugenstatecontrollers.cpp` (extend `parseExplodController` / `handleExplodController` and the `ExplodController` struct). |
| **Implementation** | Compare Dolmexica's `ExplodController` struct (search mugenstatecontrollers.cpp for `struct ExplodController` or similar) against Ikemen's parameter list at `compiler_functions.go:857–1072` (doc 13 §5). **Missing MUGEN 1.1 params to verify**: `remappal` (2 — group,index), `space` (screen/stage — Ikemen ext, skip), `bindid` (Ikemen ext, skip), `bindtime`, `removeongethit`, `removeonchangestate`, `hidewithbars`, `trans` (add/sub/addalpha — verify it parses all forms), `ownpal`, `animfreeze`, `interpolation.*` (Ikemen ext, skip), `afterimage.*` (Ikemen ext, skip). For each missing MUGEN 1.1 param: add a field to `ExplodController`, parse it in `parseExplodController`, apply it in `handleExplodController`. The parse pattern is well-established — clone any existing param like `pos` or `vel`. |
| **Ikemen GO reference** | `compiler_functions.go:857–1072` — `explodSub` helper. `compiler_functions.go:1127` — `explod` (calls `explodSub`). `compiler_functions.go:1141` — `modifyExplod`. Runtime: `bytecode.go:6098` (explod), `:6566` (modifyExplod). |
| **Test characters** | Goku_UI (uses complex explod params for aura effects), Spider-Man_SR (web effects with `bindtime` and `removeonchangestate`). |
| **Risk** | Low for the parse side. Medium for the apply side — some params (like `trans` with `addalpha`) may interact with the existing transparency system in non-obvious ways. |
| **Effort** | 3–5 days (depending on how many params are actually missing — needs an audit pass first). |

---

#### Phase 3.5 — HitOverride improvements

| Field | Value |
|---|---|
| **Objective** | Bring `HitOverride` to full MUGEN 1.1 spec. Verify all MUGEN 1.1 params are parsed (`attr`, `stateno`, `time`, `forceair`). Add support for the `keepstate` and `forceguard` params (MUGEN 1.1-era additions). Add tracking of the active HitOverride time so Phase 1.1's `hitoverridden` returns the correct value. |
| **Files to modify** | `mugenstatecontrollers.cpp` (extend `parseHitOverrideController` / `handleHitOverrideController`), `playerdefinition.cpp` (new `mHitOverrideTime` field that ticks down each frame, new `mHitOverrideStateNo`/`mHitOverrideAttr`/`mHitOverrideForceAir` fields, new `isPlayerHitOverrideActive` accessor). |
| **Implementation** | **(a)** In the handle function, after parsing, set `mHitOverrideTime = time` (default -1 = infinite), `mHitOverrideStateNo = stateno`, `mHitOverrideAttr = attr`, `mHitOverrideForceAir = forceair`. **(b)** In the player's per-frame update (search `playerdefinition.cpp` for the tick loop), decrement `mHitOverrideTime` if > 0. **(c)** In the hit-application code (search for `applyHitDef` or similar), check `isPlayerHitOverrideActive(tPlayer) && doesAttrMatch(hitDef.attr, mHitOverrideAttr)` — if so, redirect the player to `mHitOverrideStateNo` instead of the normal gethit state, apply `mHitOverrideForceAir` if set. **(d)** Implement `keepstate` (if true, don't reset state time when entering the override state) and `forceguard` (if true, treat the hit as a guard even though the player is in override). |
| **Ikemen GO reference** | `compiler_functions.go:3371` — `hitOverride` parser. Runtime: `bytecode.go:10298`. The Ikemen `Char` struct has a `hoverIdx` field (the active HitOverride slot index, -1 if none). When a hit lands, `char.go` checks `c.hoverIdx >= 0` and routes to the override state. |
| **Test characters** | KoldSpidey (armor + counter), any character with `HitOverride` (search the character's CNS for `type = HitOverride`). |
| **Risk** | Medium. The hit-routing logic is deep in the engine — modifying `applyHitDef` is risky. The `keepstate` and `forceguard` flags have subtle semantics that need careful testing. |
| **Effort** | 2–3 days. |

---

### Phase 4 — Edge cases & polish (Weeks 7–8)

**Objective:** Close the gaps that don't break characters outright but cause subtle behavioral differences from Ikemen GO. These are the "the character works but feels slightly off" issues.

**Total estimated effort:** 1.5–2 weeks.

---

#### Phase 4.1 — `Cond`/`IfElse` edge cases (nested `:=`, side effects in unused branch)

| Field | Value |
|---|---|
| **Objective** | Verify that the short-circuit `Cond` implementation (commit `2f9d755`) correctly handles edge cases: nested `:=` assignments in branches, side effects in the unused branch (must NOT execute), nested Cond/IfElse chains, Cond inside arithmetic. |
| **Files to modify** | None (verification-only). If broken, fix `evaluateCondArrayAssignment` (mugenassignmentevaluator.cpp:2453–2478). |
| **Implementation** | Build a test character with: **(a)** `Cond(var(50):=1, var(51):=10, var(51):=20)` — verify only var(50) and one of var(51) is set (depending on Cond's first arg). **(b)** `var(52) := Cond(time > 30, 100, 200) + 1` — verify the result is 101 or 201. **(c)** `Cond(time > 30, var(53):=1, 0)` — verify var(53) is set only when time > 30. Cross-validate every case with Ikemen GO running the same character. |
| **Ikemen GO reference** | `compiler.go:1684` (`ifelse`) and `:1726` (`cond`). Both emit `jz`/`jmp` bytecode so un-taken branches are skipped. |
| **Test characters** | Custom test character (build for this purpose). Spider-Man_SR already uses complex Cond chains. |
| **Risk** | Low — verification-only. The main risk is discovering that `evaluateCondArrayAssignment`'s short-circuit logic was subtly wrong, which would require careful re-implementation. |
| **Effort** | 1 day. |

---

#### Phase 4.2 — Command parsing edge cases

| Field | Value |
|---|---|
| **Objective** | Fix remaining command parser edge cases: `~$D` (release with don't-care modifier), `$B, $F` (simultaneous diagonal-friendly inputs), command buffer timing (verify Ikemen's 1-frame vs Dolmexica's possibly-off-by-one buffer). |
| **Files to modify** | `mugencommandparser.cpp` (or wherever command parsing lives — search for `~` and `$` token handling), `mugenassignmentevaluator.cpp` (the `command` comparison trigger at line 1185). |
| **Implementation** | **(a)** Audit the command tokenizer: `~` means "hold for N ticks", `$` means "don't care about other directions", `/` means "hold while pressed". Verify `~$D` (release direction with don't-care) parses as "the down direction was released after being held". **(b)** Audit the command buffer: when a command is matched, it should be valid for 1 frame (the current tick). `command("QCF")` returns true on that frame, then false. Ikemen uses a 1-frame buffer; verify Dolmexica matches. **(c)** Audit diagonal inputs: `$B, $F` (hold back, then forward while still holding back? or release back then forward?) — verify against Ikemen. |
| **Ikemen GO reference** | `compiler.go:2025` — `case "command":` parses a string and emits `OC_command`. Runtime: `bytecode.go` — `case OC_command:` reads `c.cmd[0].Buffer.BufferedCommand(name)`. The command matcher is in `command.go` in Ikemen GO source (outside the files listed in this audit but worth reading for semantics). |
| **Test characters** | Goku_UI (uses `~D, DB, B` for crouch dash), Spider-Man_SR (uses `$U` for wall-cling direction detection). |
| **Risk** | Medium — command parsing is character-critical. A bug here breaks inputs for everyone. Mitigation: extensive side-by-side testing with Ikemen GO. |
| **Effort** | 2–3 days. |

---

#### Phase 4.3 — Animation system edge cases (`animelemtime`, `animelemno`)

| Field | Value |
|---|---|
| **Objective** | Verify `animelemtime(n)` and `animelemno(t)` handle edge cases: negative `n` (count from end), `n` beyond the anim length (return bottom or clamp?), animations with loop points (the time relative to element n must account for the loop), empty animations. |
| **Files to modify** | None (verification). If broken, fix `evaluateAnimationElementTimeArrayAssignment` (search mugenassignmentevaluator.cpp for `animelemtime`) and `evaluateAnimationElementNumberArrayAssignment`. |
| **Implementation** | Build test anims: **(a)** a 10-frame linear anim (elements 1..10, 1 tick each). Verify `animelemtime(5)` returns 0 when on frame 5, -1 when on frame 6, etc. **(b)** a 10-frame anim with a loop from frame 5 to frame 8. Verify `animelemtime(5)` accounts for the loop (when on frame 8, animelemtime(5) should be -3, not "looped back so it's +3"). **(c)** `animelemno(0)` should return the current element. `animelemno(5)` should return the element that will be playing 5 ticks from now (accounting for loops). **(d)** `animelemtime(20)` on a 10-frame anim — Ikemen returns the time relative to element 20 as if it existed (negative number); verify Dolmexica matches. |
| **Ikemen GO reference** | `compiler.go:1817` (`animelemno`) and `:1822` (`animelemtime`). Runtime in `bytecode.go` — both read from `c.anim` struct. The anim element struct is in `anim.go` in Ikemen source. |
| **Test characters** | Any character with frame-perfect cancels (uses `animelemtime(n) = 0` to gate cancellable windows). |
| **Risk** | Low — verification only. |
| **Effort** | 1 day. |

---

#### Phase 4.4 — Physics edge cases (localcoord mixing, coordinate transformation)

| Field | Value |
|---|---|
| **Objective** | Fix coordinate transformation when characters with different `localcoord` values fight (e.g., a 320x240 JUS character vs a 640x480 standard character). The engine must scale positions, velocities, and sizes so both characters appear at the correct relative scale. |
| **Files to modify** | `playerdefinition.cpp` (the `getActiveStateMachineCoordinateP` and `getPlayerPosition*` family of functions — verify they correctly scale by the player's localcoord / stage localcoord ratio). |
| **Implementation** | **(a)** Verify each player has an `mLocalCoord` field set from the .def file's `[Info]` section. **(b)** Verify `getActiveStateMachineCoordinateP()` returns the stage's coordinate (usually 320). **(c)** When a 320-coord character queries `pos x`, the value should be in stage coords (already scaled). When a 640-coord character queries `pos x`, the value should be... in what coords? Ikemen's rule: trigger values are always in the **player's own localcoord**, not the stage's. So a 640-coord character sees its own pos x in 640-space. Verify Dolmexica matches. **(d)** When a 320-coord character's hitdef affects a 640-coord character, the velocities must be scaled by the ratio — verify the existing hitdef code does this. |
| **Ikemen GO reference** | `char.go` — `localcoord` field on `Char`. Every position/velocity trigger scales by `c.localscl` (localcoord scale factor). The scale factor is `c.gi().localcoord / 320`. |
| **Test characters** | Mix Goku_UI (320 JUS) with Songoku (standard 320) — should both appear same size. Mix Goku_UI with a 640-coord char — Goku_UI should appear half-size. |
| **Risk** | High. Coordinate scaling bugs are subtle and affect every interaction (hit detection, push, camera, edge bounds). Mitigation: do not change existing scaling unless broken — only fix the specific cases where Dolmexica's behavior differs from Ikemen. |
| **Effort** | 3–5 days (mostly testing; fixes are localized). |

---

#### Phase 4.5 — HitDef attribute string parsing completeness

| Field | Value |
|---|---|
| **Objective** | Verify HitDef `attr` parsing handles all MUGEN 1.1 attribute combinations: `SCA` (state + character + attack), `NA` (normal attack), `SA` (special), `HA` (hyper), `NP`/`SP`/`HP` (projectile variants), `AA` (air), `AT` (throw). Verify the `hitdefattr` comparison trigger (line 1185 area) correctly matches these. |
| **Files to modify** | None (verification). If broken, fix the `attr` parser in `mugenstatecontrollers.cpp` (search for `parseHitDefAttribute` or similar) and the `hitdefattr` comparison in `mugenassignmentevaluator.cpp`. |
| **Implementation** | Test cases: **(a)** `attr = SCA, NA, AA` — standing normal attack that hits air. **(b)** `attr = SCA, HA, AP` — hyper projectile. **(c)** `attr = SCA, SA, AT` — special throw. **(d)** Verify `hitdefattr = SCA, NA` matches when the active HitDef's attr is `SCA, NA, AA` (partial match should succeed — `SCA, NA` is a prefix). **(e)** Verify `hitdefattr = AA, HA` does NOT match `SCA, NA, AA` (order matters in MUGEN? or doesn't? — verify against Ikemen). |
| **Ikemen GO reference** | `compiler.go:2832` — `case "hitdefattr":` parses a comparison against the active HitDef's attr. The attr matcher in `bytecode.go` uses bitwise AND on the attr bitfield. |
| **Test characters** | Any character with `hitdefattr` checks (most characters use this to gate cancels: `hitdefattr = SCA, NA` means "I have an active normal attack"). |
| **Risk** | Low — verification only. The attr parser is well-established; the main risk is edge cases with the `AP` (projectile) and `AT` (throw) flags. |
| **Effort** | 1 day. |

---

### Phase 5 — Testing & validation (Weeks 9–10)

**Objective:** Build a regression-test suite and verify cross-compatibility with Ikemen GO. This phase does NOT add features — it locks in the work from Phases 1–4.

**Total estimated effort:** 2 weeks.

---

#### Phase 5.1 — Test character suite

| Field | Value |
|---|---|
| **Objective** | One minimal test character per feature implemented in Phases 1–4. Each character has a single state that exercises one feature and prints the result via `DisplayToClipboard`. |
| **Files to create** | `/home/z/my-project/fight-engine/test-chars/` (new directory). One subdirectory per feature, each with a minimal .def/.cns/.air/.sff. |
| **Implementation** | Test characters needed: `test-hitoverridden` (uses `hitoverridden` trigger + HitOverride sctrl), `test-partner` (uses `partner, life` in simul), `test-inputtime` (uses `inputtime(B) > 30`), `test-gethitvar` (uses each new `gethitvar(*)` sub-key), `test-stagevar` (uses each new `stagevar(*)` sub-key), `test-instant-assign` (uses `var(5) := 10` in Cond), `test-rootvarset` (helper uses rootvarset), `test-modifyhitdef` (combo scaling), `test-modifyprojectile` (homing), `test-assertspecial` (uses each new flag), `test-cond-nested-assign` (Phase 4.1 cases), `test-command-edge` (Phase 4.2 cases), `test-animelem` (Phase 4.3 cases), `test-localcoord-mix` (Phase 4.4 — 320 vs 640 coord). |
| **Ikemen GO reference** | Ikemen GO ships with `build/test/` containing similar test chars. |
| **Test characters** | The test chars themselves. |
| **Risk** | None — additive. |
| **Effort** | 3 days. |

---

#### Phase 5.2 — Automated regression tests

| Field | Value |
|---|---|
| **Objective** | A script that loads each test character, runs 60 frames, captures the clipboard output, and compares against an expected value. |
| **Files to create** | `/home/z/my-project/fight-engine/tests/regression/run.js` (Node.js script that drives the WASM engine via the existing `GameCanvas` interface, or a simpler C++ harness if WASM is too heavy for CI). |
| **Implementation** | Use the existing `GameCanvas` WASM module. Load a test character in solo mode, fast-forward 60 frames, read the player's clipboard (Dolmexica already exposes this via `DisplayToClipboard`). Compare against an expected value file. Report pass/fail per test. |
| **Ikemen GO reference** | Ikemen GO has `build/test/` with a similar approach. |
| **Test characters** | The Phase 5.1 suite. |
| **Risk** | Low. The main risk is WASM startup overhead making tests slow — mitigate by reusing one WASM instance across tests. |
| **Effort** | 2–3 days. |

---

#### Phase 5.3 — Cross-validation with Ikemen GO

| Field | Value |
|---|---|
| **Objective** | Run the 5 reference characters (Goku_UI, Spider-Man_SR, KoldSpidey, Nightwing, Songoku) in both Dolmexica and Ikemen GO side-by-side. Record frame-by-frame state (position, velocity, anim, var(0..59), life, power) and diff. |
| **Files to create** | `/home/z/my-project/fight-engine/tests/cross-validate/` (scripts to run both engines, capture state, diff). |
| **Implementation** | **(a)** For Ikemen GO: build with debug flags, run the character, dump state every frame via the existing debug overlay (`F1` key toggles). **(b)** For Dolmexica: use the existing fight debug overlay (search for `fightdebug` in the engine). **(c)** Diff the two state dumps frame-by-frame. Investigate any frame where position differs by > 1 pixel or velocity differs by > 0.1. |
| **Ikemen GO reference** | Ikemen GO itself. |
| **Test characters** | The 5 reference characters. |
| **Risk** | Medium. Will likely uncover subtle differences (timing off-by-one, rounding differences). Each is a small fix but they accumulate. |
| **Effort** | 3–5 days. |

---

#### Phase 5.4 — Performance profiling

| Field | Value |
|---|---|
| **Objective** | Verify that Phases 1–4 did not regress 60 FPS performance. The AST-walking evaluator is slower than Ikemen's bytecode; ensure the gap is acceptable. |
| **Files to create** | None (use existing profiling tools — emscripten's `--profiling` flag, Chrome DevTools Performance tab). |
| **Implementation** | **(a)** Build Dolmexica WASM with `--profiling` and `-O2`. **(b)** Load a stress test: 4-player simul with 20 helpers each. **(c)** Profile 60 seconds of gameplay. **(d)** Identify hot spots: if any single trigger function accounts for > 5% of CPU, optimize it (cache lookups, inline accessor). **(e)** Compare against a pre-Phase-1 baseline build (kept in git: `git checkout cc943d7^ -- build/wasm/` for the binary). |
| **Ikemen GO reference** | N/A. |
| **Test characters** | Stress test: 4x Goku_UI (lots of helpers and explods). |
| **Risk** | Low. If performance regressed, the fix is usually to cache `gVariableHandler.mVariables[name]` lookups (they're std::map lookups, not hash — could switch to `std::unordered_map` if it becomes a bottleneck). |
| **Effort** | 1–2 days. |

---

## 4. Phase summary table

| Phase | Items | Effort | Cumulative |
|---|---|---|---|
| **Phase 1** — Critical trigger fixes | 7 items (hitoverridden, partner+numpartner/numenemy, inputtime, gethitvar sub-keys, const sub-keys, isasserted, [STRETCH] parentexist/selfstatenoexist) | 9–13 days | Week 1–2 |
| **Phase 2** — Variable system | 4 items (`:=` augmented assignments, rootvarset/rootvaradd, parentvarset verify, [STRETCH] map system) | 1.5–2.5 weeks | Week 3–4 |
| **Phase 3** — State controller completeness | 5 items (modifyhitdef/modifyreversaldef/modifyprojectile, AssertSpecial flags, stagevar sub-keys, explod params, hitoverride improvements) | 3–4 weeks | Week 5–6 |
| **Phase 4** — Edge cases & polish | 5 items (cond edge cases, command parsing, animation system, physics/localcoord, hitdef attr) | 1.5–2 weeks | Week 7–8 |
| **Phase 5** — Testing & validation | 4 items (test suite, regression tests, cross-validate, perf profile) | 2 weeks | Week 9–10 |
| **TOTAL (without [STRETCH])** | | **~9–11 weeks** | ~10 weeks |
| **With [STRETCH] map system** | | **~10–13 weeks** | ~12 weeks |

This matches the gap analysis estimate of "~9–12 weeks for Tiers 1+2" (which is what the non-stretch portions of Phases 1–3 cover) plus the additional Phase 4 (edge cases) and Phase 5 (testing) needed to actually reach the "100% MUGEN 1.1" milestone.

---

## 5. Testing strategy

### 5.1 Reference character suite

The following 5 characters are used throughout all phases. They were chosen because they collectively exercise every major engine subsystem that has caused issues this session.

| Character | Why it's a test case | Used in phases |
|---|---|---|
| **Goku_UI** (JUS, SFF v2, palette links, air jumps) | Tests: SFF v2 palette link resolution (commit `110a03f`), 32-color JUS palette (commit `4a114d2`), single-number jump velocities (commit `e931a5d`), air jump count (commit `2f9d755`), complex aura explods, multi-state combo system. | 1.4 (gethitvar.power), 2.2 (rootvarset from projectile helper), 3.4 (explod params), 4.4 (320 localcoord) |
| **Spider-Man_SR** (SFF v1.01, Cond/enemy, wall cling) | Tests: SFF v1.01 loading, `Cond(AILevel, enemy,statetype != L, ...)` (commit `12052ff`), wall-cling state with `$U` direction detection, web-ball helper with `parent, varset`, command parsing for diagonal inputs. | 1.2 (enemy/partner), 2.1 (`:=` in Cond), 2.3 (parentvarset verify), 4.2 (command edge cases) |
| **KoldSpidey** (AI helper, var(0) AI flag) | Tests: AI flag via `var(0) := 1` in `-cmd` file, IsHomeTeam semantics (commit `cc943d7`), HitOverride armor/counter system, `hitoverridden` trigger. | 1.1 (hitoverridden), 3.5 (HitOverride improvements) |
| **Nightwing** (multi-state, helpers) | Tests: Complex multi-state character (50+ states), helper-based projectiles, `ModifyHitDef` for combo scaling, `gethitvar(priority)` for combo scaling. | 1.4 (gethitvar.priority), 3.1 (modifyhitdef) |
| **Songoku/Vegeta** (bundled, baseline) | Tests: Baseline MUGEN 1.1 character — should always work as a regression check. Bundled with the engine, no download needed. | All phases (smoke test) |

### 5.2 How to verify: side-by-side comparison with Ikemen GO

For every behavioral change, verify against Ikemen GO:

1. **Build Ikemen GO locally** — `cd /home/z/my-project/ikemen-go && go build ./...`. The Go toolchain is required; if not installed, `apt install golang-go` (or use the Docker image `ikemen/go:latest`).
2. **Run the same character in both engines** — same stage, same palette, same inputs (record inputs with Dolmexica's existing input recorder, replay in both).
3. **Compare state at frame 60** — pause both, compare: player position, velocity, anim, anim frame, facing, life, power, var(0..59), fvar(0..39), state number, state time. Any difference > 1 pixel or > 1 unit is a bug.
4. **For AI-driven characters** — set both engines' AI to the same level (e.g., AI level 5), run 10 seconds, compare end state. Some variance is expected (AI is non-deterministic across engines), but the broad strokes (who's alive, who's in what state) should match.

### 5.3 Per-phase exit criteria

| Phase | Exit criteria |
|---|---|
| Phase 1 | All 7 items implemented. The 5 reference characters load without parse warnings. `hitoverridden`, `inputtime`, `partner, life`, `numpartner`, `numenemy` all return correct values. |
| Phase 2 | `var(5) := 10` parses and executes. `RootVarSet`/`RootVarAdd` work end-to-end. `ParentVarSet` verified. [STRETCH] `map("foo")` works. |
| Phase 3 | `ModifyHitDef` scales combo damage. All ~70 AssertSpecial flags dispatch. `stagevar("camera.boundleft")` returns the correct value. `Explod` accepts all MUGEN 1.1 params. `HitOverride` correctly routes hits to the override state. |
| Phase 4 | `Cond` with nested `:=` matches Ikemen behavior. Command parsing for `~$D` matches Ikemen. `animelemtime(n)` matches Ikemen for all `n` including negative and out-of-range. Mixed-localcoord matches work at correct scale. HitDef attr matching matches Ikemen for all attr combinations. |
| Phase 5 | Test suite passes 100%. Cross-validation shows < 1px position difference per frame for the 5 reference characters over 60 frames. Performance within 10% of pre-Phase-1 baseline. |

---

## 6. Build & deploy considerations

### 6.1 emsdk persistence

The emsdk has been **deleted 3 times this session** (see worklog Task 19). This is the single biggest source of wasted time. Solutions, in order of preference:

1. **Install emsdk to `/opt/emsdk`** (persistent across reboots, survives shell resets):
   ```bash
   sudo git clone https://github.com/emscripten-core/emsdk.git /opt/emsdk
   sudo /opt/emsdk/emsdk install latest
   sudo /opt/emsdk/emsdk activate latest
   # Add to ~/.bashrc or /etc/profile.d/emsdk.sh:
   source /opt/emsdk/emsdk_env.sh
   ```
   Verify with `which emcc` — should print `/opt/emsdk/upstream/emscripten/emcc`.

2. **Use a Docker image with emsdk pre-installed**:
   ```bash
   docker run --rm -v /home/z/my-project:/work -w /work \
     emscripten/emsdk:latest \
     bash -c 'cd fight-engine && ./build-wasm.sh'
   ```
   This is more portable but slower (cold Docker layer cache).

3. **Cache the build output in CI** — if using GitHub Actions or similar, cache the `build/wasm/*.o` files keyed on the source hash of `engine/DolmexicaInfinite/`. Subsequent builds only recompile changed files.

**Recommended action:** Install emsdk to `/opt/emsdk` immediately (before starting Phase 1), and add a `make verify-emsdk` target that checks `emcc --version` exits 0.

### 6.2 Build verification checklist

After **every** code change, follow this checklist (do NOT skip — the emsdk deletion issue showed that "I think it built" is not sufficient):

```bash
# 1. Verify emsdk is present
which emcc || source /opt/emsdk/emsdk_env.sh
emcc --version  # should print 3.x or 4.x

# 2. Touch the file you changed (forces recompile)
touch /home/z/my-project/fight-engine/engine/DolmexicaInfinite/mugenassignmentevaluator.cpp

# 3. Run the build
cd /home/z/my-project/fight-engine && ./build-wasm.sh 2>&1 | tee build.log

# 4. Verify the .o file was regenerated (timestamp should be "now")
ls -la build/wasm/dolmexica_mugenassignmentevaluator.o
# Expected: timestamp within the last minute

# 5. Verify the WASM binary was regenerated
ls -la build/wasm/dolmexica.wasm  # or wherever the final binary lives
# Expected: timestamp within the last minute

# 6. Verify the new symbol exists (if you added a function)
nm build/wasm/dolmexica_mugenassignmentevaluator.o | grep hitOverriddenFunction
# Expected: a line like "00000000 T hitOverriddenFunction"

# 7. Smoke-test: load Songoku (bundled, no download needed)
# in the browser, verify the character still loads and plays.
```

**Critical rule:** If step 4 shows an old timestamp, the build did NOT pick up your change. **Do not commit.** Investigate why (emsdk missing? wrong working directory? stale build cache?).

### 6.3 Incremental testing after each fix

After each individual fix (not just each phase), do a minimal smoke test:

1. **Build** (per 6.2).
2. **Load Songoku** (the bundled baseline character) — verify it still loads, walks, jumps, attacks. This catches regressions in core engine paths.
3. **Load the character the fix targets** — verify the specific behavior is now correct.
4. **Cross-check with Ikemen GO** (per §5.2) for the specific behavior.

Only commit after steps 1–4 pass. Each commit should be:
- **Atomic** — one fix per commit.
- **Descriptive** — message format: `engine: <subsystem>: <one-line description> (Task 20-d, Phase X.Y)`.
- **Tested** — include the test character output in the commit message body (or link to a gist).

### 6.4 Commit message format

```
engine: triggers: add hitoverridden trigger (Task 20-d, Phase 1.1)

Adds the `hitoverridden` trigger (Ikemen GO compiler.go:4657) which
returns true if the player has an active HitOverride slot.

Implementation:
- mugenassignmentevaluator.cpp: new hitOverriddenFunction + registration
- playerdefinition.cpp: new isPlayerHitOverrideActive() accessor

Tested with KoldSpidey: `ifelse(hitoverridden, 5020, 5000)` now
correctly routes to the counter state when armor is active.

Cross-validated with Ikemen GO: identical behavior for all test cases.
```

### 6.5 Branch / PR strategy

- Work on a branch `feature/mugen11-compat` off `main`.
- One PR per phase (5 PRs total). Each PR is reviewable in isolation.
- Within a PR, commits are atomic (one per item — Phase 1.1, 1.2, etc.).
- PR merge requires: build passes (per 6.2), all 5 reference characters load without parse warnings, cross-validation shows no regressions vs `main`.

### 6.6 Rollback plan

If a phase introduces a regression that can't be fixed quickly:
1. `git revert` the offending commit(s).
2. Rebuild (per 6.2).
3. Verify the reference characters work.
4. Re-attempt the fix on a fresh branch with smaller scope.

**Do not** carry known regressions forward to the next phase. Each phase's exit criteria (§5.3) must be met before starting the next phase.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| emsdk deleted again | High (3x this session) | High (1 day to recover) | Install to `/opt/emsdk` (§6.1) immediately |
| `:=` parser changes break existing characters | Medium | High | Comprehensive Cond/IfElse test suite (Phase 4.1) before merging Phase 2.1 |
| `partner`/`numpartner` changes break single-player | Medium | Medium | Always return 0 partners / 1 enemy in 1v1 mode (the common case) |
| AssertSpecial flag enforcement is incomplete | High | Low (silent — flag set but no effect) | Per-flag test character (Phase 5.1) |
| localcoord scaling regressions | Medium | High (affects every character) | Phase 4.4 is verification-only — do not change scaling unless broken |
| Performance regression from AST evaluator | Low | Medium | Phase 5.4 profiling; cache `std::map` lookups if needed |
| Map system (if implemented) breaks MUGEN 1.1 characters | Low | Low (MUGEN 1.1 chars don't use maps) | Map system is [STRETCH] — can be skipped without affecting MUGEN 1.1 milestone |
| Cross-validation reveals deep behavioral differences | High | Medium (delays Phase 5) | Each difference is a separate ticket; don't block the whole phase on one diff |

---

## 8. Success criteria

The plan is **complete** when **all** of the following are true:

1. **Trigger coverage**: every non-`[Ikemen]` trigger in `12-ikemen-triggers-catalog.md` is registered in `mugenassignmentevaluator.cpp` and returns the correct value for at least one test case.
2. **State controller coverage**: every MUGEN 1.1 state controller (the 91 in Ikemen's `compiler.go:38–129`) is registered in `mugenstatecontrollers.cpp` with all of its MUGEN 1.1 parameters parsed and applied.
3. **AssertSpecial coverage**: all 20 MUGEN 1.1 flags (10 char + 10 global) are dispatched in `handleSingleSpecialAssert` and **enforced** in the relevant engine subsystems. The ~50 Ikemen flags are also dispatched but enforcement is best-effort.
4. **CNS syntax**: `var(x) := y`, range expressions `[a,b]`, legacy `projhit[id]`, comparison triggers in value contexts — all parse without warnings.
5. **Reference characters**: the 5 reference characters (Goku_UI, Spider-Man_SR, KoldSpidey, Nightwing, Songoku) all load, play, and match Ikemen GO behavior to within 1 pixel / 1 unit per frame over a 60-frame cross-validation.
6. **Performance**: 4-player simul with 20 helpers per player sustains 60 FPS on a 2020-era laptop.
7. **Regression suite**: the Phase 5.1 test character suite passes 100% in CI.

When all 7 are met, Dolmexica has achieved **MUGEN 1.1 compatibility at Ikemen GO parity**. The [STRETCH] Ikemen extensions (map system, Z axis, Text sctrls, etc.) can then be pursued as a separate post-milestone effort.

---

*End of plan. This document is the actionable successor to `14-engine-gap-analysis.md`. Implementation work should reference this doc's phase/item numbers in commit messages (e.g., "Task 20-d, Phase 1.1").*
