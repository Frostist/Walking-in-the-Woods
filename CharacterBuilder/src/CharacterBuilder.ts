import * as THREE from 'three';
import { GunLoader } from './GunLoader.js';
import { DatabaseManager } from './DatabaseManager.js';

export interface CharacterPartData {
    id: string;
    type: string;
    geometry: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    color: number;
    parentId?: string;
}

export interface CharacterExportData {
    parts: CharacterPartData[];
    gun?: {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        scale: { x: number; y: number; z: number };
        parentId: string;
    };
    bulletSpawnNode?: {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        parentId?: string;
    };
}

export class CharacterBuilder {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private character: THREE.Group;
    private gun: THREE.Group | null = null;
    private rightHand: THREE.Mesh | null = null;
    
    // Fly camera controls
    private cameraPosition: THREE.Vector3 = new THREE.Vector3(0, 2, 5);
    private cameraRotation: THREE.Euler = new THREE.Euler(0, 0, 0, 'YXZ');
    private moveSpeed: number = 5;
    private rotationSpeed: number = 0.002;
    private keys: Set<string> = new Set();
    
    // Selection and dragging
    private raycaster: THREE.Raycaster = new THREE.Raycaster();
    private mouse: THREE.Vector2 = new THREE.Vector2();
    private selectedObject: THREE.Object3D | null = null;
    private isDragging: boolean = false;
    private dragPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    private dragOffset: THREE.Vector3 = new THREE.Vector3();
    
    // Part tracking
    private parts: Map<string, THREE.Object3D> = new Map();
    private partCounter: number = 0;
    private bulletSpawnNode: THREE.Group | null = null;
    
    // UI
    private controlsDiv!: HTMLDivElement;
    private selectedInfoDiv!: HTMLDivElement;
    
    // Database
    private databaseManager: DatabaseManager;
    private currentSaveId: number | null = null;
    
    constructor(container: HTMLElement) {
        // Initialize database
        this.databaseManager = new DatabaseManager();
        this.databaseManager.initialize().catch(err => {
            console.error('Failed to initialize database:', err);
        });
        
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        
        // Create camera
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        this.camera.position.copy(this.cameraPosition);
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);
        
        // Create character
        this.character = this.createCharacter();
        this.scene.add(this.character);
        
        // Setup lighting
        this.setupLighting();
        
        // Setup ground
        this.setupGround();
        
