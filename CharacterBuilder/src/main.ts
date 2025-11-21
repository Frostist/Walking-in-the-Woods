import { CharacterBuilder } from './CharacterBuilder.js';

const container = document.getElementById('canvas-container');
if (container) {
    new CharacterBuilder(container);
} else {
    console.error('Canvas container not found!');
}

