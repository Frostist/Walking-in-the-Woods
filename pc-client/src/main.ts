import { Game } from './game/Game';

// Detect mobile device
function detectMobile(): boolean {
    // Check for touch capability
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Check user agent for mobile devices
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    const isMobileUA = mobileRegex.test(userAgent.toLowerCase());
    
    // Also check screen size (small screens are likely mobile)
    const isSmallScreen = window.innerWidth < 768;
    
    return hasTouch && (isMobileUA || isSmallScreen);
}

// Check if mobile and show message instead of game
if (detectMobile()) {
    // Hide canvas container
    const container = document.getElementById('canvas-container');
    if (container) {
        container.style.display = 'none';
    }
    
    // Hide info panel
    const info = document.getElementById('info');
    if (info) {
        info.style.display = 'none';
    }
    
    // Create and show mobile message
    const messageDiv = document.createElement('div');
    messageDiv.id = 'mobile-message';
    messageDiv.innerHTML = `
        <div class="message-content">
            <h1>Desktop Only</h1>
            <p>This game is designed for desktop computers only.</p>
            <p>Please play on a desktop or laptop computer for the best experience.</p>
        </div>
    `;
    document.body.appendChild(messageDiv);
} else {
    // Initialize the game on desktop
    const game = new Game();
    game.init().catch(error => {
        console.error('Failed to initialize game:', error);
    });
}

