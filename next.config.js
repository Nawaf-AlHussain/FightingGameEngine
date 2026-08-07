/** @type {import('next').NextConfig} */
const nextConfig = {
  // WASM files are served from public/game/ — no special webpack config needed
  // since Emscripten output is self-contained JS + .wasm + .data
  reactStrictMode: false, // avoid double-render issues with WASM canvas

  // H2 fix: Expose a build-time env var to the client so the game loader can
  // cache-bust /game/ files with a deploy-stable version instead of Date.now()
  // (which would fetch 13MB on every page load).
  // Vercel sets NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA automatically.
  env: {
    GAME_ASSET_VERSION: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev",
  },
};

module.exports = nextConfig;