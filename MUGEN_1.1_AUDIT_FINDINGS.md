# MUGEN 1.0/1.1 Compatibility Audit — Initial Findings

Target: behavioral compatibility with Elecbyte MUGEN 1.0 and 1.1 on Windows. Ikemen-only functionality is not part of the compatibility target.

## High-confidence compatibility defects found

### 1. IfElse and Cond are incorrectly implemented as the same lazy operation

Current evaluator routes `IfElse(...)` through the same `evaluateCondArrayAssignment()` implementation used by `Cond(...)`. That implementation evaluates only the selected branch.

MUGEN 1.1 explicitly distinguishes them: all three arguments of `IfElse` are evaluated before the result is selected, including side effects such as variable assignment and warnings. `Cond` exists specifically when those side effects must be avoided.

Impact: characters that rely on `IfElse` argument side effects can produce different variables, state changes, warnings, or subsequent behavior.

Required fix: implement separate eager `IfElse` evaluation while preserving lazy `Cond`.

### 2. GetHitVar(slidetime) has the wrong return type

`getHitVarSlidetimeFunction()` currently constructs a boolean return from the player's slide time. MUGEN defines `GetHitVar(slidetime)` as an integer.

Impact: numeric comparisons/arithmetic using `GetHitVar(slidetime)` can be evaluated with the wrong type.

Required fix: return a numeric assignment value.

### 3. Helper parser writes `name` into `type`

The Helper controller parser contains two assignments targeting `mType`: one for `helpertype` and another for `name`. The second assignment should target `mName`.

The corresponding unload path destroys `mType` and frees `mName`, so this mismatch can cause both incorrect Helper metadata and invalid ownership/lifetime behavior.

Impact: Helper creation can mis-handle helper type/name and can become memory-unsafe.

Required fix: parse `name` into `mName` and audit the lifetime/unload path.

### 4. Player redirection code calls strlen() on an uninitialized buffer

The player redirection resolver declares `char text[100]` and, for raw variables, checks `strlen(text)` before copying the source name into it. The source string is `rawVar->mName`.

Impact: undefined behavior during redirection evaluation.

Required fix: validate the source name length and copy it safely.

## Important compatibility gaps to audit next

- DestroySelf: verify that MUGEN 1.1 `recursive` and `removeexplods` actually affect runtime behavior; current controller parsing accepts these parameters but the visible handler path does not use them.
- Explod remappal: MUGEN 1.1 supports remappal for Explod; the current Explod object/header has no remap-palette state or setter.
- Helper remappal: MUGEN 1.1 supports remappal for Helper; verify parser/object/runtime support.
- Team semantics: P3Name/P4Name, NumEnemy/NumPartner, IsHomeTeam, TeamMode and team-dependent LifeMax/Lose behavior need a dedicated audit because the engine currently describes team modes as outside its core scope.
- AIR 1.1: scale, angle, interpolation and floating-point offsets need direct verification in the actual Prism animation handler.
- SFF 2 / RGB/RGBA assets and palette behavior need runtime verification.
- HitDef / get-hit timing, defaults, guard behavior, juggle, persistence and hitpause need comparison against the official 1.0/1.1 controller semantics.

## Findings that are NOT defects

- State controller order -3, -2, -1, current state is already implemented in the state handler.
- Helper handling of special-state groups is already structured to avoid normal -3/-2 execution.
- Gravity, HitFallDamage, HitFallVel and FallEnvShake have real runtime handlers; they should not be treated as missing merely because their parsers are parameter-light.
- The AST-based expression engine is retained; a wholesale switch to an Ikemen bytecode VM is not required for this compatibility goal.

## Working rule

Do not mark compatibility complete because a trigger/controller name parses. A MUGEN-compatible implementation must match return type, defaults, evaluation order, timing, persistence, redirection failure behavior and runtime effects.
