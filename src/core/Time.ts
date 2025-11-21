export class Time {
  private static fixedDeltaTime = 1 / 60; // 60 FPS
  private static accumulated = 0;
  private static lastTime = 0;

  static step(_deltaTime: number): number {
    const now = performance.now() / 1000;
    if (Time.lastTime === 0) {
      Time.lastTime = now;
      return Time.fixedDeltaTime;
    }

    const frameTime = now - Time.lastTime;
    Time.lastTime = now;
    Time.accumulated += Math.min(frameTime, 0.25); // Cap at 250ms

    if (Time.accumulated >= Time.fixedDeltaTime) {
      Time.accumulated -= Time.fixedDeltaTime;
      return Time.fixedDeltaTime;
    }

    return 0; // No update this frame
  }

  static getFixedDeltaTime(): number {
    return Time.fixedDeltaTime;
  }
}

