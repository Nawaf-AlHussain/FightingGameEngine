#include "prism/memoryhandler.h"

namespace prism {
    void initThreading() {}
    void shutdownThreading() {}
    void startThread(void (*tFunc)(void*), void* tData) {
        // Single-threaded: just run the function directly
        tFunc(tData);
    }
}