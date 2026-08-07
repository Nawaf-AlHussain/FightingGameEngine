# Ikemen GO State Controllers Catalog

**Date:** 2026-08-09
**Task ID:** 20-b
**Scope:** Catalog every MUGEN 1.1 + Ikemen GO state controller (sctrl) supported by the Ikemen GO engine, with parameters, file/line references, and per-category counts.
**Status:** Research-only audit. **No source files were modified.**

**Source files inspected:**
- `ikemen-go/src/compiler.go` (8,391 lines) — `scmap` (canonical lowercased name → `scFunc` handler), defined at lines 37–199
- `ikemen-go/src/compiler_functions.go` (7,138 lines) — implementation of every `scFunc` (parameter parser)
- `ikemen-go/src/bytecode.go` (15,510 lines) — `type <name> StateControllerBase` declarations and runtime `run(c *Char, ...)` bodies
- `ikemen-go/src/char.go` (14,141 lines) — `Char` methods invoked by the bytecode `run` callbacks

---

## 0. How state controllers work in Ikemen GO

Ikemen GO does **not** use `OC_*` opcodes for state controllers (unlike triggers). Instead:

1. **Registration** — `compiler.go:37–199` builds `scmap`, a `map[string]scFunc` keyed by lowercased CNS name. Each entry points to a parser function defined in `compiler_functions.go`.
2. **Compilation** — When the compiler meets `[State N, Name]` followed by `type = Foo`, it calls `scmap["foo"]`, which is `(*CharCompiler).foo(...)`. This function reads named parameters out of an `IniSection` and emits them onto a `StateControllerBase` (which is itself just a `[]byte`). Each parameter is encoded as `(paramID byte, length, expression bytes...)`.
3. **Runtime** — The compiled `StateControllerBase` slice is dispatched via `StateControllerBase.run(c, func(paramID, exp) bool { ... })` in `bytecode.go`. The dispatch callback switches on `paramID` (a per-controller byte constant like `changeState_value`, `hitDef_attr`, `explod_pos`) and mutates the `*Char` accordingly.
4. **Redirection** — Almost every controller accepts an optional `redirectid` parameter and uses `getRedirectedChar(c, sc, <name>_redirectid, "Name")` (defined at `bytecode.go:4843`) to redirect execution to another player. This is the engine-level implementation of the `redirect,` prefix that MUGEN exposes for things like `parent,VarSet`.
5. **IgnoreHitPause** — Each `[StateBlock]` gets a `hitPauseToggleFlagCount` slot (`compiler_functions.go:464–469`) so the engine can remember whether the controller should run during hitpause. Most controllers respect this via `c.scAdd(...)`.

The registry contains **91** MUGEN 1.1 controllers (lines 38–129 of `compiler.go`, the `// Mugen state controllers` block) and **68** Ikemen-extension controllers (lines 131–198, the `// Ikemen state controllers` block), for a total of **159** state controllers.

---

## 1. State change controllers (11)

These change the player's animation, state number, facing, control flag, or destroy/remove the entity.

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **ChangeState** | `value` (int, required), `ctrl` (int), `anim` (int), `continue` (bool), `readplayerid` (int), `redirectid` (int) | Switches the player to a new state number. Re-initializes state time. | compiler_functions.go:473 | bytecode.go:5170 |
| **SelfState** | (same as ChangeState) | Like ChangeState but uses self-state semantics (used in custom states to escape the custom-state owner). | compiler_functions.go:480 | bytecode.go:5212 |
| **ChangeAnim** | `value` (int, required), `elem` (int), `elemtime` (int), `animplayerno` (int), `spriteplayerno` (int), `readplayerid` (int), `redirectid` (int) | Switches the player's current animation to `value`, optionally seeking to a specific element. | compiler_functions.go:615 | bytecode.go:5453 |
| **ChangeAnim2** | (same as ChangeAnim) | Like ChangeAnim but uses the *enemy's* animation library (for throws where P2 plays an anim from P1's air). | compiler_functions.go:622 | bytecode.go:5515 |
| **Turn** | `redirectid` (int) | Reverses the player's facing (1 → -1 or -1 → 1). No parameters beyond redirect. | compiler_functions.go:2907 | bytecode.go:9621 |
| **CtrlSet** | `value` (bool, required), `redirectid` (int) | Sets the player's `ctrl` flag (whether they can perform moves). | compiler_functions.go:846 | bytecode.go:5739 |
| **StateTypeSet** | `statetype`/`value` (S/C/A/L), `movetype` (I/A/H), `physics` (S/C/A/N), `redirectid` (int) | Changes the state type, move type, or physics in mid-state. | compiler_functions.go:3580 | bytecode.go:10599 |
| **DestroySelf** | `recursive` (bool), `removeexplods` (bool), `removetexts` (bool), `redirectid` (int) | Destroys a helper. `recursive` kills all its children, `removeexplods` cleans up its explods. | compiler_functions.go:556 | bytecode.go:5419 |
| **GameMakeAnim** | `value` (int, required), `pos` (float, 3), `random` (float, 3), `under` (bool), `redirectid` (int) | Spawns a "stage" animation (from `fightfx.air`) at the player's position — used for hit sparks, dust, etc. | compiler_functions.go:1164 | bytecode.go:7167 |
| **TagIn** *(Ikemen)* | `self` (int), `partner` (int), `stateno` (int), `memberno` (int), `partnerstateno` (int), `ctrl` (bool), `partnerctrl` (bool), `leader` (int), `redirectid` (int) | Tags in the active player's partner for tag-team modes. | compiler_functions.go:487 | bytecode.go:5245 |
| **TagOut** *(Ikemen)* | `self` (int), `partner` (int), `stateno` (int), `memberno` (int), `partnerstateno` (int), `redirectid` (int) | Tags out the active player. | compiler_functions.go:526 | bytecode.go:5342 |

---

## 2. Physics controllers (8)

Velocity, position, gravity, and freeze.

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **PosSet** | `x`, `y`, `z` (float, each 1), `redirectid` (int) | Sets the player's absolute position. | compiler_functions.go:1217 | bytecode.go:5762 |
| **PosAdd** | `x`, `y`, `z` (float, each 1), `redirectid` (int) | Adds a delta to the player's position. | compiler_functions.go:1228 | bytecode.go:5808 |
| **VelSet** | `x`, `y`, `z` (float, each 1), `redirectid` (int) | Sets the player's velocity components directly. | compiler_functions.go:1239 | bytecode.go:5844 |
| **VelAdd** | `x`, `y`, `z` (float, each 1), `redirectid` (int) | Adds a delta to the player's velocity. | compiler_functions.go:1250 | bytecode.go:5868 |
| **VelMul** | `x`, `y`, `z` (float, each 1), `redirectid` (int) | Multiplies the player's velocity by a scalar per component. | compiler_functions.go:1261 | bytecode.go:5892 |
| **HitVelSet** | `x`, `y`, `z` (bool, each 1), `redirectid` (int) | Sets the player's velocity to the cached gethit velocity (per-axis enable flag). Used in gethit states. | compiler_functions.go:3252 | bytecode.go:10141 |
| **PosFreeze** | `value` (bool, defaults to 1), `redirectid` (int) | Freezes the player's position so further PosSet/VelSet calls have no effect this tick. | compiler_functions.go:3311 | bytecode.go:10227 |
| **Gravity** | `redirectid` (int) | Applies one tick of gravity (`vel y += const(movement.yaccel)`). No value parameter. | compiler_functions.go:4177 | bytecode.go:11360 |

Note: Ikemen GO unifies PosSet/VelSet/VelAdd/VelMul through the same `posSetSub` helper (compiler_functions.go:1200), which reads `x`, `y`, `z` independently — meaning all four controllers accept a Z axis even though MUGEN 1.1 only documented X/Y for them.

---

## 3. Hit controllers (11)

