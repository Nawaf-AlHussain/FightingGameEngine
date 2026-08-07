/**
 * ZSTD stub — decompression not needed for basic MUGEN character loading.
 * SFF v1 sprites are uncompressed; SFF v2 uses built-in zlib.
 * This stub satisfies the linker until real zstd support is added.
 */
#include <stddef.h>
#include <stdint.h>

extern "C" {
    unsigned long long ZSTD_getFrameContentSize(const void* src, size_t srcSize) {
        (void)src; (void)srcSize;
        return 0; // ZSTD_CONTENTSIZE_UNKNOWN
    }

    size_t ZSTD_decompress(void* dst, size_t dstCapacity, const void* src, size_t srcSize) {
        (void)dst; (void)dstCapacity; (void)src; (void)srcSize;
        return 0; // Return 0 bytes decompressed (error)
    }
}