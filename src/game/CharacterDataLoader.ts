import * as THREE from 'three';

export interface CharacterPart {
    id: string;
    type: string;
    geometry: 'sphere' | 'box' | 'cylinder';
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    color: number;
}

export interface GunData {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    parentId: string;
}

export interface BulletSpawnNode {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    parentId?: string;
}

export interface CharacterExportData {
    parts: CharacterPart[];
    gun: GunData;
    bulletSpawnNode: BulletSpawnNode;
}

import { CHARACTER_DATA } from './CharacterData';

export class CharacterDataLoader {
    private static cachedData: CharacterExportData | null = null;

    public static async loadCharacterData(): Promise<CharacterExportData> {
        if (this.cachedData) {
            return this.cachedData;
        }

        // Use embedded character data instead of loading from JSON file
        this.cachedData = CHARACTER_DATA;
        return this.cachedData;
    }

    public static createGeometry(geometryType: string, size: number = 1): THREE.BufferGeometry {
        switch (geometryType) {
            case 'sphere':
                return new THREE.SphereGeometry(size * 0.25, 16, 16);
            case 'box':
                return new THREE.BoxGeometry(size * 0.32, size * 0.4, size * 0.2);
            case 'cylinder':
                return new THREE.CylinderGeometry(size * 0.08, size * 0.1, size * 0.35, 8);
            default:
                return new THREE.BoxGeometry(size * 0.32, size * 0.4, size * 0.2);
        }
    }

    public static getGeometrySize(part: CharacterPart): number {
        // Return appropriate size multiplier based on part type
        switch (part.type) {
            case 'head':
                return 1.0;
            case 'neck':
                return 1.0;
            case 'torso':
                return 1.0;
            case 'hips':
                return 1.0;
            case 'shoulder':
                return 1.0;
            case 'arm':
                return 1.0;
            case 'hand':
                return 1.0;
            case 'leg':
                return 1.0;
            case 'foot':
                return 1.0;
            default:
                return 1.0;
        }
    }
}

