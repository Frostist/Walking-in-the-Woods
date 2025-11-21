import * as THREE from 'three';
import { TreeGenerator, TreeData } from './TreeGenerator';
import { Monster } from './Monster';
import { FeatureFlags } from './FeatureFlags';
import { GrassData } from './NetworkManager';

export class SceneManager {
    private scene: THREE.Scene;
    private objects: THREE.Object3D[] = [];
    private treeGenerator: TreeGenerator;
    private sun: THREE.Mesh | null = null;
    private sunGlow: THREE.Mesh | null = null;
    private moon: THREE.Mesh | null = null;
    private moonGlow: THREE.Mesh | null = null;
    private directionalLight: THREE.DirectionalLight | null = null;
    private moonLight: THREE.DirectionalLight | null = null;
    private ambientLight: THREE.AmbientLight | null = null;
    private cycleDuration: number = 300000; // 5 minutes in milliseconds
    private elapsedTime: number = 0; // Fallback local time if server time not available
    private sunRadius: number = 150; // Radius of sun/moon orbit - increased to prevent sun going through floor
    private monster: Monster | null = null;
    private isDay: boolean = true;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.treeGenerator = new TreeGenerator();
    }

    public setup(): void {
        // Create large terrain FIRST - before anything else
        this.createTerrain();

        // Add ambient light - will be updated based on time of day
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(this.ambientLight);
        this.objects.push(this.ambientLight);

        // Add directional light (sun) - will move with sun
        this.directionalLight = new THREE.DirectionalLight(0xffffee, 0.9);
        this.directionalLight.castShadow = true;
        const sunShadowResolution = 8192;
        this.directionalLight.shadow.mapSize.width = sunShadowResolution;
        this.directionalLight.shadow.mapSize.height = sunShadowResolution;
        // Optimized shadow camera bounds - tighter near/far for better precision
        this.directionalLight.shadow.camera.near = 0.1;
        this.directionalLight.shadow.camera.far = 200;
        // Shadow camera bounds will be updated dynamically to follow player
        this.directionalLight.shadow.camera.left = -60;
        this.directionalLight.shadow.camera.right = 60;
        this.directionalLight.shadow.camera.top = 60;
        this.directionalLight.shadow.camera.bottom = -60;
        // Improved shadow bias to reduce shadow acne without peter panning
        this.directionalLight.shadow.bias = -0.00005;
        // Shadow radius for softer, more realistic shadow edges
        this.directionalLight.shadow.radius = 8;
        // Normal bias to reduce shadow acne on surfaces
        this.directionalLight.shadow.normalBias = 0.02;
        this.scene.add(this.directionalLight);
        this.objects.push(this.directionalLight);

        // Add directional light (moon) - will move with moon
        this.moonLight = new THREE.DirectionalLight(0xaaaaff, 0.3);
        this.moonLight.castShadow = true;
        const moonShadowResolution = 4096;
        this.moonLight.shadow.mapSize.width = moonShadowResolution;
        this.moonLight.shadow.mapSize.height = moonShadowResolution;
        // Optimized shadow camera bounds
        this.moonLight.shadow.camera.near = 0.1;
        this.moonLight.shadow.camera.far = 200;
        // Shadow camera bounds will be updated dynamically
        this.moonLight.shadow.camera.left = -60;
        this.moonLight.shadow.camera.right = 60;
        this.moonLight.shadow.camera.top = 60;
        this.moonLight.shadow.camera.bottom = -60;
        // Improved shadow bias
        this.moonLight.shadow.bias = -0.00005;
        // Softer shadow edges for moon
        this.moonLight.shadow.radius = 6;
        // Normal bias
        this.moonLight.shadow.normalBias = 0.02;
        this.scene.add(this.moonLight);
        this.objects.push(this.moonLight);

        // Create visible sun and moon in the sky
        this.createSun();
        this.createMoon();

        // Trees will be generated from server data - see generateTreesFromServerData()

        // Create monster - spawn it away from player (if feature flag is enabled)
        if (FeatureFlags.MONSTER_ENABLED) {
            const monsterStartPos = new THREE.Vector3(20, 1.0, 20);
            this.monster = new Monster(this.scene, monsterStartPos);
        }
    }

    /**
     * Generate trees from server-provided tree data.
     * This ensures all clients see trees in the same positions.
     */
    public generateTreesFromServerData(treeData: TreeData[]): void {
        this.treeGenerator.generateForestFromData(this.scene, treeData);
    }

    /**
     * Get all trees for collision detection
     */
    public getTrees(): THREE.Group[] {
        return this.treeGenerator.getTrees();
    }

    private createSun(): void {
        // Create sun geometry
        const sunGeometry = new THREE.SphereGeometry(2, 32, 32);
        
        // Create glowing sun material - use MeshStandardMaterial for emissive support
        const sunMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffee,
            emissive: 0xffaa00,
            emissiveIntensity: 1.5
        });
        
        this.sun = new THREE.Mesh(sunGeometry, sunMaterial);
        this.scene.add(this.sun);
        this.objects.push(this.sun);

        // Add sun glow effect using a larger sphere with lower opacity
        const glowGeometry = new THREE.SphereGeometry(2.5, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        this.sunGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.scene.add(this.sunGlow);
        this.objects.push(this.sunGlow);
    }

    private createMoon(): void {
        // Create moon geometry
        const moonGeometry = new THREE.SphereGeometry(1.5, 32, 32);
        
        // Create glowing moon material - use MeshStandardMaterial for emissive support
        const moonMaterial = new THREE.MeshStandardMaterial({
            color: 0xeeeeff,
            emissive: 0xaaaaaa,
            emissiveIntensity: 0.8
        });
        
        this.moon = new THREE.Mesh(moonGeometry, moonMaterial);
        this.scene.add(this.moon);
        this.objects.push(this.moon);

        // Add moon glow effect
        const glowGeometry = new THREE.SphereGeometry(2, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xaaaaaa,
            transparent: true,
            opacity: 0.2,
            side: THREE.BackSide
        });
        this.moonGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.scene.add(this.moonGlow);
        this.objects.push(this.moonGlow);
    }

    private createTerrain(): void {
        // Create a simple, large flat ground plane - BRIGHT GREEN
        const terrainSize = 200; // Make it huge
        const groundGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, 1, 1);
        
        // Use MeshStandardMaterial with high roughness for natural grass
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x5a9a5a, // Natural grass green
            roughness: 0.95, // Very high roughness for matte grass
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        // Rotate plane to be horizontal (facing up)
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true; // Enable shadow receiving
        this.scene.add(ground);
        this.objects.push(ground);
        
        // Store ground reference
        (this as any).ground = ground;

        // Grass will be generated from server data - see generateGrassFromServerData()
    }

    /**
     * Generate grass from server-provided grass data.
     * This ensures all clients see grass in the same positions.
     */
    public generateGrassFromServerData(grassData: GrassData[]): void {
        // Create simple grass representation using small green boxes
        const grassGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.1);
        const grassMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x2d5016, // Dark green
            roughness: 0.9
        });

        // Create grass patches from server data
        for (const data of grassData) {
            const grass = new THREE.Mesh(grassGeometry, grassMaterial);
            
            grass.position.set(data.x, data.y, data.z);
            grass.rotation.y = data.rotationY;
            grass.scale.set(data.scaleX, data.scaleY, data.scaleZ);
            
            grass.castShadow = true;
            grass.receiveShadow = true;
            this.scene.add(grass);
            this.objects.push(grass);
        }
    }

    public update(deltaTime: number, playerPosition: THREE.Vector3, serverGameTime?: number): void {
        // Update day/night cycle
        // Use server time if provided, otherwise use local elapsed time
        let currentTime: number;
        if (serverGameTime !== undefined && serverGameTime > 0) {
            currentTime = serverGameTime;
        } else {
            // Fallback to local time if server time not available
            this.elapsedTime += deltaTime;
            currentTime = this.elapsedTime;
        }
        
        const cycleProgress = (currentTime % this.cycleDuration) / this.cycleDuration;
        
        // Calculate sun and moon positions in circular orbits
        // Sun starts at -90 degrees (left horizon) and moves to 90 degrees (right horizon)
        // Moon is opposite (starts at 90 degrees, moves to -90 degrees)
        const sunAngle = (cycleProgress * Math.PI * 2) - Math.PI / 2; // -90 to 270 degrees
        const moonAngle = sunAngle + Math.PI; // Opposite side
        
        // Calculate positions in circular orbit
        const sunX = Math.cos(sunAngle) * this.sunRadius;
        const sunY = Math.sin(sunAngle) * this.sunRadius;
        const sunZ = 0;
        
        const moonX = Math.cos(moonAngle) * this.sunRadius;
        const moonY = Math.sin(moonAngle) * this.sunRadius;
        const moonZ = 0;
        
        // Update sun position - ensure it stays well above ground
        if (this.sun && this.sunGlow) {
            // Clamp sun Y position to be at least 10 units above ground
            const sunYClamped = Math.max(10, sunY);
            this.sun.position.set(sunX, sunYClamped, sunZ);
            this.sunGlow.position.copy(this.sun.position);
            
            // Hide sun when below horizon
            const sunVisible = sunY > -5;
            this.sun.visible = sunVisible;
            this.sunGlow.visible = sunVisible;
        }
        
        // Update moon position - ensure it stays well above ground
        if (this.moon && this.moonGlow) {
            // Clamp moon Y position to be at least 10 units above ground
            const moonYClamped = Math.max(10, moonY);
            this.moon.position.set(moonX, moonYClamped, moonZ);
            this.moonGlow.position.copy(this.moon.position);
            
            // Hide moon when below horizon
            const moonVisible = moonY > -5;
            this.moon.visible = moonVisible;
            this.moonGlow.visible = moonVisible;
        }
        
        // Calculate normalized heights for lighting calculations
        const sunHeightNormalized = Math.max(0, Math.min(1, (sunY + 10) / 20));
        const moonHeightNormalized = Math.max(0, Math.min(1, (moonY + 10) / 20));
        
        // Update directional light to follow sun
        if (this.directionalLight) {
            this.directionalLight.position.set(sunX, sunY, sunZ);
            
            // Adjust light intensity based on sun height
            this.directionalLight.intensity = sunHeightNormalized * 0.9;
            this.directionalLight.visible = sunY > -10;
            
            // Update shadow camera to follow player for better shadow quality
            this.updateShadowCamera(this.directionalLight.shadow.camera, playerPosition);
        }
        
        // Update moon light to follow moon
        if (this.moonLight) {
            this.moonLight.position.set(moonX, moonY, moonZ);
            
            // Moon light is stronger when moon is higher, weaker during day
            const moonIntensity = moonHeightNormalized * 0.4 * (1 - sunHeightNormalized * 0.5);
            this.moonLight.intensity = moonIntensity;
            this.moonLight.visible = moonY > -10;
            
            // Update shadow camera to follow player for better shadow quality
            this.updateShadowCamera(this.moonLight.shadow.camera, playerPosition);
        }
        
        // Update ambient light based on time of day - keep it bright enough so trees are visible
        if (this.ambientLight) {
            // Minimum ambient light of 0.4 so trees don't go completely black at night
            // Maximum of 0.7 during day
            const dayIntensity = 0.4 + sunHeightNormalized * 0.3; // 0.4 to 0.7
            this.ambientLight.intensity = dayIntensity;
            
            // Tint ambient light: warm during day, cool blue during night (but not too dark)
            const dayColor = new THREE.Color(0xffffff);
            const nightColor = new THREE.Color(0x6666aa); // Lighter blue so things are still visible
            this.ambientLight.color.lerpColors(dayColor, nightColor, 1 - sunHeightNormalized);
        }
        
        // Update sky color based on time of day - make night sky lighter so ground doesn't look weird
        const daySky = new THREE.Color(0x87ceeb); // Sky blue
        const nightSky = new THREE.Color(0x1a1a3a); // Dark blue but not pure black
        this.scene.background = daySky.clone().lerp(nightSky, 1 - sunHeightNormalized);

        // Determine if it's day or night (day when sun is above horizon and bright)
        this.isDay = sunHeightNormalized > 0.3;
    }

    private updateShadowCamera(shadowCamera: THREE.OrthographicCamera, playerPosition: THREE.Vector3): void {
        // Make shadow camera follow player position for optimal shadow quality
        // This ensures shadows are always rendered at high quality around the player
        const shadowDistance = 80; // Distance from player to shadow camera bounds
        
        shadowCamera.position.set(
            playerPosition.x,
            playerPosition.y + 50, // Position camera above player
            playerPosition.z
        );
        
        // Update shadow camera bounds centered on player
        shadowCamera.left = playerPosition.x - shadowDistance;
        shadowCamera.right = playerPosition.x + shadowDistance;
        shadowCamera.top = playerPosition.z + shadowDistance;
        shadowCamera.bottom = playerPosition.z - shadowDistance;
        
        // Update the camera projection matrix
        shadowCamera.updateProjectionMatrix();
    }

    public updateMonster(deltaTime: number, playerPosition: THREE.Vector3): void {
        if (this.monster) {
            this.monster.update(deltaTime, playerPosition, this.isDay);
        }
    }

    public isDayTime(): boolean {
        return this.isDay;
    }

    public dispose(): void {
        if (this.monster) {
            this.monster.dispose();
        }
        this.treeGenerator.dispose();
        
        this.objects.forEach(obj => {
            if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(mat => mat.dispose());
                } else {
                    obj.material.dispose();
                }
            }
            this.scene.remove(obj);
        });
        this.objects = [];
    }
}

