# 🎵 Shelby Sound Network

A decentralized Web3 music player built on the **Shelby Protocol** (Aptos Testnet) for resilient, decentralized audio storage and **Supabase** for high-speed metadata indexing. Upload, manage, and discover music with full on-chain ownership verification.

---

## ✨ Features

### 🎧 Playback & Visualizer
- **Real-time Audio Visualizer** — Canvas-based frequency spectrum visualizer with DPR-aware rendering and `ResizeObserver` for consistent display across all screen sizes
- **LRU Audio Cache** — 100 MB in-memory cache with least-recently-used eviction to prevent re-downloading tracks
- **Crossfade & Gapless Playback** — Configurable playback continuity settings
- **Next-Track Preloading** — Background prefetch of the next track starts 2 seconds into current playback
- **Concurrency Guard** — Symbol token per `loadTrack()` call prevents stale-closure race conditions when rapidly switching tracks
- **Keyboard Controls** — `Space` (play/pause), `Shift+Arrow` (skip), `Arrow Up/Down` (volume), `S` (shuffle), `L` (loop)

### 📚 Library
- **Wallet-Isolated Library** — Each connected wallet sees only their own tracks with strict double-filter validation (GraphQL Indexer + Supabase owner cross-verification)
- **Server-Side Pagination** — Dynamic page size (5 / 10 / 15 items) adapts to screen width
- **Real-time Polling** — Library auto-refreshes every 5 seconds, visibility-aware (pauses when tab is hidden) with `AbortController` cleanup
- **Debounced Search** — 300ms debounce on title/artist search input
- **Public / Private Toggle** — Per-track visibility control, synced to Supabase in real-time
- **Track Deletion** — On-chain blob deletion with smart fallback for already-deleted blobs (`0x3 / E_BLOB_NOT_FOUND`), followed by Supabase metadata cleanup

### ☁️ Cloud Explorer
- **Global Discovery** — Browse all publicly shared tracks from the Shelby community
- **Paginated Feed** — Server-side pagination via Supabase for scalable global track browsing
- **Cross-Owner Playback** — Plays any public track regardless of uploader wallet

### 📤 Upload
- **ID3 Tag Auto-Detection** — Reads embedded title and artist tags from MP3 files at upload time
- **Duration Pre-detection** — Measures audio duration client-side before uploading
- **Batch Upload** — Upload multiple files in one transaction
- **Metadata Sync** — After blockchain confirmation, polls the Shelby Indexer to capture `blob_commitment` and sync metadata to Supabase
- **100 MB File Size Limit** — Per-file validation before upload

### 🔐 Wallet & Auth
- **Petra Wallet Extension** — Hardware-level signing via Aptos Petra browser extension
- **Google Keyless (Web3Auth)** — Sign in with Google via AptosConnect keyless wallet
- **Multi-wallet Support** — Powered by `@aptos-labs/wallet-adapter-react`
- **Address Normalization** — All addresses padded to full 64-character hex for consistent cross-wallet comparison

### 🎨 UI & UX
- **GSAP Animations** — View transitions, sidebar overlay, and pagination powered by GSAP `matchMedia` and `fromTo` animations
- **Responsive Grid Layout** — Dynamic CSS grid (`--track-grid-lib`, `--track-grid-cloud`) adapts column widths across mobile, tablet, laptop, and monitor resolutions
- **Mobile Sidebar** — Slide-in sidebar with overlay dismiss for mobile/tablet
- **Toast Notifications** — Non-blocking success/error feedback with 2.5s auto-dismiss
- **Neon Visualizer Separator** — Subtle cyan glow border between visualizer and player controls

---

## 🏗️ Architecture

```
Wallet (Petra / Keyless)
        │
        ▼
  React + Vite (TypeScript)
        │
    ┌───┴───────────────────┐
    │                       │
    ▼                       ▼
Shelby Protocol SDK     Supabase (PostgreSQL)
(Aptos Testnet)         ├── blob_commitment (PK)
├── Upload blob         ├── title, artist, owner
├── Download blob       ├── is_public, network
└── Delete blob         ├── size, duration
                        └── blob_name
        │
        ▼
Shelby GraphQL Indexer
(aptoslabs nocode endpoint)
```

**Data Flow:**
`File Select` → `ID3 Parse` → `Duration Detect` → `Shelby SDK Upload` → `Blockchain Confirm` → `Indexer Poll` → `Supabase Upsert` → `Library Refresh`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React 19 + Vite 8 + TypeScript |
| **Blockchain** | Aptos Testnet via Shelby Protocol SDK |
| **Storage** | Shelby Protocol (decentralized blob storage) |
| **Database** | Supabase (PostgreSQL) |
| **Wallet** | Petra Extension + Google Keyless (AptosConnect) |
| **Data Fetching** | GraphQL (`graphql-request`) + TanStack Query |
| **Animations** | GSAP 3 (`matchMedia`, `fromTo`, `context`) |
| **Audio** | Web Audio API (`AnalyserNode`, `GainNode`) |
| **Deployment** | Vercel (SPA rewrite via `vercel.json`) |

---

## ⚙️ Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Start the development server (with local network access)
npm run dev -- --host

# 3. Build for production
npm run build

# 4. Preview the production build locally
npm run preview -- --host
```

> **⚠️ Note:** The `--host` flag exposes the dev/preview server on your local network IP.
> Upload functionality requires **HTTPS** (Web Crypto API restriction) — test uploads on the Vercel deployment, not via `http://192.168.x.x`.

---

## 🔑 Environment Variables

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_SHELBY_API_KEY_TESTNET=your-shelby-api-key
```

> All `.env*` files are excluded from Git via `.gitignore`.

---

## 📁 Project Structure

```
src/
├── App.tsx                  # Root component — state, audio engine, routing
├── index.css                # Global styles, CSS variables, responsive grid
├── types.ts                 # Shared TypeScript interfaces (Track, Settings, View)
├── polyfills.ts             # Node.js globals shim (Buffer, process, global)
├── main.tsx                 # Entry point — Provider stack setup
├── components/
│   ├── PlayerBar.tsx        # Audio player + canvas visualizer
│   ├── Sidebar.tsx          # Navigation sidebar (desktop + mobile)
│   ├── TrackList.tsx        # Track row renderer (Library + Cloud variants)
│   ├── CloudExplorer.tsx    # Global public track discovery
│   └── UploadZone.tsx       # Drag-and-drop file upload UI
└── utils/
    ├── shelbyExplorer.ts    # GraphQL + Supabase hybrid track fetching
    ├── metadataService.ts   # Supabase CRUD (save, update, delete metadata)
    ├── addressUtils.ts      # Wallet address normalization + ID standardization
    └── id3Parser.ts         # Client-side ID3 tag extraction from MP3 buffers
```

---

## 🔒 Security & Production Notes

- All `console.log`, `console.warn`, and `console.error` statements are guarded by `import.meta.env.DEV` — zero console output in production builds
- The `dist/` folder is excluded from Git; Vercel builds from source on every push
- Owner verification is double-layered: GraphQL Indexer ownership + Supabase `owner` field cross-check
- Deleted track IDs are tracked in a `deletedIdsRef` tombstone to prevent ghost reappearance during polling cycles

---

## 🚀 Future Improvements

- WebSocket-based real-time sync (replace polling)
- Custom playlist creation & favoriting
- Waveform thumbnail generation on upload
- Code splitting to reduce the ~6 MB production bundle
- Mainnet deployment support
