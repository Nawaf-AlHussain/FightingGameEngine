#include "ai.h"

#include <assert.h>
#include <cctype>
#include <algorithm>

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

	// ======================================================================
	// Gradual escalation + engine-AI-only bursts (Normal mode only)
	// ======================================================================
	// When the AI loses a round, the engine AI gets slightly harder for the
	// next round (higher guard chance, faster actions). This is "gradual
	// escalation" — smooth difficulty ramp, not jarring spikes.
	//
	// Additionally, on escalated rounds, the engine AI gets 2 random 10-second
	// "bursts" where it acts very fast and guards at 60%. These are intense
	// but beatable (no character CNS AI, so no 99.9% block rate).
	//
	// Burst timing: 2 bursts per round, scheduled at random frame offsets
	// within the round. Each burst lasts 600 frames (10 seconds at 60fps).
	// ======================================================================

	// 0 = base difficulty, 1 = AI lost 1 round, 2 = AI lost 2 rounds (max)
	int mEscalationLevel;

	// Burst state
	int mBurstActive;           // 1 if currently in a burst
	int mBurstFramesRemaining;  // frames left in current burst
	int mBurstsRemaining;       // bursts left to trigger this round
	int mBurstTriggerFrame1;   // frame in round to trigger burst 1
	int mBurstTriggerFrame2;   // frame in round to trigger burst 2
	int mBurstTriggerFrame3;   // frame in round to trigger burst 3 (only at escalation 2)
	int mRoundFrameCounter;    // frames elapsed in current round
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
// Easy (levels 1-2): 0% — character custom AI NEVER activates. Only the
//   engine AI is active (random real commands + movement + 20-27% guard).
//   This is genuinely easy: the AI does random moves, doesn't combo, doesn't
//   punish, doesn't block consistently. Like fighting a button-mashing beginner.
//
// Normal (levels 3-5): 35% chance — character AI activates in ~1-2 sec.
//   Human has some breathing room but character AI eventually wakes up.
//
// Hard (levels 6-8): 65% chance — character AI activates almost immediately.
//   Full character AI + fast engine AI.
static double getAIActivationCommandProbability(PlayerAI* e) {
	const int aiLevel = getPlayerAILevel(e->mPlayer);
	// Character CNS AI activation probability. The character's custom AI
	// (e.g. Songoku's var(51) AI) has 50%-per-frame guard logic that makes
	// it nearly impossible to land hits. We only activate it on Hard.
	//
	// Easy (levels 1-2): 0% — never. Pure engine AI.
	// Normal (levels 3-5): 0% — never. Engine AI with moderate tuning.
	// Hard (levels 6-8): 50-65% — activates quickly. Full character AI.
	if (aiLevel <= 5) return 0.0;
	return 0.50 + (0.65 - 0.50) * e->mDifficultyFactor;
}

// ==========================================================================
// Forward declarations for escalation/burst system (defined later in file)
// ==========================================================================
static double getEscalationGuardMultiplier(PlayerAI* e);
static double getEscalationSpeedMultiplier(PlayerAI* e);

// ==========================================================================
// Movement and guarding
// ==========================================================================

