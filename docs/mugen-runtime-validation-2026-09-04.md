# MUGEN 1.1 Runtime Validation — Build & Test Report

**Branch:** `mugen-compat-1.0-1.1`
**Date:** 2026-09-04

---

## 1. Complete WASM build result

### Build environment

- **emsdk:** 6.0.9 (clang/LLVM 21, node 24.19.0)
- **Compiler:** em++ 6.0.9 (4e4223852a0835923411059a3929907d7df1232e)
- **Linker:** wasm-ld

### Build fix applied (commit `a26cd89`)

The web build was configured to compile `windows/soundeffect_win.cpp` and `windows/sound_win.cpp`, which use FMOD (proprietary, not available in Emscripten). Fixed by switching to the existing web-specific SDL_mixer implementations:

| File | Change |
|------|--------|
| `addons/prism/Makefile.web` | Replace `windows/soundeffect_win.o` → `web/soundeffect_web.o`, `windows/sound_win.o` → `web/sound_web.o`. Filter out generic `soundeffect.o` and `sound.o` from OBJS (duplicate symbols). |
| `addons/prism/Makefile.commonweb` | Add `-s USE_SDL_MIXER=2`. Remove fmod include/lib paths. Fix libzstd path (`web/LIB` not `web/lib`). Remove stale commands. |
| `Makefile.web` (engine) | Fix `PRISM_PATH` to `$(CURDIR)/addons/prism`. Fix include path to `addons/prism/Makefile.commonweb`. |

FMOD-based native/Windows build untouched.

### Build output

```
web/game.html   19,599 bytes
web/game.js    179,746 bytes
web/game.wasm 3,351,531 bytes (3.3MB)
```

### Linker warning (pre-existing, non-fatal)

```
wasm-ld: warning: function signature mismatch: prism::startThread
>>> defined as (i32, i32) -> i32 in libprism.a(wrapper.o)
>>> defined as (i32, i32) -> void in libprism.a(thread_web.o)
```

This is a pre-existing signature mismatch between `wrapper.cpp` and `web/thread_web.cpp`. Non-fatal — the link succeeds.

### Verification that WASM contains our changes

Parser strings present in `mugenstatecontrollers.o`:
- `palfx.time`, `palfx.mul`, `palfx.add` (existing)
- `sinadd`, `invertall`, `color` (new — used as parser key suffixes with `palfx.` prefix)

The `orphanExplodsForPlayer` function and new palfx getters/setters are compiled into the WASM (symbols are minified at `-O3` but the object files contain the code).

---

## 2. Runtime tests

### Status: **Cannot run in this environment**

The WASM binary is designed for browser execution (requires SDL2 canvas, audio context, character assets). Running it headlessly in Node.js requires:
- A canvas implementation (e.g., `node-canvas` or `jsdom` with WebGL)
- SDL2 Emscripten port emulation
- Character asset files (SFF, AIR, CNS, SND)
- A web server to serve the files

This is beyond what can be set up in the current environment.

### Tests to be run in a browser environment

The following CNS test files are ready for runtime testing once a browser environment is available:

**`tests/test-hitonce.cns`** (5 cases):
1. Normal attr + omitted hitonce → expect 0
2. Throw attr + omitted hitonce → expect 1
3. Explicit hitonce=0 → expect 0
4. Explicit hitonce=1 → expect 1
5. Throw + explicit hitonce=0 → expect 0 (override)

**`tests/test-palfx.cns`** (7 cases):
1. palfx.time + palfx.add (regression)
2. palfx.mul (regression)
3. palfx.color=0 (grayscale)
4. palfx.invertall=1 (inverted)
5. palfx.sinadd=64,0,0,10 (sine pulse)
6. All combined
7. palfx.time=0 (no effect)

**IfElse/Cond test** (via DisplayToClipboard):
- `IfElse(1, var(0):=1, var(1):=1)` → both var(0) and var(1) should be 1 (eager)
- `Cond(1, var(0):=1, var(1):=1)` → only var(0) should be 1 (lazy)

**GetHitVar(slidetime) test**:
- HitDef with `ground.slidetime=30` → `GetHitVar(slidetime)` should return 30
- `GetHitVar(slidetime) > 0` should be true
- `GetHitVar(slidetime) + 1` should return 31

**DestroySelf tests** (6 combinations):
1. recursive=0: helper destroyed, children reparented
2. recursive=1: helper + all descendants destroyed
3. removeexplods=0: explods survive as orphaned
4. removeexplods=1: explods removed
5. recursive=1 + removeexplods=0: all descendants destroyed, all explods orphaned
6. recursive=1 + removeexplods=1: all descendants + explods destroyed

---

## 3. Projectile Explod ownership investigation

### Finding: Projectiles cannot own explods

**Source-verified:**

1. `mugenstatehandler.cpp:139`:
```c
assert(tRegisteredState->mIsInStoryMode || !isPlayerProjectile(tRegisteredState->mPlayer));
```
Projectiles do NOT have registered state machines. They do not execute CNS state controllers (HitDef, Explod, ChangeState, etc.).

2. `projectile.cpp` contains zero references to "explod" or `addExplod`. Projectile behavior is entirely managed by C++ code, not CNS states.

3. The only `addExplod` call is in `handleExplod` (`mugenstatecontrollers.cpp:4164`), which is a state controller. Since projectiles don't run state controllers, they can never call `addExplod`.