Attack definition, armor, hit overrides, and fall handling.

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **HitDef** | See note below (40+ params) | Defines an attack's hit properties (damage, hitbox flags, velocities, pausetime, spark, etc.). Always persists for the duration of the state. | compiler_functions.go:2275 | bytecode.go:7930 |
| **ModifyHitDef** *(Ikemen)* | (same as HitDef) | Modifies an already-active HitDef without resetting all of its fields. | compiler_functions.go:2286 | bytecode.go:8330 |
| **ReversalDef** | `reversal.attr` (attr, required), `reversal.guardflag`, `reversal.guardflag.not`, plus all HitDef params | Defines a "reversal" (parry/counter) that catches incoming attacks matching `attr`. | compiler_functions.go:2297 | bytecode.go:7975 |
| **ModifyReversalDef** *(Ikemen)* | `reversal.attr`, plus HitDef params | Modifies an active ReversalDef. | compiler_functions.go:2331 | bytecode.go:8360 |
| **HitBy** | `attr`/`value` (attr flag), `time` (int), `slot` (int), `stack` (bool), `playerno` (int), `playerid` (int), `value2` (legacy attr), `redirectid` (int) | Player is *only* hittable by attacks whose `attr` matches, for `time` ticks. Supports up to 2 slots (legacy) or arbitrary slots (new syntax). | compiler_functions.go:112 | bytecode.go:4929 |
| **NotHitBy** | (same as HitBy) | Player is *not* hittable by attacks whose `attr` matches, for `time` ticks. | compiler_functions.go:122 | bytecode.go:4999 |
| **HitOverride** | `attr` (attr), `stateno` (int), `time` (int), `forceair` (bool), `keepstate` (bool), `forceguard` (bool), `slot` (int), `guardflag`, `guardflag.not`, `redirectid` (int) | When player is hit by an attack matching `attr`, instead of going to a gethit state they go to `stateno` (armor/counter mechanic). | compiler_functions.go:3371 | bytecode.go:10298 |
| **HitFallSet** | `value` (int, -1 default = unchanged), `xvel` (float), `yvel` (float), `redirectid` (int) | Sets the fall flag (`value` != 0) and overrides the fall velocity on the next gethit. | compiler_functions.go:4035 | bytecode.go:11149 |
| **HitFallVel** | `redirectid` (int) | Sets the player's velocity to the cached fall velocity. No value parameter. | compiler_functions.go:4023 | bytecode.go:11126 |
| **HitFallDamage** | `redirectid` (int) | Applies the cached fall damage to the player. No value parameter. | compiler_functions.go:4011 | bytecode.go:11103 |
| **FallEnvShake** | `redirectid` (int) | Triggers an EnvShake using the fall.EnvShake parameters from the current gethit. No params beyond redirect. | compiler_functions.go:3999 | bytecode.go:11063 |

**HitDef parameter list** (from `hitDefSub`, compiler_functions.go:1706–2274):
`attr`, `guardflag`, `hitflag`, `ground.type`, `air.type`, `animtype`, `air.animtype`, `fall.animtype`, `affectteam`, `teamside`, `id`, `chainid`, `nochainid` (up to MaxSimul*2), `kill`, `guard.kill`, `fall.kill`, `keepstate`, `hitonce`, `air.juggle`, `getpower` (2), `damage` (2), `givepower` (2), `numhits`, `hitsound` (2), `hitsound.channel`, `guardsound` (2), `guardsound.channel`, `priority` (1 + type), `p1stateno`, `p2stateno`, `p2getp1state`, `missonoverride`, `p1sprpriority`/`sprpriority`, `p2sprpriority`, `forcestand`, `forcecrouch`, `forcenofall`, `fall.damage`, `fall.xvelocity`, `fall.yvelocity`, `fall.zvelocity`, `fall.recover`, `fall.recovertime`, `sparkno`, `sparkangle`, `guard.sparkno`, `guard.sparkangle`, `sparkxy` (2), `down.hittime`, `p1facing`, `p1getp2facing`, `mindist` (3), `maxdist` (3), `snap` (4), `p2facing`, `air.hittime`, `fall`, `air.fall`, `air.cornerpush.veloff`, `down.bounce`, `down.cornerpush.veloff`, `guard.cornerpush.veloff`, `airguard.cornerpush.veloff`, plus `ground.*`, `air.*`, `down.*`, `guard.*`, `airguard.*` velocity/hittime/friction families. The full list exceeds 80 distinct params.

---

## 4. Variable controllers (12)

Working with int/float/sys vars on self, parent, root, and ranges.

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **VarSet** | `v`/`fv`/`sysv`/`sysfv` (int, legacy), or `var(n)`/`fvar(n)`/`sysvar(n)`/`sysfvar(n)` (newer), `value` (int or float, required), `redirectid` (int) | Sets a single int/float/sysvar/sysfvar. Supports both `v = 5; value = 10` legacy and `var(0) = 10` CNS syntax. | compiler_functions.go:2841 | bytecode.go:9579 |
| **VarAdd** | (same as VarSet) | Adds to a single variable. | compiler_functions.go:2852 | bytecode.go:9579 (reuses varSet) |
| **VarRangeSet** | `first` (int), `last` (int), `value` (int) OR `fvalue` (float), `redirectid` (int) | Sets a contiguous range of int variables (`first..last`) to a single value. Either `value` or `fvalue`, not both. | compiler_functions.go:4064 | bytecode.go:11186 |
| **VarRandom** | `v` (int, required), `range` (int, 2), `redirectid` (int) | Sets `var(v)` to a random integer in `[range[0], range[1]]`. | compiler_functions.go:4158 | bytecode.go:11328 |
| **ParentVarSet** | (same as VarSet) | VarSet on the player's parent (typically used in helper code). | compiler_functions.go:2863 | bytecode.go:9579 (reuses varSet) |
| **ParentVarAdd** | (same as VarSet) | VarAdd on the player's parent. | compiler_functions.go:2874 | bytecode.go:9579 (reuses varSet) |
| **RootVarSet** | (same as VarSet) | VarSet on the player's root (the topmost non-helper ancestor). | compiler_functions.go:2885 | bytecode.go:9579 (reuses varSet) |
| **RootVarAdd** | (same as VarSet) | VarAdd on the player's root. | compiler_functions.go:2896 | bytecode.go:9579 (reuses varSet) |
| **MapSet** *(Ikemen)* | `map` (string name) OR `map(name) = value` syntax, `value` (float, required), `redirectid` (int) | Sets a named "map" (string-keyed float) on the player. Maps persist across states and round-end. | compiler_functions.go:4891 | bytecode.go:12258 |
| **MapAdd** *(Ikemen)* | (same as MapSet) | Adds to a named map. | compiler_functions.go:4903 | bytecode.go:12258 |
| **ParentMapSet** *(Ikemen)* | (same as MapSet) | MapSet on parent. | compiler_functions.go:4915 | bytecode.go:12258 |
| **ParentMapAdd** *(Ikemen)* | (same as MapSet) | MapAdd on parent. | compiler_functions.go:4927 | bytecode.go:12258 |
| **RootMapSet** *(Ikemen)* | (same as MapSet) | MapSet on root. | compiler_functions.go:4939 | bytecode.go:12258 |
| **RootMapAdd** *(Ikemen)* | (same as MapSet) | MapAdd on root. | compiler_functions.go:4951 | bytecode.go:12258 |
| **TeamMapSet** *(Ikemen)* | (same as MapSet) | MapSet on all players on the same team. | compiler_functions.go:4963 | bytecode.go:12258 |
| **TeamMapAdd** *(Ikemen)* | (same as MapSet) | MapAdd on all players on the same team. | compiler_functions.go:4975 | bytecode.go:12258 |
| **MapReset** *(Ikemen)* | `exclude` (string), `exclude2`..`exclude8` (strings), `redirectid` (int) | Resets all maps to their initial values, optionally excluding up to 8 named maps. | compiler_functions.go:4987 | bytecode.go:15413 |

(Count: 17 — 8 MUGEN-style var controllers + 9 Ikemen map controllers. VarMul is **not** implemented as a separate state controller in Ikemen GO; `var(x) *= y` is achieved via `VarSet` with an expression `var(x)*y`. Likewise `SysVarSet` is folded into VarSet via the `sysv`/`sysvar(n)` syntax.)

---

## 5. Visual / rendering controllers (20)

