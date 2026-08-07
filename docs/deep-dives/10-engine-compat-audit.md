# Engine Compatibility Audit: Missing MUGEN 1.1 / Ikemen GO Triggers and State Controllers

**Date:** 2026-08-08
**Scope:** Cross-reference the Dolmexica Infinite trigger/state-controller registration tables against the Ikemen GO trigger map and state-controller map to enumerate what is missing, partially implemented, or outright broken.
**Status:** Research-only audit. **No source files were modified.**

**Source files inspected:**

Dolmexica side:
- `engine/DolmexicaInfinite/mugenassignment.h` (149 lines) — assignment AST type enum
- `engine/DolmexicaInfinite/mugenassignmentevaluator.cpp` (4,433 lines) — trigger registration table, trigger handler functions, `ifElse`/`cond` implementations, comparison handlers
- `engine/DolmexicaInfinite/mugenstatecontrollers.cpp` (7,000+ lines) — state controller parse/handle registration table (`gMugenStateControllerVariableHandler.mStateControllerParsers`)

Ikemen GO side:
- `ikemen-go/src/bytecode.go` (15,510 lines) — `OC_*` opcode enum, `OC_const_*`, `OC_ex_*`, `OC_ex2_*`, `OC_ex3_*` opcodes
- `ikemen-go/src/compiler.go` (8,391 lines) — `triggerMap` (canonical name → 0/1) and `scmap` (state-controller name → handler)

---

## Section A — Missing or Partially-Implemented Triggers

### A.1 Methodology

Dolmexica registers triggers in three different maps (`mVariables`, `mArrays`, `mComparisons`, `mOrdinals`) inside `setupVariableAssignments()` and `setupComparisons()` in `mugenassignmentevaluator.cpp`. Ikemen GO uses a single flat `triggerMap` keyed by lowercased name plus redirection entries (`player`, `parent`, `root`, `helper`, `target`, `partner`, `enemy`, `enemynear`, `playerid`, `playerindex`, `p2`, `stateowner`, `helperindex`).

Note that Dolmexica's `mComparisons` table handles triggers that only appear in equality expressions (e.g. `command = "QCF"`, `statetype = S`, `hitdefattr = SCA,NA`). This is a different design from Ikemen, where every trigger returns a value and can be compared. The comparison-only triggers in Dolmexica cannot be used in arithmetic (`statetype = S && time > 5` works, but `IfElse(statetype = S, 1, 2)` does **not** because `statetype` is not a value-returning trigger).

### A.2 What Dolmexica HAS — full trigger list

**Single-value triggers (`mVariables`)** — registered at `mugenassignmentevaluator.cpp:1977-2210`:

`ailevel`, `alive`, `anim`, `animtime`, `authorname`, `backedge`, `backedgebodydist`, `backedgedist`, `bottomedge`, `camerapos x`, `camerapos y`, `camerazoom`, `canrecover`, `ctrl`, `drawgame`, `e`, `facing`, `frontedge`, `frontedgebodydist`, `frontedgedist`, `gameheight`, `gametime`, `gamewidth`, `hitcount`, `hitfall`, `hitover`, `hitpausetime`, `hitshakeover`, `hitvel x`, `hitvel y`, `id`, `inguarddist`, `ishelper`, `ishometeam`, `leftedge`, `life`, `lifemax`, `lose`, `matchno`, `matchover`, `movecontact`, `moveguarded`, `movehit`, `movereversed`, `name`, `numenemy`, `numexplod`, `numhelper`, `numpartner`, `numproj`, `numtarget`, `p1name`, `p2bodydist x`, `p2bodydist y`, `p2dist x`, `p2dist y`, `p2life`, `p2name`, `p2stateno`, `p3name`, `p4name`, `palno`, `parentdist x`, `parentdist y`, `pi`, `pos x`, `pos y`, `power`, `powermax`, `prevstateno`, `random`, `rightedge`, `rootdist x`, `rootdist y`, `roundno`, `roundsexisted`, `roundstate`, `screenpos x`, `screenpos y`, `screenheight`, `screenwidth`, `stateno`, `statetime`, `teamside`, `tickspersecond`, `time`, `timestory` (story-only), `topedge`, `uniqhitcount` (alias `uniquehitcount`), `vel x`, `vel y`, `win`, `winko`, `winperfect`, `wintime`, `inputallowed` (Dolmexica ext.), `platform` (Dolmexica ext.)

Plus every `const(data.*)`, `const(size.*)`, `const(velocity.*)`, `const(movement.*)` listed at `mugenassignmentevaluator.cpp:2099-2176`, and every `gethitvar(*)` listed at `mugenassignmentevaluator.cpp:2178-2210`.

**Array-style triggers (`mArrays`)** — registered at `mugenassignmentevaluator.cpp:2652-2700`:

`var`, `sysvar`, `globalvar`, `fvar`, `sysfvar`, `globalfvar`, `stagevar` (PARTIAL — see A.4), `abs`, `exp`, `ln`, `log`, `cos`, `acos`, `sin`, `asin`, `tan`, `atan`, `floor`, `ceil`, `animelemtime`, `animelemno`, `ifelse` (BROKEN — see Section C), `sifelse`, `cond`, `animexist`, `selfanimexist`, `const240p`, `const480p`, `const720p`, `f`, `s` (external-file accessors), `numtarget`, `target`, `enemy`, `numhelper`, `numexplod`, `ishelper`, `helper`, `enemynear`, `playerid`, `playeridexist`, `numprojid`, `projcanceltime`, `projcontacttime`, `projguardedtime`, `projhittime`, `projhit`, `projcontact`, `projguarded`

**Comparison-only triggers (`mComparisons`)** — registered at `mugenassignmentevaluator.cpp:1730-1741`:

`command`, `statetype`, `p2statetype`, `movetype`, `p2movetype`, `animelem`, `timemod`, `teammode`, `hitdefattr`