static void updateAIMovement(PlayerAI* e) {
	const auto otherPlayer = getPlayerOtherPlayer(e->mPlayer);
	const auto dist = getPlayerDistanceToFrontOfOtherPlayerX(e->mPlayer, getDreamMugenStageHandlerCameraCoordinateP());
	const auto playerStateType = getPlayerStateType(e->mPlayer);
	const auto otherPlayerStateType = getPlayerStateType(otherPlayer);
	const auto otherPlayerStateMoveType = getPlayerStateMoveType(otherPlayer);

	// On Easy (levels 1-2), the AI is less aggressive about approaching.
	// It walks toward you when moderately far, and stops at a comfortable
	// mid-range instead of getting in your face. This gives the human space
	// to act while still keeping the AI active.
	const int aiLevel = getPlayerAILevel(e->mPlayer);
	const int approachDist = (aiLevel <= 2) ? 70 : 50;
	const int stopDist = (aiLevel <= 2) ? 40 : 30;

	if (dist > approachDist) {
		e->mIsMoving = 1;
	}
	else if (dist < stopDist) {
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
			// Guard chance is decided ONCE per attack encounter (not per frame).
			//
			// Easy (levels 1-2): 10-25% — AI blocks sometimes, human can land hits
			// Normal (levels 3-5): 40-60% — AI blocks a fair amount, varied
			// Hard (levels 6-8): 55-75% — AI blocks often (character CNS AI also
			//   activates on Hard with its own 50%/frame guard logic)
			const int aiLevel = getPlayerAILevel(e->mPlayer);
			double guardPossibilityMin, guardPossibilityMax;
			if (aiLevel <= 2) {
				// Easy: 10% → 25%
				guardPossibilityMin = 0.10;
				guardPossibilityMax = 0.25;
			}
			else if (aiLevel <= 5) {
				// Normal: 40% → 60%
				guardPossibilityMin = 0.40;
				guardPossibilityMax = 0.60;
			}
			else {
				// Hard: 55% → 75%
				guardPossibilityMin = 0.55;
				guardPossibilityMax = 0.75;
			}
			double guardPossibility = guardPossibilityMin + (guardPossibilityMax - guardPossibilityMin) * e->mDifficultyFactor;
			// Apply escalation multiplier (Normal mode only, scales with rounds lost)
			guardPossibility *= getEscalationGuardMultiplier(e);
			if (guardPossibility > 0.88) guardPossibility = 0.88; // Cap at 88% so human can always land hits
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
				// On Easy, if the time check failed (complex commands need more
				// charge time than the AI has waited), fall back to firing the
				// command anyway. Without this, the AI never acts because most
				// commands have minimum durations longer than the AI's timer.
				// This is a "dumb button masher" behavior, which is appropriate
				// for Easy difficulty.
				if (!isSettingInput && aiLevel <= 2) {
					setRandomRealCommandActive(e);
					isSettingInput = 1;
				}
			}
		}
		if (!isSettingInput) return;

		e->mRandomInputNow = 0;

		// Compute the next action delay. Lower difficulty = longer pauses.
		// Easy (levels 1-2): 35-60 frames (~0.6-1 sec between actions)
		//   — AI acts slowly, human has plenty of reaction time.
		// Normal (levels 3-5): 8-20 frames (~0.13-0.33 sec)
		//   — AI acts quickly, constant pressure.
		// Hard (levels 6-8): 1-7 frames (~instant)
		//   — Very fast. Character CNS AI also activates on Hard.
		const int aiLevel = getPlayerAILevel(e->mPlayer);
		int lowerDuration, upperDuration;
		if (aiLevel <= 2) {
			// Easy: 35-60 frames
			// Level 1 (factor=0): 50-70, Level 2 (factor=0.143): 35-60
			lowerDuration = 50 - (int)(15 * e->mDifficultyFactor * 7);
			upperDuration = 70 - (int)(10 * e->mDifficultyFactor * 7);
			if (lowerDuration < 30) lowerDuration = 30;
			if (upperDuration < 50) upperDuration = 50;
		}
		else if (aiLevel <= 5) {
			// Normal: 8-20 frames
			// Level 3 (factor=0.286): 20-35, Level 5 (factor=0.571): 8-15
			lowerDuration = 20 - (int)(12 * (e->mDifficultyFactor - 0.286) / 0.286);
			upperDuration = 35 - (int)(20 * (e->mDifficultyFactor - 0.286) / 0.286);
			if (lowerDuration < 6) lowerDuration = 6;
			if (upperDuration < 12) upperDuration = 12;
		}
		else {
			// Hard: 1-7 frames at level 8
			int lowerDurationMin = 30;
			int lowerDurationMax = 1;
			int upperDurationMin = 45;
			int upperDurationMax = 7;
			lowerDuration = (int)(lowerDurationMin + (lowerDurationMax - lowerDurationMin) * e->mDifficultyFactor);
			upperDuration = (int)(upperDurationMin + (upperDurationMax - upperDurationMin) * e->mDifficultyFactor);
		}
		// Apply escalation speed multiplier (Normal mode only)
		double speedMult = getEscalationSpeedMultiplier(e);
		lowerDuration = (int)(lowerDuration * speedMult);
		upperDuration = (int)(upperDuration * speedMult);
		if (lowerDuration < 2) lowerDuration = 2; // Min 2 frames so AI doesn't lock the engine
		if (upperDuration < 3) upperDuration = 3;
		if (upperDuration < lowerDuration) upperDuration = lowerDuration + 1;
		e->mRandomInputDuration = randfromInteger(lowerDuration, upperDuration);
	}
}

// ==========================================================================
// Gradual escalation + engine-AI-only bursts
// ==========================================================================
// On Normal mode (levels 3-5), when the AI loses a round, the engine AI
// gets slightly harder for the next round. Additionally, 2 random 10-second
// bursts per escalated round make the engine AI act very fast and guard at 60%.
//
// This applies ONLY to Normal mode. Easy and Hard are unaffected.
// ============================================================================