Explods, afterimages, palette effects, transparency, angles, sprite transforms.

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **Explod** | 50+ params (see below) | Spawns a sprite/animation as a "explod" effect (visual particle). The most parameter-rich sctrl in MUGEN. | compiler_functions.go:1127 | bytecode.go:6098 |
| **ModifyExplod** | (same as Explod) + `index` (int) | Modifies properties of an existing explod by `id` (and optionally `index`). | compiler_functions.go:1141 | bytecode.go:6566 |
| **RemoveExplod** | `id` (int), `index` (int), `redirectid` (int) | Removes explods matching `id` (or all if `id` is omitted). | compiler_functions.go:4224 | bytecode.go:11484 |
| **ExplodBindTime** | `id` (int), `time`/`value` (int, required), `redirectid` (int) | Sets how long explods of `id` stay bound to the player's position. | compiler_functions.go:4250 | bytecode.go:11513 |
| **AfterImage** | 14 params (see below) | Enables the player's afterimage trail (ghost trails of the player's sprite). | compiler_functions.go:1642 | bytecode.go:7349 |
| **AfterImageTime** | `time`/`value` (int, defaults to 0), `redirectid` (int) | Resets the AfterImage timer (use `time = 0` to clear). | compiler_functions.go:1649 | bytecode.go:7378 |
| **Trans** | `trans` (Trans spec: none/add/sub/add1/addalpha), `alpha` (2), `omage` (2), `redirectid` (int) | Sets the player's transparency/blend mode. | compiler_functions.go:3518 | bytecode.go:10519 |
| **AngleDraw** | `value` (float), `xangle` (float), `yangle` (float), `scale` (float, 2), `redirectid` (int) | Renders the player rotated by `value` degrees (Z axis), with optional X/Y angles for 3D-style tilt. | compiler_functions.go:3667 | bytecode.go:10628 |
| **AngleSet** | `value` (float), `xangle` (float), `yangle` (float), `redirectid` (int) | Sets the player's rotation angle (does not draw — use AngleDraw to apply). | compiler_functions.go:3694 | bytecode.go:10665 |
| **AngleAdd** | `value` (float), `xangle` (float), `yangle` (float), `redirectid` (int) | Adds to the player's rotation angle. | compiler_functions.go:3717 | bytecode.go:10700 |
| **AngleMul** | `value` (float), `xangle` (float), `yangle` (float), `redirectid` (int) | Multiplies the player's rotation angle. | compiler_functions.go:3740 | bytecode.go:10729 |
| **PalFX** | `time` (int), `color` (float), `hue` (float), `add` (3), `mul` (3), `sinadd` (4), `sinmul` (4), `sincolor` (2), `sinhue` (2), `invertall` (bool), `invertblend` (int), `redirectid` (int) | Applies palette effects (color shift, add/mul, sinusoidal, invert) to the player's sprite only. | compiler_functions.go:1539 | bytecode.go:5915 |
| **AllPalFX** | (same as PalFX, no redirectid) | Applies palette effects to *everything* on screen (players, helpers, explods). | compiler_functions.go:1550 | bytecode.go:6041 |
| **BGPalFX** | (same as PalFX) + `id` (int), `index` (int) | Applies palette effects to stage backgrounds. `id`/`index` select a specific BG layer. | compiler_functions.go:1557 | bytecode.go:6064 |
| **RemapPal** | `source` (int, 2 = group,index), `dest` (int, 2 = group,index, required), `redirectid` (int) | Remaps one palette to another (e.g. for alt costumes, or palette-based specials). | compiler_functions.go:4101 | bytecode.go:11223 |
| **RemapSprite** *(Ikemen)* | `reset` (int), `preset` (string), `source` (int, 2), `dest` (int, 2), `redirectid` (int) | Remaps one sprite (group, index) to another sprite, optionally by named preset. | compiler_functions.go:5475 | bytecode.go:12480 |
| **ModifyShadow** *(Ikemen)* | `anim` (int), `animelem` (int), `animplayerno` (int), `spriteplayerno` (int), `color` (3), `intensity` (int), `keeptransform` (bool), `offset` (2), `window` (4), `xscale`, `yscale`, `xshear`, `angle`, `xangle`, `yangle`, `focallength`, `projection`, plus `pos.x/y/z` (via posSetSub), `redirectid` (int) | Modifies how the player's shadow is drawn (anim, color, scale, angle). | compiler_functions.go:1272 | bytecode.go:15122 |
| **ModifyReflection** *(Ikemen)* | (same as ModifyShadow) | Modifies how the player's stage reflection is drawn. | compiler_functions.go:1354 | bytecode.go:15215 |
| **TransformSprite** *(Ikemen)* | `window` (4), `xshear` (float), `focallength` (float), `projection`, `redirectid` (int) | Applies a 3D-style projection transform to the player's sprite. | compiler_functions.go:6751 | bytecode.go:14915 |
| **ShaderSet** *(Ikemen)* | `time` (int), `shader.<param>` sub-params (via `shaderSub`), `redirectid` (int) | Sets a custom shader with named parameters. Used by Ikemen's post-processing pipeline. | compiler_functions.go:5594 | bytecode.go:12818 |

**Explod parameters** (from `explodSub`, compiler_functions.go:857–1072):
`remappal` (2), `id`, `postype`, `space`, `facing`, `vfacing`, `pos` (3), `random` (3), `vel`/`velocity` (3), `friction` (3), `accel` (3), `projection`, `scale` (2), `synclayer`, `syncparams`, `syncid`, `shadertime`, `shader.*`, `bindid`, `bindtime`, `removetime`, `supermove`, `supermovetime`, `pausemovetime`, `sprpriority`, `ontop`, `under`, `layerno`, `shadow` (3), `reflection`, `removeongethit`, `removeonchangestate`, `hidewithbars`, `trans`, `ownpal`, `palfx.*`, `window` (4), `afterimage.*`, `animplayerno`, `spriteplayerno`, `anim`, `animelem`, `animelemtime`, `animfreeze`, `angle`, `yangle`, `xangle`, `xshear`, `focallength`, `interpolation.*` (8 sub-keys), `ignorehitpause`, `redirectid`.

**AfterImage parameters** (from `afterImageSub`, compiler_functions.go:1575–1640):
`trans`, `time`, `length`, `timegap`, `framegap`, `palcolor`, `palhue`, `palinvertall`, `palinvertblend`, `palbright` (3), `palcontrast` (3), `palpostbright` (3), `paladd` (3), `palmul` (3), `ignorehitpause`, `redirectid`.

---

## 6. Game-flow controllers (8)

Pauses, screen shake, color overlays, special assertions.

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **Pause** | `time` (int), `movetime` (int), `pausebg` (bool), `endcmdbuftime` (int), `redirectid` (int) | Initiates a "pause" — gameplay freezes but command input still resolves for `movetime`. | compiler_functions.go:3426 | bytecode.go:10373 |
| **SuperPause** | `time` (int), `movetime` (int), `pausebg` (bool), `endcmdbuftime` (int), `darken` (bool), `brightness` (int), `anim` (int), `pos` (3), `p2defmul` (float), `poweradd` (int), `unhittable` (bool), `sound` (int, 2), `redirectid` (int) | A "super pause" — typically used for hyper-attack cinematics. Darkens background, plays an animation. | compiler_functions.go:3453 | bytecode.go:10408 |
| **EnvShake** | `time` (int), `ampl` (int), `phase` (float), `freq` (float), `mul` (float), `dir` (float), `diradd` (float), `decay` (float) | Shakes the camera/screen for `time` ticks. | compiler_functions.go:3332 | bytecode.go:10252 |
| **EnvColor** | `value` (int, 3 = r,g,b), `time` (int), `under` (bool) | Floods the screen with a solid color for `time` ticks. `under=true` draws below players. | compiler_functions.go:3763 | bytecode.go:10764 |
| **AssertSpecial** | `flag` (string, required), `flag2`..`flag8` (strings), `enabled` (bool), `redirectid` (int) | Sets a special flag (intro, invisible, noautoturn, noko, timerfreeze, etc.). Supports 8 simultaneous flags. | compiler_functions.go:132 | bytecode.go:5010 |
| **Zoom** | `pos` (2), `scale` (float), `lag` (float), `endlag` (float), `camerabound` (bool), `time` (int), `stagebound` (bool) | Adjusts camera zoom. Used in hyper cinematics. | compiler_functions.go:4339 | bytecode.go:11638 |
| **Offset** | `x` (float), `y` (float), `redirectid` (int) | Offsets the player's sprite rendering position (visual only — does not affect collision). | compiler_functions.go:4305 | bytecode.go:11587 |
| **SprPriority** | `value` (int), `layerno` (int), `redirectid` (int) | Sets the player's sprite drawing priority (lower = drawn behind). | compiler_functions.go:2617 | bytecode.go:9549 |

