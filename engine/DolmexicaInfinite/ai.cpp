#include "ai.h"

#include <assert.h>
#include <cctype>

#include <prism/datastructures.h>
#include <prism/math.h>
#include <prism/stlutil.h>

#include "mugencommandhandler.h"
#include "gamelogic.h"
#include "config.h"
#include "mugenstagehandler.h"

using namespace std;

// ==========================================================================
// Universal AI Difficulty System
// ==========================================================================
// Research basis:
//   - MUGEN 1.1 official AILevel trigger (elecbyte.com): returns 1-8 (easy-hard)
//   - Seravy's AI Guide (mugenfreeforall.com): var(59)=AI on/off, var(50)=difficulty
//   - MUGEN Wiki (mugen.fandom.com/wiki/A.I.): "impossible commands" method
//
// Old-style (WinMUGEN) characters activate their custom AI via "impossible
// commands" — fake commands with inputs no human can do in 1 frame (e.g.
// "U,D,U,D,U,D,U,D" with time=1). The engine AI randomly flags these as
// active, which triggers a VarSet (var(51) or var(59) = 1), which then
// activates the character's custom AI ChangeState controllers.
//
// Problem: The old engine AI fired ALL commands randomly, including these
// AI-activation commands. On Easy, the character AI would activate almost
// instantly (within 1-2 seconds) and then fight at FULL difficulty because
// the character's CNS AI logic has no difficulty scaling — it's always
// "if var(51)=1 and conditions met, do the combo."
//
// Fix: Split commands into two lists:
//   - mAIActivationCommands: commands that activate character AI (AI*, cpu*)
//   - mRealCommands: actual move commands (hadouken, shoryuken, etc.)
//
// Then control difficulty by choosing WHICH list to fire from and HOW OFTEN:
//   - Easy (levels 1-2): Fire AI commands RARELY. Character AI takes 4-6
//     seconds to activate. Before that, only engine AI (random real commands
//     + movement + guard) is active. Guard chance = 20-27%.
//   - Normal (levels 3-5): Fire AI commands MODERATELY. Character AI
//     activates in 1-2 seconds. Guard chance = 34-49%.
//   - Hard (levels 6-8): Fire AI commands FREQUENTLY. Character AI activates
//     almost immediately. Guard chance = 56-70%.
//
// This is universal — works for ANY character that follows the standard
// MUGEN convention (AI commands named "AI1"-"AI99" or "cpu1"-"cpu99").
// Characters that use the AILevel trigger directly (MUGEN 1.0+ style) are
// unaffected by this split — their AI activates based on mAILevel > 0,
// which is already set correctly.
// ==========================================================================

typedef struct {
	DreamPlayer* mPlayer;

	double mDifficultyFactor;
	int mRandomInputNow;
	int mRandomInputDuration;

	int mIsMoving;
	int mIsCrouching;
	int mIsJumping;

	int mIsGuardingLogicActive;
	int mWasGuardingSuccessful;

	// Real move commands (hadouken, shoryuken, etc.) — fired randomly
	// to make the AI do things even before custom AI activates.
	vector<string> mCommandNames;

	// AI activation commands (AI1-AI99, cpu1-cpu99) — fired at a
	// difficulty-scaled rate to control WHEN the character's custom
	// AI wakes up.
	vector<string> mAIActivationCommands;
} PlayerAI;

static struct {
	list<PlayerAI> mHandledPlayers;

} gAI;

static void loadAIHandler(void* tData) {
	(void)tData;
	setProfilingSectionMarkerCurrentFunction();
	stl_new_list(gAI.mHandledPlayers);
}

static int unloadSingleHandledPlayer(void* tCaller, PlayerAI& tData) {
	(void)tCaller;
	PlayerAI* e = &tData;
	stl_delete_vector(e->mCommandNames);
	stl_delete_vector(e->mAIActivationCommands);
	return 1;
}

static void unloadAIHandler(void* tData) {
	(void)tData;
	setProfilingSectionMarkerCurrentFunction();
	stl_list_remove_predicate(gAI.mHandledPlayers, unloadSingleHandledPlayer);
	stl_delete_list(gAI.mHandledPlayers);
}

// ==========================================================================
// AI command classification
// ==========================================================================