// Returns the escalation multiplier for guard chance (1.0 = base, higher = harder).
// Normal mode only. Returns 1.0 for Easy/Hard.
static double getEscalationGuardMultiplier(PlayerAI* e) {
	const int aiLevel = getPlayerAILevel(e->mPlayer);
	if (aiLevel < 3 || aiLevel > 5) return 1.0; // Only Normal

	if (e->mBurstActive) return 2.0; // Burst: 2x guard (very tough but beatable)

	// Gradual escalation: +20% per escalation level
	return 1.0 + 0.20 * e->mEscalationLevel;
}

// Returns the escalation multiplier for action speed (1.0 = base, lower = faster).
// During a burst, the AI acts ~6x faster.
static double getEscalationSpeedMultiplier(PlayerAI* e) {
	const int aiLevel = getPlayerAILevel(e->mPlayer);
	if (aiLevel < 3 || aiLevel > 5) return 1.0; // Only Normal

	if (e->mBurstActive) return 0.15; // Burst: ~6.6x faster actions

	// Gradual escalation: 15% faster per level
	return 1.0 - 0.15 * e->mEscalationLevel;
}

// Updates the burst and escalation state. Called every frame from updateSingleAI.
static void updateEscalationAndBursts(PlayerAI* e) {
	const int aiLevel = getPlayerAILevel(e->mPlayer);

	// Only Normal mode (levels 3-5) gets escalation + bursts
	if (aiLevel < 3 || aiLevel > 5) {
		e->mEscalationLevel = 0;
		e->mBurstActive = 0;
		e->mBurstsRemaining = 0;
		return;
	}

	// Check round state — only count frames during active fight (round state 2)
	if (getDreamRoundStateNumber() != 2) {
		e->mRoundFrameCounter = 0;
		return;
	}

	e->mRoundFrameCounter++;

	// Update escalation level based on how many rounds the AI has lost.
	// We check the OTHER player's rounds won (= rounds AI lost).
	DreamPlayer* otherPlayer = getPlayerOtherPlayer(e->mPlayer);
	int aiLostRounds = 0;
	if (otherPlayer) aiLostRounds = otherPlayer->mRoundsWon;
	if (aiLostRounds > 2) aiLostRounds = 2;
	e->mEscalationLevel = aiLostRounds;

	// If no escalation (AI hasn't lost any rounds), no bursts
	if (e->mEscalationLevel == 0) {
		e->mBurstActive = 0;
		e->mBurstsRemaining = 0;
		return;
	}

	// Handle active burst countdown
	if (e->mBurstActive) {
		e->mBurstFramesRemaining--;
		if (e->mBurstFramesRemaining <= 0) {
			e->mBurstActive = 0;
		}
		return;
	}

	// Check if it's time to trigger a burst
	// Burst 1: trigger at mBurstTriggerFrame1 if we still have bursts and
	// haven't triggered burst 1 yet (mBurstTriggerFrame1 > 0 means scheduled)
	if (e->mBurstsRemaining > 0 && e->mBurstTriggerFrame1 > 0 &&
	    e->mRoundFrameCounter >= e->mBurstTriggerFrame1) {
		e->mBurstActive = 1;
		e->mBurstFramesRemaining = 720; // 12 seconds at 60fps
		e->mBurstsRemaining--;
		e->mBurstTriggerFrame1 = 0; // Mark as triggered
		return;
	}

	// Check burst 2
	if (e->mBurstsRemaining > 0 && e->mBurstTriggerFrame2 > 0 &&
	    e->mRoundFrameCounter >= e->mBurstTriggerFrame2) {
		e->mBurstActive = 1;
		e->mBurstFramesRemaining = 720; // 12 seconds at 60fps
		e->mBurstsRemaining--;
		e->mBurstTriggerFrame2 = 0; // Mark as triggered
		return;
	}

	// Check burst 3 (only scheduled for escalation level 2 = AI lost 2 rounds)
	if (e->mBurstsRemaining > 0 && e->mBurstTriggerFrame3 > 0 &&
	    e->mRoundFrameCounter >= e->mBurstTriggerFrame3) {
		e->mBurstActive = 1;
		e->mBurstFramesRemaining = 720; // 12 seconds at 60fps
		e->mBurstsRemaining--;
		e->mBurstTriggerFrame3 = 0; // Mark as triggered
		return;
	}
}