        // Setup UI
        this.setupUI();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Start animation loop
        this.animate();
    }
    
    private createCharacter(): THREE.Group {
        const character = new THREE.Group();
        
        // Head
        const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            roughness: 0.8
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.6;
        head.castShadow = true;
        head.receiveShadow = true;
        head.userData = { id: 'head', type: 'head', geometry: 'sphere' };
        character.add(head);
        this.parts.set('head', head);
        
        // Neck
        const neckGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.15, 8);
        const neckMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            roughness: 0.8
        });
        const neck = new THREE.Mesh(neckGeometry, neckMaterial);
        neck.position.y = 1.45;
        neck.castShadow = true;
        neck.receiveShadow = true;
        neck.userData = { id: 'neck', type: 'neck', geometry: 'cylinder' };
        character.add(neck);
        this.parts.set('neck', neck);
        
        // Torso
        const torsoGeometry = new THREE.BoxGeometry(0.32, 0.4, 0.2);
        const torsoMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a90e2,
            roughness: 0.7
        });
        const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
        torso.position.y = 1.2;
        torso.castShadow = true;
        torso.receiveShadow = true;
        torso.userData = { id: 'torso', type: 'torso', geometry: 'box' };
        character.add(torso);
        this.parts.set('torso', torso);
        
        // Hips
        const hipsGeometry = new THREE.BoxGeometry(0.35, 0.2, 0.2);
        const hipsMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d5016,
            roughness: 0.8
        });
        const hips = new THREE.Mesh(hipsGeometry, hipsMaterial);
        hips.position.y = 0.85;
        hips.castShadow = true;
        hips.receiveShadow = true;
        hips.userData = { id: 'hips', type: 'hips', geometry: 'box' };
        character.add(hips);
        this.parts.set('hips', hips);
        
        // Left shoulder
        const shoulderGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const shoulderMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            roughness: 0.8
        });
        const leftShoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
        leftShoulder.position.set(-0.28, 1.25, 0);
        leftShoulder.castShadow = true;
        leftShoulder.receiveShadow = true;
        leftShoulder.userData = { id: 'leftShoulder', type: 'shoulder', geometry: 'sphere' };
        character.add(leftShoulder);
        this.parts.set('leftShoulder', leftShoulder);
        
        // Right shoulder
        const rightShoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
        rightShoulder.position.set(0.28, 1.25, 0);
        rightShoulder.castShadow = true;
        rightShoulder.receiveShadow = true;
        rightShoulder.userData = { id: 'rightShoulder', type: 'shoulder', geometry: 'sphere' };
        character.add(rightShoulder);
        this.parts.set('rightShoulder', rightShoulder);
        
        // Left upper arm
        const upperArmGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.35, 8);
        const armMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            roughness: 0.8
        });
        const leftUpperArm = new THREE.Mesh(upperArmGeometry, armMaterial);
        leftUpperArm.position.set(-0.28, 1.075, 0);
        leftUpperArm.rotation.z = 0.2;
        leftUpperArm.castShadow = true;
        leftUpperArm.receiveShadow = true;
        leftUpperArm.userData = { id: 'leftUpperArm', type: 'arm', geometry: 'cylinder' };
        character.add(leftUpperArm);
        this.parts.set('leftUpperArm', leftUpperArm);
        
        // Left forearm
        const forearmGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8);
        const leftForearm = new THREE.Mesh(forearmGeometry, armMaterial);
        leftForearm.position.set(-0.28, 0.85, 0);
        leftForearm.rotation.z = 0.2;
        leftForearm.castShadow = true;
        leftForearm.receiveShadow = true;
        leftForearm.userData = { id: 'leftForearm', type: 'arm', geometry: 'cylinder' };
        character.add(leftForearm);
        this.parts.set('leftForearm', leftForearm);
        
        // Left hand
        const handGeometry = new THREE.BoxGeometry(0.1, 0.12, 0.05);
        const handMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            roughness: 0.8
        });
        const leftHand = new THREE.Mesh(handGeometry, handMaterial);
        leftHand.position.set(-0.28, 0.7, 0);
        leftHand.castShadow = true;
        leftHand.receiveShadow = true;
        leftHand.userData = { id: 'leftHand', type: 'hand', geometry: 'box' };
        character.add(leftHand);
        this.parts.set('leftHand', leftHand);
        
        // Right upper arm
        const rightUpperArm = new THREE.Mesh(upperArmGeometry, armMaterial);
        rightUpperArm.position.set(0.28, 1.075, -0.175);
        rightUpperArm.rotation.x = Math.PI / 2;
        rightUpperArm.rotation.z = -0.1;
        rightUpperArm.castShadow = true;
        rightUpperArm.receiveShadow = true;
        rightUpperArm.userData = { id: 'rightUpperArm', type: 'arm', geometry: 'cylinder' };
        character.add(rightUpperArm);
        this.parts.set('rightUpperArm', rightUpperArm);
        
        // Right forearm
        const rightForearm = new THREE.Mesh(forearmGeometry, armMaterial);
        rightForearm.position.set(0.28, 1.075, -0.5);
        rightForearm.rotation.x = Math.PI / 2;
        rightForearm.rotation.z = -0.1;
        rightForearm.castShadow = true;
        rightForearm.receiveShadow = true;
        rightForearm.userData = { id: 'rightForearm', type: 'arm', geometry: 'cylinder' };
        character.add(rightForearm);
        this.parts.set('rightForearm', rightForearm);
        
        // Right hand
        const rightHand = new THREE.Mesh(handGeometry, handMaterial);
        rightHand.position.set(0.28, 1.075, -0.65);
        rightHand.rotation.x = Math.PI / 2;
        rightHand.rotation.z = -0.1;
        rightHand.castShadow = true;
        rightHand.receiveShadow = true;
        rightHand.userData = { id: 'rightHand', type: 'hand', geometry: 'box' };
        character.add(rightHand);
        this.parts.set('rightHand', rightHand);
        this.rightHand = rightHand;
        
        // Left thigh
        const thighGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.45, 8);
        const legMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d5016,
            roughness: 0.8
        });
        const leftThigh = new THREE.Mesh(thighGeometry, legMaterial);
        leftThigh.position.set(-0.12, 0.525, 0);
        leftThigh.rotation.z = 0.05;
        leftThigh.castShadow = true;
        leftThigh.receiveShadow = true;
        leftThigh.userData = { id: 'leftThigh', type: 'leg', geometry: 'cylinder' };
        character.add(leftThigh);
        this.parts.set('leftThigh', leftThigh);
        
        // Left shin
        const shinGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);
        const shinMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            roughness: 0.8
        });
        const leftShin = new THREE.Mesh(shinGeometry, shinMaterial);
        leftShin.position.set(-0.12, 0.25, 0);
        leftShin.rotation.z = 0.05;
        leftShin.castShadow = true;
        leftShin.receiveShadow = true;
        leftShin.userData = { id: 'leftShin', type: 'leg', geometry: 'cylinder' };
        character.add(leftShin);
        this.parts.set('leftShin', leftShin);
        
        // Left foot
        const footGeometry = new THREE.BoxGeometry(0.12, 0.05, 0.25);
        const footMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.9
        });
        const leftFoot = new THREE.Mesh(footGeometry, footMaterial);
        leftFoot.position.set(-0.12, 0.05, 0.1);
        leftFoot.castShadow = true;
        leftFoot.receiveShadow = true;
        leftFoot.userData = { id: 'leftFoot', type: 'foot', geometry: 'box' };
        character.add(leftFoot);
        this.parts.set('leftFoot', leftFoot);
        
        // Right thigh
        const rightThigh = new THREE.Mesh(thighGeometry, legMaterial);
        rightThigh.position.set(0.12, 0.525, 0);
        rightThigh.rotation.z = -0.05;
        rightThigh.castShadow = true;
        rightThigh.receiveShadow = true;
        rightThigh.userData = { id: 'rightThigh', type: 'leg', geometry: 'cylinder' };
        character.add(rightThigh);
        this.parts.set('rightThigh', rightThigh);
        
        // Right shin
        const rightShin = new THREE.Mesh(shinGeometry, shinMaterial);
        rightShin.position.set(0.12, 0.25, 0);
        rightShin.rotation.z = -0.05;
        rightShin.castShadow = true;
        rightShin.receiveShadow = true;
        rightShin.userData = { id: 'rightShin', type: 'leg', geometry: 'cylinder' };
        character.add(rightShin);
        this.parts.set('rightShin', rightShin);
        
        // Right foot
        const rightFoot = new THREE.Mesh(footGeometry, footMaterial);
        rightFoot.position.set(0.12, 0.05, 0.1);
        rightFoot.castShadow = true;
        rightFoot.receiveShadow = true;
        rightFoot.userData = { id: 'rightFoot', type: 'foot', geometry: 'box' };
        character.add(rightFoot);
        this.parts.set('rightFoot', rightFoot);
        
        return character;
    }
    
    private async loadGun(): Promise<void> {
        try {
            const gunModel = await GunLoader.loadGun();
            this.gun = gunModel;
            
            const bbox = new THREE.Box3();
            bbox.setFromObject(this.gun);
            const size = bbox.getSize(new THREE.Vector3());
            if (size.length() > 0) {
                const targetLength = 0.4;
                const currentLength = Math.max(size.x, size.y, size.z);
                const scale = targetLength / currentLength;
                this.gun.scale.set(scale, scale, scale);
            } else {
                this.gun.scale.set(0.5, 0.5, 0.5);
            }
            
            if (this.rightHand) {
                this.rightHand.add(this.gun);
                this.gun.position.set(0, 0, -0.15);
                this.gun.rotation.set(-Math.PI / 2, -Math.PI / 2, 0);
                this.gun.userData = { id: 'gun', type: 'gun' };
            }
            
            this.scene.add(this.gun);
        } catch (error) {
            console.warn('Failed to load gun:', error);
        }
    }
    
    private setupLighting(): void {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -10;
        directionalLight.shadow.camera.right = 10;
        directionalLight.shadow.camera.top = 10;
        directionalLight.shadow.camera.bottom = -10;
        this.scene.add(directionalLight);
    }
    
    private setupGround(): void {
        const groundGeometry = new THREE.PlaneGeometry(20, 20);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x5a9a5a,
            roughness: 0.95
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }
    
    private setupUI(): void {
        // Controls panel
        this.controlsDiv = document.createElement('div');
        this.controlsDiv.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            z-index: 1000;
            max-width: 300px;
        `;
        this.controlsDiv.innerHTML = `
            <h3 style="margin-top: 0;">Character Builder</h3>
            <p><strong>Camera Controls:</strong></p>
            <p>WASD - Move<br>
            Q/E - Up/Down<br>
            Right-click + Drag - Rotate<br>
            Shift - Speed boost</p>
            <p><strong>Editing:</strong></p>
            <p>Left-click - Select part<br>
            Left-click + Drag - Move part<br>
            R/T - Rotate Y axis<br>
            F/G - Rotate X axis<br>
            V/B - Rotate Z axis<br>
            Right-click - Deselect</p>
            <button id="add-box-btn" style="margin-top: 10px; padding: 5px 10px;">Add Box</button>
            <button id="add-sphere-btn" style="margin-top: 5px; padding: 5px 10px;">Add Sphere</button>
            <button id="add-cylinder-btn" style="margin-top: 5px; padding: 5px 10px;">Add Cylinder</button>
            <button id="add-bullet-spawn-btn" style="margin-top: 10px; padding: 5px 10px; background: #ff6b6b; color: white; border: none; border-radius: 4px; cursor: pointer;">Add Bullet Spawn Node</button>
            <hr style="margin: 15px 0; border-color: #555;">
            <button id="save-btn" style="margin-top: 5px; padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">Save Character</button>
            <button id="load-btn" style="margin-top: 5px; padding: 5px 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">Load Character</button>
            <button id="export-btn" style="margin-top: 10px; padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">Export JSON</button>
        `;
        document.body.appendChild(this.controlsDiv);
        
        // Selected info panel
        this.selectedInfoDiv = document.createElement('div');
        this.selectedInfoDiv.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            z-index: 1000;
            min-width: 200px;
        `;
        this.selectedInfoDiv.innerHTML = '<p>No part selected</p>';
        document.body.appendChild(this.selectedInfoDiv);
        
        // Button handlers
        document.getElementById('add-box-btn')?.addEventListener('click', () => this.addPart('box'));
        document.getElementById('add-sphere-btn')?.addEventListener('click', () => this.addPart('sphere'));
        document.getElementById('add-cylinder-btn')?.addEventListener('click', () => this.addPart('cylinder'));
        document.getElementById('add-bullet-spawn-btn')?.addEventListener('click', () => this.addBulletSpawnNode());
        document.getElementById('save-btn')?.addEventListener('click', () => this.saveCharacter());
        document.getElementById('load-btn')?.addEventListener('click', () => this.loadCharacter());
        document.getElementById('export-btn')?.addEventListener('click', () => this.exportCharacter());
    }
    
    private setupEventListeners(): void {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys.add(key);
            if (e.key === ' ') e.preventDefault();
            
            // Handle rotation keys
            if (this.selectedObject && !e.repeat) {
                const rotationSpeed = 0.1; // radians per keypress
                
                if (key === 'r') {
                    // Rotate Y axis clockwise
                    this.selectedObject.rotation.y += rotationSpeed;
                    this.updateSelectedInfo();
                } else if (key === 't') {
                    // Rotate Y axis counter-clockwise
                    this.selectedObject.rotation.y -= rotationSpeed;
                    this.updateSelectedInfo();
                } else if (key === 'f') {
                    // Rotate X axis clockwise
                    this.selectedObject.rotation.x += rotationSpeed;
                    this.updateSelectedInfo();
                } else if (key === 'g') {
                    // Rotate X axis counter-clockwise
                    this.selectedObject.rotation.x -= rotationSpeed;
                    this.updateSelectedInfo();
                } else if (key === 'v') {
                    // Rotate Z axis clockwise
                    this.selectedObject.rotation.z += rotationSpeed;
                    this.updateSelectedInfo();
                } else if (key === 'b') {
                    // Rotate Z axis counter-clockwise
                    this.selectedObject.rotation.z -= rotationSpeed;
                    this.updateSelectedInfo();
                }
            }
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys.delete(e.key.toLowerCase());
        });
        
        // Mouse
        this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('mouseup', () => this.onMouseUp());
        this.renderer.domElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.deselect();
        });
        
        // Prevent context menu
        this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Load gun
        this.loadGun();
    }
    
    private onMouseDown(event: MouseEvent): void {
        if (event.button === 2) return; // Right click handled elsewhere
        
        event.preventDefault();
        
        if (event.button === 0) { // Left click
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            // Include all scene objects (bullet spawn node is already in scene.children)
            const intersects = this.raycaster.intersectObjects(this.scene.children, true);
            
            if (intersects.length > 0) {
                const object = intersects[0].object;
                // Find the mesh or its parent that has userData
                let selectableObject = object;
                while (selectableObject && !selectableObject.userData.id && selectableObject.parent) {
                    selectableObject = selectableObject.parent;
                }
                
                // Also check if it's part of the bullet spawn node group
                if (!selectableObject.userData.id && this.bulletSpawnNode) {
                    let checkObject = object;
                    while (checkObject && checkObject !== this.scene) {
                        if (checkObject === this.bulletSpawnNode) {
                            selectableObject = this.bulletSpawnNode;
                            break;
                        }
                        checkObject = checkObject.parent!;
                    }
                }
                
                if (selectableObject.userData.id) {
                    this.selectObject(selectableObject);
                    this.isDragging = true;
                    
                    // Calculate drag offset
                    const worldPosition = new THREE.Vector3();
                    selectableObject.getWorldPosition(worldPosition);
                    const intersectionPoint = intersects[0].point;
                    this.dragOffset.subVectors(worldPosition, intersectionPoint);
                    
                    // Update drag plane
                    const planeNormal = new THREE.Vector3();
                    this.camera.getWorldDirection(planeNormal);
                    this.dragPlane.normal.copy(planeNormal);
                    this.dragPlane.constant = worldPosition.y;
                } else {
                    this.deselect();
                }
            } else {
                this.deselect();
            }
        }
    }
    
    private onMouseMove(event: MouseEvent): void {
        if (this.isDragging && this.selectedObject) {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            // Update drag plane to face camera
            const planeNormal = new THREE.Vector3();
            this.camera.getWorldDirection(planeNormal);
            this.dragPlane.normal.copy(planeNormal);
            this.dragPlane.constant = this.selectedObject.position.y;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersectionPoint = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint);
            
            if (intersectionPoint) {
                intersectionPoint.add(this.dragOffset);
                
                // Convert to local space if parent exists
                if (this.selectedObject.parent && this.selectedObject.parent !== this.scene) {
                    const worldMatrix = this.selectedObject.parent.matrixWorld.clone().invert();
                    intersectionPoint.applyMatrix4(worldMatrix);
                }
                
                this.selectedObject.position.copy(intersectionPoint);
                this.updateSelectedInfo();
            }
        } else if (event.buttons === 2 || (event.buttons === 0 && event.ctrlKey)) {
            // Camera rotation (right mouse or ctrl+drag)
            const movementX = event.movementX || 0;
            const movementY = event.movementY || 0;
            
            this.cameraRotation.y -= movementX * this.rotationSpeed;
            this.cameraRotation.x -= movementY * this.rotationSpeed;
            this.cameraRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraRotation.x));
        }
    }
    
    private onMouseUp(): void {
        this.isDragging = false;
    }
    
    private selectObject(object: THREE.Object3D): void {
        this.deselect();
        this.selectedObject = object;
        
        // Highlight selected object
        if (object instanceof THREE.Mesh) {
            const originalMaterial = object.material;
            if (originalMaterial instanceof THREE.MeshStandardMaterial) {
                object.material = originalMaterial.clone();
                object.material.emissive = new THREE.Color(0x444444);
            }
        } else if (object instanceof THREE.Group && object.userData.id === 'bulletSpawnNode') {
            // Highlight bullet spawn node by making it brighter
            object.children.forEach((child) => {
                if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                    child.material.emissiveIntensity = 1.0;
                }
            });
        }
        
        this.updateSelectedInfo();
    }
    
    private deselect(): void {
        if (this.selectedObject) {
            // Restore original material
            if (this.selectedObject instanceof THREE.Mesh) {
                const material = this.selectedObject.material;
                if (material instanceof THREE.MeshStandardMaterial) {
                    material.emissive = new THREE.Color(0x000000);
                }
            } else if (this.selectedObject instanceof THREE.Group && this.selectedObject.userData.id === 'bulletSpawnNode') {
                // Restore bullet spawn node emissive
                this.selectedObject.children.forEach((child) => {
                    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                        child.material.emissiveIntensity = 0.5;
                    }
                });
            }
            this.selectedObject = null;
            this.selectedInfoDiv.innerHTML = '<p>No part selected</p>';
        }
    }
    
    private updateSelectedInfo(): void {
        if (!this.selectedObject) return;
        
        const pos = this.selectedObject.position;
        const rot = this.selectedObject.rotation;
        const scale = this.selectedObject.scale;
        const userData = this.selectedObject.userData;
        
        let scaleSection = '';
        if (userData.id !== 'bulletSpawnNode') {
            scaleSection = `<p><strong>Scale:</strong><br>
            X: ${scale.x.toFixed(3)}<br>
            Y: ${scale.y.toFixed(3)}<br>
            Z: ${scale.z.toFixed(3)}</p>`;
        }
        
        const title = userData.id === 'bulletSpawnNode' ? 'Bullet Spawn Node' : (userData.id || 'Unknown');
        
        this.selectedInfoDiv.innerHTML = `
            <h4 style="margin-top: 0;">Selected: ${title}</h4>
            ${userData.id === 'bulletSpawnNode' ? '<p style="color: #ff6b6b;"><strong>Arrow shows bullet direction</strong></p>' : ''}
            <p><strong>Position:</strong><br>
            X: ${pos.x.toFixed(3)}<br>
            Y: ${pos.y.toFixed(3)}<br>
            Z: ${pos.z.toFixed(3)}</p>
            <p><strong>Rotation:</strong><br>
            X: ${rot.x.toFixed(3)}<br>
            Y: ${rot.y.toFixed(3)}<br>
            Z: ${rot.z.toFixed(3)}</p>
            ${scaleSection}
            <button id="delete-btn" style="margin-top: 10px; padding: 5px 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
        `;
        
        document.getElementById('delete-btn')?.addEventListener('click', () => {
            if (this.selectedObject) {
                this.deletePart(this.selectedObject);
            }
        });
    }
    
    private addPart(type: 'box' | 'sphere' | 'cylinder'): void {
        let geometry: THREE.BufferGeometry;
        const id = `custom_${this.partCounter++}`;
        
        switch (type) {
            case 'box':
                geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(0.1, 16, 16);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8);
                break;
        }
        
        const material = new THREE.MeshStandardMaterial({
            color: 0xff6b6b,
            roughness: 0.8
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 2, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { id, type: 'custom', geometry: type };
        
        this.character.add(mesh);
        this.parts.set(id, mesh);
        this.selectObject(mesh);
    }
    
    private deletePart(object: THREE.Object3D): void {
        if (object.userData.id === 'gun') {
            alert('Cannot delete gun');
            return;
        }
        
        if (object.userData.id === 'bulletSpawnNode') {
            this.scene.remove(this.bulletSpawnNode!);
            this.bulletSpawnNode = null;
            this.deselect();
            return;
        }
        
        this.character.remove(object);
        this.parts.delete(object.userData.id);
        this.deselect();
    }
    
    private addBulletSpawnNode(): THREE.Group {
        // Remove existing node if any
        if (this.bulletSpawnNode) {
            this.scene.remove(this.bulletSpawnNode);
        }
        
        // Create a group for the node
        const nodeGroup = new THREE.Group();
        nodeGroup.userData = { id: 'bulletSpawnNode', type: 'bulletSpawnNode' };
        
        // Create a small sphere as the node marker
        const nodeGeometry = new THREE.SphereGeometry(0.05, 16, 16);
        const nodeMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000, // Red to make it stand out
            emissive: 0xff0000,
            emissiveIntensity: 0.5
        });
        const nodeSphere = new THREE.Mesh(nodeGeometry, nodeMaterial);
        nodeGroup.add(nodeSphere);
        
        // Create an arrow pointing forward (in the +Z direction)
        const arrowHelper = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1), // Direction (forward)
            new THREE.Vector3(0, 0, 0), // Origin
            0.3, // Length
            0x00ff00, // Color (green)
            0.1, // Head length
            0.05 // Head width
        );
        nodeGroup.add(arrowHelper);
        
        // Position the node in front of the character (or gun if it exists)
        if (this.gun) {
            const gunWorldPos = new THREE.Vector3();
            this.gun.getWorldPosition(gunWorldPos);
            nodeGroup.position.copy(gunWorldPos);
            // Position it slightly forward from the gun
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.gun.getWorldQuaternion(new THREE.Quaternion()));
            nodeGroup.position.addScaledVector(forward, 0.2);
        } else if (this.rightHand) {
            const handWorldPos = new THREE.Vector3();
            this.rightHand.getWorldPosition(handWorldPos);
            nodeGroup.position.copy(handWorldPos);
            nodeGroup.position.z -= 0.3; // Forward from hand
        } else {
            nodeGroup.position.set(0, 1.5, -1); // Default position in front of character
        }
        
        nodeGroup.castShadow = true;
        this.scene.add(nodeGroup);
        this.bulletSpawnNode = nodeGroup;
        
        // Select the new node
        this.selectObject(nodeGroup);
        
        return nodeGroup;
    }
    
    private updateCamera(deltaTime: number): void {
        const speed = this.keys.has('shift') ? this.moveSpeed * 2 : this.moveSpeed;
        const moveDistance = speed * (deltaTime / 1000);
        
        const direction = new THREE.Vector3();
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        
        // Calculate forward direction from rotation (camera looks in -Z direction by default)
        direction.set(
            -Math.sin(this.cameraRotation.y),
            0,
            -Math.cos(this.cameraRotation.y)
        );
        
        // Calculate right direction
        right.crossVectors(up, direction).normalize();
        
        // Move camera
        if (this.keys.has('w')) {
            this.cameraPosition.addScaledVector(direction, moveDistance);
        }
        if (this.keys.has('s')) {
            this.cameraPosition.addScaledVector(direction, -moveDistance);
        }
        if (this.keys.has('a')) {
            this.cameraPosition.addScaledVector(right, moveDistance);
        }
        if (this.keys.has('d')) {
            this.cameraPosition.addScaledVector(right, -moveDistance);
        }
        if (this.keys.has('q')) {
            this.cameraPosition.y -= moveDistance;
        }
        if (this.keys.has('e')) {
            this.cameraPosition.y += moveDistance;
        }
        
        // Apply rotation
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.x = this.cameraRotation.x;
        this.camera.rotation.y = this.cameraRotation.y;
        this.camera.rotation.z = this.cameraRotation.z;
        
        // Update camera position
        this.camera.position.copy(this.cameraPosition);
    }
    
    private onWindowResize(): void {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    
    private getCharacterData(): CharacterExportData {
        const exportData: CharacterExportData = {
            parts: []
        };
        
        // Export all parts (using local positions relative to character)
        this.character.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.id) {
                const pos = child.position;
                const rot = child.rotation;
                const scale = child.scale;
                
                const partData: CharacterPartData = {
                    id: child.userData.id,
                    type: child.userData.type || 'unknown',
                    geometry: child.userData.geometry || 'unknown',
                    position: {
                        x: pos.x,
                        y: pos.y,
                        z: pos.z
                    },
                    rotation: {
                        x: rot.x,
                        y: rot.y,
                        z: rot.z
                    },
                    scale: {
                        x: scale.x,
                        y: scale.y,
                        z: scale.z
                    },
                    color: (child.material as THREE.MeshStandardMaterial).color.getHex()
                };
                
                // Only set parentId if parent is not the character root
                if (child.parent && child.parent !== this.character && child.parent.userData.id) {
                    partData.parentId = child.parent.userData.id;
                }
                
                exportData.parts.push(partData);
            }
        });
        
        // Export gun if it exists (relative to its parent)
        if (this.gun) {
            const gunPos = this.gun.position;
            const gunRot = this.gun.rotation;
            const gunScale = this.gun.scale;
            
            exportData.gun = {
                position: {
                    x: gunPos.x,
                    y: gunPos.y,
                    z: gunPos.z
                },
                rotation: {
                    x: gunRot.x,
                    y: gunRot.y,
                    z: gunRot.z
                },
                scale: {
                    x: gunScale.x,
                    y: gunScale.y,
                    z: gunScale.z
                },
                parentId: this.gun.parent?.userData.id || 'rightHand'
            };
        }
        
        // Export bullet spawn node if it exists
        if (this.bulletSpawnNode) {
            const nodePos = this.bulletSpawnNode.position;
            const nodeRot = this.bulletSpawnNode.rotation;
            
            exportData.bulletSpawnNode = {
                position: {
                    x: nodePos.x,
                    y: nodePos.y,
                    z: nodePos.z
                },
                rotation: {
                    x: nodeRot.x,
                    y: nodeRot.y,
                    z: nodeRot.z
                },
                parentId: this.bulletSpawnNode.parent?.userData.id
            };
        }
        
        return exportData;
    }
    
    private async saveCharacter(): Promise<void> {
        try {
            const name = prompt('Enter a name for this character:', `Character ${new Date().toLocaleString()}`);
            if (!name) return;
            
            const data = this.getCharacterData();
            const json = JSON.stringify(data, null, 2);
            
            if (this.currentSaveId) {
                await this.databaseManager.updateCharacter(this.currentSaveId, name, json);
                alert('Character updated!');
            } else {
                const id = await this.databaseManager.saveCharacter(name, json);
                this.currentSaveId = id;
                alert('Character saved!');
            }
        } catch (error) {
            console.error('Failed to save character:', error);
            alert('Failed to save character. Check console for details.');
        }
    }
    
    private async loadCharacter(): Promise<void> {
        try {
            const characters = await this.databaseManager.getAllCharacters();
            
            if (characters.length === 0) {
                alert('No saved characters found.');
                return;
            }
            
            // Create selection dialog
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.95);
                color: white;
                padding: 20px;
                border-radius: 8px;
                z-index: 2000;
                min-width: 400px;
                max-height: 80vh;
                overflow-y: auto;
            `;
            
            dialog.innerHTML = `
                <h3 style="margin-top: 0;">Load Character</h3>
                <div id="character-list" style="margin: 15px 0;">
                    ${characters.map(char => `
                        <div style="padding: 10px; margin: 5px 0; background: rgba(255,255,255,0.1); border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" 
                             data-id="${char.id}">
                            <div>
                                <strong>${char.name}</strong><br>
                                <small>Updated: ${new Date(char.updatedAt).toLocaleString()}</small>
                            </div>
                            <button class="delete-char-btn" data-id="${char.id}" style="padding: 5px 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
                        </div>
                    `).join('')}
                </div>
                <button id="cancel-load-btn" style="padding: 5px 15px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
            `;
            
            document.body.appendChild(dialog);
            
            // Handle character selection
            dialog.querySelectorAll('[data-id]').forEach(el => {
                if (el.classList.contains('delete-char-btn')) return;
                
                el.addEventListener('click', async (e) => {
                    const id = parseInt((e.currentTarget as HTMLElement).getAttribute('data-id') || '0');
                    const character = await this.databaseManager.getCharacter(id);
                    if (character) {
                        this.loadCharacterData(JSON.parse(character.data));
                        this.currentSaveId = id;
                        document.body.removeChild(dialog);
                    }
                });
            });
            
            // Handle delete buttons
            dialog.querySelectorAll('.delete-char-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = parseInt((e.currentTarget as HTMLElement).getAttribute('data-id') || '0');
                    if (confirm('Are you sure you want to delete this character?')) {
                        await this.databaseManager.deleteCharacter(id);
                        document.body.removeChild(dialog);
                        this.loadCharacter(); // Refresh list
                    }
                });
            });
            
            // Handle cancel
            document.getElementById('cancel-load-btn')?.addEventListener('click', () => {
                document.body.removeChild(dialog);
            });
            
        } catch (error) {
            console.error('Failed to load characters:', error);
            alert('Failed to load characters. Check console for details.');
        }
    }
    
    private loadCharacterData(data: CharacterExportData): void {
        // Clear existing character
        this.scene.remove(this.character);
        this.character = this.createCharacter();
        this.scene.add(this.character);
        
        // Remove gun if exists
        if (this.gun) {
            this.scene.remove(this.gun);
            this.gun = null;
        }
        
        // Remove bullet spawn node if exists
        if (this.bulletSpawnNode) {
            this.scene.remove(this.bulletSpawnNode);
            this.bulletSpawnNode = null;
        }
        
        // Load parts
        data.parts.forEach(partData => {
            const part = this.parts.get(partData.id);
            if (part) {
                part.position.set(partData.position.x, partData.position.y, partData.position.z);
                part.rotation.set(partData.rotation.x, partData.rotation.y, partData.rotation.z);
                part.scale.set(partData.scale.x, partData.scale.y, partData.scale.z);
            }
        });
        
        // Load gun
        if (data.gun && this.rightHand) {
            const gunData = data.gun; // Store reference to avoid TS narrowing issues
            this.loadGun().then(() => {
                if (this.gun && gunData) {
                    this.gun.position.set(gunData.position.x, gunData.position.y, gunData.position.z);
                    this.gun.rotation.set(gunData.rotation.x, gunData.rotation.y, gunData.rotation.z);
                    this.gun.scale.set(gunData.scale.x, gunData.scale.y, gunData.scale.z);
                }
            });
        }
        
        // Load bullet spawn node
        if (data.bulletSpawnNode) {
            const spawnNode = data.bulletSpawnNode as NonNullable<typeof data.bulletSpawnNode>;
            const bulletSpawnNode = this.addBulletSpawnNode();
            bulletSpawnNode.position.set(spawnNode.position.x, spawnNode.position.y, spawnNode.position.z);
            bulletSpawnNode.rotation.set(spawnNode.rotation.x, spawnNode.rotation.y, spawnNode.rotation.z);
        }
        
        alert('Character loaded!');
    }
    
    private exportCharacter(): void {
        const exportData = this.getCharacterData();
        
        // Download as JSON
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'character-export.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('Character exported:', exportData);
        alert('Character exported! Check your downloads folder for character-export.json');
    }
    
    private animate(): void {
        requestAnimationFrame(() => this.animate());
        
        const now = performance.now();
        const deltaTime = now - (this.lastTime || now);
        this.lastTime = now;
        
        this.updateCamera(deltaTime);
        this.renderer.render(this.scene, this.camera);
    }
    
    private lastTime: number = 0;
}

