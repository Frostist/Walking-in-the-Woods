/**
 * UpdateNotifier - Displays a small notification at the top of the screen
 * showing when the game was last updated (e.g., "2 hours ago", "3 days ago")
 */
export class UpdateNotifier {
    private container: HTMLElement | null = null;
    private updateTimestamp: number;
    private updateInterval: number | null = null;

    /**
     * @param updateTimestamp - Unix timestamp (in milliseconds) of when the game was last updated
     *                          If not provided, uses the current build time
     */
    constructor(updateTimestamp?: number) {
        // Use provided timestamp, or fallback to build time from env, or current time
        this.updateTimestamp = updateTimestamp || 
            (import.meta.env.VITE_BUILD_TIME ? parseInt(import.meta.env.VITE_BUILD_TIME) : Date.now());
        this.createUI();
        this.startAutoUpdate();
    }

    private createUI(): void {
        // Create update notifier container
        this.container = document.createElement('div');
        this.container.id = 'update-notifier';
        this.container.style.cssText = `
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.75);
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            z-index: 150;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            border: 1px solid rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            white-space: nowrap;
        `;

        this.updateDisplay();
        document.body.appendChild(this.container);
    }

    private formatTimeAgo(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);

        if (years > 0) {
            return `${years} ${years === 1 ? 'year' : 'years'} ago`;
        } else if (months > 0) {
            return `${months} ${months === 1 ? 'month' : 'months'} ago`;
        } else if (weeks > 0) {
            return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
        } else if (days > 0) {
            return `${days} ${days === 1 ? 'day' : 'days'} ago`;
        } else if (hours > 0) {
            return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
        } else if (minutes > 0) {
            return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
        } else {
            return 'just now';
        }
    }

    private updateDisplay(): void {
        if (!this.container) return;
        const timeAgo = this.formatTimeAgo(this.updateTimestamp);
        this.container.textContent = `Last update: ${timeAgo}`;
    }

    private startAutoUpdate(): void {
        // Update every minute to keep the time accurate
        this.updateInterval = window.setInterval(() => {
            this.updateDisplay();
        }, 60000); // Update every 60 seconds
    }

    private stopAutoUpdate(): void {
        if (this.updateInterval !== null) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Update the timestamp (useful if you want to update it dynamically)
     */
    public setUpdateTimestamp(timestamp: number): void {
        this.updateTimestamp = timestamp;
        this.updateDisplay();
    }

    public dispose(): void {
        this.stopAutoUpdate();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

