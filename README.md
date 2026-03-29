# 🎵 Shelby Sound Network

A decentralized Web3 Audio Player providing a fully localized, ownership-verified music streaming experience. Built on top of the **Shelby Protocol** for resilient, decentralized object storage and **Supabase** for high-speed, relational metadata indexing.

## Features

- **Decentralized Storage:** Direct audio parsing and uploading to the immutable Shelby Network.
- **Global Metadata Sync:** Track titles, artists, and visibility toggles are synchronized via Supabase.
- **Wallet-Based Ownership:** Complete ownership rights linked exclusively to your verified Web3 Wallet address.
- **Private Library by Default:** Your uploaded tracks belong to you and remain completely private until selectively published.
- **Public / Private Toggling:** A per-track, responsive UI toggle switch empowering you to share your music globally.
- **Global Cloud Explorer:** A synchronized global feed displaying audio publicly exposed by the community.
- **Optimistic UI Execution:** Instant, lagging-free client-side UI reflections following state updates.
- **Mobile Responsive Layout:** Precision-engineered layouts built gracefully for iOS/Android viewing experiences.

## Architecture

- **Shelby Network:** Dedicated protocol for storing heavy audio binary artifacts (blobs).
- **Supabase (PostgreSQL):** Relational tracking for identities, artists, track names, and `is_public` database flags.
- **React Client:** A smart client-side Vite application that orchestrates uploads, UI rendering, and playback bindings.

## Data Flow

`Upload` ➔ `Shelby Network` ➔ `blob_commitment` ➔ `Supabase` ➔ `Fetch` ➔ `UI` ➔ `Toggle` ➔ `Update` ➔ `Refresh`

## Tech Stack

- **Framework:** Vite + React + TypeScript
- **Database:** Supabase 
- **Decentralized Network:** Shelby Protocol SDK

## Screenshots

*[Add screenshot here]*

## Setup & Run

To run the application locally:

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev

# 3. Build for production deployment
npm run build

# 4. Preview the production build locally
npm run preview
```

## Environment Variables

Create an `.env` file in the root directory and ensure the following variables are configured:

```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Notes

- `console.log`, `console.warn`, and `console.error` trace statements are strictly wrapped in `import.meta.env.DEV` conditions and will not pollute the trace logs on production versions.
- The `.env` configurations are explicitly mapped in `.gitignore` and securely withheld from remote tracking.

## Future Improvements

- Realtime synchronization via WebSockets
- Custom Playlist creation & favoriting functionality
- Performance & chunk-loading optimizations