**AssertSpecial flags** (compiler_functions.go:143–301):
MUGEN char flags: `intro`, `invisible`, `noairguard`, `noautoturn`, `nocrouchguard`, `nojugglecheck`, `noshadow`, `nostandguard`, `nowalk`, `unguardable`.
MUGEN global flags: `globalnoshadow`, `nobardisplay`, `nobg`, `nofg`, `noko`, `nokoslow`, `nokosnd`, `nomusic`, `roundnotover`, `timerfreeze`.
Ikemen char flags: `animatehitpause`, `animfreeze`, `autoguard`, `drawunder`, `noaibuttonjam`, `noaicheat`, `noailevel`, `noairjump`, `nobrake`, `nocombodisplay`, `nocornerpush`, `nocrouch`, `nodizzypointsdamage`, `nofacedisplay`, `nofacep2`, `nofallcount`, `nofalldefenceup`, `nofallhitflag`, `nofastrecoverfromliedown`, `nogetupfromliedown`, `noguardbardisplay`, `noguarddamage`, `noguardko`, `noguardpointsdamage`, `nohardcodedkeys`, `nohitdamage`, `noinput`, `nointroreset`, `nojump`, `nokofall`, `nokovelocity`, `nolifebaraction`, `nolifebardisplay`, `nomakedust`, `nonamedisplay`, `nopowerbardisplay`, `noredlifedamage`, `noscore`, `nostand`, `nostunbardisplay`, `noturntarget`, `nowinicondisplay`, `postroundinput`, `projtypecollision`, `runfirst`, `runlast`, `sizepushonly`, `nodestroyself`.
Ikemen global flags: `camerafreeze`, `notimedisplay`, `globalnoko`, `roundnotskip`, `roundfreeze`, `skipfightdisplay`, `skipkodisplay`, `skiprounddisplay`, `skipwindisplay`.

---

## 7. Helper controllers (5)

Spawning/binding helpers (child entities).

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **Helper** | 30+ params (see below) | Spawns a new helper entity with its own state, anim, position, etc. | compiler_functions.go:629 | bytecode.go:5554 |
| **DestroySelf** | (see §1 State change) | Destroys the calling helper. | compiler_functions.go:556 | bytecode.go:5419 |
| **BindToParent** | `time` (int), `facing` (int), `pos` (3), `redirectid` (int) | Binds the calling helper to its parent's position for `time` ticks. | compiler_functions.go:4210 | bytecode.go:11383 |
| **BindToRoot** | (same as BindToParent) | Binds the calling helper to its root (topmost non-helper ancestor). | compiler_functions.go:4217 | bytecode.go:11440 |
| **BindToTarget** | `id` (int), `index` (int), `time` (int), `pos` (1–3 floats, with optional H/M/F type suffix), `posz` (float), `redirectid` (int) | Binds the player to a target's position. Used for throws/grabs. | compiler_functions.go:2969 | bytecode.go:9726 |

**Helper parameters** (from `helper`, compiler_functions.go:629–845):
`helpertype` (normal/player/projectile), `clsnproxy` (bool), `name` (string), `postype`, `ownpal` (bool), `size.xscale`, `size.yscale`, `size.ground.back`, `size.ground.front`, `size.air.back`, `size.air.front`, `size.height`, `size.proj.doscale`, `size.head.pos` (2), `size.mid.pos` (2), `size.shadowoffset`, `size.depth` (2), `size.weight`, `size.pushfactor`, `stateno`, `keyctrl` (int, 4), `id`, `pos` (3), `facing`, `pausemovetime`, `supermovetime`, `remappal` (2), `extendsmap` (bool), `inheritjuggle` (int), `inheritchannels` (int), `immortal` (bool), `kovelocity` (bool), `preserve` (bool), `standby` (bool), `ownclsnscale` (bool), `ownprojectile` (bool), `map.*` (named map parameters), `redirectid`.

---

## 8. Target controllers (12)

Manipulating players that the calling player has hit (targets).

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **TargetBind** | `id` (int), `index` (int), `time` (int), `pos` (3), `redirectid` (int) | Binds target(s) to the calling player's position for `time` ticks. | compiler_functions.go:2942 | bytecode.go:9679 |
| **TargetDrop** | `excludeid` (int), `keepone` (bool), `redirectid` (int) | Releases all targets except `excludeid`. If `keepone=false`, releases all. | compiler_functions.go:3177 | bytecode.go:10005 |
| **TargetFacing** | `id` (int), `index` (int), `value` (int), `redirectid` (int) | Sets the facing of target(s). | compiler_functions.go:2919 | bytecode.go:9644 |
| **TargetLifeAdd** | `id` (int), `index` (int), `absolute` (bool), `kill` (bool), `dizzy` (bool), `redlife` (bool), `value` (int, required), `redirectid` (int) | Subtracts `value` from target(s)' life. If not `absolute`, scales by attack/defence multipliers. | compiler_functions.go:3030 | bytecode.go:9777 |
| **TargetPowerAdd** | `id` (int), `index` (int), `value` (int, required), `redirectid` (int) | Adds `value` to target(s)' power bar. | compiler_functions.go:3154 | bytecode.go:9970 |
| **TargetState** | `id` (int), `index` (int), `value` (int, required), `redirectid` (int) | Forces target(s) into state `value` (the target's state, not the attacker's). | compiler_functions.go:3069 | bytecode.go:9825 |
| **TargetVelSet** | `id` (int), `index` (int), `x`, `y`, `z` (float, each 1), `redirectid` (int) | Sets target(s)' velocity. | compiler_functions.go:3092 | bytecode.go:9860 |
| **TargetVelAdd** | `id` (int), `index` (int), `x`, `y`, `z` (float, each 1), `redirectid` (int) | Adds to target(s)' velocity. | compiler_functions.go:3123 | bytecode.go:9915 |
| **TargetAdd** *(Ikemen)* | `playerid` (int, required), `redirectid` (int) | Manually adds a player (by playerid) to the caller's target list. | compiler_functions.go:6709 | bytecode.go:14858 |
| **TargetDizzyPointsAdd** *(Ikemen)* | `id` (int), `absolute` (bool), `value` (int, required), `redirectid` (int) | Adds to target(s)' dizzy-points meter. | compiler_functions.go:5625 | bytecode.go:13389 |
| **TargetGuardPointsAdd** *(Ikemen)* | `id` (int), `absolute` (bool), `value` (int, required), `redirectid` (int) | Adds to target(s)' guard-points meter. | compiler_functions.go:5648 | bytecode.go:13428 |
| **TargetRedLifeAdd** *(Ikemen)* | `id` (int), `absolute` (bool), `value` (int, required), `redirectid` (int) | Adds to target(s)' red-life (chip damage) meter. | compiler_functions.go:5671 | bytecode.go:13467 |
| **TargetScoreAdd** *(Ikemen)* | `id` (int), `value` (float, required), `redirectid` (int) | Adds to target(s)' score. | compiler_functions.go:5694 | bytecode.go:13510 |

(13 entries — 8 MUGEN + 5 Ikemen.)

---

## 9. Player attribute controllers (8)

