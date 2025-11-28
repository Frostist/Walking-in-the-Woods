/**
 * Feature Flags
 * 
 * Control which features are enabled or disabled in the game.
 * Set flags to true to enable features, false to disable them.
 */
export class FeatureFlags {
    /**
     * Enable or disable the monster that chases the player at night
     * - true: Monster will spawn and chase player during night
     * - false: No monster will spawn
     */
    public static readonly MONSTER_ENABLED: boolean = true;
}

