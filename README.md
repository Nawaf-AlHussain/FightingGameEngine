# Fighting Game Engine

Browser-based 2D fighting game platform using **Dolmexica Infinite** (MUGEN interpreter) compiled to WebAssembly, with Next.js frontend and Deno Deploy WebSocket relay.

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐
│  Player A   │◄──────────────────►│  Deno Relay  │
│  (Browser)  │                    │  (lockstep)  │
│  WASM+Next  │                    └──────┬───────┘
└─────────────┘                           │
                                    ┌─────▼──────┐
┌─────────────┐     WebSocket      │  Neon DB    │
│  Player B   │◄──────────────────►│  (Postgres) │
│  (Browser)  │                    └────────────┘
│  WASM+Next  │
└─────────────┘
```

## Tech Stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | Next.js 14 + React 18 | Free (Vercel) |
| Game Engine | Dolmexica Infinite → WASM (Emscripten 3.1.74) | Free |
| WebSocket Relay | Deno Deploy | Free |
| Database | Neon Serverless Postgres | Free tier |
| Cache | Upstash Redis | Free tier |
| Asset Storage | Cloudflare R2 | Free 10GB |
| Audio | SDL_mixer (compiled into WASM) | Free |

## Project Structure

```
├── engine/DolmexicaInfinite/   # C++ MUGEN engine + Prism framework
│   └── chars/                  # MUGEN character assets
├── server/                     # Deno relay server
│   ├── src/ws/room-manager.ts  # Lockstep room & input logic
│   ├── db/queries.ts           # Database operations (stubs)
│   ├── db/migrations/          # PostgreSQL schema
│   └── utils/helpers.ts        # Session ID, room code generation
├── src/                        # Next.js frontend
│   ├── app/                    # App Router pages
│   ├── components/             # GameCanvas, TouchControls
│   ├── hooks/                  # useGameInput
│   ├── lib/                    # wasm-loader, relay-client
│   └── styles/                 # Game CSS
├── scripts/build-wasm.sh       # WASM build pipeline
├── tools/validate-mugen.py     # MUGEN asset validator
├── docs/                       # Design specs & deep-dives
└── public/game/                # WASM build output (committed — built via npm run build:wasm)
```

## Quick Start

### Prerequisites
- Node.js 18+
- Emscripten SDK 3.1.74+ (activate with `source /path/to/emsdk_env.sh`)
- Python 3 (for asset validator)
- Deno 1.40+ (for relay server, Phase 1.5+)

### Build Game Engine to WASM
```bash
# Activate Emscripten
source /path/to/emsdk_env.sh

# Build (requires engine source)
npm run build:wasm
```

### Run Frontend
```bash
npm install
npm run dev
```

### Validate Character Assets
```bash
python3 tools/validate-mugen.py engine/DolmexicaInfinite/chars/KnightmareSuperman/KnightmareSuperman.def
```

## Character Roster

### Bundled in `game.data` (Phase 1)

Only small characters are bundled to keep first-load under ~10MB (essential for Bangladesh mobile data).

| Character | Size | Author | Source |
|-----------|------|--------|--------|
| Songoku | ~4 MB | bundled with engine | Dolmexica Infinite |
| Vegeta | ~4.3 MB | CHOUJIN (2011) | tmpfiles.org |

**Note:** `scripts/build-wasm.sh` selectively preloads only the bundled characters (Songoku, Vegeta) into `game.data`. Large characters (KnightmareSuperman 69MB, Nightwing 30MB) stay in the directory for local dev testing but are excluded from the bundle.

### Available via R2 on-demand streaming (Phase 1.5+)

Larger characters are fetched from Cloudflare R2 when selected in the lobby, then written into Emscripten MEMFS via `Module.FS.writeFile()`. See `docs/deep-dives/03-asset-pipeline.md`.

| Character | Size | Source |
|-----------|------|--------|
| Knightmare Superman | ~69 MB | tmpfiles.org |
| Nightwing (O Illusionista) | ~30 MB | tmpfiles.org |

## Key Technical Details

- **Netcode**: Phase 1 = local only (no network). Phase 1.5 = input-delay lockstep + GGPO-style rollback. See `docs/deep-dives/05-rollback-netcode.md`.
- **Threading**: Single-threaded build (`thread_web.cpp` runs synchronously). No `SharedArrayBuffer` / COOP/COEP headers needed.
- **FMOD replacement**: Proprietary FMOD audio replaced with open-source SDL_mixer (web/ implementations)
- **Mobile support**: Virtual D-pad + 5 action buttons with multi-touch
- **Emscripten 3.1.74**: Uses `--use-port=sdl2_image:formats=png` (not the old `-s SDL2_IMAGE_FORMATS` flag)
- **Database**: In-memory relay only for Phase 1 / 1.5. Neon Postgres added in Phase 3.

## Known Limitations (WASM build)

- **Fonts disabled**: `data/system.def` and `data/fight.def` have all font references commented out because TrueType (SDL_ttf) and bitmap .fnt (PCX) fonts crash in WASM. This means no round announcements, lifebar text, character names, or KO/TO text will render. The fight itself works fine.
- **Empty sprite/sound references**: `system.def` has empty `spr =` and `snd =` fields. System screens (title, select, options) have no UI graphics — only the direct-match fight screen is used.
- **Post-fight rematch**: When a fight ends, the engine automatically restarts the same match (no return-to-lobby). This is because the title/select screens crash in WASM. See `start_direct_match.cpp::directMatchFightFinishedCB`.
- **Single-threaded**: No pthreads, no `SharedArrayBuffer`, no COOP/COEP headers needed.
- **No audio yet**: Sound files load but SDL_mixer audio init may not work in all browsers.

## License

See individual licenses for Dolmexica Infinite and included character assets.