Width, height, attack range, multipliers.

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **Width** | `edge` (float, 2), `player` (float, 2), OR `value` (float, 2, legacy), `redirectid` (int) | Sets the player's collision width. `edge` is for camera/edge bound; `player` is for player-vs-player push. | compiler_functions.go:2581 | bytecode.go:9502 |
| **Height** *(Ikemen)* | `value` (float, 2 = top,bottom), `redirectid` (int) | Sets the player's collision height (top, bottom). | compiler_functions.go:6304 | bytecode.go:14457 |
| **Depth** *(Ikemen)* | `edge` (float, 2), `player` (float, 2), OR `value` (float, 2), `redirectid` (int) | Sets the player's depth (Z-axis) collision bounds. | compiler_functions.go:6319 | bytecode.go:14487 |
| **AttackDist** | `value`/`width` (float, 2), `height` (float, 2), `depth` (float, 2), `redirectid` (int) | Sets the player's "attack range" — the distance at which the enemy starts guarding. | compiler_functions.go:3886 | bytecode.go:10931 |
| **AttackMulSet** | `value` (float), `damage` (float), `redlife` (float), `dizzypoints` (float), `guardpoints` (float) — at least one required, `redirectid` (int) | Sets the player's attack damage multiplier, or sub-multipliers for damage/redlife/dizzy/guard points. | compiler_functions.go:3913 | bytecode.go:10974 |
| **DefenceMulSet** | `value` (float, required), `multype` (int 0/1), `onhit` (bool), `redirectid` (int) | Sets the player's defence multiplier. `multype` distinguishes `defence_mul` (0) from `fall_defence_mul` (1). | compiler_functions.go:3958 | bytecode.go:11013 |
| **PlayerPush** | `value` (bool), `priority` (int), `affectteam` (E/B/F), at least one required, `redirectid` (int) | Toggles player-vs-player push collision, optionally with priority and team filter. | compiler_functions.go:3532 | bytecode.go:10566 |
| **ScreenBound** | `value` (bool, defaults to 0), `movecamera` (bool, 2), `stagebound` (bool), `redirectid` (int) | Controls whether the player is bounded by the screen edge and whether they can move the camera. (Listed under Screen too.) | compiler_functions.go:3275 | bytecode.go:10177 |
| **OverrideClsn** *(Ikemen)* | `group` (clsn type: none/box/custom), `index` (int), `rect` (float, 4 = x,y,w,h), `redirectid` (int) | Overrides the player's collision box with a custom rect. | compiler_functions.go:7112 | bytecode.go:15356 |
| **TransformClsn** *(Ikemen)* | `scale` (float, 2), `angle` (float) — at least one required, `redirectid` (int) | Applies a scale/angle transform to the player's collision boxes. | compiler_functions.go:6724 | bytecode.go:14885 |
| **ModifyPlayer** *(Ikemen)* | 18 params (see below) | Modifies a redirected player's core attributes (life max, power max, names, A.I. level, etc.). | compiler_functions.go:6355 | bytecode.go:14534 |
| **GroundLevelOffset** *(Ikemen)* | `value` (float, required), `redirectid` (int) | Sets the player's ground-level rendering offset. | compiler_functions.go:6694 | bytecode.go:14833 |

**ModifyPlayer parameters** (from `modifyPlayer`, compiler_functions.go:6355–6461):
`lifemax`, `powermax`, `dizzypointsmax`, `guardpointsmax`, `teamside`, `displayname` (string), `lifebarname` (string), `helpername` (string), `helpervar.id`, `movehit`, `moveguarded`, `movereversed`, `movecountered` (bool), `hitpausetime`, `pausemovetime`, `supermovetime`, `unhittabletime`, `attack`, `defence`, `alive` (bool), `ailevel` (float), `redirectid`.

(12 entries — 7 MUGEN + 5 Ikemen.)

---

## 10. Sound controllers (5)

SFX, BGM, and per-channel modifiers.

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **PlaySnd** | `value` (int, 2 = group,index, required), `channel` (int), `lowpriority` (bool), `pan` (float), `abspan` (float), `volume` (int), `volumescale` (int), `freqmul` (float), `loop` (bool), `priority` (int), `loopstart` (int), `loopend` (int), `startposition` (int), `loopcount` (int), `stopongethit` (bool), `stoponchangestate` (bool), `redirectid` (int) | Plays a sound from the player's `snd` file (or `fightfx.snd` if prefix `f`/`F` is used). | compiler_functions.go:357 | bytecode.go:5066 |
| **StopSnd** | `channel` (int, required), `redirectid` (int) | Stops any sound playing on the given channel. | compiler_functions.go:4120 | bytecode.go:11258 |
| **SndPan** | `channel` (int, required), `pan` (float), `abspan` (float), `redirectid` (int) | Sets the pan of a currently-playing sound on the given channel. | compiler_functions.go:4135 | bytecode.go:11290 |
| **ModifySnd** *(Ikemen)* | `channel` (int), `pan`, `abspan`, `volume`, `volumescale`, `freqmul`, `priority`, `loopstart`, `loopend`, `position`, `loop`, `loopcount`, `stopongethit`, `stoponchangestate`, `redirectid` (int) | Modifies an already-playing sound on the given channel (volume, freq, loop points, etc.). | compiler_functions.go:5344 | bytecode.go:13152 |
| **PlayBgm** *(Ikemen)* | `source` (string: `match.<...>` / `stagedef.<...>` / `charparams.<...>` / `stageparams.<...>` / `launchparams.<...>` / `motif.<...>`), `bgm` (string path), `volume`, `loop`, `loopstart`, `loopend`, `startposition`, `loopcount`, `freqmul`, `redirectid` (int) | Plays background music from a named source. | compiler_functions.go:5163 | bytecode.go:13306 |
| **ModifyBgm** *(Ikemen)* | `volume`, `loopstart`, `loopend`, `freqmul`, `position` | Modifies the currently-playing BGM. | compiler_functions.go:5411 | bytecode.go:13083 |

(6 entries — 3 MUGEN + 3 Ikemen.)

---

## 11. Screen / camera controllers (3)

Camera, screen bounds.

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **ScreenBound** | (see §9 Player) | Binds the player to the screen edges. | compiler_functions.go:3275 | bytecode.go:10177 |
| **Zoom** | (see §6 Game flow) | Camera zoom control. | compiler_functions.go:4339 | bytecode.go:11638 |
| **Camera** *(Ikemen)* | `followid` (int), `view` (string: `fighting` / `follow` / `free`), `pos` (2), `redirectid` (int) | Sets the camera mode — `fighting` (default 2-player tracking), `follow` (lock onto a player id), or `free` (manual `pos`). | compiler_functions.go:6271 | bytecode.go:14425 |

---

## 12. Projectile controllers (2)

