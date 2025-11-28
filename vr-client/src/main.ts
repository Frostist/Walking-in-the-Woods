import { VRGame } from './game/VRGame';

// Initialize the VR game
const game = new VRGame();
game.init().catch(error => {
    console.error('Failed to initialize VR game:', error);
});

