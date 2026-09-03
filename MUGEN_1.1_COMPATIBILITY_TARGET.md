# MUGEN 1.0 / 1.1 Compatibility Target

This branch targets behavioral compatibility with Elecbyte M.U.G.E.N 1.0 and 1.1 on Windows.

## Definition of done

A normal MUGEN 1.0/1.1 character, stage, system definition, and AIR/SFF assets should execute with the same observable game behavior as MUGEN, within platform/rendering differences that do not affect gameplay semantics.

Compatibility means semantics, not merely parser/controller registration.

## Explicitly out of scope

Ikemen-only features are not compatibility requirements. Examples include map systems, tag-team mechanics, Z-axis gameplay, Ikemen-specific variable systems, and other extensions that do not exist in MUGEN 1.0/1.1.

Supporting an extension is acceptable when it is harmless, but it must not alter MUGEN behavior or consume compatibility effort ahead of MUGEN requirements.

## Priority areas

1. Expression parsing and evaluation, including types, precedence, short-circuit behavior, ranges, redirections, and irregular legacy triggers.
2. Complete MUGEN 1.0/1.1 trigger semantics.
3. Complete state-controller semantics, including defaults, evaluation timing, persistence, ordering, and hitpause behavior.
4. Hit system semantics: HitDef, HitBy, NotHitBy, HitOverride, ReversalDef, target state/velocity/damage/power, juggle, chaining, and guard behavior.
5. State-machine timing and special states (-1, -2, -3).
6. AIR 1.1 features: floating offsets, scale, angle, and interpolation.
7. SFF and rendering behavior required by MUGEN 1.0/1.1, including RGB/RGBA sprites and transparency/blending.
8. Stage/camera behavior, including MUGEN 1.1 camera zoom.
9. System files, common states, command processing, palettes, sounds, and resource loading.
10. Regression testing against representative real-world MUGEN characters and stages.

## Current confirmed source issues

### GetHitVar(slidetime)

The current evaluator returns a boolean for `GetHitVar(slidetime)`. MUGEN defines this as an integer remaining slide time. This is a semantic incompatibility and should be corrected to return a numeric value.

### Player redirection resolver

The current player redirection resolver calls `strlen()` on an uninitialized local buffer before copying the source variable name. This is undefined behavior and must be corrected before relying on redirection-heavy characters.

### ReversalDef scope

The engine currently parses/handles `damage`, `getpower`, and `givepower` for ReversalDef. These are not parameters defined by MUGEN 1.0/1.1 ReversalDef. This behavior should not be treated as a MUGEN compatibility requirement and needs to be reviewed separately as an extension.

## Working rule

When a proposed change is justified only by Ikemen behavior, do not implement it as part of the MUGEN compatibility milestone. When MUGEN documentation is ambiguous, prefer observable MUGEN behavior and cross-check existing character conventions before changing engine semantics.