Spawning and modifying projectiles.

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **Projectile** | 40+ params (see below) | Spawns a projectile with full HitDef semantics (it's basically `Helper + HitDef + anim`). | compiler_functions.go:2548 | bytecode.go:8062 |
| **ModifyProjectile** *(Ikemen)* | `id` (int), `index` (int), plus all Projectile params | Modifies an existing projectile's properties. | compiler_functions.go:2558 | bytecode.go:8397 |

**Projectile parameters** (from `projectileSub`, compiler_functions.go:2363–2546):
`redirectid`, `postype`, `projid`, `projremove` (bool), `projremovetime`, `projshadow` (3), `projreflection`, `projmisstime`, `projhits`, `projpriority`, `projhitanim`, `projremanim`, `projcancelanim`, `velocity` (3), `velmul` (3), `remvelocity` (3), `accel` (3), `projscale` (2), `projangle`, `projxangle`, `projyangle`, `projclsnscale` (2), `projclsnangle`, `projwindow` (4), `projxshear`, `projfocallength`, `projprojection`, plus full `hitDefSub` (HitDef params), `offset` (3), `projsprpriority`, `projlayerno`, `projstagebound`, `projedgebound`, `projheightbound` (2), `projdepthbound`, `projanim`, `supermovetime`, `pausemovetime`, `ownpal`, `remappal` (2), `afterimage.*`, `shadertime`, `shader.*`.

---

## 13. Special / misc controllers (25)

Life, power, score, redlife, dizzy, clipboard, dialogue, console, save/load, storyboards, stage mutation, etc.

| CNS Name | Parameters | Description | Parser (file:line) | Runtime (bytecode.go) |
|---|---|---|---|---|
| **HitAdd** | `value` (int, required), `redirectid` (int) | Adds `value` to the player's hit count (combo counter). | compiler_functions.go:4290 | bytecode.go:11564 |
| **LifeAdd** | `value` (int, required), `absolute` (bool), `kill` (bool), `redirectid` (int) | Adds `value` to the player's life. If not `absolute`, scales by attack/defence multipliers. | compiler_functions.go:3196 | bytecode.go:10036 |
| **LifeSet** | `value` (int, required), `redirectid` (int) | Sets the player's life to `value` directly (no multiplier). | compiler_functions.go:3219 | bytecode.go:10072 |
| **PowerAdd** | `value` (int, required), `redirectid` (int) | Adds `value` to the player's power bar. | compiler_functions.go:3230 | bytecode.go:10095 |
| **PowerSet** | `value` (int, required), `redirectid` (int) | Sets the player's power bar to `value`. | compiler_functions.go:3241 | bytecode.go:10118 |
| **RedLifeAdd** *(Ikemen)* | `value` (int, required), `absolute` (bool), `redirectid` (int) | Adds to the player's red-life (chip damage) meter. | compiler_functions.go:5445 | bytecode.go:12430 |
| **RedLifeSet** *(Ikemen)* | `value` (int, required), `redirectid` (int) | Sets the player's red-life meter. | compiler_functions.go:5464 | bytecode.go:12457 |
| **ScoreAdd** *(Ikemen)* | `value` (float, required), `redirectid` (int) | Adds to the player's score. | compiler_functions.go:5580 | bytecode.go:12795 |
| **DizzyPointsAdd** *(Ikemen)* | `value` (int, required), `absolute` (bool), `redirectid` (int) | Adds to the player's dizzy-points meter. | compiler_functions.go:4597 | bytecode.go:11999 |
| **DizzyPointsSet** *(Ikemen)* | `value` (int, required), `redirectid` (int) | Sets the player's dizzy-points meter. | compiler_functions.go:4616 | bytecode.go:12026 |
| **DizzySet** *(Ikemen)* | `value` (bool, required), `redirectid` (int) | Forces the player into (`value=1`) or out of (`value=0`) the dizzy state. | compiler_functions.go:4627 | bytecode.go:12049 |
| **GuardPointsAdd** *(Ikemen)* | `value` (int, required), `absolute` (bool), `redirectid` (int) | Adds to the player's guard-points meter. | compiler_functions.go:4649 | bytecode.go:12095 |
| **GuardPointsSet** *(Ikemen)* | `value` (int, required), `redirectid` (int) | Sets the player's guard-points meter. | compiler_functions.go:4668 | bytecode.go:12122 |
| **GuardBreakSet** *(Ikemen)* | `value` (bool, required), `redirectid` (int) | Forces the player into/out of guard-broken state. | compiler_functions.go:4638 | bytecode.go:12072 |
| **MakeDust** | `pos` (3), `pos2` (3), `spacing` (int), `redirectid` (int) | Spawns dust particles at the player's position. `spacing` controls how often (in ticks) dust spawns if MakeDust is called every tick. | compiler_functions.go:3861 | bytecode.go:10870 |
| **MoveHitReset** | `redirectid` (int) | Resets the player's movehit/moveguarded/movereversed counters to 0. No value parameter. | compiler_functions.go:4278 | bytecode.go:11541 |
| **DisplayToClipboard** | `text` (string, required), `params` (up to 100 exprs), `redirectid` (int) | Replaces the player's clipboard contents with `text` (formatted with `params`). | compiler_functions.go:3835 | bytecode.go:10792 |
| **AppendToClipboard** | (same as DisplayToClipboard) | Appends to the player's clipboard instead of replacing. | compiler_functions.go:3842 | bytecode.go:10826 |
| **ClearClipboard** | `redirectid` (int) | Clears the player's clipboard. | compiler_functions.go:3849 | bytecode.go:10847 |
| **PrintToConsole** *(Ikemen)* | (same as DisplayToClipboard) | Prints `text` (formatted with `params`) to stdout/console. | compiler_functions.go:5438 | bytecode.go:12406 |
| **VictoryQuote** | `value` (int), `redirectid` (int) | Sets which victory quote is shown on the win screen. | compiler_functions.go:4324 | bytecode.go:11613 |
| **Null** | (none) | No-op. Used to comment out a `[State]` block while keeping it syntactically valid. | compiler_functions.go:7135 | (returns `nullStateController`) |
| **ForceFeedback** | `waveform` (string: `sine`/`square`/`sinesquare`/`off`), `time` (int), `force` (varies), `redirectid` (int) | Triggers gamepad force feedback (rumble). Often ignored on PC builds. | compiler_functions.go:4374 | bytecode.go:11711 |
| **Text** *(Ikemen)* | 30+ params (see below) | Spawns a text object (rendered string) on screen — Ikemen's generalization of DisplayToClipboard. | compiler_functions.go:5849 | bytecode.go:13545 |
| **ModifyText** *(Ikemen)* | (same as Text) | Modifies an existing Text object by `id`. | compiler_functions.go:5859 | bytecode.go:14041 |
| **RemoveText** *(Ikemen)* | `id` (int), `index` (int), `redirectid` (int) | Removes Text objects by `id`. | compiler_functions.go:5874 | bytecode.go:14009 |
| **Dialogue** *(Ikemen)* | `hidebars` (bool), `force` (bool), `text1`..`textN` (strings), `redirectid` (int) | Displays a story-mode dialogue box with multiple text lines. | compiler_functions.go:4555 | bytecode.go:11961 |
| **ChangeMovelist** *(Ikemen)* | `value` (int), `redirectid` (int) | Swaps the player's movelist (used by Ikemen's training-mode UI). | compiler_functions.go:4540 | bytecode.go:11932 |
| **LifebarAction** *(Ikemen)* | `top` (bool), `timemul` (float), `time` (int), `anim` (int), `spr` (int, 2), `snd` (int, 2), `text` (string), `font.no`, `font.bank`, `font.align`, `palfx.*`, `redirectid` (int) | Triggers a lifebar "action" (e.g. combo counter pop, hit spark on lifebar). | compiler_functions.go:4679 | bytecode.go:12145 |
| **AssertCommand** *(Ikemen)* | `name` (string, required), `buffer.time` (int), `redirectid` (int) | Manually asserts a command (as if the player had input it) for `buffer.time` ticks. Used for AI/cutscene control. | compiler_functions.go:6465 | bytecode.go:11821 |
| **AssertInput** *(Ikemen)* | `flag` (string: U/D/L/R/a/b/c/x/y/z/s/d/w/m/B/F, required), `flag2`..`flag8`, `redirectid` (int) | Manually asserts raw input flags. Useful for AI/cutscene control. | compiler_functions.go:4469 | bytecode.go:11895 |
| **AssertAnalogVector** *(Ikemen)* | `leftx`, `lefty`, `rightx`, `righty`, `lefttrigger`, `righttrigger` (float, each 1), `redirectid` (int) | Manually asserts analog stick / trigger values. | compiler_functions.go:4434 | bytecode.go:11850 |
| **ShiftInput** *(Ikemen)* | `input` (string: U/D/L/R/a/b/c/x/y/z/s/d/w/m or `none`, required), `output` (string, same format, required), `redirectid` (int) | Remaps one input symbol to another for the player (e.g. swap punch/kick buttons). | compiler_functions.go:7035 | bytecode.go:15308 |
| **GetHitVarSet** *(Ikemen)* | 20+ params (animtype, airtype, attr, damage, guardcount, hitcount, fallcount, hitshaketime, hittime, slidetime, ctrltime, xoff/yoff/zoff, xvel/yvel/zvel, xaccel/yaccel/zaccel, xveladd/yveladd, chainid, guarded, isbound, fall, fall.*, attr.*) | Manually overwrites fields of the player's gethitvar structure (the cached "what hit me" data). | compiler_functions.go:6489 | bytecode.go:14669 |
| **SaveFile** *(Ikemen)* | `path` (string, required), `savedata` (via `paramSaveData`), `maps` (string list), `maps.include` (string list), `redirectid` (int) | Saves player data (vars, maps) to a file on disk. | compiler_functions.go:5558 | bytecode.go:12572 |
| **LoadFile** *(Ikemen)* | (same as SaveFile) | Loads player data from a file. | compiler_functions.go:5565 | bytecode.go:12663 |
| **SaveState** *(Ikemen)* | (none) | Snapshots the current match state for later LoadState. | compiler_functions.go:5572 | bytecode.go:12777 |
| **LoadState** *(Ikemen)* | (none) | Restores the last saved match state. | compiler_functions.go:4755 | bytecode.go:12240 |
| **MatchRestart** *(Ikemen)* | `reload` (bool, MaxPlayerNo), `stagedef` (string), `p1def`..`p8def` (strings), `preservevars` (bool, MaxPlayerNo), `p1palette`..`p8palette` (ints), `redirectid` (int) | Restarts the match with optional new stage/player definitions. Used in Ikemen's story mode. | compiler_functions.go:5023 | bytecode.go:12291 |
| **Storyboard** *(Ikemen)* | `path` (string, required) | Plays a `.def` storyboard cutscene. | compiler_functions.go:5609 | bytecode.go:12890 |
| **RoundTimeAdd** *(Ikemen)* | `value` (int, required), `redirectid` (int) | Adds to the round timer. | compiler_functions.go:5507 | bytecode.go:12532 |
| **RoundTimeSet** *(Ikemen)* | `value` (int, required), `redirectid` (int) | Sets the round timer. | compiler_functions.go:5522 | bytecode.go:12552 |
| **ModifyBGCtrl** *(Ikemen)* | `id` (int, required), `time` (3), `value` (3), `x`, `y`, `source` (2), `dest` (2), `add` (3), `mul` (3), `sinadd` (4), `sinmul` (4), `sincolor` (2), `sinhue` (2), `invertall`, `invertblend`, `color` (float) | Triggers / modifies a stage background controller (BGCtrl) by id. | compiler_functions.go:5248 | bytecode.go:12913 |
| **ModifyBGCtrl3d** *(Ikemen)* | `id` (int, required), `time` (3), `value` (3) | Triggers / modifies a 3D stage background controller. | compiler_functions.go:5324 | (in bytecode.go, registered via type alias) |
| **ModifyStageBG** *(Ikemen)* | `id` (int), `index` (int), `actionno`, `delta.x` (2), `delta.y`, `layerno` (2), `pos.x` (2), `pos.y`, `spriteno` (2), `start.x` (2), `start.y`, `scalestart` (2), `trans`, `angle`, `xangle`, `yangle`, `velocity.x` (2), `velocity.y`, `tile.x`, `tile.y`, `tile.spacing.x`, `tile.spacing.y`, `window.x` (2), `window.y`, `window.delta.x` (2), `window.delta.y`, `mask`, `layerno`, `xshear`, `focallength`, `projection`, plus more | Modifies a stage background layer's properties at runtime. | compiler_functions.go:6791 | bytecode.go:14949 |
| **ModifyStageVar** *(Ikemen)* | `camera.boundleft`, `camera.boundright`, `camera.boundhigh`, `camera.boundlow`, `camera.tension`, `camera.verticaltension`, `camera.tensionlow`, `camera.tensionhigh`, `camera.zoomin`, `camera.zoomout`, `camera.ytension.enable`, `camera.ytension.threshold`, `stageinfo.zoffset`, `stageinfo.zoffsetlink`, `stageinfo.author`, `stageinfo.displayname`, `stageinfo.zenable`, `stageinfo.autorun`, `shadow.intensity`, `shadow.color`, `shadow.yscale`, `shadow.fade.range`, `reflection.intensity`, `bgm.bgmvolume`, `bgm.bgmratio`, `bgm.loop`, etc. | Modifies stage-level variables (camera bounds, shadows, etc.) at runtime. | compiler_functions.go:5975 | bytecode.go:14112 |

