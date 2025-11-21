import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class GunLoader {
    private static loader: GLTFLoader | null = null;
    private static cachedGun: THREE.Group | null = null;

    /**
     * Load the gun model from the specified path
     * @param path Path to the gun GLB file (default: '/models/gun.glb')
     * @returns Promise that resolves with the loaded gun model
     */
    public static async loadGun(path: string = '/models/gun.glb'): Promise<THREE.Group> {
        // Return cached gun if already loaded
        if (this.cachedGun) {
            return this.cloneGun(this.cachedGun);
        }

        // Initialize loader if needed
        if (!this.loader) {
            this.loader = new GLTFLoader();
        }

        try {
            // Suppress the deprecated extension warning
            const originalWarn = console.warn;
            console.warn = (...args: any[]) => {
                if (args[0] && typeof args[0] === 'string' && args[0].includes('KHR_materials_pbrSpecularGlossiness')) {
                    return; // Suppress this specific warning
                }
                originalWarn.apply(console, args);
            };
            
            // Use loadAsync - it automatically detects GLB vs GLTF format
            const gltf = await this.loader.loadAsync(path);
            
            // Restore original console.warn
            console.warn = originalWarn;
            
            // Get the gun model from the loaded scene
            const gunModel = gltf.scene;
            
            // Enable shadows
            gunModel.traverse((child: THREE.Object3D) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Cache the original model
            this.cachedGun = gunModel;

            // Return a clone for this instance
            return this.cloneGun(gunModel);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Clone a gun model for use by a character
     */
    private static cloneGun(original: THREE.Group): THREE.Group {
        const clone = original.clone();
        
        // Ensure shadows are enabled on clone
        clone.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        return clone;
    }
}