// Returns 1 if the command name matches the standard "AI activation"
// pattern used by old-style MUGEN characters. These are impossible-input
// commands that only the engine AI can trigger (e.g. "U,D,U,D,U,D" with
// time=1). When fired, they set the character's AI variable (var(51)/var(59))
// to 1, activating the character's custom AI.
//
// Standard patterns (per MUGEN Wiki and Seravy's guide):
//   - "AI0" - "AI99"  (case-insensitive)
//   - "cpu0" - "cpu99" (case-insensitive)
//   - "computer0" - "computer99" (case-insensitive, less common)
//
// Also detects a few rare variants:
//   - "AI_" + digit
//   - "cpu_" + digit
static int isAIActivationCommand(const string& name) {
	if (name.size() < 3) return 0;

	size_t i = 0;

	// Skip optional prefix
	if ((name.size() > 3) &&
	    (tolower(name[0]) == 'a') && (tolower(name[1]) == 'i') &&
	    (name[2] == '_')) {
		i = 3;
	}
	else if ((tolower(name[0]) == 'a') && (tolower(name[1]) == 'i')) {
		i = 2;
	}
	else if ((name.size() >= 4) &&
		 (tolower(name[0]) == 'c') && (tolower(name[1]) == 'p') &&
		 (tolower(name[2]) == 'u')) {
		i = 3;
		if (i < name.size() && name[i] == '_') i++;
	}
	else if ((name.size() >= 9) &&
		 (tolower(name[0]) == 'c') && (tolower(name[1]) == 'o') &&
		 (tolower(name[2]) == 'm') && (tolower(name[3]) == 'p') &&
		 (tolower(name[4]) == 'u') && (tolower(name[5]) == 't') &&
		 (tolower(name[6]) == 'e') && (tolower(name[7]) == 'r')) {
		i = 8;
		if (i < name.size() && name[i] == '_') i++;
	}
	else {
		return 0;
	}

	// After the prefix, there must be at least one digit
	if (i >= name.size()) return 0;
	if (!isdigit((unsigned char)name[i])) return 0;

	// And the rest should all be digits (e.g. "AI1", "cpu23")
	for (; i < name.size(); i++) {
		if (!isdigit((unsigned char)name[i])) return 0;
	}

	return 1;
}

// ==========================================================================
// Random command firing — now difficulty-aware
// ==========================================================================

// Fire a random real command (move). Used at all difficulty levels.
static void setRandomRealCommandActive(PlayerAI* e) {
	if (e->mCommandNames.empty()) return;
	int i = randfromInteger(0, int(e->mCommandNames.size()) - 1);
	const string& name = e->mCommandNames[i];
	setDreamPlayerCommandActiveForAI(e->mPlayer->mCommandID, name.data(), 2);
}

static int setRandomRealCommandActiveIfTimePossible(PlayerAI* e) {
	if (e->mCommandNames.empty()) return 0;
	int i = randfromInteger(0, int(e->mCommandNames.size()) - 1);
	const string& name = e->mCommandNames[i];
	const auto duration = getDreamCommandMinimumDuration(e->mPlayer->mCommandID, name.data());
	if (duration < e->mRandomInputNow) {
		setDreamPlayerCommandActiveForAI(e->mPlayer->mCommandID, name.data(), 2);
		return 1;
	}
	return 0;
}

// Fire a random AI-activation command. This triggers the character's
// custom AI to wake up (sets var(51)/var(59)=1).
static void setRandomAIActivationCommand(PlayerAI* e) {
	if (e->mAIActivationCommands.empty()) return;
	int i = randfromInteger(0, int(e->mAIActivationCommands.size()) - 1);
	const string& name = e->mAIActivationCommands[i];
	setDreamPlayerCommandActiveForAI(e->mPlayer->mCommandID, name.data(), 2);
}

// Returns the probability (0.0 - 1.0) of firing an AI-activation command
// (vs a real command) when the AI timer fires.
//
// Easy (levels 1-2): 10% chance — character AI takes ~4-6 sec to activate
// Normal (levels 3-5): 35% chance — character AI activates in ~1-2 sec
// Hard (levels 6-8): 65% chance — character AI activates almost immediately
//
// These numbers are calibrated so that:
//   - On Easy, the human has time to approach and get the first hit before
//     the character AI wakes up. The engine AI (random real commands) is
//     still active but dumb.
//   - On Hard, the character AI is active almost from frame 1, giving the
//     human no breathing room.
static double getAIActivationCommandProbability(PlayerAI* e) {
	// difficultyFactor: 0.0 (level 1) to 1.0 (level 8)
	// Linear interpolation: 0.10 → 0.65
	return 0.10 + (0.65 - 0.10) * e->mDifficultyFactor;
}