### Conclusion

`removeProjectile` calls `destroyGeneralPlayer` directly (without explod cleanup). This is **safe** because projectiles never own explods. No fix needed.

---

## 4. Float/Max/Min/Sign — proposed implementation (NOT implemented)

Per user instruction, do NOT implement yet. Proposed approach:

### Official MUGEN 1.1 spec (from trigger.html)

- **`Float(exprn)`** — Converts an integer expression to floating-point. Return type: float.
- **`Max(exp1, exp2)`** — Returns the larger of two values. Return type: type of exp1 or exp2.
- **`Min(exp1, exp2)`** — Returns the smaller of two values. Return type: type of exp1 or exp2.
- **`Sign(expn)`** — Returns -1 if expn < 0, 0 if expn == 0, 1 if expn > 0. Return type: int.

### Proposed implementation

All four are simple math functions that fit the existing `mArrays` pattern:

```c
// In mugenassignmentevaluator.cpp, near the other math functions:

static AssignmentReturnValue* floatFunction(DreamMugenAssignment** tIndexAssignment, DreamPlayer* tPlayer, int* tIsStatic) {
    AssignmentReturnValue* arg = evaluateAssignmentDependency(tIndexAssignment, tPlayer, tIsStatic);
    double val = convertAssignmentReturnToFloat(arg);
    destroyAssignmentReturn(arg);
    return makeFloatAssignmentReturn(val);
}

static AssignmentReturnValue* maxFunction(DreamMugenAssignment** tIndexAssignment, DreamPlayer* tPlayer, int* tIsStatic) {
    // Parse two args from the vector
    DreamMugenDependOnTwoAssignment* v = (DreamMugenDependOnTwoAssignment*)*tIndexAssignment;
    AssignmentReturnValue* a = evaluateAssignmentDependency(&v->a, tPlayer, tIsStatic);
    AssignmentReturnValue* b = evaluateAssignmentDependency(&v->b, tPlayer, tIsStatic);
    double va = convertAssignmentReturnToFloat(a);
    double vb = convertAssignmentReturnToFloat(b);
    destroyAssignmentReturn(a);
    destroyAssignmentReturn(b);
    return makeNumberAssignmentReturn(va >= vb ? va : vb);
}

static AssignmentReturnValue* minFunction(DreamMugenAssignment** tIndexAssignment, DreamPlayer* tPlayer, int* tIsStatic) {
    // Same as max but return smaller
}

static AssignmentReturnValue* signFunction(DreamMugenAssignment** tIndexAssignment, DreamPlayer* tPlayer, int* tIsStatic) {
    AssignmentReturnValue* arg = evaluateAssignmentDependency(tIndexAssignment, tPlayer, tIsStatic);
    double val = convertAssignmentReturnToFloat(arg);
    destroyAssignmentReturn(arg);
    int sign = (val > 0) ? 1 : (val < 0) ? -1 : 0;
    return makeNumberAssignmentReturn(sign);
}

// Registration:
gVariableHandler.mArrays["float"] = floatFunction;
gVariableHandler.mArrays["max"] = maxFunction;
gVariableHandler.mArrays["min"] = minFunction;
gVariableHandler.mArrays["sign"] = signFunction;
```

### Estimated scope

- 4 new functions (~15 lines each)
- 4 new `mArrays` registrations
- Need to verify `makeFloatAssignmentReturn` exists (or use `makeNumberAssignmentReturn` with float conversion)
- Need to verify `convertAssignmentReturnToFloat` exists

**Runtime testing required** after implementation to verify return types and edge cases.

---

## 5. Commits created in this pass

| Commit | Description |
|--------|-------------|
| `a26cd89` | fix(build): use web audio implementation for Emscripten |
| `cd93acc` | fix: re-apply all MUGEN compat fixes (orphaned explods, hitonce, palfx, AIR, ReversalDef) |

---

## 6. Remaining runtime-only uncertainties

1. **hitonce throw detection:** Need runtime test to confirm `MUGEN_ATTACK_TYPE_THROW` is set for throw attrs (S,NT / S,HT / A,NT etc.).
2. **palfx.color/sinadd/invertall visual effects:** Need browser test to confirm rendering.
3. **palfx.time expiry:** Need browser test to confirm all palfx fields stop when time expires.
4. **Orphaned explod rendering:** Need browser test to confirm no crash, correct position/Z-order/shadow.
5. **IfElse eager / Cond lazy:** Need runtime test with side-effecting expressions.
6. **GetHitVar(slidetime):** Need runtime test with known slidetime value.
7. **DestroySelf 6 combinations:** Need runtime test in browser.
8. **sinadd period=0 edge case:** Pre-existing NaN potential, low priority.
9. **Float/Max/Min/Sign triggers:** Not implemented (proposed implementation above).

---

## 7. No merge into `main`

The branch `mugen-compat-1.0-1.1` remains separate. Full branch history:

```
cd93acc fix: re-apply all MUGEN compat fixes (orphaned explods, hitonce, palfx, AIR, ReversalDef)
a26cd89 fix(build): use web audio implementation for Emscripten
f828a56 fix: implement DestroySelf 1.1 semantics (recursive, removeexplods)
5c3b7fb fix: correct MUGEN expression semantics (IfElse, GetHitVar, player redirection)
```
