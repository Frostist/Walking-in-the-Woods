```
      *    .    *    .    *    .    *    .    *    .    *
       /\        /\      /\        /\      /\        /\
      /  \      /  \    /  \      /  \    /  \      /  \
     / /\ \    / /\ \  / /\ \    / /\ \  / /\ \    / /\ \
    /_/  \_\  /_/  \_\/_/  \_\  /_/  \_\/_/  \_\  /_/  \_\
         ||        ||      ||        ||      ||        ||
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

 ██╗    ██╗ █████╗ ██╗     ██╗  ██╗██╗███╗   ██╗  ██████╗
 ██║    ██║██╔══██╗██║     ██║ ██╔╝██║████╗  ██║██╔════╝
 ██║ █╗ ██║███████║██║     █████╔╝ ██║██╔██╗ ██║██║  ███╗
 ██║███╗██║██╔══██║██║     ██╔═██╗ ██║██║╚██╗██║██║   ██║
 ╚███╔███╔╝██║  ██║███████╗██║  ██╗██║██║ ╚████║╚██████╔╝
  ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝

            ─── I N   T H E   W O O D S ───

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      *    .    *    .    *    .    *    .    *    .    *
```

> A WIP multiplayer 3D browser game built to explore real-time online multiplayer as fast as possible. Survive the forest, shoot monsters, build structures, and climb the leaderboard — now with VR support.

---

## Features

- **Real-time multiplayer** — Socket.io keeps all players in sync
- **First-person perspective** — rendered in WebGL via Three.js
- **Shooting** — fire bullets at monsters and compete for kills
- **Block building** — place and remove blocks in the world
- **Day / night cycle** — night brings a wave of up to 10 monsters
- **Two monster types** — a roaming boss monster and fast night monsters
- **Safe spawn zone** — 8-unit radius protected area at the origin
- **Leaderboard** — persistent kill tracking via PostgreSQL
- **VR mode** — full WebXR support in the `vr-client`
- **Procedural world** — trees and grass are generated server-side and shared across all clients

---

## Project Structure

```
Walking-in-the-Woods/
├── server/        # Node.js + Socket.io game server
├── pc-client/     # Browser (desktop) client — Three.js + TypeScript + Vite
└── vr-client/     # WebXR VR client — Three.js + TypeScript + Vite
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL (for the leaderboard)

### Server

```bash
cd server
npm install
npm run dev        # development (tsx watch)
# or
npm start          # production (compiled JS)
```

The server runs on **port 3001** by default. Set the `PORT` environment variable to override.

### PC Client

```bash
cd pc-client
npm install
npm run dev        # starts Vite dev server on http://localhost:3000
```

The client connects to `http://localhost:3001` by default.

### VR Client

```bash
cd vr-client
npm install
npm run dev        # starts Vite dev server on http://localhost:3001
```

> **Note:** The VR client's default dev port (3001) conflicts with the server. Either change the Vite port in `vr-client/vite.config.ts` or point the client at a remote server using the `VITE_SERVER_URL` environment variable.

```bash
VITE_SERVER_URL=http://localhost:3002 npm run dev
```

WebXR requires HTTPS in production. For local VR testing, most browsers allow an exemption for `localhost`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Rendering | [Three.js](https://threejs.org/) |
| Language | TypeScript |
| Build tool | Vite |
| Networking | Socket.io |
| Server | Node.js + Express |
| Database | PostgreSQL |
| VR | WebXR API |
| Process manager | PM2 (`ecosystem.config.js`) |
