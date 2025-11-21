import { eventBus } from '../app/EventBus';

export interface Cost {
  essence?: number;
  fairy?: number;
}

export class Economy {
  private essence: number = 0;
  private fairyDust: number = 0;

  addEssence(amount: number): void {
    this.essence += amount;
    this.notifyChange();
  }

  addFairy(amount: number): void {
    this.fairyDust += amount;
    this.notifyChange();
  }

  canAfford(cost: Cost): boolean {
    if (cost.essence && this.essence < cost.essence) return false;
    if (cost.fairy && this.fairyDust < cost.fairy) return false;
    return true;
  }

  spend(cost: Cost): boolean {
    if (!this.canAfford(cost)) return false;
    
    if (cost.essence) this.essence -= cost.essence;
    if (cost.fairy) this.fairyDust -= cost.fairy;
    
    this.notifyChange();
    return true;
  }

  getEssence(): number {
    return this.essence;
  }

  getFairyDust(): number {
    return this.fairyDust;
  }

  private notifyChange(): void {
    eventBus.emit('currency/change', {
      essence: this.essence,
      fairy: this.fairyDust
    });
  }
}