// ==========================================================================
// Movement and guarding — unchanged from original, already difficulty-scaled
// ==========================================================================

static void updateAIMovement(PlayerAI* e) {
	const auto otherPlayer = getPlayerOtherPlayer(e->mPlayer);
	const auto dist = getPlayerDistanceToFrontOfOtherPlayerX(e->mPlayer, getDreamMugenStageHandlerCameraCoordinateP());
	const auto playerStateType = getPlayerStateType(e->mPlayer);
	const auto otherPlayerStateType = getPlayerStateType(otherPlayer);
	const auto otherPlayerStateMoveType = getPlayerStateMoveType(otherPlayer);

	if (dist > 50) {
		e->mIsMoving = 1;
	}
	else if (dist < 30) {
		e->mIsMoving = 0;
	}

	const auto isOtherPlayerCloseAndCrouching = (dist < 30) && (otherPlayerStateType == MUGEN_STATE_TYPE_CROUCHING);
	const auto isOtherPlayerCrouchAttacking = (otherPlayerStateType == MUGEN_STATE_TYPE_CROUCHING) && (otherPlayerStateMoveType == MUGEN_STATE_MOVE_TYPE_ATTACK);
	e->mIsCrouching = isOtherPlayerCloseAndCrouching || isOtherPlayerCrouchAttacking;

	const auto isOtherPlayerJumpingClose = (dist < 30) && (playerStateType != MUGEN_STATE_TYPE_AIR) && (otherPlayerStateType == MUGEN_STATE_TYPE_AIR);
	const auto isOtherPlayerJumpingAttack = (dist < 30) && (playerStateType != MUGEN_STATE_TYPE_AIR) && (otherPlayerStateType == MUGEN_STATE_TYPE_AIR) && (otherPlayerStateMoveType == MUGEN_STATE_MOVE_TYPE_ATTACK);
	e->mIsJumping = isOtherPlayerJumpingClose || isOtherPlayerJumpingAttack;

	if (e->mIsMoving) {
		setDreamPlayerCommandActiveForAI(e->mPlayer->mCommandID, "holdfwd", 2);
	}
	if (e->mIsCrouching) {
		setDreamPlayerCommandActiveForAI(e->mPlayer->mCommandID, "holddown", 2);
	}
	if (e->mIsJumping) {
		setDreamPlayerCommandActiveForAI(e->mPlayer->mCommandID, "holdup", 2);
	}
}

static void updateAIGuarding(PlayerAI* e) {
	if (isPlayerBeingAttacked(e->mPlayer) && isPlayerInGuardDistance(e->mPlayer)) {
		if (!e->mIsGuardingLogicActive) {
			double rand = randfrom(0, 1);
			double guardPossibilityMin = 0.2;
			double guardPossibilityMax = 0.7;
			double guardPossibility = guardPossibilityMin + (guardPossibilityMax - guardPossibilityMin) * e->mDifficultyFactor;
			e->mWasGuardingSuccessful = (rand < guardPossibility);
			e->mIsGuardingLogicActive = 1;
		}
	}
	else {
		e->mIsGuardingLogicActive = 0;
	}

	if (e->mIsGuardingLogicActive && e->mWasGuardingSuccessful) {
		setDreamPlayerCommandActiveForAI(e->mPlayer->mCommandID, "holdback", 2);
	}
}

// ==========================================================================
// Command firing — the core difficulty logic
// ==========================================================================