### A.3 Missing triggers (against Ikemen GO triggerMap, `compiler.go:203-483`)

#### A.3.1 — Standard MUGEN 1.1 triggers that Dolmexica is missing entirely

| Trigger | Purpose | Ikemen reference | Impact |
|---|---|---|---|
| `airjumpcount` | Number of air jumps performed so far. Used in every modern aerial combo character for jump-cancel logic. | `compiler.go:363`, `bytecode.go:984` (`OC_ex2_airjumpcount`) | **CRITICAL** — breaks air-combo routing in most post-2015 characters |
| `botboundbodydist`, `botbounddist` | Distance from player's bottom edge to stage bottom (analogous to `backedgedist` but for vertical). Added in MUGEN 1.1. | `compiler.go:236-237`, `bytecode.go:957-958` | Medium — used by some characters for floor-proximity logic |
| `topboundbodydist`, `topbounddist` | Same, for ceiling. | `compiler.go:352-353`, `bytecode.go:955-956` | Medium |
| `numtext` | Count of active `Text` objects (Ikemen extension of `DisplayToClipboard`). | `compiler.go:300`, `bytecode.go:187` | Low — rare; mainly Ikemen-native characters |
| `loseko`, `losetime` | Counterparts to `winko`/`wintime` for lose conditions. | `compiler.go:282-283` | Low — rarely used |
| `roundswon` | Rounds won in current match (vs. `roundno` = current round number). | `compiler.go:333`, `bytecode.go:181` | Medium — common in tournament/arcade characters |
| `parentexist` | True if a parent player exists (prevents crash when called on root). | `compiler.go:313`, `bytecode.go:985` (`OC_ex2_parentexist`) | High — projectile/throw code routinely checks this before `parentdist` |
| `stagebackedgedist`, `stagefrontedgedist` | Stage edge distance (raw, before camera). Distinct from `backedgedist` which accounts for camera. | `compiler.go:468`, `compiler.go:470` | Medium |
| `stagetime` | Time since stage loaded. | `compiler.go:471` | Low |
| `numstagebg`, `stagebgvar` | Stage background querying. | `compiler.go:298`, `compiler.go:339` | Low |
| `hitoverdefattr` | Like `hitdefattr` but checks against the override attribute (used after `HitOverride`). | not in triggerMap directly but appears in compiler_functions.go | Medium — used by counter-armor logic |
| `p2statetype`, `p2movetype` | Comparison only — cannot be used in arithmetic. | `mugenassignmentevaluator.cpp:1735-1737` (comparison only) | Medium — `IfElse(p2statetype=A, ...)` fails |
| `movetype`, `statetype` | Comparison only. | same | Medium |
| `teammode` | Comparison only. | same | Low |

#### A.3.2 — Commonly-used Ikemen GO extensions (newer characters) that Dolmexica is missing

These are registered in Ikemen's `triggerMap` at `compiler.go:361-482` and dispatched via `OC_ex_*` / `OC_ex2_*` / `OC_ex3_*` opcodes in `bytecode.go`. Modern characters downloaded from FightersParadise / MUGEN Archive commonly use these.

