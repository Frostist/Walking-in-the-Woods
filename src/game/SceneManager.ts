import * as THREE from 'three';
import { TreeGenerator } from './TreeGenerator';

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
    private elapsedTime: number = 0;
    private sunRadius: number = 50; // Radius of sun/moon orbit

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
        this.directionalLight.shadow.mapSize.width = 4096;
        this.directionalLight.shadow.mapSize.height = 4096;
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 100;
        this.directionalLight.shadow.camera.left = -50;
        this.directionalLight.shadow.camera.right = 50;
        this.directionalLight.shadow.camera.top = 50;
        this.directionalLight.shadow.camera.bottom = -50;
        this.directionalLight.shadow.bias = -0.0001;
        this.scene.add(this.directionalLight);
        this.objects.push(this.directionalLight);

        // Add directional light (moon) - will move with moon
        this.moonLight = new THREE.DirectionalLight(0xaaaaff, 0.3);
        this.moonLight.castShadow = true;
        this.moonLight.shadow.mapSize.width = 2048;
        this.moonLight.shadow.mapSize.height = 2048;
        this.moonLight.shadow.camera.near = 0.5;
        this.moonLight.shadow.camera.far = 100;
        this.moonLight.shadow.camera.left = -50;
        this.moonLight.shadow.camera.right = 50;
        this.moonLight.shadow.camera.top = 50;
        this.moonLight.shadow.camera.bottom = -50;
        this.moonLight.shadow.bias = -0.0001;
        this.scene.add(this.moonLight);
        this.objects.push(this.moonLight);

        // Create visible sun and moon in the sky
        this.createSun();
        this.createMoon();

        // Generate forest
        this.treeGenerator.generateForest(this.scene, 80, 60);
    }

    private createSun(): void {
        // Create sun geometry
        const sunGeometry = new THREE.SphereGeometry(2, 32, 32);
        
        // Create glowing sun material
        const sunMaterial = new THREE.MeshBasicMaterial({
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
        
        // Create glowing moon material
        const moonMaterial = new THREE.MeshBasicMaterial({
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

        // Add grass patches
        this.addGrassPatches(terrainSize);
    }

    private addGrassPatches(terrainSize: number): void {
        // Create simple grass representation using small green boxes
        const grassGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.1);
        const grassMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x2d5016, // Dark green
            roughness: 0.9
        });

        // Create multiple grass patches
        const grassCount = 200;
        for (let i = 0; i < grassCount; i++) {
            const grass = new THREE.Mesh(grassGeometry, grassMaterial);
            
            // Random position within terrain
            const x = (Math.random() - 0.5) * terrainSize * 0.8;
            const z = (Math.random() - 0.5) * terrainSize * 0.8;
            const y = 0.15; // Half height of grass
            
            grass.position.set(x, y, z);
            grass.rotation.y = Math.random() * Math.PI * 2;
            grass.scale.set(
                0.8 + Math.random() * 0.4,
                0.8 + Math.random() * 0.4,
                0.8 + Math.random() * 0.4
            );
            
            grass.castShadow = true;
            grass.receiveShadow = true;
            this.scene.add(grass);
            this.objects.push(grass);
        }
    }

    public update(deltaTime: number): void {
        // Update day/night cycle
        this.elapsedTime += deltaTime;
        const cycleProgress = (this.elapsedTime % this.cycleDuration) / this.cycleDuration;
        
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
        
        // Update sun position
        if (this.sun && this.sunGlow) {
            this.sun.position.set(sunX, Math.max(0, sunY), sunZ);
            this.sunGlow.position.copy(this.sun.position);
            
            // Hide sun when below horizon
            const sunVisible = sunY > -5;
            this.sun.visible = sunVisible;
            this.sunGlow.visible = sunVisible;
        }
        
        // Update moon position
        if (this.moon && this.moonGlow) {
            this.moon.position.set(moonX, Math.max(0, moonY), moonZ);
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
        }
        
        // Update moon light to follow moon
        if (this.moonLight) {
            this.moonLight.position.set(moonX, moonY, moonZ);
            
            // Moon light is stronger when moon is higher, weaker during day
            const moonIntensity = moonHeightNormalized * 0.4 * (1 - sunHeightNormalized * 0.5);
            this.moonLight.intensity = moonIntensity;
            this.moonLight.visible = moonY > -10;
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
    }

    public dispose(): void {
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

