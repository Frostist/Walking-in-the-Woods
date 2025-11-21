type EventMap = {
  "wave/start": { index: number; seed: string };
  "wave/clear": {};
  "downtime/start": { duration: number; activeDeities: string[] };
  "downtime/end": {};
  "currency/change": { essence: number; fairy: number };
  "boon/selected": { deity: string; boonId: string; slot: "weapon" | "utility" | "defense" | "passive" | "ultimate" };
  "player/hurt": { amount: number };
  "player/dead": {};
  "enemy/miniboss/spawned": {};
  "enemy/boss/spawned": {};
  "run/extract": {};
};

export class EventBus<E extends Record<string, any>> {
  private listeners: Map<keyof E, Array<(payload: any) => void>> = new Map();

  on<K extends keyof E>(evt: K, cb: (p: E[K]) => void): void {
    if (!this.listeners.has(evt)) {
      this.listeners.set(evt, []);
    }
    this.listeners.get(evt)!.push(cb);
  }

  off<K extends keyof E>(evt: K, cb: (p: E[K]) => void): void {
    const handlers = this.listeners.get(evt);
    if (handlers) {
      const index = handlers.indexOf(cb);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emit<K extends keyof E>(evt: K, payload: E[K]): void {
    const handlers = this.listeners.get(evt);
    if (handlers) {
      handlers.forEach(cb => cb(payload));
    }
  }
}

export const eventBus = new EventBus<EventMap>();