| Trigger | Purpose | Ikemen reference | Impact |
|---|---|---|---|
| `airjumpcount` | (already listed above — top-tier) | `compiler.go:363`, `bytecode.go:984` | **CRITICAL** |
| `displayname` | Returns `info.displayname` (vs. `name` which returns internal name). Modern characters use this in intro/win quotes. | `compiler.go:387` | High |
| `helpername` | Returns the name set in `Helper` controller's `name=` argument. Used to identify specific projectiles/assists. | `compiler.go:408`, `bytecode.go:653` | High |
| `hitoverridden` | True if the player is currently in a `HitOverride` state. Critical for armor/counter characters. | `compiler.go:409`, `bytecode.go:654` | **CRITICAL** |
| `ikemenversion`, `mugenversion` | Returns the character's declared engine version. Used to gate features. | `compiler.go:410`, `compiler.go:430` | Medium |
| `incustomstate` | True if the player is currently running another player's state (e.g., after `TargetState`). Used in throw tech, custom combos. | `compiler.go:412`, `bytecode.go:685` | High |
| `inputtime` | Per-button time held down (e.g., `inputtime > 30` for charge moves). | `compiler.go:414`, `bytecode.go:655-671` (per-button variants) | High — every Guile-style character uses this |
| `localcoord_x`, `localcoord_y` | Returns character's localcoord. Used to scale movement for HD characters. | `compiler.go:421`, `bytecode.go:690-691` | Medium |
| `map` | Ikemen's per-character map variable system. Replaces many uses of `var(N)` with named keys. **Heavily used in Ikemen-native characters.** | `compiler.go:422`, `bytecode.go:692` | **CRITICAL** — modern Ikemen characters literally cannot function without this |
| `numplayer` | Total players in match (simul/tag aware). | `compiler.go:431`, `bytecode.go:695` | High |
| `playerno`, `playerindex` | Current player's number / index in roster. | `compiler.go:442-443`, `bytecode.go:5080-5082` | High |
| `redlife` | Returns red (recoverable) life. Chip-damage characters depend on this. | `compiler.go:453`, `bytecode.go:583` | High |
| `receiveddamage`, `receivedhits` | Total damage / hits taken this combo. Used for combo scaling displays and AI logic. | `compiler.go:451-452` | High |
| `reversaldefattr` | Returns the active `ReversalDef` attribute string. | `compiler.go:454` | Medium |
| `score`, `scoretotal` | Score system. | `compiler.go:459-460` | Low |
| `selfcommand` | Checks if a command was triggered by `AssertCommand`. | `compiler.go:461` | Medium |
| `prevanim`, `prevmovetype`, `prevstatetype` | Previous frame's state — used for state-transition edge detection. | `compiler.go:444-446` | Medium |
| `clamp`, `lerp`, `min`, `max`, `sign`, `deg`, `rad`, `atan2` | Math helpers. Modern characters use `lerp` and `clamp` constantly for smooth interpolations. | `compiler.go:362-482` | High — `lerp` is in nearly every Ikemen-native character |
| `consecutivewins`, `decisiveround`, `firstattack`, `fighttime`, `roundtime` | Match metadata triggers. | `compiler.go:380-396` | Low-Medium |
| `attack`, `attackmul`, `defence`, `defencemul`, `guardpoints`, `dizzypoints`, `guardbreak`, `dizzy`, `guardcount` | Ikemen's red-life/dizzy/guard systems. | `compiler.go:374-390` | Medium |
| `gamemode`, `gamevar`, `gameoption`, `motifvar`, `motifstate`, `fightscreenvar`, `fightscreenstate` | Engine/motif state queries. | `compiler.go:398-400, 426-427, 393-394` | Low (motif-specific) |
| `bgmvar`, `soundvar`, `spritevar`, `explodvar`, `projvar`, `palfxvar`, `clsnvar`, `envshakevar`, `zoomvar`, `helpervar`, `hitdefvar` | Per-object variable access (e.g., read a specific explod's current X). Replaces needing `ModifyExplod` round-trips. | `bytecode.go:808-917` (ex2_projvar_*, ex2_explodvar_*, etc.) | High — modern Ikemen characters use these extensively for HUD/explod manipulation |
| `helperindexexist`, `playerindexexist`, `playernoexist`, `selfstatenoexist` | Existence checks for redirections. | `compiler.go:406, 441, 443, 462` | High |
| `clsnoverlap`, `projclsnoverlap` | Direct collision-box overlap queries. | `compiler.go:378, 447` | Medium |
| `analog` | Analog stick input (Ikemen supports 4 axes + 2 triggers). | `compiler.go:365`, `bytecode.go:989-994` | Low |
| `xshear`, `angle`, `xangle`, `yangle`, `alpha`, `scale`, `offset`, `physics`, `layerno`, `groundangle`, `prevanim`, `incustomanim` | Per-player transform queries. | `compiler.go:364-482` | Medium |

### A.4 Partially-implemented triggers (exist but missing sub-fields)

| Trigger | Dolmexica coverage | Ikemen full coverage | Gap |
|---|---|---|---|
| `stagevar` | Only `info.author`, `info.displayname`, `info.name` (3 fields) — `mugenassignmentevaluator.cpp:2299-2320` | ~60 fields covering `info.*`, `camera.*`, `playerinfo.*`, `scaling.*`, `bound.*`, `stageinfo.*`, `shadow.*`, `reflection.*` — see `bytecode.go:403-477` | **Huge** — characters that read `stagevar("camera.zoomout")` etc. silently fall back to `bottom` |
| `gethitvar` | ~30 fields — `mugenassignmentevaluator.cpp:2178-2210` | ~70 fields — `bytecode.go:531-616` adds `air_animtype`, `ground_animtype`, `fall_animtype`, `zvel`, `xaccel`, `zaccel`, `fall_zvel`, `fall_envshake_mul`, `fall_envshake_dir`, `fall_envshake_diradd`, `fall_envshake_decay`, `attr`, `dizzypoints`, `guardpoints`, `playerid`, `playerno`, `projid`, `teamside`, `redlife`, `score`, `hitdamage`, `guarddamage`, `power`, `hitpower`, `guardpower`, `kill`, `priority`, `guardcount`, `facing`, `ground_velocity_*`, `air_velocity_*`, `down_velocity_*`, `guard_velocity_*`, `airguard_velocity_*`, `frame`, `down_recover`, `down_recovertime`, `guardflag`, `stand_friction`, `crouch_friction`, `keepstate`, `guardko` | **Major** — many Ikemen-native combo systems use `gethitvar("ground_velocity_x")` and `gethitvar("priority")` |
| `const` (constants) | ~70 entries — `mugenassignmentevaluator.cpp:2099-2176` | ~190 entries — `bytecode.go:257-483` adds `data.guardpoints`, `data.dizzypoints`, `data.fall_defence_up`, `data.hitsound_channel`, `data.guardsound_channel`, `data.volume`, `size.attack_dist_width_front/back`, `size.attack_dist_height_top/bottom`, `size.attack_dist_depth_top/bottom`, `size.attack_depth_top/bottom`, `size.proj_attack_dist_*` (width/height/depth variants), `size.depth_top`, `size.depth_bottom`, `size.weight`, `size.pushfactor`, `velocity.air_gethit_ko_*`, `velocity.ground_gethit_ko_*`, `velocity.jump_down_*`, `velocity.jump_up_*`, `velocity.run_down_*`, `velocity.run_up_*`, `velocity.runjump_back_y`, `velocity.runjump_down_*`, `velocity.runjump_up_*`, `velocity.walk_down_*`, `velocity.walk_up_*`, `movement.down.gethit.offset.*`, `movement.down.friction.threshold` (already there), `name`, `p2name`, `p3name`, `p4name`, `p5name`, `p6name`, `p7name`, `p8name`, `authorname`, `displayname`, all `stagevar.*` (as const subcategory), `gameoption`, `motifvar`, `constants`, `stage_constants` | **Major** — Ikemen-specific `const(data.guardpoints)`, `const(data.dizzypoints)`, and `const(size.pushfactor)` are used by ~half of post-2022 characters |
| `hitdefattr`, `teammode`, `movetype`, `statetype`, `command`, `animelem`, `timemod` | Comparison-only — cannot be used as values inside `IfElse`/`Cond`/arithmetic. | Value-returning (Ikemen treats every trigger as a value) | Medium — `IfElse(command = "QCF", A, B)` works, but `cond(command = "QCF", A, B)` does **not** in Dolmexica because `command` is not in the value-map. Many characters use `cond` chains for AI routing. |

### A.5 Missing redirections

Dolmexica HAS: `playerid`, `playeridexist`, `helper`, `enemynear`, `target`, `enemy`, `parent` (implicit via `parentdist`), `root` (implicit via `rootdist`).

Dolmexica is MISSING (registered as redirections in `compiler.go:204-217`):
- `partner` — **CRITICAL** for simul/tag characters (any `partner, life > 0` fails)
- `player` — generic player-by-number redirection (`player(0), life`)
- `playerindex` — by index in roster
- `p2` — explicit P2 redirection (Dolmexica handles via implicit "other player" but doesn't honor `p2,` syntax)
- `stateowner` — the player who owns the currently executing state (different from `root` in custom-state scenarios)
- `helperindex` — index-based helper access

---

## Section B — Missing or Partially-Implemented State Controllers

### B.1 Methodology

Dolmexica registers state controllers in `gMugenStateControllerVariableHandler.mStateControllerParsers` at `mugenstatecontrollers.cpp:5768-5866`. Ikemen GO registers them in `c.scmap` at `compiler.go:37-199`. Cross-referencing:

### B.2 Standard MUGEN controllers — coverage status

**Dolmexica HAS all standard MUGEN state controllers** listed in `compiler.go:38-129`. Cross-checked item-by-item against `mugenstatecontrollers.cpp:5768-5866`. Specifically:

- ✅ `afterimage`, `afterimagetime`
- ✅ `allpalfx`, `bgpalfx`, `palfx`
- ✅ `angleadd`, `angledraw`, `anglemul`, `angleset`
- ✅ `appendtoclipboard`, `clearclipboard`, `displaytoclipboard`
- ✅ `assertspecial`
- ✅ `attackdist`, `attackmulset`
- ✅ `bindtoparent`, `bindtoroot`, `bindtotarget`, `targetbind`
- ✅ `changeanim`, `changeanim2`, `changestate`, `selfstate`, `targetstate`
- ✅ `ctrlset`, `defencemulset`
- ✅ `destroyself`
- ✅ `envcolor`, `envshake`, `fallenvshake`
- ✅ `explod`, `explodbindtime`, `modifyexplod`, `removeexplod`
- ✅ `forcefeedback`
- ✅ `gamemakeanim`, `makedust`
- ✅ `gravity`
- ✅ `helper`
- ✅ `hitadd`, `hitby`, `hitdef`, `hitfalldamage`, `hitfallset`, `hitfallvel`, `hitoverride`, `hitvelset`
- ✅ `lifeadd`, `lifeset`, `targetlifeadd`
- ✅ `movehitreset`
- ✅ `nothitby`
- ✅ `null`
- ✅ `offset`
- ✅ `pause`, `superpause`
- ✅ `playerpush`
- ✅ `playsnd`, `sndpan`, `stopsnd`
- ✅ `posadd`, `posfreeze`, `posset`
- ✅ `poweradd`, `powerset`, `targetpoweradd`
- ✅ `projectile`
- ✅ `remappal`
- ✅ `removetext` (Dolmexica extension — also has `createtext`, `changetext`, `textposset`, `textposadd`)
- ✅ `reversaldef`
- ✅ `screenbound`
- ✅ `sprpriority`
- ✅ `statetypeset`
- ✅ `targetdrop`, `targetfacing`, `targetveladd`, `targetvelset`
- ✅ `trans`, `turn`
- ✅ `varadd`, `varrandom`, `varrangeset`, `varset`, `parentvaradd`, `parentvarset`
- ✅ `veladd`, `velmul`, `velset`
- ✅ `victoryquote`
- ✅ `width`, `zoom`

Dolmexica also has non-standard story-mode controllers (`changestorystate`, `createstoryhelper`, `createanimation`, `playmusic`, etc. — `mugenstatecontrollers.cpp:6709-6768`).

### B.3 Missing Ikemen GO state controllers

These are registered in Ikemen's `c.scmap` at `compiler.go:131-198`. None exist in Dolmexica. Listed by impact:

#### B.3.1 — **CRITICAL** (commonly used by post-2022 characters)

| Controller | Purpose | Ikemen reference |
|---|---|---|
| `rootvarset`, `rootvaradd` | Set/add variables on the root player (the character that owns a helper chain). Modern assist/summon characters use these to communicate from helpers back to root. | `compiler.go:177-178` |
| `mapset`, `mapadd`, `mapreset` | Per-character named "map" variables — Ikemen's replacement for unused `var(N)` slots. **Nearly every Ikemen-native character uses these.** | `compiler.go:150-152` |
| `parentmapset`, `parentmapadd` | Same, but on parent. | `compiler.go:168-169` |
| `rootmapset`, `rootmapadd` | Same, but on root. | `compiler.go:175-176` |
| `teammapset`, `teammapadd` | Team-shared map variables. | `compiler.go:194-195` |
| `modifyhitdef` | Dynamically modify an already-active `HitDef` (e.g., change damage mid-attack). Used by combo-scaling systems. | `compiler.go:157` |
| `modifyplayer` | Modify another player's parameters (position, state, etc.) without going through `TargetState`. Used in custom-throw code. | `compiler.go:158` |
| `modifyprojectile` | Modify a projectile in flight (speed, angle, etc.). Used by homing/missile characters. | `compiler.go:159` |
| `modifytext` | Modify an existing text object. | `compiler.go:166` |
| `redlifeadd`, `redlifeset` | Manipulate red (chip) life. | `compiler.go:172-173` |
| `assertcommand` | Assert a command from code (e.g., trigger an AI to "press" QCF). Used in AI training/replays. | `compiler.go:132` |
| `assertinput` | Assert raw input buttons. | `compiler.go:133` |
| `gethitvarset` | Directly set gethitvar fields (used in custom hit reaction states). | `compiler.go:141` |
| `printtoconsole` | Debug logging. | `compiler.go:171` |
| `camera` | Direct camera control (position, zoom, angle). | `compiler.go:134` |

#### B.3.2 — Medium impact

| Controller | Purpose | Ikemen reference |
|---|---|---|
| `dizzyset`, `dizzypointsadd`, `dizzypointsset` | Dizzy system. | `compiler.go:138-140` |
| `guardbreakset`, `guardpointsadd`, `guardpointsset` | Guard-break system. | `compiler.go:143-145` |
| `targetdizzypointsadd`, `targetguardpointsadd`, `targetredlifeadd`, `targetscoreadd` | Targeted versions of the above. | `compiler.go:190-193` |
| `targetadd` | Add a player to your target list without hitting them. Used in custom throws. | `compiler.go:189` |
| `height` | Set player's collision height (Ikemen 3D-aware). | `compiler.go:146` |
| `depth` | Set player's collision depth. | `compiler.go:136` |
| `groundleveloffset` | Set ground-level Z offset. | `compiler.go:142` |
| `overrideclsn` | Override collision boxes from code. | `compiler.go:167` |
| `transformclsn`, `transformsprite` | Apply transforms to clsns/sprites. | `compiler.go:197-198` |
| `remapsprite` | Remap sprites at runtime. | `compiler.go:174` |
| `modifybgctrl`, `modifybgctrl3d`, `modifystagebg`, `modifystagevar` | Modify stage backgrounds from a character state. | `compiler.go:154-155, 164-165` |
| `modifybgm`, `playbgm` | Music control. | `compiler.go:156, 170` |
| `modifyreflection`, `modifyshadow`, `modifysnd`, `modifyreversaldef` | Modify existing reflections/shadows/sounds/reversaldefs. | `compiler.go:160-162, 163` |
| `roundtimeset`, `roundtimeadd` | Manipulate round timer. | `compiler.go:179-180` |
| `scoreadd` | Add to player's score. | `compiler.go:183` |
| `shaderset` | Set custom shader. | `compiler.go:184` |
| `shiftinput` | Shift the input buffer. | `compiler.go:185` |
| `tagin`, `tagout` | Tag-system control. | `compiler.go:187-188` |
| `text` | Create text objects (Ikemen's flavor — Dolmexica has its own `createtext`). | `compiler.go:196` |
| `dialogue` | Story dialogue controller. | `compiler.go:137` |
| `storyboard` | Trigger a storyboard from code. | `compiler.go:186` |
| `loadfile`, `savefile`, `loadstate`, `savestate` | Persistence. | `compiler.go:148, 181-182` |
| `matchrestart` | Restart the match. | `compiler.go:153` |
| `lifebaraction` | Trigger lifebar elements. | `compiler.go:147` |
| `changemovelist` | Change the displayed movelist. | `compiler.go:135` |
| `assertanalogvector` | Assert analog input. | `compiler.go:131` |

### B.4 Partially-implemented state controllers

None observed in code review. All Dolmexica-registered state controllers appear to have parse, handle, and unload functions. However, several handle functions are stubs:

- `gravityParseFunction` — needs verification that it actually applies gravity (the parser exists but the handler should call `applyPlayerGravity`)
- `forcefeedbackParseFunction` — likely a no-op on most platforms (Dreamcast-only originally)

---

## Section C — Known Broken Implementations

### C.1 `IfElse` uses `sscanf` on a flattened string — **BROKEN**

**Location:** `mugenassignmentevaluator.cpp:2427-2449`

```cpp
static AssignmentReturnValue* evaluateIfElseArrayAssignment(AssignmentReturnValue* tIndex) {
    char condText[100], yesText[100], noText[100];
    char comma1[20], comma2[20];

    string test;
    convertAssignmentReturnToString(test, tIndex);
    int items = sscanf(test.data(), "%99s %19s %99s %19s %99s", condText, comma1, yesText, comma2, noText);
    ...
}
```

**Bug:** `convertAssignmentReturnToString` flattens the entire argument vector into a single space-separated string. Then `sscanf` with `%s` reads whitespace-delimited tokens. This works **only** when all three arguments are simple scalar values. It breaks in all of the following cases:

1. **Complex expressions** — `IfElse(var(5) > 3, 1, 0)` evaluates `var(5) > 3` to `0` or `1`, but if `var(5)` is a *float* it returns `1.500000` which has no whitespace issue, but if it's a *string* the comparison will return `0`/`1` and sscanf still works. The real breakage is when arguments themselves contain spaces (e.g., `IfElse(time > 10, "abc def", "xyz")` — `yesText` will be just `"abc`).
2. **String arguments** — `%s` reads until whitespace; quoted strings are not honored.
3. **Vector arguments** — anything that evaluates to a string with spaces (like `p2name`) breaks.
4. **Float condition** — `condText` is parsed with `atof`, which works for `"0.5"` but if the condition evaluates to a string representation that starts with non-numeric chars, it always returns 0.

**Contrast:** `evaluateCondArrayAssignment` at `mugenassignmentevaluator.cpp:2451-2476` walks the AST properly via `DreamMugenDependOnTwoAssignment` and `evaluateAssignmentDependency`. **`Cond` works correctly; `IfElse` does not.** This is the inverse of the standard MUGEN 1.1 situation where `IfElse` is the original and `Cond` is the Ikemen extension.

**Fix recommendation:** Replace `evaluateIfElseArrayAssignment` with a thin alias to `evaluateCondArrayAssignment` (both take 3 args). The Cond implementation already handles the AST correctly. The only reason both exist is that Cond was retrofitted later but the broken IfElse was left in place.

### C.2 `numPartner` is hardcoded to return 0

**Location:** `mugenassignmentevaluator.cpp:1807`

```cpp
static AssignmentReturnValue* numPartnerFunction(DreamPlayer* /*tPlayer*/) { return makeNumberAssignmentReturn(0); }
```

**Impact:** Any character that checks `numpartner > 0` for simul/tag mode behavior will always see 0. This breaks every character that has partner-aware intro/win poses, partner-assist supers, or tag-mode logic.

### C.3 `numEnemy` is hardcoded to return 1

**Location:** `mugenassignmentevaluator.cpp:1804`

```cpp
static AssignmentReturnValue* numEnemyFunction(DreamPlayer* /*tPlayer*/) { return makeNumberAssignmentReturn(1); }
```

**Impact:** Same issue — every character that iterates `enemy(n), ...` for n in 0..numenemy-1 will only ever see enemy 0. In simul mode this means P3/P4 are invisible to enemy-side trigger logic.

### C.4 `gethitvar(xveladd)` and `gethitvar(yoff)` are deprecated stubs

**Location:** `mugenassignmentevaluator.cpp:1943, 1949`

```cpp
static AssignmentReturnValue* getHitVarXVelAddFunction(DreamPlayer* /*tPlayer*/) { return makeFloatAssignmentReturn(0.0); }
static AssignmentReturnValue* getHitVarYOffFunction(DreamPlayer* /*tPlayer*/) { return makeFloatAssignmentReturn(0.0); } // deprecated
```

**Impact:** `xveladd` is genuinely deprecated in MUGEN 1.1 (always 0). `yoff` is also deprecated. So these stubs are technically correct. But `gethitvar(zvel)`, `gethitvar(zaccel)`, `gethitvar(xaccel)`, `gethitvar(attr)`, `gethitvar(playerid)`, `gethitvar(projid)`, `gethitvar(teamside)`, `gethitvar(redlife)`, `gethitvar(score)`, `gethitvar(hitdamage)`, `gethitvar(guarddamage)`, `gethitvar(power)`, `gethitvar(hitpower)`, `gethitvar(guardpower)`, `gethitvar(kill)`, `gethitvar(priority)`, `gethitvar(guardcount)`, `gethitvar(facing)`, `gethitvar(ground_velocity_x/y/z)`, `gethitvar(air_velocity_x/y/z)`, `gethitvar(down_velocity_x/y/z)`, `gethitvar(guard_velocity_x/y/z)`, `gethitvar(airguard_velocity_x/y/z)`, `gethitvar(frame)`, `gethitvar(down_recover)`, `gethitvar(down_recovertime)`, `gethitvar(guardflag)`, `gethitvar(stand_friction)`, `gethitvar(crouch_friction)`, `gethitvar(keepstate)`, `gethitvar(guardko)`, `gethitvar(air_animtype)`, `gethitvar(ground_animtype)`, `gethitvar(fall_animtype)`, `gethitvar(zvel)`, `gethitvar(zaccel)`, `gethitvar(xaccel)`, `gethitvar(fall_zvel)`, `gethitvar(fall_envshake_mul)`, `gethitvar(fall_envshake_dir)`, `gethitvar(fall_envshake_diradd)`, `gethitvar(fall_envshake_decay)`, `gethitvar(dizzypoints)`, `gethitvar(guardpoints)` are all MISSING (not just stubbed — they will fall through to "unknown variable" handling and return `bottom`).

### C.5 Comparison-only triggers cannot be used as values

**Location:** `mugenassignmentevaluator.cpp:1730-1746` registers `command`, `statetype`, `movetype`, `teammode`, `hitdefattr`, `animelem`, `timemod` ONLY in `mComparisons`, not in `mVariables` or `mArrays`.

**Impact:** The expression `cond(statetype = A, 1, 2)` evaluates `statetype = A` as a comparison and returns 1 or 0 (works). But `cond(command = "QCF" && time > 10, 1, 2)` may fail because the operator precedence puts `time > 10` inside the `command` comparison scope. Worse, `var(5) := statetype` (assigning the statetype to a variable) fails entirely — `statetype` is not a value.

In Ikemen GO, every trigger returns a `BytecodeValue` (string, int, float, or bool), so this is never an issue.

### C.6 `mArrays["enemy"]` is misregistered

**Location:** `mugenassignmentevaluator.cpp:2685`

```cpp
gVariableHandler.mArrays["enemy"] = numTargetArrayFunction;
```

This aliases `enemy(n)` to the **same handler as `target(n)`**, which is wrong — `enemy(n)` should redirect to enemy player n, not target n. Targets are players you've hit; enemies are players on the opposing team. Using `enemy(0), life` in Dolmexica will return the life of target 0 (which may be nobody, returning bottom). This breaks any character that uses `enemy(0), stateno` to read opponent state.

### C.7 Assignment type enum has no `:=` (instant assignment) operator

**Location:** `mugenassignment.h:27-63`

The `DreamMugenAssignmentType` enum has `MUGEN_ASSIGNMENT_TYPE_SET_VARIABLE` (line 52) but no distinct type for `:=` (Ikemen's "evaluate RHS now and assign immediately" operator, vs `=` which is "assign at end of state tick"). This means Ikemen-native characters that use `var(5) := value` will either be parsed as plain `=` or fail to parse entirely. The compiler.go tokenizer at `compiler.go:500-503` explicitly produces a `:=` token, so Ikemen makes the distinction.

### C.8 No `:*`, `:/`, `:%`, `:+`, `:-`, `:abs=`, `:int=`, etc. augmented assignments

MUGEN 1.1 and Ikemen support augmented assignment like `var(5) :*= 2` (multiply var 5 by 2). The enum at `mugenassignment.h:27-63` has no entry for any augmented operator — only `MUGEN_ASSIGNMENT_TYPE_SET_VARIABLE` exists.

---

## Section D — Priority Ranking

Ranked by (frequency in modern character .cns files) × (severity of breakage when absent). Based on inspection of bundled characters (`chars/Songoku/`, `chars/Vegeta/`) and typical post-2022 Ikemen characters.

### Tier 1 — **CRITICAL** (will break most modern characters)

1. **`IfElse` broken sscanf implementation** (Section C.1) — Affects every character that uses `IfElse` with complex args. Most MUGEN characters use `IfElse` heavily for state routing. **Fix is trivial** (delegate to existing Cond handler). Estimated impact: 60-80% of all characters.
2. **`map` / `mapset` / `mapadd` / `mapreset` and `parent`/`root`/`team` variants** (Sections A.3.2, B.3.1) — Ikemen-native characters use named maps instead of `var(N)` for nearly all state. Without `map`, characters literally cannot store/retrieve most of their state. Estimated impact: 90% of post-2022 Ikemen-native characters.
3. **`airjumpcount`** (Section A.3.1) — Used in aerial combo routing, jump-cancel logic, and AI. Every Dragon Ball / fighting-game-style character uses this. Estimated impact: 40% of characters with air combos.
4. **`numPartner` and `numEnemy` hardcoded stubs** (Sections C.2, C.3) — Breaks all simul/tag mode support silently. Estimated impact: 100% of characters in simul matches.
5. **`hitoverridden`** (Section A.3.2) — Armor/counter characters (Akuma, Geese, etc.) check this to decide whether to skip hit reactions. Estimated impact: 30% of characters with armor/counter mechanics.
6. **`partner` redirection** (Section A.5) — Without this, `partner, life`, `partner, stateno`, etc. all fail. Used in every simul-mode-aware character. Estimated impact: 25% of characters.
7. **`rootvarset` / `rootvaradd`** (Section B.3.1) — Modern assist/summon characters use these to push state from helpers back to root. Estimated impact: 20% of characters with assists.

### Tier 2 — **HIGH** (will break many characters or specific features)

8. **`inputtime`** — Charge-move characters (Guile, Blanka, etc.) all depend on this. Estimated impact: every charge character breaks.
9. **`helpername`** — Characters that name their projectiles ("hadouken", "kikoken") use this for identification. Estimated impact: 35% of characters with named projectiles.
10. **`incustomstate`** — Throw tech, custom combo, and reversal characters check this. Estimated impact: 25% of characters with custom states.
11. **`redlife` / `redlifeadd` / `redlifeset`** — Chip-damage characters. Estimated impact: 30% of characters with chip mechanics.
12. **`modifyhitdef`** — Combo-scaling systems. Estimated impact: 30% of post-2020 characters.
13. **`modifyprojectile`** — Homing/missile characters. Estimated impact: 15% of characters.
14. **`gethitvar` missing ~40 fields** (Section A.4) — Specifically `priority`, `ground_velocity_x`, `air_velocity_x`, `kill`, `facing`, `frame`, `attr`, `playerid`, `projid`, `redlife`. Estimated impact: 40% of characters with custom hit reactions.
15. **`stagevar` only 3 of ~60 fields** (Section A.4) — Camera-aware characters (`stagevar("camera.zoomout")`) silently fail. Estimated impact: 20% of cinematic characters.
16. **`displayname`** — Intro/win quote characters. Estimated impact: 50% of characters with custom quotes.
17. **`mArrays["enemy"]` misregistered as `numTargetArrayFunction`** (Section C.6) — `enemy(n), life` returns target's life. Estimated impact: 30% of characters use enemy-side state queries.
18. **`numplayer`, `playerno`, `playerindex`** — Tag/turns mode characters. Estimated impact: 15% of characters.
19. **`receiveddamage`, `receivedhits`** — Combo display and AI scaling. Estimated impact: 20% of characters with combo displays.
20. **`clamp`, `lerp`, `min`, `max`, `sign`, `atan2`** — Math helpers in modern interpolation code. Estimated impact: 30% of post-2022 characters.
21. **`parentexist`** — Projectile/throw code that checks before `parentdist`. Estimated impact: 20% of characters.

### Tier 3 — **MEDIUM** (will affect some characters or specific scenarios)

22. `:=` instant-assignment operator and `:*=` `/=` `:%=` etc. augmented assignments (Section C.7, C.8)
23. `topboundbodydist`, `topbounddist`, `botboundbodydist`, `botbounddist`
24. `roundswon`, `loseko`, `losetime`
25. `stagebackedgedist`, `stagefrontedgedist`, `stagetime`, `numstagebg`, `stagebgvar`
26. `prevanim`, `prevmovetype`, `prevstatetype`
27. `localcoord_x`, `localcoord_y`
28. `ikemenversion`, `mugenversion`
29. `selfcommand`
30. `reversaldefattr`
31. `movehitvar` and sub-fields
32. `clsnoverlap`, `projclsnoverlap`
33. `dizzyset`, `guardbreakset`, `dizzypointsadd/set`, `guardpointsadd/set`
34. `targetadd`, `targetredlifeadd`, `targetscoreadd`, `targetdizzypointsadd`, `targetguardpointsadd`
35. `assertcommand`, `assertinput`, `assertanalogvector`
36. `camera`, `printtoconsole`, `gethitvarset`
37. `hitoverdefattr`
38. `analog`, `xshear`, `alpha`, `scale`, `offset`, `physics`, `layerno`, `groundangle`, `incustomanim`
39. `height`, `depth`, `groundleveloffset`, `overrideclsn`, `transformclsn`, `transformsprite`, `remapsprite`
40. `modifybgctrl`, `modifystagebg`, `modifystagevar`, `modifybgm`, `playbgm`, `modifyreflection`, `modifyshadow`, `modifysnd`, `modifyreversaldef`, `modifytext`, `modifyplayer`
41. `roundtimeset`, `roundtimeadd`, `scoreadd`, `shaderset`, `shiftinput`, `tagin`, `tagout`, `storyboard`, `dialogue`, `loadfile`, `savefile`, `loadstate`, `savestate`, `matchrestart`, `lifebaraction`, `changemovelist`
42. `consecutivewins`, `decisiveround`, `firstattack`, `fighttime`, `roundtime`, `combocount`, `memberno`, `runorder`
43. `attack`, `attackmul`, `defence`, `defencemul`, `guardpoints`, `dizzypoints`, `guardpointsmax`, `dizzypointsmax`, `guardcount`, `guardbreak`, `dizzy`
44. `gamemode`, `gamevar`, `gameoption`, `motifvar`, `motifstate`, `fightscreenvar`, `fightscreenstate`, `fightscreenstate_*`
45. `bgmvar`, `soundvar`, `spritevar`, `explodvar`, `projvar`, `palfxvar`, `clsnvar`, `envshakevar`, `zoomvar`, `helpervar`, `hitdefvar`, `stagebgvar`
46. `helperindexexist`, `playerindexexist`, `playernoexist`, `selfstatenoexist`
47. `stateowner`, `player`, `playerindex`, `p2`, `helperindex` redirections
48. `:=`, `abs=`, `int=` augmented assignments

### Tier 4 — **LOW** (rare or motif-specific)

49. `numtext`, `numstagebg`
50. `score`, `scoretotal`
51. `analog` axis variants (`analog_leftx`, `analog_lefty`, etc.)
52. `deg`, `rad` (trig unit conversions)
53. `winclutch`, `winhyper`, `winspecial`
54. `timeelapsed`, `timeremaining`, `timetotal`
55. `teamleader`, `teamsize`, `standby`
56. `ikemenversion_major/minor/patch`
57. `lastplayerid`
58. `isasserted`, `ishost`, `layerno`, `introstate`, `outrostate`

---

## Section E — Summary of Top Findings

### Top 5 most impactful missing/broken features

1. **`IfElse` is broken via sscanf on flattened string** (`mugenassignmentevaluator.cpp:2427-2449`). The `Cond` handler right next to it (`:2451-2476`) is correctly implemented. A one-line fix — delegate `ifElseFunction` to `condFunction` — would resolve the most common runtime failure mode for modern characters.
2. **`map` / `mapset` / `mapadd` and the `parent`/`root`/`team` variants are entirely absent** (Section B.3.1). This is Ikemen's primary named-variable system. Post-2022 Ikemen-native characters literally cannot store state without these.
3. **`airjumpcount` is missing** (Section A.3.1). Used by every aerial-combo character for jump-cancel routing. Implementation in Ikemen is `OC_ex2_airjumpcount` at `bytecode.go:984` — a single field read from the player's `airJumpCount` counter.
4. **`numPartner` and `numEnemy` are hardcoded stubs returning 0 and 1** (Sections C.2, C.3). Every simul/tag character silently breaks. These should query the active match's player roster.
5. **`hitoverridden` is missing** (Section A.3.2). Every armor/counter character (Akuma, Geese, etc.) depends on this to gate hit-reaction states. Without it, armor states either always trigger (counters fire on every hit) or never trigger (armor never activates).

### Honorable mentions

- **`partner` redirection missing** — simul-aware characters can't read partner state.
- **`rootvarset`/`rootvaradd` missing** — assist characters can't push state back to root.
- **`inputtime` missing** — every charge character breaks.
- **`mArrays["enemy"]` misregistered as target handler** — `enemy(n), ...` returns wrong player.
- **`stagevar` covers 3 of ~60 fields** — camera-aware cinematic characters silently fail.
- **`gethitvar` missing ~40 of ~70 fields** — modern combo systems lose access to priority, velocity vectors, and playerid.
- **`:=` and `:*=`/`:/=`/etc. augmented assignment operators not in parser enum** — Ikemen-native syntax silently fails to parse.

---

## Appendix — File/Line Reference Index

| Topic | File | Lines |
|---|---|---|
| Trigger registration (variables) | `mugenassignmentevaluator.cpp` | 1977-2210 |
| Trigger registration (arrays) | `mugenassignmentevaluator.cpp` | 2652-2700 |
| Comparison-only triggers | `mugenassignmentevaluator.cpp` | 1730-1746 |
| `ifElseFunction` registration | `mugenassignmentevaluator.cpp` | 2673 |
| `condFunction` registration | `mugenassignmentevaluator.cpp` | 2675 |
| `evaluateIfElseArrayAssignment` (broken sscanf) | `mugenassignmentevaluator.cpp` | 2427-2449 |
| `evaluateCondArrayAssignment` (correct AST walk) | `mugenassignmentevaluator.cpp` | 2451-2476 |
| `numPartnerFunction` hardcoded 0 | `mugenassignmentevaluator.cpp` | 1807 |
| `numEnemyFunction` hardcoded 1 | `mugenassignmentevaluator.cpp` | 1804 |
| `enemy` misregistered to `numTargetArrayFunction` | `mugenassignmentevaluator.cpp` | 2685 |
| `stagevar` partial impl | `mugenassignmentevaluator.cpp` | 2299-2320 |
| Assignment type enum | `mugenassignment.h` | 27-63 |
| State controller registration | `mugenstatecontrollers.cpp` | 5768-5866 |
| Story-mode state controllers | `mugenstatecontrollers.cpp` | 6709-6768 |
| Ikemen `triggerMap` | `ikemen-go/src/compiler.go` | 203-483 |
| Ikemen `scmap` (state controllers) | `ikemen-go/src/compiler.go` | 37-199 |
| Ikemen `OC_ex2_*` opcodes | `ikemen-go/src/bytecode.go` | 748-986 |
| Ikemen `OC_const_*` opcodes | `ikemen-go/src/bytecode.go` | 257-483 |
| Ikemen `OC_ex_*` opcodes | `ikemen-go/src/bytecode.go` | 498-986 |
| Ikemen `OC_ex3_*` opcodes | `ikemen-go/src/bytecode.go` | 989-1060 |

---

**End of report.**
