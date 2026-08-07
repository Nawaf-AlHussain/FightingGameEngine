#include "prism/sound.h"

#include <SDL.h>
#include <SDL_mixer.h>

#include <stdio.h>
#include <string>
#include <map>

#include "prism/log.h"
#include "prism/file.h"
#include "prism/datastructures.h"
#include "prism/memoryhandler.h"
#include "prism/system.h"
#include "prism/math.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

using namespace std;
namespace prism {

static struct {
	int mIsInitialized;
	Mix_Music* mCurrentMusic;
	double mVolume;
	double mPanning;
	int mIsPlaying;
	int mIsPaused;
	string mCurrentPath;
} gSoundData;

void initSound() {
	if (gSoundData.mIsInitialized) return;

	if (Mix_Init(MIX_INIT_MP3 | MIX_INIT_OGG | MIX_INIT_FLAC) == 0) {
		logWarningFormat("Mix_Init failed: %s", Mix_GetError());
	}
	if (Mix_OpenAudio(44100, MIX_DEFAULT_FORMAT, 2, 2048) < 0) {
		logWarningFormat("Mix_OpenAudio failed: %s", Mix_GetError());
		return;
	}

	Mix_AllocateChannels(16);

	gSoundData.mIsInitialized = 1;
	gSoundData.mCurrentMusic = NULL;
	gSoundData.mVolume = 1.0;
	gSoundData.mPanning = 0.0;
	gSoundData.mIsPlaying = 0;
	gSoundData.mIsPaused = 0;
}

void shutdownSound() {
	if (!gSoundData.mIsInitialized) return;
	stopMusic();
	Mix_CloseAudio();
	Mix_Quit();
	gSoundData.mIsInitialized = 0;
}

void updateSound() {
	// No-op for SDL_mixer (callback-driven)
}

double getVolume() {
	return gSoundData.mVolume;
}

void setVolume(double tVolume) {
	gSoundData.mVolume = tVolume;
	int vol = (int)(tVolume * MIX_MAX_VOLUME);
	Mix_VolumeMusic(vol);
}

double getPanningValue() {
	return gSoundData.mPanning;
}

void setPanningValue(double tPanning) {
	gSoundData.mPanning = tPanning;
	// SDL_mixer panning applied per-channel; music panning is limited
}

void playTrack(int tTrack) {
	(void)tTrack;
	// Track-based playback not needed for MUGEN; use streamMusicFile instead
}

void stopTrack() {
	stopMusic();
}

void pauseTrack() {
	pauseMusic();
}

void resumeTrack() {
	resumeMusic();
}

void playTrackOnce(int tTrack) {
	(void)tTrack;
}

void streamMusicFile(const char* tPath) {
	if (!gSoundData.mIsInitialized) return;

	stopMusic();

	gSoundData.mCurrentMusic = Mix_LoadMUS(tPath);
	if (!gSoundData.mCurrentMusic) {
		logWarningFormat("Mix_LoadMUS failed for '%s': %s", tPath, Mix_GetError());
		return;
	}

	gSoundData.mCurrentPath = tPath;
	Mix_PlayMusic(gSoundData.mCurrentMusic, -1); // -1 = loop forever
	setVolume(gSoundData.mVolume);
	gSoundData.mIsPlaying = 1;
	gSoundData.mIsPaused = 0;
}

void streamMusicFileOnce(const char* tPath) {
	if (!gSoundData.mIsInitialized) return;

	stopMusic();

	gSoundData.mCurrentMusic = Mix_LoadMUS(tPath);
	if (!gSoundData.mCurrentMusic) {
		logWarningFormat("Mix_LoadMUS failed for '%s': %s", tPath, Mix_GetError());
		return;
	}

	gSoundData.mCurrentPath = tPath;
	Mix_PlayMusic(gSoundData.mCurrentMusic, 0); // 0 = play once
	setVolume(gSoundData.mVolume);
	gSoundData.mIsPlaying = 1;
	gSoundData.mIsPaused = 0;
}

void stopStreamingMusicFile() {
	stopMusic();
}

uint64_t getStreamingSoundTimeElapsedInMilliseconds() {
	if (!gSoundData.mIsPlaying || gSoundData.mIsPaused) return 0;
	return (uint64_t)(Mix_GetMusicPosition(gSoundData.mCurrentMusic) * 1000.0);
}

int isPlayingStreamingMusic() {
	return gSoundData.mIsPlaying && !gSoundData.mIsPaused;
}

void stopMusic() {
	if (gSoundData.mCurrentMusic) {
		Mix_HaltMusic();
		Mix_FreeMusic(gSoundData.mCurrentMusic);
		gSoundData.mCurrentMusic = NULL;
	}
	gSoundData.mIsPlaying = 0;
	gSoundData.mIsPaused = 0;
	gSoundData.mCurrentPath.clear();
}

void pauseMusic() {
	if (gSoundData.mIsPlaying && !gSoundData.mIsPaused) {
		Mix_PauseMusic();
		gSoundData.mIsPaused = 1;
	}
}

void resumeMusic() {
	if (gSoundData.mIsPlaying && gSoundData.mIsPaused) {
		Mix_ResumeMusic();
		gSoundData.mIsPaused = 0;
	}
}

void crossFadeMusicLayer(const char* tNewPath, bool tIsLooping) {
	// Simple crossfade: start new, let old fade out over 1 second
	if (!gSoundData.mIsInitialized) return;

	Mix_Music* newMusic = Mix_LoadMUS(tNewPath);
	if (!newMusic) {
		logWarningFormat("crossFade: Mix_LoadMUS failed for '%s': %s", tNewPath, Mix_GetError());
		return;
	}

	// Fade out old music over 1000ms
	if (gSoundData.mCurrentMusic) {
		Mix_FadeOutMusic(1000);
	}

	// Wait briefly for fade, then start new
#ifdef __EMSCRIPTEN__
	// On web, start new immediately after short delay
	Mix_FadeInMusic(newMusic, tIsLooping ? -1 : 0, 500);
#else
	Mix_FadeInMusic(newMusic, tIsLooping ? -1 : 0, 500);
#endif

	// Free old after fade
	if (gSoundData.mCurrentMusic) {
		Mix_FreeMusic(gSoundData.mCurrentMusic);
	}
	gSoundData.mCurrentMusic = newMusic;
	gSoundData.mCurrentPath = tNewPath;
	gSoundData.mIsPlaying = 1;
	gSoundData.mIsPaused = 0;
}

ActorBlueprint getMicrophoneHandlerActorBlueprint() {
	// Not implemented for web
	ActorBlueprint ret;
	ret.mLoad = NULL;
	ret.mUpdate = NULL;
	return ret;
}

double getMicrophoneVolume() {
	return 0.0;
}

} // namespace prism