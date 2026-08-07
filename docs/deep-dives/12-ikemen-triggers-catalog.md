# Ikemen GO MUGEN 1.1 Triggers — Complete Catalog

> **Task ID**: 20-a
> **Source**: `/home/z/my-project/ikemen-go/src/` (Ikemen GO)
> **Research-only**: no files were modified.
> **Source files inspected**:
> - `bytecode.go` — 15,509 lines — defines all `OC_*` opcodes (956 opcodes total)
> - `compiler.go` — 8,390 lines — contains the trigger compiler (`CharCompiler.expValue`, lines 1272–5329)
> - `compiler_functions.go` — 7,137 lines — state-controller (sctrl) parsers, **not** triggers

## 1. How Ikemen GO compiles a trigger

1. CNS/ZSS source text is tokenized by `CharCompiler.tokenizer` (compiler.go:485).
2. The expression parser descends through `expBoolOr → expBoolXor → expBoolAnd → expRange → expEqne → expGrls → expAdsb → expMldv → expPow → expPostNot → expValue` (compiler.go:5688–1272).
3. `expValue` (compiler.go:1272–5329) is a giant `switch c.token` that maps each trigger keyword to one or more `OpCode`s emitted into a `BytecodeExp`.
4. At runtime, `BytecodeExp.run` / `runExternal` (bytecode.go) interprets those opcodes against the live `Char` state.

A trigger can therefore be identified by its `case "name":` block inside `expValue`. The list below was produced by extracting every such case (compiler.go:1420–5232) plus their nested sub-key switches (e.g. `gethitvar(animtype)`, `const(data.life)`, `stagevar(camera.boundleft)`).

### Conventions used below

- **Args** = number of comma-separated arguments inside `( )`. `0` means no parenthesis.
- **Returns** = runtime type: `int` (BytecodeInt), `float` (BytecodeFloat), `bool` (BytecodeBool), `str` (BytecodeString), or *player ref* (redirection — pushes nothing on the value stack, just changes the active `cdr` / `redir` context).
- **Line** = compiler.go line where the `case` block starts (the implementation that emits the opcode).
- Triggers marked **[Ikemen]** are Ikemen GO extensions not present in vanilla MUGEN 1.1.

---

## 2. Redirection triggers