// Called when a new round starts to schedule bursts for the upcoming round.
// At escalation level 1 (AI lost 1 round): schedules 2 bursts.
// At escalation level 2 (AI lost 2 rounds): schedules 3 bursts.
// Each burst lasts 720 frames (12 seconds at 60fps).
static void scheduleBurstsForRound(PlayerAI* e) {
	const int aiLevel = getPlayerAILevel(e->mPlayer);

	// Reset burst state
	e->mBurstActive = 0;
	e->mBurstFramesRemaining = 0;
	e->mRoundFrameCounter = 0;

	// Only Normal mode (levels 3-5) gets bursts, and only if escalated
	if (aiLevel < 3 || aiLevel > 5) {
		e->mBurstsRemaining = 0;
		e->mBurstTriggerFrame1 = 0;
		e->mBurstTriggerFrame2 = 0;
		e->mBurstTriggerFrame3 = 0;
		return;
	}

	// Check if AI is currently losing (other player has won rounds)
	DreamPlayer* otherPlayer = getPlayerOtherPlayer(e->mPlayer);
	int aiLostRounds = 0;
	if (otherPlayer) aiLostRounds = otherPlayer->mRoundsWon;

	if (aiLostRounds == 0) {
		// AI hasn't lost any rounds — no bursts needed
		e->mBurstsRemaining = 0;
		e->mBurstTriggerFrame1 = 0;
		e->mBurstTriggerFrame2 = 0;
		e->mBurstTriggerFrame3 = 0;
		return;
	}

	// Schedule bursts at random times within the round.
	// Range: 90-600 frames (1.5-10 sec into round)
	// Ensure bursts don't overlap (gap of at least 820 frames = 12s + 2s buffer)
	int burstCount = (aiLostRounds >= 2) ? 3 : 2;
	e->mBurstsRemaining = burstCount;

	e->mBurstTriggerFrame1 = randfromInteger(90, 600);
	int gap2 = e->mBurstTriggerFrame1 + 820;
	e->mBurstTriggerFrame2 = randfromInteger(gap2, std::min(gap2 + 700, 2400));

	if (burstCount >= 3) {
		int gap3 = e->mBurstTriggerFrame2 + 820;
		e->mBurstTriggerFrame3 = randfromInteger(gap3, std::min(gap3 + 700, 3600));
	} else {
		e->mBurstTriggerFrame3 = 0;
	}
}

static void updateSingleAI(void* /*tCaller*/, PlayerAI& tData) {
	if (getDreamRoundStateNumber() != 2) {
		// When round is not active, reset frame counter so bursts don't trigger
		// during intro/win pose. Bursts are scheduled when round 2 starts.
		// We detect round transitions by checking if frame counter was > 0.
		// Actually, scheduling happens in resetRoundData callback — but we
		// don't have that. Instead, we detect round start by checking if
		// mRoundFrameCounter is 0 and round state just became 2.
		return;
	}
	PlayerAI* e = &tData;
	if (!getPlayerAILevel(e->mPlayer)) return;

	// Detect round start: if frame counter is 0 and we haven't scheduled
	// bursts yet (all trigger frames == 0 AND mBurstsRemaining == 0 AND
	// escalation requires bursts), schedule them.
	// This handles the round 1→2 transition where escalation kicks in.
	if (e->mRoundFrameCounter == 0) {
		// Check if we need to schedule bursts for this round
		DreamPlayer* otherPlayer = getPlayerOtherPlayer(e->mPlayer);
		int aiLostRounds = otherPlayer ? otherPlayer->mRoundsWon : 0;
		const int aiLevel = getPlayerAILevel(e->mPlayer);
		if (aiLevel >= 3 && aiLevel <= 5 && aiLostRounds > 0 &&
		    e->mBurstTriggerFrame1 == 0 && e->mBurstTriggerFrame2 == 0 &&
		    e->mBurstTriggerFrame3 == 0 && e->mBurstsRemaining == 0) {
			scheduleBurstsForRound(e);
		}
	}

	// Update escalation + burst state
	updateEscalationAndBursts(e);

	// Normal AI updates
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

	// Escalation + burst state (Normal mode adaptive difficulty)
	e.mEscalationLevel = 0;
	e.mBurstActive = 0;
	e.mBurstFramesRemaining = 0;
	e.mBurstsRemaining = 0;
	e.mBurstTriggerFrame1 = 0;
	e.mBurstTriggerFrame2 = 0;
	e.mBurstTriggerFrame3 = 0;
	e.mRoundFrameCounter = 0;

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
