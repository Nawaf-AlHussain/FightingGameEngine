#include "prism/soundeffect.h"

#include <SDL.h>
#include <SDL_mixer.h>

#include <stdio.h>
#include <string>
#include <map>
#include <vector>

#include "prism/file.h"
#include "prism/sound.h"
#include "prism/datastructures.h"
#include "prism/memoryhandler.h"
#include "prism/stlutil.h"
#include "prism/log.h"

using namespace std;
namespace prism {

typedef struct {
	int mID;
	Mix_Chunk* mChunk;
} SoundEffectLoaded;

static struct {
	double mVolume;
	map<int, SoundEffectLoaded> mLoaded;
	int mNextID;
} gSoundEffectData;

void initSoundEffects() {
	gSoundEffectData.mVolume = 1.0;
	gSoundEffectData.mNextID = 0;
}

void setupSoundEffectHandler() {
	// No-op: SDL_mixer channels are ready after initSound()
}

void shutdownSoundEffectHandler() {
	stopAllSoundEffects();
	for (auto& pair : gSoundEffectData.mLoaded) {
		if (pair.second.mChunk) {
			Mix_FreeChunk(pair.second.mChunk);
		}
	}
	gSoundEffectData.mLoaded.clear();
}

void setSoundEffectCompression(int tIsEnabled) {
	(void)tIsEnabled;
	// No compression control in SDL_mixer
}

int loadSoundEffect(const char* tPath) {
	Mix_Chunk* chunk = Mix_LoadWAV(tPath);
	if (!chunk) {
		logWarningFormat("Mix_LoadWAV failed for '%s': %s", tPath, Mix_GetError());
		return -1;
	}

	int id = gSoundEffectData.mNextID++;
	SoundEffectLoaded loaded;
	loaded.mID = id;
	loaded.mChunk = chunk;
	gSoundEffectData.mLoaded[id] = loaded;
	return id;
}

int loadSoundEffectFromBuffer(const Buffer& tBuffer) {
	// SDL_mixer can load from memory via RWops
	SDL_RWops* rw = SDL_RWFromConstMem(tBuffer.mData, (int)tBuffer.mLength);
	if (!rw) {
		logWarning("Failed to create RWops from buffer");
		return -1;
	}

	Mix_Chunk* chunk = Mix_LoadWAV_RW(rw, 1); // 1 = auto-close rwops
	if (!chunk) {
		logWarningFormat("Mix_LoadWAV_RW failed: %s", Mix_GetError());
		return -1;
	}

	int id = gSoundEffectData.mNextID++;
	SoundEffectLoaded loaded;
	loaded.mID = id;
	loaded.mChunk = chunk;
	gSoundEffectData.mLoaded[id] = loaded;
	return id;
}

void unloadSoundEffect(int tID) {
	auto it = gSoundEffectData.mLoaded.find(tID);
	if (it != gSoundEffectData.mLoaded.end()) {
		if (it->second.mChunk) {
			Mix_FreeChunk(it->second.mChunk);
		}
		gSoundEffectData.mLoaded.erase(it);
	}
}

int playSoundEffect(int tID) {
	return playSoundEffectChannel(tID, -1, gSoundEffectData.mVolume);
}

int playSoundEffectChannel(int tID, int tChannel, double tVolume, double tFreqMul, int tIsLooping) {
	auto it = gSoundEffectData.mLoaded.find(tID);
	if (it == gSoundEffectData.mLoaded.end()) {
		return -1;
	}

	int vol = (int)(tVolume * MIX_MAX_VOLUME);
	Mix_VolumeChunk(it->second.mChunk, vol);

	int loops = tIsLooping ? -1 : 0;
	int ch = Mix_PlayChannel(tChannel, it->second.mChunk, loops);
	if (ch < 0) {
		// All channels busy — try any free channel
		ch = Mix_PlayChannel(-1, it->second.mChunk, loops);
	}

	// Frequency manipulation not directly supported in SDL_mixer without effects
	(void)tFreqMul;
	return ch;
}

int playSoundEffectFile(const std::string& tPath) {
	int id = loadSoundEffect(tPath.c_str());
	if (id < 0) return -1;
	return playSoundEffect(id);
}

void stopSoundEffect(int tChannel) {
	if (tChannel >= 0) {
		Mix_HaltChannel(tChannel);
	}
}

void stopAllSoundEffects() {
	Mix_HaltChannel(-1);
}

void panSoundEffect(int tChannel, double tPanning) {
	if (tChannel < 0) return;
	// SDL_mixer panning: 0 = left, 255 = right, 127 = center
	int left = 255;
	int right = 255;

	if (tPanning < 0) {
		// Pan left
		left = 255;
		right = (int)(255 * (1.0 + tPanning)); // tPanning is -1..0
	} else if (tPanning > 0) {
		// Pan right
		left = (int)(255 * (1.0 - tPanning)); // tPanning is 0..1
		right = 255;
	}

	Mix_SetPanning(tChannel, left, right);
}

int isSoundEffectPlayingOnChannel(int tChannel) {
	return Mix_Playing(tChannel);
}

SoundEffectCollection loadConsecutiveSoundEffectsToCollection(const char* tPath, int tAmount) {
	SoundEffectCollection col;
	col.mAmount = tAmount;
	col.mSoundEffects = (int*)allocMemory(sizeof(int) * tAmount);
	loadConsecutiveSoundEffects(col.mSoundEffects, tPath, tAmount);
	return col;
}

void loadConsecutiveSoundEffects(int* tDst, const char* tPath, int tAmount) {
	char path[1024];
	for (int i = 0; i < tAmount; i++) {
		snprintf(path, sizeof(path), tPath, i);
		tDst[i] = loadSoundEffect(path);
	}
}

int playRandomSoundEffectFromCollection(const SoundEffectCollection& tCollection) {
	if (tCollection.mAmount <= 0) return -1;
	int idx = rand() % tCollection.mAmount;
	return playSoundEffect(tCollection.mSoundEffects[idx]);
}

double getSoundEffectVolume() {
	return gSoundEffectData.mVolume;
}

void setSoundEffectVolume(double tVolume) {
	gSoundEffectData.mVolume = tVolume;
	// Apply to all loaded chunks
	for (auto& pair : gSoundEffectData.mLoaded) {
		if (pair.second.mChunk) {
			int vol = (int)(tVolume * MIX_MAX_VOLUME);
			Mix_VolumeChunk(pair.second.mChunk, vol);
		}
	}
}

} // namespace prism