These change the active player the rest of the expression evaluates against. They take a *body* expression after a comma — e.g. `Root, AnimTime`, `Player(2), StateNo`.

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `root` | 0 (then `, expr`) | player ref | Switch to the root player (top-level char that owns this helper) | 1429 |
| `parent` | 0 (then `, expr`) | player ref | Switch to the helper's parent (the char that created this helper) | 1429 |
| `p2` | 0 (then `, expr`) | player ref | Switch to the nearest enemy (P2 from P1's perspective) | 1429 |
| `stateowner` | 0 (then `, expr`) | player ref | Switch to the player that owns the current custom state | 1429 |
| `partner` | 0–1 (n, then `, expr`) | player ref | Switch to partner `n` (simul/turns) — `n` defaults to 0 | 1466 |
| `enemy` | 0–1 (n, then `, expr`) | player ref | Switch to enemy `n` by team-slot order — `n` defaults to 0 | 1466 |
| `enemynear` | 0–1 (n, then `, expr`) | player ref | Switch to `n`-th nearest enemy — `n` defaults to 0 | 1466 |
| `player` | 1 (n, then `, expr`) | player ref | Switch to absolute player number `n` (1-based) | 1466 |
| `playerid` | 1 (id, then `, expr`) | player ref | Switch to the player whose helper/char ID == `id` | 1466 |
| `playerindex` | 1 (idx, then `, expr`) | player ref | Switch to the player at engine index `idx` **[Ikemen]** | 1466 |
| `helperindex` | 1 (idx, then `, expr`) | player ref | Switch to the helper at index `idx` **[Ikemen]** | 1466 |
| `helper` | 0–2 (id, [idx], then `, expr`) | player ref | Switch to helper with ID `id` (or all helpers if omitted), pick `idx`-th | 1543 |
| `target` | 0–2 (id, [idx], then `, expr`) | player ref | Switch to a target of the current player (ID `id`, index `idx`) | 1543 |

Related existence-checks (often used after a redirect):

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `playeridexist` | 1 (id) | bool | True if a player with that ID exists | 3230 |
| `playerindexexist` | 1 (idx) | bool | **[Ikemen]** True if a player exists at engine index | 5075 |
| `playernoexist` | 1 (n) | bool | **[Ikemen]** True if player number `n` exists | 5082 |
| `helperindexexist` | 1 (idx) | bool | **[Ikemen]** True if a helper exists at given index | 2782 |
| `selfstatenoexist` | 1 (stateno) | bool | True if the player has a state `stateno` defined | 5099 |
| `parentexist` | 0 | bool | **[Ikemen]** True if a parent exists (i.e. this is a helper) | 4091 |

---

## 3. State triggers

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `stateno` | 0 | int | Current state number | 3656 |
| `p2stateno` | 0 | int | P2's current state number (auto-redirects through P2) | 3656 |
| `prevstateno` | 0 | int | State number before the current one | 3237 |
| `statetype` | 0 (eq-compare: `S`/`C`/`A`/`L`) | bool | Standing / Crouching / Air / Lying-down | 3661 |
| `p2statetype` | 0 (eq-compare) | bool | P2's state type | 3661 |
| `prevstatetype` | 0 (eq-compare) | bool | **[Ikemen]** Previous state type | 3661 |
| `movetype` | 0 (eq-compare: `I`/`A`/`H`) | bool | Idle / Attack / Hit movetype | 3046 |
| `p2movetype` | 0 (eq-compare) | bool | P2's movetype | 3046 |
| `prevmovetype` | 0 (eq-compare) | bool | **[Ikemen]** Previous movetype | 3046 |
| `physics` | 0 (eq-compare: `S`/`C`/`A`/`N`) | bool | Active physics model | 5052 |
| `time` / `statetime` | 0 | int | Ticks spent in the current state | 3971 |
| `timemod` | 1 (n, then compare) | int | `time % n` (legacy shortcut for `Time % n op value`) | 4028 |
| `ctrl` | 0 | bool | Player has control | 2352 |
| `incustomstate` | 0 | bool | **[Ikemen]** True if currently inside another player's custom state | 4679 |
| `incustomanim` | 0 | bool | **[Ikemen]** True if currently displaying another player's anim | 4677 |
| `standby` | 0 | bool | **[Ikemen]** Player is in standby (e.g. tag-bench) | 5153 |
| `anim` | 0 | int | Current animation action number | 1815 |
| `prevanim` | 0 | int | **[Ikemen]** Previous anim action number | 3235 |
| `animtime` | 0 | int | Ticks remaining in current anim (≤0, 0 = last frame) | 1832 |
| `animlength` | 0 | int | **[Ikemen]** Total length of current anim in ticks | 4459 |
| `animelem` | 1 (n, then compare) | int | Old-style: equivalent to `AnimelemTime(n) op 0` | 4007 |
| `animelemno` | 1 (t) | int | Anim element index that will be playing `t` ticks from now | 1817 |
| `animelemtime` | 1 (n) | int | Time relative to start of anim element `n` (0 = first frame) | 1822 |
| `animelemvar` | 1 (sub-key) | varies | **[Ikemen]** Properties of the current anim element. Sub-keys: `alphadest`, `angle`, `alphasource`, `group`, `hflip`, `image`, `time`, `vflip`, `xoffset`, `xscale`, `yoffset`, `yscale`, `numclsn1`, `numclsn2` | 4418 |
| `animexist` | 1 (n) | bool | True if anim `n` exists in the player's AIR | 1827 |
| `selfanimexist` | 1 (n) | bool | Like `AnimExist` but checks the player's own AIR (not redirected) | 3592 |
| `animplayerno` | 0 | int | **[Ikemen]** Player number owning the currently playing anim | 4461 |
| `spriteplayerno` | 0 | int | **[Ikemen]** Player number owning the currently displayed sprite | 4463 |

---

## 4. Player triggers

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `life` | 0 | int | Current HP | 3021 |
| `p2life` | 0 | int | P2's HP (auto-redirects) | 3021 |
| `lifemax` | 0 | int | Maximum HP (`data.life`) | 3026 |
| `power` | 0 | int | Current power meter | 3226 |
| `powermax` | 0 | int | Maximum power meter (`data.power`) | 3228 |
| `alive` | 0 | bool | HP > 0 | 1785 |
| `redlife` | 0 | int | **[Ikemen]** "Red life" — recoverable damage | 5091 |
| `attack` | 0 | int | **[Ikemen]** Attack stat (`data.attack`) | 4465 |
| `attackmul` | 0 | float | **[Ikemen]** Attack multiplier | 4467 |
| `defence` | 0 | int | **[Ikemen]** Defence stat (`data.defence`) | 4500 |
| `defencemul` | 0 | float | **[Ikemen]** Defence multiplier | 4502 |
| `dizzypoints` | 0 | int | **[Ikemen]** Current dizzy points | 4506 |
| `dizzypointsmax` | 0 | int | **[Ikemen]** `data.dizzypoints` | 4508 |
| `dizzy` | 0 | bool | **[Ikemen]** Player is currently dizzy | 4504 |
| `guardpoints` | 0 | int | **[Ikemen]** Current guard points | 4649 |
| `guardpointsmax` | 0 | int | **[Ikemen]** `data.guardpoints` | 4651 |
| `guardbreak` | 0 | bool | **[Ikemen]** Guard has been broken | 4647 |
| `guardcount` | 0 | int | **[Ikemen]** Number of guards performed (for guard-cancel systems) | 2780 |
| `jugglepoints` | 1 (target) | int | **[Ikemen]** Available juggle points against `target` | 4901 |
| `hitoverridden` | 0 | bool | **[Ikemen]** HitOverride is currently active | 4657 |
| `canrecover` | 0 | bool | Player can air/ground recover from current gethit state | 1913 |
| `airjumpcount` | 0 | int | **[Ikemen]** Number of air jumps performed so far | 4416 |
| `sprpriority` | 0 | int | **[Ikemen]** Current sprite draw priority | 5133 |
| `layerno` | 0 | int | **[Ikemen]** Current draw layer | 3017 |
| `id` | 0 | int | Unique persistent player/helper ID | 3004 |
| `helpername` | 0 (str eq) | bool | **[Ikemen]** Helper's name (from `Helper, name=`) | 4653 |
| `authorname` | 0 (str eq) | bool | Char's author (from `def` file) | 1834 |
| `name` / `p1name`…`p8name` | 0 (str eq) | bool | Display name of players 1–8 | 3155 |
| `displayname` | 0 (str eq) | bool | Char's display name (from `def` file) | 2354 |
| `palno` | 0 | int | Selected palette number (1–12) | 3212 |
| `facing` | 0 | int | 1 = facing right, -1 = facing left | 2536 |
| `ishelper` | 0–2 (id, [skip]) | bool | True if this is a helper (optionally with matching ID) | 3008 |
| `index` | 0 | int | **[Ikemen]** Helper index inside its parent | 3015 |
| `teamleader` | 0 | int | **[Ikemen]** Player number of the team leader | 5155 |

---

## 5. Position triggers

All distances/positions are in stage pixels unless noted.

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `pos x` / `pos y` / `pos z` | 0 | float | Player position (z is **[Ikemen]**) | 3214 |
| `vel x` / `vel y` / `vel z` | 0 | float | Player velocity (z is **[Ikemen]**) | 3981 |
| `screenpos x` / `screenpos y` | 0 | float | Position translated to screen space | 3580 |
| `backedge` | 0 | float | X-coord of the back edge of the stage | 1838 |
| `backedgedist` | 0 | float | Distance to the back edge | 1842 |
| `backedgebodydist` | 0 | float | Distance to back edge measured from the body box | 1840 |
| `frontedge` | 0 | float | X-coord of the front edge | 2538 |
| `frontedgedist` | 0 | float | Distance to the front edge | 2542 |
| `frontedgebodydist` | 0 | float | Body-box distance to front edge | 2540 |
| `leftedge` | 0 | float | X-coord of the left screen edge | 3019 |
| `rightedge` | 0 | float | X-coord of the right screen edge | 3562 |
| `topedge` | 0 | float | Y-coord of the top screen edge | 3973 |
| `bottomedge` | 0 | float | Y-coord of the bottom screen edge | 1895 |
| `topbounddist` | 0 | float | **[Ikemen]** Distance to top stage bound | 3977 |
| `topboundbodydist` | 0 | float | **[Ikemen]** Body-box distance to top bound | 3975 |
| `botbounddist` | 0 | float | **[Ikemen]** Distance to bottom stage bound | 1899 |
| `botboundbodydist` | 0 | float | **[Ikemen]** Body-box distance to bottom bound | 1897 |
| `stagebackedgedist` (alias `stagebackedge`) | 0 | float | **[Ikemen]** Distance to back edge of the *stage* (not screen) | 5135 |
| `stagefrontedgedist` (alias `stagefrontedge`) | 0 | float | **[Ikemen]** Distance to front edge of the *stage* | 5149 |
| `groundlevel` | 0 | float | **[Ikemen]** Current ground level (for sloped stages) | 2778 |
| `p2dist x` / `p2dist y` / `p2dist z` | 0 | float | Distance from P1 to P2 (per axis) | 4043 |
| `p2bodydist x` / `p2bodydist y` / `p2bodydist z` | 0 | float | Body-box distance from P1 to P2 | 4055 |
| `rootdist x` / `rootdist y` / `rootdist z` | 0 | float | **[Ikemen]** Distance from a helper to its root | 4067 |
| `parentdist x` / `parentdist y` / `parentdist z` | 0 | float | **[Ikemen]** Distance from a helper to its parent | 4079 |
| `localcoord x` / `localcoord y` | 0 | float | **[Ikemen]** Player's localcoord (from `def`) | 4908 |
| `gameheight` | 0 | float | Height of the game viewport in player coords | 2544 |
| `gamewidth` | 0 | float | Width of the game viewport in player coords | 2560 |
| `screenheight` | 0 | float | Height of the screen in pixels | 3578 |
| `screenwidth` | 0 | float | Width of the screen in pixels | 3590 |
| `camerapos x` / `camerapos y` | 0 | float | Camera position | 1901 |
| `camerazoom` | 0 | float | Current camera zoom factor | 1911 |
| `groundangle` | 0 | float | **[Ikemen]** Stage's current ground tilt angle | 4645 |

---

## 6. Input triggers

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `command` | 0 (str eq) | bool | True if the named command was activated this tick | 2025 |
| `selfcommand` | 0 (str eq) | bool | **[Ikemen]** Like `Command` but ignores input from the engine's helper/parent redirection | 2025 |
| `inputtime` | 1 (key) | int | **[Ikemen]** Frames since `key` was last pressed. Keys: `B`/`D`/`F`/`U`/`L`/`R`/`N` (directions), `a`/`b`/`c`/`x`/`y`/`z`/`s`/`d`/`w`/`m` (buttons) | 4681 |

> Note: there is **no `numcommand` trigger** in Ikemen GO. The example in the task description does not exist as a built-in; command presence is tested via `command("name")` only.

---

## 7. Math / conditional functions

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `ifelse` | 3 (cond, a, b) | varies | Returns `a` if `cond` is true, else `b`. Always evaluates both branches. | 1684 |
| `cond` | 3 (cond, a, b) | varies | **[Ikemen]** Short-circuit version of `IfElse` — only evaluates the taken branch | 1726 |
| `abs` | 1 (x) | float/int | Absolute value | 4097 |
| `exp` | 1 (x) | float | e^x | 4101 |
| `ln` | 1 (x) | float | Natural logarithm | 4105 |
| `log` | 2 (base, x) | float | Logarithm of `x` in base `base` | 4109 |
| `cos` / `sin` / `tan` | 1 (θ in radians) | float | Standard trig | 4139 / 4143 / 4147 |
| `acos` / `asin` / `atan` | 1 (x) | float | Inverse trig (radians) | 4151 / 4155 / 4159 |
| `atan2` | 2 (y, x) | float | **[Ikemen]** 2-argument arctangent | 4330 |
| `floor` | 1 (x) | int | Floor to integer | 4163 |
| `ceil` | 1 (x) | int | Ceiling to integer | 4167 |
| `float` | 1 (x) | float | **[Ikemen]** Cast int → float | 4171 |
| `max` | 2 (a, b) | varies | **[Ikemen]** Larger of two values | 4176 |
| `min` | 2 (a, b) | varies | **[Ikemen]** Smaller of two values | 4206 |
| `clamp` | 3 (x, lo, hi) | varies | **[Ikemen]** Clamp x to `[lo, hi]` | 4291 |
| `randomrange` | 2 (lo, hi) | int | **[Ikemen]** Uniform random integer in `[lo, hi]` | 4236 |
| `round` | 2 (x, n) | float | **[Ikemen]** Round `x` to `n` decimal places | 4261 |
| `sign` | 1 (x) | int | **[Ikemen]** -1, 0, or +1 | 4360 |
| `rad` | 1 (deg) | float | **[Ikemen]** Degrees → radians | 4365 |
| `deg` | 1 (rad) | float | **[Ikemen]** Radians → degrees | 4370 |
| `lerp` | 3 (a, b, t) | float | **[Ikemen]** Linear interpolation `a + (b - a) * t` | 4375 |
| `pi` | 0 | float | Constant π | 4093 |
| `e` | 0 | float | Constant e | 4095 |

Built-in comparison operators (`=`, `!=`, `>`, `>=`, `<`, `<=`, `&`, `&&`, `^`, `^^`, `|`, `||`, `+`, `-`, `*`, `/`, `%`, `**`) and range syntax `[a, b]` / `[a, b)` / `(a, b]` / `(a, b)` are also supported (compiler.go:5232–5233, 5513–5600).

---

## 8. Variable triggers

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `var` | 1 (i, 0–59) | int | Integer variable. Also supports assignment `var(i) := value` | 1676 |
| `fvar` | 1 (i, 0–39) | float | Float variable. Also supports `fvar(i) := value` | 1678 |
| `sysvar` | 1 (i, 0–4) | int | System integer variable. Supports assignment. | 1680 |
| `sysfvar` | 1 (i, 0–4) | float | System float variable. Supports assignment. | 1682 |
| `map` | 1 (name) | float | **[Ikemen]** Named map variable (string-keyed). Supports `map(name) := value` | 4918 |

---

## 9. `const( )` and constant-related triggers

`const(...)` (compiler.go:2044–2331) is a single trigger with ~100 sub-keys, grouped by section:

### `const(data.*)` — char stats from `[Data]`
`data.life`, `data.power`, `data.dizzypoints`, `data.guardpoints`, `data.attack`, `data.defence`, `data.fall.defence_up`, `data.fall.defence_mul`, `data.liedown.time`, `data.airjuggle`, `data.sparkno`, `data.guard.sparkno`, `data.hitsound.channel`, `data.guardsound.channel`, `data.ko.echo`, `data.volume`, `data.intpersistindex`, `data.floatpersistindex`

### `const(size.*)` — `[Size]`
`size.xscale`, `size.yscale`, `size.ground.back`, `size.ground.front`, `size.air.back`, `size.air.front`, `size.height`, `size.attack.dist` (= `.width.front`), `size.attack.dist.width.front`, `size.attack.dist.width.back`, `size.attack.dist.height.top`, `size.attack.dist.height.bottom`, `size.attack.dist.depth.top`, `size.attack.dist.depth.bottom`, `size.attack.depth.top`, `size.attack.depth.bottom`, `size.proj.attack.dist` (= `.width.front`), `size.proj.attack.dist.width.front`, `size.proj.attack.dist.width.back`, `size.proj.attack.dist.height.top`, `size.proj.attack.dist.height.bottom`, `size.proj.attack.dist.depth.top`, `size.proj.attack.dist.depth.bottom`, `size.proj.doscale`, `size.head.pos.x`, `size.head.pos.y`, `size.mid.pos.x`, `size.mid.pos.y`, `size.shadowoffset`, `size.draw.offset.x`, `size.draw.offset.y`, `size.depth.top`, `size.depth.bottom`, `size.weight`, `size.pushfactor`

### `const(velocity.*)` — `[Velocity]`
`velocity.air.gethit.airrecover.add.x`, `.add.y`, `.back`, `.down`, `.fwd`, `.mul.x`, `.mul.y`, `.up`,
`velocity.air.gethit.groundrecover.x`, `.y`,
`velocity.air.gethit.ko.add.x`, `.add.y`, `.ymin`,
`velocity.airjump.back.x`, `.down.x`, `.down.y`, `.down.z`, `.fwd.x`, `.neu.x`, `.up.x`, `.up.y`, `.up.z`, `.y`,
`velocity.ground.gethit.ko.add.x`, `.add.y`, `.xmul`, `.ymin`,
`velocity.jump.back.x`, `.down.x`, `.down.y`, `.down.z`, `.fwd.x`, `.neu.x`, `.up.x`, `.up.y`, `.up.z`, `.y`,
`velocity.run.back.x`, `.back.y`, `.down.x`, `.down.y`, `.down.z`, `.fwd.x`, `.fwd.y`, `.up.x`, `.up.y`, `.up.z`,
`velocity.runjump.back.x`, `.back.y`, `.down.x`, `.down.y`, `.down.z`, `.fwd.x`, `.up.x`, `.up.y`, `.up.z`, `.y`,
`velocity.walk.back.x`, `.down.x`, `.down.y`, `.down.z`, `.fwd.x`, `.up.x`, `.up.y`, `.up.z`

### `const(movement.*)` — `[Movement]`
`movement.airjump.num`, `movement.airjump.height`, `movement.yaccel`, `movement.stand.friction`, `movement.crouch.friction`, `movement.stand.friction.threshold`, `movement.crouch.friction.threshold`, `movement.air.gethit.groundlevel`, `movement.air.gethit.groundrecover.ground.threshold`, `movement.air.gethit.groundrecover.groundlevel`, `movement.air.gethit.airrecover.threshold`, `movement.air.gethit.airrecover.yaccel`, `movement.air.gethit.trip.groundlevel`, `movement.down.bounce.offset.x`, `movement.down.bounce.offset.y`, `movement.down.bounce.yaccel`, `movement.down.bounce.groundlevel`, `movement.down.gethit.offset.x`, `movement.down.gethit.offset.y`, `movement.down.friction.threshold`

### Related constant fetchers

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `const` | 1 (sub-key) | varies | Standard MUGEN constants (above) | 2044 |
| `const240p` | 1 (sub-key) | varies | **[Ikemen]** Value of `sub-key` scaled to 240p reference resolution | 2332 |
| `const480p` | 1 (sub-key) | varies | **[Ikemen]** Value at 480p reference | 2337 |
| `const720p` | 1 (sub-key) | varies | **[Ikemen]** Value at 720p reference | 2342 |
| `const1080p` | 1 (sub-key) | varies | **[Ikemen]** Value at 1080p reference | 2347 |
| `stageconst` | 1 (name) | varies | **[Ikemen]** Read a `[Stage]` constant by name (uses `OC_const_stage_constants`, bytecode.go:484) | 5137 |
| `gameoption` | 1 (name) | varies | **[Ikemen]** Read an `options.ini` value by name (`OC_const_gameoption`) | 2546 |
| `motifvar` | 1 (name) | varies | **[Ikemen]** Read a motif variable by name (`OC_const_motifvar`) | 4987 |
| `stagevar` | 1 (sub-key) | varies | Stage constants. ~80 sub-keys (see §10 below) | 3763 |

### `stagevar( )` sub-keys (compiler.go:3773–3935)
- `info.author`, `info.displayname`, `info.name` (strings)
- `info.ikemenversion.major/.minor/.patch`, `info.mugenversion.major/.minor`
- `camera.boundleft/.boundright/.boundhigh/.boundlow`, `camera.verticalfollow`, `camera.floortension`, `camera.tensionhigh/.tensionlow/.tension/.tensionvel`, `camera.cuthigh/.cutlow`, `camera.startzoom/.zoomout/.zoomin/.zoomindelay/.zoominspeed/.zoomoutspeed`, `camera.yscrollspeed`, `camera.ytension.enable`, `camera.autocenter`, `camera.lowestcap`
- `playerinfo.leftbound/.rightbound/.topbound/.botbound`, `playerinfo.p1startx/.p2startx/.p1starty/.p2starty/.p1startz/.p2startz`, `playerinfo.p1facing/.p2facing`
- `scaling.topz/.botz/.topscale/.botscale`
- `bound.screenleft/.screenright`
- `stageinfo.autoturn`, `stageinfo.localcoord.x/.y`, `stageinfo.resetbg`, `stageinfo.zoffset/.zoffsetlink/.xscale/.yscale`
- `shadow.intensity`, `shadow.color.r/.g/.b`, `shadow.yscale` (alias `shadow.ydelta`), `shadow.fade.range.begin/.end`, `shadow.xshear`, `shadow.offset.x/.y`
- `reflection.intensity/.yscale/.ydelta/.fade.range.begin/.end/.offset.x/.y/.xshear/.color.r/.g/.b`

---

## 10. Game / round triggers

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `gametime` | 0 | int | Total ticks since the match started | 2558 |
| `gamemode` | 0 (str eq) | bool | **[Ikemen]** Current game mode (`"arcade"`, `"versus"`, etc.) | 4608 |
| `gamevar` | 1 (sub-key) | varies | **[Ikemen]** Sub-keys: `introtime`, `outrotime`, `pausetime`, `slowtime`, `superpausetime`, `persistlife`, `persistmusic`, `persistrounds`, `hidebars` | 4612 |
| `roundstate` | 0 | int | 0=pre-intro, 1=intro, 2=fight, 3=pre-over, 4=over | 3570 |
| `roundno` | 0 | int | **[Ikemen]** Current round number (1-based) | 3566 |
| `roundsexisted` | 0 | int | **[Ikemen]** Number of rounds the player has existed in this match | 3568 |
| `roundswon` | 0 | int | Rounds won by this player | 3572 |
| `roundtime` | 0 | int | **[Ikemen]** Time remaining in this round | 5093 |
| `introstate` | 0 | bool | **[Ikemen]** Currently in intro state | 3574 |
| `outrostate` | 0 | bool | **[Ikemen]** Currently in outro state | 3576 |
| `matchno` | 0 | int | **[Ikemen]** Match number in the current session | 3034 |
| `matchover` | 0 | bool | **[Ikemen]** True after the last match ends | 3036 |
| `tickspersecond` | 0 | int | **[Ikemen]** Engine tick rate (usually 60) | 3969 |
| `fighttime` | 0 | int | **[Ikemen]** Ticks since `FIGHT!` was called | 4604 |
| `fightscreenstate` | 1 (sub-key) | bool | **[Ikemen]** Sub-keys: `fightdisplay`, `kodisplay`, `rounddisplay`, `windisplay` | 4531 |
| `fightscreenvar` | 1 (sub-key) | varies | **[Ikemen]** Sub-keys: `info.author/.name/.localcoord.x/.localcoord.y`, `round.ctrl.time`, `round.over.hittime/.time/.waittime/.wintime`, `round.slow.time`, `round.start.waittime`, `round.callfight.time`, `time.framespercount` | 4554 |
| `pausetime` | 0 | int | **[Ikemen]** Ticks of pause remaining | 5050 |
| `stagetime` | 0 | int | **[Ikemen]** Ticks since the stage loaded | 5151 |
| `timeelapsed` | 0 | int | **[Ikemen]** Time elapsed in the current round | 5159 |
| `timeremaining` | 0 | int | **[Ikemen]** Time remaining in the current round | 5161 |
| `timetotal` | 0 | int | **[Ikemen]** Total round time limit | 5163 |
| `drawgame` | 0 | bool | **[Ikemen]** Round was a draw | 2358 |
| `drawpal` | sub: `group` / `index` | int | **[Ikemen]** Draw-palette group or index of the current player | 2360 |
| `score` | 0 | float | **[Ikemen]** Current round score | 5095 |
| `scoretotal` | 0 | float | **[Ikemen]** Total match score | 5097 |
| `firstattack` | 0 | bool/int | **[Ikemen]** First-attack flag for the round | 4606 |
| `decisiveround` | 0 | bool | **[Ikemen]** This round decides the match | 4498 |
| `consecutivewins` | 0 | int | **[Ikemen]** Current win streak | 4471 |
| `ikemenversion` | 1 (`major`/`minor`/`patch`) | int | **[Ikemen]** Ikemen-version the char declared | 4659 |
| `mugenversion` | 1 (`major`/`minor`) | int | **[Ikemen]** MUGEN-version the char declared | 5032 |
| `motifstate` | 1 (sub-key) | bool | **[Ikemen]** Sub-keys: `challenger`, `continuescreen`, `continueyes`, `continueno`, `demo`, `dialogue`, `menu`, `victoryscreen`, `winscreen`, `hiscore` | 4952 |
| `numplayer` | 0 | int | **[Ikemen]** Total number of active players | 5048 |
| `ishost` | 0 | bool | **[Ikemen]** True if this is the host side (netplay) | 4899 |
| `ishometeam` | 0 | bool | True if this player is on the home team (P1 side) | 3013 |
| `runorder` | 0 | int | **[Ikemen]** Order this player was added to the engine | 3564 |
| `lastplayerid` | 0 | int | **[Ikemen]** Highest assigned player ID so far | 4906 |
| `memberno` | 0 | int | **[Ikemen]** Member number within the team (turns/tag) | 4950 |
| `teamleader` | 0 | int | **[Ikemen]** Player number of the team's current leader | 5155 |
| `teamsize` | 0 | int | **[Ikemen]** Size of the player's team (turns/tag) | 5157 |

---

## 11. Hit triggers

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `hitcount` | 0 | int | Number of hits in the current combo | 2816 |
| `uniqhitcount` | 0 | int | Number of unique hits (each player counts once) | 3979 |
| `hitover` | 0 | bool | GetHit state has finished | 2986 |
| `hitpausetime` | 0 | int | Ticks of hit-pause remaining | 2988 |
| `hitshakeover` | 0 | bool | Hit-shake (screen-shake on the player) is done | 2990 |
| `hitfall` | 0 | bool | Player is in a falling state from a hit | 2984 |
| `hitvel x` / `hitvel y` / `hitvel z` | 0 | float | Velocity applied by the last hit (z is **[Ikemen]**) | 2992 |
| `hitdefattr` | 0 (attr eq) | bool | True if the active HitDef's attribute matches (e.g. `SCA, AA`) | 2832 |
| `hitbyattr` | 1 (attr) | bool | **[Ikemen]** True if a HitBy/NotHitBy slot is set with matching attr | 2818 |
| `hitdefvar` | 1 (sub-key) | varies | **[Ikemen]** Read fields of the current HitDef. ~40 sub-keys: `guard.dist.*`, `guard.pausetime/.shaketime/.sparkno`, `guarddamage`, `guardflag`, `guardsound.group/.number`, `hitdamage`, `hitflag`, `hitsound.group/.number`, `id`, `p1stateno`, `p2stateno`, `pausetime`, `priority`, `shaketime`, `sparkno`, `sparkx`, `sparky`, `xaccel`, `yaccel`, `zaccel`, `ground.velocity.x/.y/.z`, `air.velocity.x/.y/.z`, `down.velocity.x/.y/.z`, `guard.velocity.x/.y/.z`, `airguard.velocity.x/.y/.z`, `ground.cornerpush.veloff`, `air.cornerpush.veloff`, `down.cornerpush.veloff`, `guard.cornerpush.veloff`, `airguard.cornerpush.veloff`, `fall.xvelocity/.yvelocity/.zvelocity` | 2848 |
| `gethitvar` | 1 (sub-key) | varies | Read fields of the last hit received. ~50 sub-keys: `animtype`, `air.animtype`, `ground.animtype`, `fall.animtype`, `type`, `airtype`, `groundtype`, `damage`, `guardcount`, `hitcount`, `fallcount`, `hitshaketime`, `hittime`, `stand.friction`, `crouch.friction`, `slidetime`, `ctrltime`, `recovertime` (alias `down.recovertime`), `xoff`, `yoff`, `zoff`, `xvel`, `yvel`, `zvel`, `xaccel`, `yaccel`, `zaccel`, `xveladd`, `yveladd`, `hitid` (alias `chainid`), `guarded`, `isbound`, `fall`, `fall.damage`, `fall.xvel`, `fall.yvel`, `fall.zvel`, `fall.recover`, `fall.time`, `fall.recovertime`, `fall.kill`, `fall.envshake.time/.freq/.ampl/.phase/.mul/.dir`, `attr` (flag), `dizzypoints`, `guardpoints`, `playerid` (alias `id`), `playerno`, `redlife`, `score`, `hitdamage`, `guarddamage`, `power`, `hitpower`, `guardpower`, `kill`, `priority`, `facing`, `ground.velocity.x/.y/.z`, `air.velocity.x/.y/.z`, `down.velocity.x/.y/.z`, `guard.velocity.x/.y/.z`, `airguard.velocity.x/.y/.z`, `frame`, `down.recover`, `guardflag` (flag), `keepstate`, `projid`, `guardko`, `teamside` | 2562 |
| `movecontact` | 0 | int | Ticks since a HitDef connected (≥1 means currently in contact) | 3038 |
| `moveguarded` | 0 | int | Ticks since a HitDef was guarded | 3040 |
| `movehit` | 0 | int | Ticks since a HitDef successfully hit | 3042 |
| `movereversed` | 0 | int | Ticks since a HitDef was ReversalDef'd | 3044 |
| `movecountered` | 0 | int | **[Ikemen]** Ticks since a ReversalDef connected | 4999 |
| `movehitvar` | 1 (sub-key) | varies | **[Ikemen]** Sub-keys: `cornerpush.veloff`, `frame`, `overridden`, `playerid` (alias `id`), `playerno`, `power`, `sparkx`, `sparky`, `uniqhit` | 5001 |
| `projcontacttime` | 1 (id) | int | Ticks since projectile `id` last contacted | 3244 |
| `projhittime` | 1 (id) | int | Ticks since projectile `id` last hit | 3299 |
| `projguardedtime` | 1 (id) | int | Ticks since projectile `id` was guarded | 3294 |
| `projcanceltime` | 1 (id) | int | Ticks since projectile `id` was cancelled | 3239 |
| `projclsnoverlap` | 3 (idx, id, type) | bool | **[Ikemen]** True if projectile's clsn overlaps a target's clsn | 3249 |
| `projvar` | 3 (idx, id, sub-key) | varies | **[Ikemen]** Read fields of a spawned projectile. ~40 sub-keys: `accel.x/.y/.z`, `angle` (alias `angle.x`, `angle.y`), `anim`, `animelem`, `attr` (flag), `drawpal.group/.index`, `facing`, `guardflag` (flag), `highbound`, `hitflag` (flag), `lowbound`, `pausemovetime`, `pos.x/.y/.z`, `projcancelanim`, `projedgebound`, `projhitanim`, `projhits`, `projhitsmax`, `projid`, `projlayerno`, `projmisstime`, `projpriority`, `projremanim`, `projremove`, `projremovetime`, `projsprpriority`, `projstagebound`, `remvelocity.x/.y/.z`, `scale.x/.y`, `shadow.r/.g/.b`, `supermovetime`, `teamside`, `time`, `vel.x/.y/.z`, `velmul.x/.y/.z`, `xshear` | 3304 |
| `numproj` | 0 | int | Total active projectiles owned | 3190 |
| `numprojid` | 1 (id) | int | Active projectiles with matching ID | 3192 |
| `inguarddist` | 0 | bool | An enemy is within guard distance | 3006 |
| `clsnoverlap` | 3 (type1, playerid, type2) | bool | **[Ikemen]** True if clsns overlap. Types: `clsn1` (attack), `clsn2` (defend), `size` | 1915 |
| `clsnvar` | 3 (type, playerid, side) | float | **[Ikemen]** Read clsn box dimensions. Side: `back` (left), `top`, `front` (right), `bottom` | 1966 |

### Legacy projectile syntax (still supported)

`projhit[id]`, `projguarded[id]`, `projcontact[id]` — old MUGEN syntax sugar for the `Proj*Time(id)` family. Handled in the `default` branch (compiler.go:5244–5316).

---

## 12. Combo triggers

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `combocount` | 0 | int | **[Ikemen]** Current combo length | 4469 |

> Combo-related state is also accessible through `hitcount`, `uniqhitcount`, `receivedhits`, `receiveddamage`.

---

## 13. Team triggers

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `teammode` | 0 (eq-compare: `single`/`simul`/`turns`/`tag`) | bool | Current team mode (`tag` is **[Ikemen]**) | 3944 |
| `teamside` | 0 | int | 0 = left, 1 = right, -1 = none | 3967 |
| `numpartner` | 0 | int | Number of partners on the same team | 3188 |
| `numenemy` | 0 | int | Number of enemies | 3176 |
| `numtarget` | 0–1 (id) | int | Number of targets (optionally filtered by ID) | 3202 |
| `numhelper` | 0–1 (id) | int | Number of helpers owned (optionally filtered by ID) | 3183 |
| `numexplod` | 0–1 (id) | int | Number of explods owned | 3178 |
| `numtext` | 0–1 (id) | int | Number of text objects owned | 3207 |
| `numproj` | 0 | int | Total active projectiles | 3190 |
| `numprojid` | 1 (id) | int | Active projectiles with matching ID | 3192 |
| `numstagebg` | 0–1 (idx) | int | **[Ikemen]** Number of stage BG layers | 3197 |
| `numplayer` | 0 | int | **[Ikemen]** Total number of players | 5048 |

---

## 14. System / global triggers

| Trigger | Args | Returns | Description | Line |
|---|---|---|---|---|
| `ailevel` | 0 | int | AI difficulty level (1–8, 0 = human) | 1783 |
| `ailevelf` | 0 | float | **[Ikemen]** Same as `AILevel` but as a float (for fractional scaling) | 4414 |
| `random` | 0 | int | Uniform random int in `[0, 999]` | 3547 |
| `reversaldefattr` | 0 (attr eq) | bool | True if the active ReversalDef's attr matches | 3549 |
| `isasserted` | 1 (flag) | bool | **[Ikemen]** True if a special flag is asserted. Supports all 60+ AssertSpecial flags: `invisible`, `noairguard`, `noautoturn`, `nocrouchguard`, `nojugglecheck`, `noko`, `noshadow`, `nostandguard`, `nowalk`, `unguardable`, `globalnoshadow`, `intro`, `nobardisplay`, `nobg`, `nofg`, `nokoslow`, `nokosnd`, `nomusic`, `roundnotover`, `timerfreeze`, `animatehitpause`, `animfreeze`, `autoguard`, `drawunder`, `noaibuttonjam`, `noaicheat`, `noailevel`, `noairjump`, `nobrake`, `nocombodisplay`, `nocornerpush`, `nocrouch`, `nodizzypointsdamage`, `nofacedisplay`, `nofacep2`, `nofallcount`, `nofalldefenceup`, `nofallhitflag`, `nofastrecoverfromliedown`, `nogetupfromliedown`, `noguardbardisplay`, `noguarddamage`, `noguardko`, `noguardpointsdamage`, `nohardcodedkeys`, `nohitdamage`, `noinput`, `nointroreset`, `nojump`, `nokofall`, `nokovelocity`, `nolifebaraction`, `nolifebardisplay`, `nomakedust`, `nonamedisplay`, `nopowerbardisplay`, `noredlifedamage`, `noscore`, `nostand`, `nostunbardisplay`, `noturntarget`, `nowinicondisplay`, `postroundinput`, `projtypecollision`, `runfirst`, `runlast`, `sizepushonly`, `nodestroyself`, `camerafreeze`, `globalnoko`, `notimedisplay`, `roundfreeze`, `roundnotskip`, `skipfightdisplay`, `skipkodisplay`, `skiprounddisplay`, `skipwindisplay` | 4728 |
| `ishelper` | 0–2 (id, [skip]) | bool | True if this is a helper (optionally with matching ID) | 3008 |
| `playerno` | 0 | int | **[Ikemen]** This player's number (1-based) | 5080 |
| `receiveddamage` | 0 | int | **[Ikemen]** Total damage received this round | 5087 |
| `receivedhits` | 0 | int | **[Ikemen]** Total hits received this round | 5089 |
| `envshakevar` | 1 (sub-key) | varies | **[Ikemen]** EnvShake params. Sub-keys: `time`, `freq`, `ampl`, `dir` | 4510 |
| `palfxvar` | 1 (sub-key) | varies | **[Ikemen]** PalFX params. Sub-keys: `time`, `add.r/.g/.b`, `mul.r/.g/.b`, `color`, `hue`, `invertall`, `invertblend`, `bg.*` (same set), `all.*` (same set) | 3078 |
| `bgmvar` | 1 (sub-key) | varies | **[Ikemen]** Background music params. Sub-keys: `filename` (str), `length`, `loop`, `loopcount`, `loopend`, `loopstart`, `position`, `startposition`, `volume` | 1844 |
| `soundvar` | 2 (id, sub-key) | varies | **[Ikemen]** Sound params. Sub-keys: `group`, `number`, `freqmul`, `isplaying`, `length`, `loopcount`, `loopend`, `loopstart`, `pan`, `position`, `priority`, `startposition`, `volumescale` | 3597 |
| `stagebgvar` | 3 (idx, layerno, sub-key) | varies | **[Ikemen]** Stage BG layer params. Sub-keys: `actionno`, `delta.x/.y`, `id`, `layerno`, `pos.x/.y`, `start.x/.y`, `tile.x/.y`, `velocity.x/.y` | 3695 |
| `explodvar` | 3 (idx, id, sub-key) | varies | **[Ikemen]** Explod params. Sub-keys: `accel.x/.y/.z`, `angle` (alias `.x`, `.y`), `anim`, `animelem`, `animelemtime`, `animplayerno`, `animtime`, `spriteplayerno`, `bindid`, `bindtime`, `drawpal.group/.index`, `facing`, `friction.x/.y/.z`, `id`, `ignorehitpause`, `layerno`, `pausemovetime`, `pos.x/.y/.z`, `removetime`, `scale.x/.y`, `sprpriority`, `time`, `vel.x/.y/.z`, `xshear` | 2370 |
| `spritevar` | 1 (sub-key) | varies | **[Ikemen]** Sprite params. Sub-keys: `group`, `height`, `image`, `width`, `xoffset`, `yoffset` | 5108 |
| `zoomvar` | 1 (sub-key) | varies | **[Ikemen]** Stage zoom params. Sub-keys: `scale`, `pos.x`, `pos.y`, `lag`, `time` | 5205 |
| `helpervar` | 1 (sub-key) | varies | **[Ikemen]** Helper creation params. Sub-keys: `clsnproxy`, `id`, `helpertype`, `keyctrl`, `ownclsnscale`, `ownpal`, `ownprojectile`, `preserve` | 2787 |
| `debugmode` | 1 (sub-key) | bool | **[Ikemen]** Debug-overlay flags. Sub-keys: `accel`, `clsndisplay`, `debugdisplay`, `lifebarhide`, `wireframedisplay`, `roundreset` | 4473 |
| `shader` | 0 (str eq) | bool | **[Ikemen]** True if named shader is active | 5104 |
| `angle` | 0 | float | **[Ikemen]** AngleSet value (Z rotation) | 5165 |
| `xangle` | 0 | float | **[Ikemen]** X-axis rotation | 5167 |
| `yangle` | 0 | float | **[Ikemen]** Y-axis rotation | 5169 |
| `scale x` / `scale y` / `scale z` | 0 | float | **[Ikemen]** Current draw scale | 5171 |
| `offset x` / `offset y` | 0 | float | **[Ikemen]** Current draw offset | 5183 |
| `alpha source` / `alpha dest` | 0 | int | **[Ikemen]** Trans alpha source/dest values | 5193 |
| `xshear` | 0 | float | **[Ikemen]** X-shear value | 5203 |
| `analog` | 1 (axis) | float | **[Ikemen]** Gamepad analog stick value. Axes: `leftx`, `lefty`, `rightx`, `righty`, `lefttrigger`, `righttrigger` | 1787 |
| `win` | 0 | bool | **[Ikemen]** Player won the round/match | 3993 |
| `winko` | 0 | bool | **[Ikemen]** Won by KO | 3995 |
| `wintime` | 0 | bool | **[Ikemen]** Won by time out | 3997 |
| `winperfect` | 0 | bool | **[Ikemen]** Won with full health | 3999 |
| `winclutch` | 0 | bool | **[Ikemen]** Won at the last second | 4001 |
| `winspecial` | 0 | bool | **[Ikemen]** Won with a special move finish | 4003 |
| `winhyper` | 0 | bool | **[Ikemen]** Won with a hyper/super finish | 4005 |
| `lose` | 0 | bool | **[Ikemen]** Player lost the round/match | 3028 |
| `loseko` | 0 | bool | **[Ikemen]** Lost by KO | 3030 |
| `losetime` | 0 | bool | **[Ikemen]** Lost by time out | 3032 |

---

## 15. Summary counts per category

| Category | Trigger count (top-level names) | Notes |
|---|---|---|
| Redirections | 12 + 6 existence-checks = **18** | `root`, `parent`, `p2`, `stateowner`, `partner`, `enemy`, `enemynear`, `player`, `playerid`, `playerindex`, `helperindex`, `helper`, `target` |
| State | **29** | stateno, statetype, movetype, physics, time, ctrl, anim* (8 variants), etc. |
| Player | **31** | life, power, alive, redlife, attack, defence, dizzy*, guard*, jugglepoints, etc. |
| Position | **36** (counting each axis) | pos/vel/screenpos x/y/z, edges (8), bounds (4), dist families (4×3), camera, viewport, groundlevel, groundangle |
| Input | **3** | command, selfcommand, inputtime |
| Math / conditional | **26** | ifelse, cond, abs, exp, ln, log, trig (6), floor, ceil, float, max, min, clamp, randomrange, round, sign, rad, deg, lerp, atan2, pi, e |
| Variables | **5** | var, fvar, sysvar, sysfvar, map |
| Constants | **8 top-level** | const (with ~100 sub-keys), const240p/480p/720p/1080p, stageconst, gameoption, motifvar, stagevar (with ~80 sub-keys) |
| Game / round | **~40** | gametime, gamemode, gamevar, roundstate/no/existed/won/time, intro/outro, match*, tickspersecond, fight*, pausetime, stage*, time*, draw*, score*, firstattack, decisive*, consecutive*, ikemen/mugenversion, motifstate/var, numplayer, ishost/ishometeam, runorder, lastplayerid, memberno, teamleader/size |
| Hit | **~28** | hitcount/uniq, hitover/pausetime/shakeover/fall, hitvel x/y/z, hitdefattr/byattr, hitdefvar (~40 sub), gethitvar (~60 sub), move* (5), movehitvar (8 sub), proj* (4 + projclsnoverlap + projvar ~40 sub), inguarddist, clsnoverlap, clsnvar |
| Combo | **1** | combocount |
| Team | **12** | teammode, teamside, num* (8: partner, enemy, target, helper, explod, text, proj, projid, stagebg, player) |
| System | **~40** | ailevel/f, random, reversaldefattr, isasserted (~70 sub-keys), envshakevar, palfxvar (~30 sub), bgmvar, soundvar, stagebgvar, explodvar (~30 sub), spritevar, zoomvar, helpervar, debugmode, shader, angle/xangle/yangle, scale x/y/z, offset x/y, alpha source/dest, xshear, analog, win*/lose* (8) |
| **Total unique top-level trigger names** | **~260** | Plus ~600 sub-key combinations |

## 16. Notable observations for the Dolmexica engine port

1. **`cond()` is short-circuit, `ifelse()` is not.** Ikemen GO's `cond` (compiler.go:1726) emits `jz`/`jmp` bytecode so the un-taken branch's side effects are skipped. The Dolmexica engine was patched in commit `12052ff` to make `IfElse` delegate to `Cond`, but the *evaluation* is still strict in our current implementation — characters with side-effectful branches (e.g. `ifelse(var(50):=1, A, B)`) will still differ.

2. **`map(name)`** (compiler.go:4918) is the **Ikemen extension** the worklog identified as the main remaining gap. It is a hash-map variable system (string-keyed, float-valued) used by post-2022 characters. Currently absent from Dolmexica.

3. **`hitoverridden`** (compiler.go:4657) — the worklog lists this as a known gap. Ikemen GO exposes it directly; Dolmexica needs to add it.

4. **`partner` redirection** (compiler.go:1466) — the worklog lists partner redirection (simul mode) as a gap. The opcode exists in Ikemen GO and the compiler allows an optional `n` argument.

5. **Legacy projectile syntax** (`projhit123`, `projguarded456`, `projcontact789`) is still supported via the `default` case in `expValue` (compiler.go:5244–5316). Old MUGEN characters rely on this; Dolmexica's parser must handle the suffix-as-ID form.

6. **`gethitvar`** has 60+ sub-keys, many Ikemen-only (`ground.velocity.x`, `air.velocity.x`, `down.velocity.x`, `guard.velocity.x`, `airguard.velocity.x`, `frame`, `down.recover`, `guardflag`, `keepstate`, `projid`, `guardko`, `teamside`, `xaccel`, `yaccel`, `zaccel`, `zoff`, `zvel`, `attr`, `dizzypoints`, `guardpoints`, `playerid`, `playerno`, `redlife`, `score`, `hitdamage`, `guarddamage`, `power`, `hitpower`, `guardpower`, `kill`, `priority`, `facing`). The audit doc lists "some gethitvar/stagevar fields" as a remaining gap.

7. **`stagevar`** has 80+ sub-keys, many Ikemen-only (`camera.tensionvel`, `camera.cuthigh/.cutlow`, `camera.zoomindelay`, `camera.yscrollspeed`, `camera.ytension.enable`, `camera.autocenter`, `camera.lowestcap`, `shadow.xshear`, `shadow.offset.x/.y`, `reflection.*`).

8. **`isasserted`** is the proper way to query AssertSpecial flags from a trigger. It supports all 60+ AssertSpecial flag names (compiler.go:4728–4898). This is far more complete than what Dolmexica currently exposes.

9. **`const()` sub-keys are exhaustive** — including Ikemen extensions like `size.attack.dist.width.front` (vs MUGEN's `size.attack.dist`), `size.attack.dist.depth.*`, `size.attack.depth.*`, `size.depth.top/.bottom`, `size.weight`, `size.pushfactor`, plus 3D velocity extensions (`velocity.*.down.z`, `velocity.*.up.z`, etc.).

10. **No `numcommand` trigger exists** in Ikemen GO. The task description listed it as an example, but command presence is tested via `command("name")` only.

## 17. Source line ranges (for quick navigation)

| File | Function / region | Lines |
|---|---|---|
| `compiler.go` | `CharCompiler.expValue` (the trigger compiler) | 1272–5329 |
| `compiler.go` | `_var` helper (var/fvar/sysvar/sysfvar) | 1282–1331 |
| `compiler.go` | `nameSub` helper (str-eq triggers) | 1365–1375 |
| `compiler.go` | `flagSub` helper (hitflag parsing) | 1377–1414 |
| `compiler.go` | Redirection cases (root/parent/p2/stateowner) | 1429–1465 |
| `compiler.go` | Redirection cases (partner/enemy/etc.) | 1466–1541 |
| `compiler.go` | Redirection cases (helper/target) | 1543–1599 |
| `compiler.go` | `const(...)` switch | 2044–2331 |
| `compiler.go` | `gethitvar(...)` switch | 2562–2777 |
| `compiler.go` | `hitdefvar(...)` switch | 2848–2983 |
| `compiler.go` | `projvar(...)` switch | 3304–3546 |
| `compiler.go` | `stagevar(...)` switch | 3763–3943 |
| `compiler.go` | `explodvar(...)` switch | 2370–2535 |
| `compiler.go` | `isasserted(...)` switch | 4728–4898 |
| `compiler.go` | Legacy `projhit[id]` etc. | 5244–5316 |
| `bytecode.go` | `OC_*` opcode constant block | 95–956 |
| `bytecode.go` | `case OC_const_*` runtime handlers | 2908+ |
| `compiler_functions.go` | State controllers (NOT triggers) | 1–7137 |
