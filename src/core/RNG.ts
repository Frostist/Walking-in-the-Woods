import seedrandom from 'seedrandom';

export class RNG {
  private static rng: seedrandom.PRNG | null = null;

  static seed(seed: string): void {
    RNG.rng = seedrandom(seed);
  }

  static seedFor(key: string): string {
    return `${Date.now()}_${key}`;
  }

  static random(): number {
    if (!RNG.rng) {
      RNG.seed(RNG.seedFor('default'));
    }
    return RNG.rng!();
  }

  static randomInt(min: number, max: number): number {
    return Math.floor(RNG.random() * (max - min + 1)) + min;
  }

  static randomFloat(min: number, max: number): number {
    return RNG.random() * (max - min) + min;
  }

  static choice<T>(array: T[]): T {
    return array[RNG.randomInt(0, array.length - 1)];
  }

  static weightedChoice<T>(items: Array<{ item: T; weight: number }>): T {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = RNG.random() * totalWeight;

    for (const { item, weight } of items) {
      random -= weight;
      if (random <= 0) {
        return item;
      }
    }

    return items[items.length - 1].item;
  }
}

