export enum GameStateType {
  Boot = 'Boot',
  InWave = 'InWave',
  WaveClear = 'WaveClear',
  Downtime = 'Downtime',
  MiniBoss = 'MiniBoss',
  BossEligible = 'BossEligible',
  BossFight = 'BossFight',
  Extract = 'Extract',
  Wipe = 'Wipe',
  Summary = 'Summary'
}

export class GameState {
  private currentState: GameStateType = GameStateType.Boot;

  getState(): GameStateType {
    return this.currentState;
  }

  setState(newState: GameStateType): void {
    this.currentState = newState;
  }

  isInWave(): boolean {
    return this.currentState === GameStateType.InWave;
  }

  isDowntime(): boolean {
    return this.currentState === GameStateType.Downtime;
  }

  isBossFight(): boolean {
    return this.currentState === GameStateType.BossFight;
  }
}

