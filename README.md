# 🎵 Shelby Sound Network

**Shel Sound Network** is a modern, decentralized audio streaming and management platform built on the **Aptos Blockchain** and the **Shelby Protocol**. It empowers users to store, manage, and stream their music collection in a truly decentralized manner, leveraging cutting-edge Web3 technologies.

---

## ✨ Features

- **Decentralized Storage**: Music files are stored securely on the Shelby Network, ensuring data ownership and availability.
- **Aptos Wallet Integration**: Seamlessly connect using Petra, Aptos Connect, or other supported wallets to manage your library.
- **Cloud Explorer**: Browse and manage your audio blobs stored across the Shelby network with a native file explorer interface.
- **Smart Metadata Parsing**: Automatic ID3 tag extraction for titles and artists upon upload.
- **Modern Audio Engine**: Responsive playback with features like shuffle, loop, volume boost, and high-fidelity rendering.
- **Premium UI/UX**: A dark-themed, glassmorphism-inspired interface built for an immersive listening experience.
- **Cross-Platform Readiness**: Designed as a Single Page Application (SPA), fully optimized for Vercel and modern browser environments.

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Blockchain Interface**: [@aptos-labs/ts-sdk](https://github.com/aptos-labs/aptos-ts-sdk), [@aptos-labs/wallet-adapter-react](https://github.com/aptos-labs/aptos-wallet-adapter)
- **Decentralized Storage**: [@shelby-protocol/sdk](https://www.npmjs.com/package/@shelby-protocol/sdk), [@shelby-protocol/react](https://www.npmjs.com/package/@shelby-protocol/react)
- **State Management**: [TanStack Query (React Query)](https://tanstack.com/query/latest)
- **Styling**: Vanilla CSS (Modern design patterns, Flexbox, CSS Grid)
- **Deployment**: [Vercel](https://vercel.com/) (Optimized with `vercel.json` and Node.js polyfills)

---

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ferize585/Shel-Sound-Network.git
   cd Shel-Sound-Network
   ```

2. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
   *Note: `--legacy-peer-deps` is recommended to ensure smooth resolution of Web3 peer dependency trees.*

### Environment Setup

Create a `.env` file in the root directory and add your Shelby API keys:
```env
VITE_SHELBY_API_KEY_SHELBYNET=your_api_key_here
VITE_SHELBY_API_KEY_TESTNET=your_api_key_here
```

### Development

Run the development server locally:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

Generate a production-ready build:
```bash
npm run build
```
The output will be located in the `dist/` directory, ready to be deployed to Vercel or any static hosting service.

---

## 🔧 Configuration Note (Vite 8 & Polyfills)

This project is optimized for **Vite 8** and **Rolldown**. To ensure compatibility with Web3 libraries that require Node.js core modules (like `Buffer` or `process`) in the browser, it uses:
- Manual `resolve.alias` in `vite.config.ts`.
- Custom global `define` entries.
- A dedicated `src/polyfills.ts` for environment initialization.

---

## 📄 License

This project is for demonstration and portfolio purposes. All rights reserved.

---

Developed with 🎵 by the Shelby Sound Network Team.