(45 entries in this section — many Ikemen-specific. The "Special" bucket is a catch-all and includes all non-categorized controllers.)

---

## 14. Summary counts

### By origin

| Origin | Count |
|---|---|
| MUGEN 1.1 (lines 38–129 of `compiler.go`) | 91 |
| Ikemen GO extensions (lines 131–198 of `compiler.go`) | 68 |
| **Total registered state controllers** | **159** |

### By category (as organized above)

| Category | Count |
|---|---|
| 1. State change (ChangeState, SelfState, ChangeAnim, Turn, CtrlSet, StateTypeSet, DestroySelf, GameMakeAnim, TagIn, TagOut, ChangeAnim2) | 11 |
| 2. Physics (PosSet, PosAdd, VelSet, VelAdd, VelMul, HitVelSet, PosFreeze, Gravity) | 8 |
| 3. Hit (HitDef, ModifyHitDef, ReversalDef, ModifyReversalDef, HitBy, NotHitBy, HitOverride, HitFallSet, HitFallVel, HitFallDamage, FallEnvShake) | 11 |
| 4. Variables (VarSet, VarAdd, VarRangeSet, VarRandom, ParentVarSet, ParentVarAdd, RootVarSet, RootVarAdd, MapSet, MapAdd, ParentMapSet, ParentMapAdd, RootMapSet, RootMapAdd, TeamMapSet, TeamMapAdd, MapReset) | 17 |
| 5. Visual (Explod, ModifyExplod, RemoveExplod, ExplodBindTime, AfterImage, AfterImageTime, Trans, AngleDraw, AngleSet, AngleAdd, AngleMul, PalFX, AllPalFX, BGPalFX, RemapPal, RemapSprite, ModifyShadow, ModifyReflection, TransformSprite, ShaderSet) | 20 |
| 6. Game flow (Pause, SuperPause, EnvShake, EnvColor, AssertSpecial, Zoom, Offset, SprPriority) | 8 |
| 7. Helpers (Helper, DestroySelf [shared with §1], BindToParent, BindToRoot, BindToTarget) | 5 |
| 8. Target (TargetBind, TargetDrop, TargetFacing, TargetLifeAdd, TargetPowerAdd, TargetState, TargetVelSet, TargetVelAdd, TargetAdd, TargetDizzyPointsAdd, TargetGuardPointsAdd, TargetRedLifeAdd, TargetScoreAdd) | 13 |
| 9. Player (Width, Height, Depth, AttackDist, AttackMulSet, DefenceMulSet, PlayerPush, ScreenBound [shared with §11], OverrideClsn, TransformClsn, ModifyPlayer, GroundLevelOffset) | 12 |
| 10. Sound (PlaySnd, StopSnd, SndPan, ModifySnd, PlayBgm, ModifyBgm) | 6 |
| 11. Screen / camera (ScreenBound [shared with §9], Zoom [shared with §6], Camera) | 3 |
| 12. Projectile (Projectile, ModifyProjectile) | 2 |
| 13. Special / misc (HitAdd, LifeAdd, LifeSet, PowerAdd, PowerSet, RedLifeAdd, RedLifeSet, ScoreAdd, DizzyPointsAdd, DizzyPointsSet, DizzySet, GuardPointsAdd, GuardPointsSet, GuardBreakSet, MakeDust, MoveHitReset, DisplayToClipboard, AppendToClipboard, ClearClipboard, PrintToConsole, VictoryQuote, Null, ForceFeedback, Text, ModifyText, RemoveText, Dialogue, ChangeMovelist, LifebarAction, AssertCommand, AssertInput, AssertAnalogVector, ShiftInput, GetHitVarSet, SaveFile, LoadFile, SaveState, LoadState, MatchRestart, Storyboard, RoundTimeAdd, RoundTimeSet, ModifyBGCtrl, ModifyBGCtrl3d, ModifyStageBG, ModifyStageVar) | 46 |
| **Total across all categories (with multi-listed items counted once per listing)** | 167 |

The category total (167) exceeds the registered total (159) because 8 controllers are intentionally cross-listed in two categories (e.g. `DestroySelf` appears in both §1 State change and §7 Helpers; `ScreenBound` in §9 Player and §11 Screen; `Zoom` in §6 Game flow and §11 Screen). The unique state-controller count is **159**.

---

## 15. Notable observations

1. **No `VarMul`** — MUGEN documentation lists `VarMul` as a state controller, but Ikemen GO does not implement it separately. To multiply a var, use `VarSet` with an expression: `var(0) = var(0) * 2`. Same for `SysVarSet`/`SysVarAdd` — these are folded into `VarSet` via the `sysv`/`sysvar(n)` syntax (the `varType` byte discriminates).

