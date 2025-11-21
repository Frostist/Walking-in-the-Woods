// Simple deterministic tree generator for server
// Uses a seeded random number generator to ensure all clients see the same trees

export interface TreeData {
    x: number;
    z: number;
    rotationY: number;
    scale: number;
}

export interface GrassData {
    x: number;
    z: number;
    y: number;
    rotationY: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
}

// Seeded random number generator for deterministic tree generation
class SeededRandom {
    private seed: number;

    constructor(seed: number) {
        this.seed = seed;
    }

    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

export function generateTrees(count: number = 80, areaSize: number = 60, seed: number = 12345): TreeData[] {
    const rng = new SeededRandom(seed);
    const trees: TreeData[] = [];

    for (let i = 0; i < count; i++) {
        // Random position within area (using seeded random)
        const angle = rng.next() * Math.PI * 2;
        const distance = rng.next() * (areaSize / 2);
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        
        // Random rotation
        const rotationY = rng.next() * Math.PI * 2;
        
        // Random scale variation
        const scale = 0.8 + rng.next() * 0.4;
        
        trees.push({
            x,
            z,
            rotationY,
            scale
        });
    }

    return trees;
}

export function generateGrass(
    count: number = 200,
    terrainSize: number = 200,
    seed: number = 12345
): GrassData[] {
    const rng = new SeededRandom(seed);
    const grass: GrassData[] = [];

    for (let i = 0; i < count; i++) {
        // Random position within terrain (using seeded random)
        const x = (rng.next() - 0.5) * terrainSize * 0.8;
        const z = (rng.next() - 0.5) * terrainSize * 0.8;
        const y = 0.15; // Half height of grass
        
        // Random rotation
        const rotationY = rng.next() * Math.PI * 2;
        
        // Random scale variation
        const scaleBase = 0.8 + rng.next() * 0.4;
        const scaleX = scaleBase;
        const scaleY = scaleBase;
        const scaleZ = scaleBase;
        
        grass.push({
            x,
            z,
            y,
            rotationY,
            scaleX,
            scaleY,
            scaleZ
        });
    }

    return grass;
}

