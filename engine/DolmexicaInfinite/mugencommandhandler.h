#pragma once

#include <cstdint>

#include <prism/actorhandler.h>
#include <prism/mugenanimationhandler.h>

#include "mugencommandreader.h"
#include "playerdefinition.h"

using namespace prism;

int registerDreamMugenCommands(int tControllerID, DreamMugenCommands* tCommands);

int isDreamCommandActive(int tID, const char* tCommandName);
int isDreamCommandActiveByLookupIndex(int tID, int tLookupIndex);
int isDreamCommandForLookup(int tID, const char* tCommandName, int* oLookupIndex);
int getDreamCommandMinimumDuration(int tID, const char* tCommandName);
void setDreamPlayerCommandActiveForAI(int tID, const char* tCommandName, int tBufferTime);
int setDreamPlayerCommandNumberActiveForDebug(int tID, int tCommandNumber);
int getDreamPlayerCommandAmount(int tID);

void setDreamMugenCommandFaceDirection(int tID, FaceDirection tDirection);
void allowOsuPlayerCommandInputOneFrame(int tRootIndex);
void resetOsuPlayerCommandInputAllowed(int tRootIndex);
int isOsuPlayerCommandInputAllowed(int tRootIndex);

ActorBlueprint getDreamMugenCommandHandler();

void setDreamButtonAActiveForPlayer(int tControllerIndex);
void setDreamButtonBActiveForPlayer(int tControllerIndex);
void setDreamButtonCActiveForPlayer(int tControllerIndex);
void setDreamButtonXActiveForPlayer(int tControllerIndex);
void setDreamButtonYActiveForPlayer(int tControllerIndex);
void setDreamButtonZActiveForPlayer(int tControllerIndex);
void setDreamButtonStartActiveForPlayer(int tControllerIndex);

void updateCommandNetplayReceive(int tID);
void updateCommandNetplaySend(int tID);
void setDreamCommandInputControllerUsed(int i, int tControllerIndex);

// Phase 1.3 — inputtime trigger.
// Returns the signed Ikemen-style input buffer value for the given button on
// the given controller. Used by charge characters (Guile, Blanka) to detect
// held buttons. Button names: B, D, F, U, L, R, N (neutral), a, b, c, x, y,
// z, s (start). Returns 0 for unknown buttons or invalid controllers.
//   Positive value = currently held, value = frames held.
//   Negative value = currently released, |value| = frames since release.
//   1 = just pressed this frame, -1 = just released this frame.
int32_t getDreamInputButtonBufferTime(int tControllerID, const char* tButtonName);