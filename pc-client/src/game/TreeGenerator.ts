import * as THREE from 'three';

export interface TreeData {
    x: number;
    z: number;
    rotationY: number;
    scale: number;
}

export class TreeGenerator {
    private trees: THREE.Group[] = [];

    public createTree(): THREE.Group {
        const tree = new THREE.Group();

        // Trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 3, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8b4513,
            roughness: 0.95 // Very high roughness for bark
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 1.5;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        tree.add(trunk);

        // Foliage (multiple spheres for a more natural look)
        const foliageMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x228b22,
            roughness: 0.95 // Very high roughness for matte leaves
        });

        // Main foliage
        const foliage1Geometry = new THREE.ConeGeometry(1.5, 2.5, 8);
        const foliage1 = new THREE.Mesh(foliage1Geometry, foliageMaterial);
        foliage1.position.y = 3.5;
        foliage1.castShadow = true;
        foliage1.receiveShadow = true;
        tree.add(foliage1);

        // Additional smaller foliage for variety
        const foliage2Geometry = new THREE.ConeGeometry(1.2, 2, 8);
        const foliage2 = new THREE.Mesh(foliage2Geometry, foliageMaterial);
        foliage2.position.y = 4.5;
        foliage2.position.x = 0.3;
        foliage2.rotation.z = 0.2;
        foliage2.castShadow = true;
        foliage2.receiveShadow = true;
        tree.add(foliage2);

        const foliage3Geometry = new THREE.ConeGeometry(1, 1.8, 8);
        const foliage3 = new THREE.Mesh(foliage3Geometry, foliageMaterial);
        foliage3.position.y = 5.2;
        foliage3.position.x = -0.2;
        foliage3.rotation.z = -0.15;
        foliage3.castShadow = true;
        foliage3.receiveShadow = true;
        tree.add(foliage3);

        return tree;
    }

    public generateForest(
        scene: THREE.Scene, 
        count: number = 50, 
        areaSize: number = 50
    ): THREE.Group[] {
        const forest = new THREE.Group();
        this.trees = [];

        for (let i = 0; i < count; i++) {
            const tree = this.createTree();
            
            // Random position within area
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * (areaSize / 2);
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            
            // Random rotation
            tree.rotation.y = Math.random() * Math.PI * 2;
            
            // Random scale variation
            const scale = 0.8 + Math.random() * 0.4;
            tree.scale.set(scale, scale, scale);
            
            tree.position.set(x, 0, z);
            
            forest.add(tree);
            this.trees.push(tree);
        }

        scene.add(forest);
        return this.trees;
    }

    /**
     * Generate forest from server-provided tree data.
     * This ensures all clients see trees in the same positions.
     */
    public generateForestFromData(
        scene: THREE.Scene,
        treeData: TreeData[]
    ): THREE.Group[] {
        const forest = new THREE.Group();
        this.trees = [];

        for (const data of treeData) {
            const tree = this.createTree();
            
            tree.position.set(data.x, 0, data.z);
            tree.rotation.y = data.rotationY;
            tree.scale.set(data.scale, data.scale, data.scale);
            
            forest.add(tree);
            this.trees.push(tree);
        }

        scene.add(forest);
        return this.trees;
    }

    public getTrees(): THREE.Group[] {
        return this.trees;
    }

    public dispose(): void {
        this.trees.forEach(tree => {
            tree.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        });
        this.trees = [];
    }
}

