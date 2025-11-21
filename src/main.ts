import { App } from './app/App';

// Detect mobile device
function detectMobile(): boolean {
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  const isMobileUA = mobileRegex.test(userAgent.toLowerCase());
  const isSmallScreen = window.innerWidth < 768;
  
  return hasTouch && (isMobileUA || isSmallScreen);
}

// Check if mobile and show message instead of game
if (detectMobile()) {
  const container = document.getElementById('app');
  if (container) {
    container.style.display = 'none';
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.id = 'mobile-message';
  messageDiv.innerHTML = `
    <div class="message-content">
      <h1>Desktop Only</h1>
      <p>Glock Wizards is designed for desktop computers only.</p>
      <p>Please play on a desktop or laptop computer for the best experience.</p>
    </div>
  `;
  document.body.appendChild(messageDiv);
} else {
  const container = document.getElementById('app');
  if (container) {
    new App(container);
  } else {
    console.error('App container not found');
  }
}
