export interface LeaderboardEntry {
    player_id: string;
    player_name: string | null;
    total_kills: number;
    player_kills: number;
    monster_kills: number;
}

export class Leaderboard {
    private serverUrl: string;
    private updateInterval: number = 30000; // Update every 30 seconds
    private updateTimer: number | null = null;
    private isVisible: boolean = false;
    private container: HTMLElement | null = null;

    constructor(serverUrl: string = 'http://localhost:3001') {
        this.serverUrl = serverUrl;
        this.createUI();
        this.setupKeyboardToggle();
    }

    private createUI(): void {
        // Create leaderboard container
        this.container = document.createElement('div');
        this.container.id = 'leaderboard-container';
        this.container.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 30px 40px;
            border-radius: 12px;
            z-index: 2000;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            border: 2px solid rgba(255, 255, 255, 0.2);
            min-width: 400px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
        `;

        this.container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; font-size: 28px; color: #fbbf24;">🏆 Leaderboard</h2>
                <button id="leaderboard-close" style="
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    color: white;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: background 0.2s;
                ">Close (L)</button>
            </div>
            <div id="leaderboard-content" style="min-height: 200px;">
                <div style="text-align: center; padding: 40px; color: #999;">
                    Loading leaderboard...
                </div>
            </div>
        `;

        document.body.appendChild(this.container);

        // Add close button handler
        const closeButton = this.container.querySelector('#leaderboard-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.hide();
            });
        }

        // Load initial data
        this.updateLeaderboard();
    }

    private setupKeyboardToggle(): void {
        document.addEventListener('keydown', (e) => {
            // Don't toggle if user is typing in an input field
            const activeElement = document.activeElement;
            if (activeElement && (
                activeElement.tagName === 'INPUT' || 
                activeElement.tagName === 'TEXTAREA' ||
                (activeElement instanceof HTMLElement && activeElement.isContentEditable)
            )) {
                return;
            }
            
            if (e.code === 'KeyL' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    public toggle(): void {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    public show(): void {
        if (!this.container) return;
        this.isVisible = true;
        this.container.style.display = 'block';
        this.updateLeaderboard();
        this.startAutoUpdate();
    }

    public hide(): void {
        if (!this.container) return;
        this.isVisible = false;
        this.container.style.display = 'none';
        this.stopAutoUpdate();
    }

    private startAutoUpdate(): void {
        this.stopAutoUpdate();
        this.updateTimer = window.setInterval(() => {
            this.updateLeaderboard();
        }, this.updateInterval);
    }

    private stopAutoUpdate(): void {
        if (this.updateTimer !== null) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    private async updateLeaderboard(): Promise<void> {
        if (!this.container) return;

        const contentDiv = this.container.querySelector('#leaderboard-content');
        if (!contentDiv) return;

        try {
            const response = await fetch(`${this.serverUrl}/api/leaderboard?limit=10`);
            if (!response.ok) {
                throw new Error('Failed to fetch leaderboard');
            }

            const leaderboard: LeaderboardEntry[] = await response.json();

            if (leaderboard.length === 0) {
                contentDiv.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #999;">
                        No kills recorded yet. Be the first to get a kill!
                    </div>
                `;
                return;
            }

            // Create leaderboard HTML
            let html = `
                <div style="margin-bottom: 15px; color: #ccc; font-size: 12px; text-align: center;">
                    Press L to toggle leaderboard
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid rgba(255, 255, 255, 0.2);">
                            <th style="text-align: left; padding: 12px 8px; color: #fbbf24; font-size: 14px;">Rank</th>
                            <th style="text-align: left; padding: 12px 8px; color: #fbbf24; font-size: 14px;">Player</th>
                            <th style="text-align: right; padding: 12px 8px; color: #fbbf24; font-size: 14px;">Total</th>
                            <th style="text-align: right; padding: 12px 8px; color: #fbbf24; font-size: 14px;">Players</th>
                            <th style="text-align: right; padding: 12px 8px; color: #fbbf24; font-size: 14px;">Monsters</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            leaderboard.forEach((entry, index) => {
                const rank = index + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
                // Use player_name if available, otherwise fall back to shortened player_id
                const playerDisplay = entry.player_name || 
                    (entry.player_id.length > 12 
                        ? entry.player_id.substring(0, 12) + '...' 
                        : entry.player_id);

                html += `
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                        <td style="padding: 12px 8px; font-weight: bold; color: ${rank <= 3 ? '#fbbf24' : '#fff'};">
                            ${medal} ${rank}
                        </td>
                        <td style="padding: 12px 8px; font-size: 13px; color: #fff;">
                            ${playerDisplay}
                        </td>
                        <td style="text-align: right; padding: 12px 8px; font-weight: bold; color: #4ade80;">
                            ${entry.total_kills}
                        </td>
                        <td style="text-align: right; padding: 12px 8px; color: #60a5fa;">
                            ${entry.player_kills}
                        </td>
                        <td style="text-align: right; padding: 12px 8px; color: #f87171;">
                            ${entry.monster_kills}
                        </td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            `;

            contentDiv.innerHTML = html;
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            contentDiv.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #f87171;">
                    Failed to load leaderboard. Please try again later.
                </div>
            `;
        }
    }

    public dispose(): void {
        this.stopAutoUpdate();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

