# Game Test - Three.js Project

A modern game development project using TypeScript and Three.js, optimized for AI-assisted development in Cursor.

## Features

- **TypeScript** - Type-safe development with excellent IDE support
- **Three.js** - Powerful 3D graphics library
- **Vite** - Fast development server and build tool
- **Modern ES Modules** - Clean, modular code structure
- **Camera Controls** - Interactive mouse-controlled camera
- **Example Scene** - Pre-configured 3D scene with lighting and objects

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev
```

The game will open automatically in your browser at `http://localhost:3000`

### Build

```bash
# Build for production
npm run build
```

### Preview Production Build

```bash
# Preview the production build
npm run preview
```

## Project Structure

```
game-test/
├── src/
│   ├── game/
│   │   ├── Game.ts          # Main game class
│   │   ├── CameraController.ts  # Camera controls
│   │   └── SceneManager.ts  # Scene setup and management
│   └── main.ts              # Entry point
├── index.html               # HTML template
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
└── vite.config.ts          # Vite configuration
```

## Controls

- **Mouse Drag** - Rotate camera around the scene
- **Mouse Wheel** - Zoom in/out

## Next Steps

This is a basic starter project. You can now:

1. Add game objects and entities
2. Implement game mechanics
3. Add physics (consider adding `cannon-es` or `rapier`)
4. Add UI elements
5. Implement game states and scenes
6. Add audio with `howler.js` or similar
7. Add networking for multiplayer games

## Why This Stack?

- **TypeScript + Three.js**: Excellent AI assistance support in Cursor
- **Web-based**: Easy to share and deploy, no installation required
- **Scalable**: Can grow from simple games to complex 3D experiences
- **Modern**: Uses latest web technologies and best practices
- **Fast Development**: Hot module replacement with Vite

## Resources

- [Three.js Documentation](https://threejs.org/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)

## License

MIT