2. **`MoveCamera` is not a separate controller** — In MUGEN 1.1, `MoveCamera` was a standalone state controller. In Ikemen GO, the same functionality is folded into `ScreenBound`'s `movecamera` parameter (2-bool vector: x, y). This is documented in `compiler_functions.go:3292–3300`.

3. **`HitBy`/`NotHitBy` use a unified `hitBySub` helper** — Both controllers parse the same way. The only difference is the runtime dispatch direction (`crun := getRedirectedChar(c, ..., "HitBy")` vs `"NotHitBy"`). They support both the legacy `value`/`value2` syntax (2 slots) and a new `attr`/`slot`/`stack` syntax (arbitrary slots). The two cannot be mixed.

4. **`Parent*` and `Root*` variants reuse the underlying controller bytecode** — `ParentVarSet`, `RootVarSet`, `ParentVarAdd`, `RootVarAdd` all use the same `varSet StateControllerBase` runtime type (`bytecode.go:9579`), discriminated by a `varSet_sctrltype` byte (0 = VarSet, 1 = VarAdd, 2 = ParentVarSet, 3 = ParentVarAdd, 4 = RootVarSet, 5 = RootVarAdd). Same pattern for MapSet (sctrltype 0–7).

5. **`ModifyHitDef` reuses `hitDefSub`** — There is no separate ModifyHitDef parameter list. The implementation just calls `c.hitDefSub(is, sc)` (compiler_functions.go:2292) and the runtime differs only in that it doesn't reset the HitDef before applying the new params.

6. **Ikemen GO adds a Z axis to almost everything** — Even MUGEN 1.1 controllers like `PosSet`, `VelSet`, `TargetBind`, `Helper.pos`, `Explod.pos`, `SuperPause.pos`, `HitDef.snap`, etc. accept a Z component. MUGEN 1.1 ignored Z. This is invisible to standard 2D characters but enables 3D stage modes.

7. **`Height` is Ikemen-only** — MUGEN 1.1 had no `Height` state controller; player height was fixed at character definition time via `size.height`. Ikemen adds the runtime `Height` controller (compiler_functions.go:6304) to allow dynamic height changes (e.g. for crouch states).

8. **`Depth` is Ikemen-only** — Likewise MUGEN 1.1 had no Z-axis collision. Ikemen adds the `Depth` controller for 3D-mode stages.

9. **`Text`/`ModifyText`/`RemoveText`** — Ikemen's generalization of MUGEN's `DisplayToClipboard`. Instead of writing to an invisible debug clipboard, `Text` spawns actual on-screen text objects with full layout control (font, position, velocity, scale, anim, palfx).

10. **The `map.` parameter convention** — Several controllers (Helper, ModifyPlayer indirectly via maps, ModifyBGCtrl via source/dest) accept `map.<name> = value` parameters. These are sorted alphabetically before being added to the bytecode (compiler_functions.go:818–825) to ensure deterministic `random` consumption.

11. **`redirectid` is universal** — Every state controller that mutates a `*Char` (i.e. almost all of them) accepts a `redirectid` parameter as its first param. This implements the MUGEN `redirect,` prefix (e.g. `parent, VarSet`) at the engine level rather than the parser level. The parser strips the `redirect,` prefix in `parseSection` and translates it to a `redirectid` parameter on the resulting state block.

12. **`Null` short-circuits** — `c.null` (compiler_functions.go:7135) returns a pre-built `nullStateController` without even calling `stateSec`. This means a `[State n, SomeName]` block with `type = Null` and a bunch of meaningless parameters compiles to nothing, with no parameter validation.

13. **`MatchRestart` is heavyweight** — It accepts per-player `p1def`..`p8def` (string paths to new character defs) and `p1palette`..`p8palette`. This is Ikemen's mechanism for "mid-match character swap" cutscenes (used in boss-rush story modes).

14. **`ModifyStageBG` is the most parameter-rich Ikemen controller** — It exposes nearly every property of a stage background layer (delta, pos, scale, angle, velocity, tile, window, mask, xshear, focallength, projection, trans) for runtime modification. This is what powers Ikemen's interactive stage destruction / transformation scenes.

---

## 16. Cross-reference:Ikemen GO state controllers vs. MUGEN 1.1 docs

The following 91 controllers are documented in the official MUGEN 1.1 CNS spec and all appear in Ikemen GO's `scmap`:

`AfterImage`, `AfterImageTime`, `AllPalFX`, `AngleAdd`, `AngleDraw`, `AngleMul`, `AngleSet`, `AppendToClipboard`, `AssertSpecial`, `AttackDist`, `AttackMulSet`, `BGPalFX`, `BindToParent`, `BindToRoot`, `BindToTarget`, `ChangeAnim`, `ChangeAnim2`, `ChangeState`, `ClearClipboard`, `CtrlSet`, `DefenceMulSet`, `DestroySelf`, `DisplayToClipboard`, `EnvColor`, `EnvShake`, `Explod`, `ExplodBindTime`, `FallEnvShake`, `ForceFeedback`, `GameMakeAnim`, `Gravity`, `Helper`, `HitAdd`, `HitBy`, `HitDef`, `HitFallDamage`, `HitFallSet`, `HitFallVel`, `HitOverride`, `HitVelSet`, `LifeAdd`, `LifeSet`, `MakeDust`, `ModifyExplod`, `MoveHitReset`, `NotHitBy`, `Null`, `Offset`, `PalFX`, `ParentVarAdd`, `ParentVarSet`, `Pause`, `PlayerPush`, `PlaySnd`, `PosAdd`, `PosFreeze`, `PosSet`, `PowerAdd`, `PowerSet`, `Projectile`, `RemapPal`, `RemoveExplod`, `ReversalDef`, `ScreenBound`, `SelfState`, `SndPan`, `SprPriority`, `StateTypeSet`, `StopSnd`, `SuperPause`, `TargetBind`, `TargetDrop`, `TargetFacing`, `TargetLifeAdd`, `TargetPowerAdd`, `TargetState`, `TargetVelAdd`, `TargetVelSet`, `Trans`, `Turn`, `VarAdd`, `VarRandom`, `VarRangeSet`, `VarSet`, `VelAdd`, `VelMul`, `VelSet`, `VictoryQuote`, `Width`, `Zoom`, `RemoveText` *(this one is actually Ikemen-added but appears in the MUGEN block of `compiler.go`)*.

The following 68 controllers are **Ikemen GO extensions** (not in MUGEN 1.1):

`AssertAnalogVector`, `AssertCommand`, `AssertInput`, `Camera`, `ChangeMovelist`, `Depth`, `Dialogue`, `DizzyPointsAdd`, `DizzyPointsSet`, `DizzySet`, `GetHitVarSet`, `GroundLevelOffset`, `GuardBreakSet`, `GuardPointsAdd`, `GuardPointsSet`, `Height`, `LifebarAction`, `LoadFile`, `LoadState`, `MapAdd`, `MapReset`, `MapSet`, `MatchRestart`, `ModifyBGCtrl`, `ModifyBGCtrl3d`, `ModifyBgm`, `ModifyHitDef`, `ModifyPlayer`, `ModifyProjectile`, `ModifyReflection`, `ModifyReversalDef`, `ModifyShadow`, `ModifySnd`, `ModifyStageBG`, `ModifyStageVar`, `ModifyText`, `OverrideClsn`, `ParentMapAdd`, `ParentMapSet`, `PlayBgm`, `PrintToConsole`, `RedLifeAdd`, `RedLifeSet`, `RemapSprite`, `RootMapAdd`, `RootMapSet`, `RootVarAdd`, `RootVarSet`, `RoundTimeAdd`, `RoundTimeSet`, `SaveFile`, `SaveState`, `ScoreAdd`, `ShaderSet`, `ShiftInput`, `Storyboard`, `TagIn`, `TagOut`, `TargetAdd`, `TargetDizzyPointsAdd`, `TargetGuardPointsAdd`, `TargetRedLifeAdd`, `TargetScoreAdd`, `TeamMapAdd`, `TeamMapSet`, `Text`, `TransformClsn`, `TransformSprite`.

---

*End of catalog. Document is research-only — no source files in `/home/z/my-project/ikemen-go/src/` were modified.*