static void updateAICommands(PlayerAI* e) {
	if (getGameMode() == GAME_MODE_OSU) {
		return;
	}

	e->mRandomInputNow++;
	if (e->mRandomInputNow >= e->mRandomInputDuration) {
		int isSettingInput = 0;

		// Decide whether to fire an AI-activation command or a real command.
		// The probability scales with difficulty.
		const double aiActivationProb = getAIActivationCommandProbability(e);
		const double rand = randfrom(0, 1);
		const int fireAICommand = (rand < aiActivationProb);

		if (fireAICommand && !e->mAIActivationCommands.empty()) {
			// Fire an AI-activation command (triggers character custom AI).
			// Always use cheat mode for these — they're impossible-input by
			// design, so respecting timing would make them never fire.
			setRandomAIActivationCommand(e);
			isSettingInput = 1;
		}
		else if (!e->mCommandNames.empty()) {
			// Fire a real move command.
			// Disable AI cheat on easy difficulty (levels 1-2) so the AI
			// respects command timing — gives the human more reaction time.
			// On normal+ (levels 3-8), use the configured ai.cheat value.
			const int aiLevel = getPlayerAILevel(e->mPlayer);
			const int useCheat = (aiLevel <= 2) ? 0 : getArcadeAICheat();
			if (useCheat) {
				setRandomRealCommandActive(e);
				isSettingInput = 1;
			}
			else {
				isSettingInput = setRandomRealCommandActiveIfTimePossible(e);
			}
		}
		if (!isSettingInput) return;

		e->mRandomInputNow = 0;

		// Compute the next action delay. Lower difficulty = longer pauses.
		int lowerDurationMin = 30;
		int lowerDurationMax = 1;
		int upperDurationMin = 45;
		int upperDurationMax = 7;
		int lowerDuration = (int)(lowerDurationMin + (lowerDurationMax - lowerDurationMin) * e->mDifficultyFactor);
		int upperDuration = (int)(upperDurationMin + (upperDurationMax - upperDurationMin) * e->mDifficultyFactor);
		e->mRandomInputDuration = randfromInteger(lowerDuration, upperDuration);
	}
}

static void updateSingleAI(void* /*tCaller*/, PlayerAI& tData) {
	if (getDreamRoundStateNumber() != 2) return;
	PlayerAI* e = &tData;
	if (!getPlayerAILevel(e->mPlayer)) return;

	updateAIMovement(e);
	updateAIGuarding(e);
	updateAICommands(e);
}

static void updateAIHandler(void* tData) {
	(void)tData;
	setProfilingSectionMarkerCurrentFunction();
	stl_list_map(gAI.mHandledPlayers, updateSingleAI);
}

// ==========================================================================
// Command list building — splits into real vs AI-activation
// ==========================================================================

typedef struct {
	vector<string>* mRealCommands;
	vector<string>* mAICommands;
} CommandSplitCaller;

static void insertSingleCommandName(CommandSplitCaller* tCaller, const string& tKey, DreamMugenCommand& tData) {
	(void)tData;
	if (isAIActivationCommand(tKey)) {
		tCaller->mAICommands->push_back(tKey);
	}
	else {
		tCaller->mRealCommands->push_back(tKey);
	}
}

void setDreamAIActive(DreamPlayer * p)
{
	PlayerAI e;
	e.mPlayer = p;
	e.mRandomInputNow = 0;
	e.mRandomInputDuration = 20;
	e.mIsMoving = 0;
	e.mIsCrouching = 0;
	e.mIsJumping = 0;
	e.mIsGuardingLogicActive = 0;
	e.mCommandNames.clear();
	e.mAIActivationCommands.clear();
	e.mDifficultyFactor = (getPlayerAILevel(p) - 1) / 7.0;

	DreamMugenCommands* commands = &p->mHeader->mFiles.mCommands;
	CommandSplitCaller caller;
	caller.mRealCommands = &e.mCommandNames;
	caller.mAICommands = &e.mAIActivationCommands;
	stl_string_map_map(commands->mCommands, insertSingleCommandName, &caller);

	gAI.mHandledPlayers.push_back(e);
}

typedef struct {
	int i;
	PlayerAI* mFound;
} FindAICaller;

static void findSameID(FindAICaller* tCaller, PlayerAI& tData) {
	PlayerAI* e = &tData;

	if (e->mPlayer->mRootID == tCaller->i) {
		tCaller->mFound = e;
	}
}

static PlayerAI* getAIFromPlayerID(int i) {
	FindAICaller caller;
	caller.i = i;
	caller.mFound = nullptr;

	stl_list_map(gAI.mHandledPlayers, findSameID, &caller);
	if (!caller.mFound) return NULL;
	else return caller.mFound;
}

// Used by osuhandler.cpp — fires a random command from the full list.
// To preserve old behavior, we fire from real commands if available,
// otherwise from AI commands.
void activateRandomAICommand(int i) {
	PlayerAI* e = getAIFromPlayerID(i);
	if (!e) return;
	if (!e->mCommandNames.empty()) {
		setRandomRealCommandActive(e);
	}
	else if (!e->mAIActivationCommands.empty()) {
		setRandomAIActivationCommand(e);
	}
}

ActorBlueprint getDreamAIHandler() {
	return makeActorBlueprint(loadAIHandler, unloadAIHandler, updateAIHandler);
}
