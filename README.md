# Glock Wizards - 3D Web MVP

A wave-based survival game built with Three.js and TypeScript.

## Features

- **Wave System**: Survive waves of enemies with increasing difficulty
- **Downtime & Shrines**: 25-second downtime between waves to visit shrines and pick boons
- **Two Deities**: Azelor (Fire/Offense) and Velune (Team/Mycelium)
- **Currency System**: Essence (common) and Fairy Dust (rare)
- **Enemy Types**: Sporeling (melee), Stalker (ranged), and Bulwark (mini-boss)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The game will open automatically in your browser at `http://localhost:3000`

### Build

```bash
npm run build
```

## Controls

- **Click** - Lock mouse pointer
- **WASD** - Move
- **Space** - Jump
- **Shift** - Dash
- **LMB** - Fire weapon
- **RMB** - Spell (Arc Burst)
- **R** - Reload
- **F** - Interact (Shrine/Forge/Portal)
- **Tab** - Toggle metrics
- **ESC** - Release mouse pointer

## Project Structure

```
game-test/
├── src/
│   ├── app/
│   │   ├── App.ts           # Main game orchestrator
│   │   └── EventBus.ts      # Event system
│   ├── core/
│   │   ├── CameraRig.ts     # FPS camera controls
│   │   ├── Effects.ts       # Visual effects
│   │   ├── Health.ts        # Health/shield system
│   │   ├── Input.ts         # Input handling
│   │   ├── RNG.ts           # Seeded random number generator
│   │   └── Time.ts          # Fixed-step time system
│   ├── game/
│   │   ├── Economy.ts       # Currency management
│   │   ├── Enemy.ts         # Enemy base class
│   │   ├── GameState.ts     # Game state machine
│   │   ├── Player.ts        # Player controller
│   │   ├── ShrineManager.ts # Shrine and boon system
│   │   ├── SpawnManager.ts  # Enemy spawning
│   │   ├── UI.ts            # HUD and UI overlays
│   │   ├── WaveManager.ts   # Wave progression
│   │   ├── Weapon.ts        # Weapon system
│   │   └── World.ts         # Scene and world setup
│   └── main.ts              # Entry point
├── config/                  # Game configuration files
│   ├── enemies.json
│   ├── waves.json
│   ├── spawns.json
│   ├── deities.json
│   └── boons.json
└── public/
    └── config/              # Config files served at runtime
```

## Game Loop

1. **Wave Start**: Enemies spawn based on wave configuration
2. **Combat**: Fight enemies, collect Essence and Fairy Dust
3. **Wave Clear**: All enemies defeated
4. **Downtime**: 25 seconds to visit shrines and pick boons
5. **Repeat**: Next wave starts automatically

## Configuration

All game balance and content is configurable via JSON files in the `config/` directory:

- `enemies.json` - Enemy stats and behaviors
- `waves.json` - Wave composition and progression
- `spawns.json` - Spawn point locations
- `deities.json` - Deity information
- `boons.json` - Available boons and their effects

## License

MIT
