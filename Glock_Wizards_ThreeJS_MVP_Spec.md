# Glock Wizards — 3D Web MVP (Three.js)

**Goal:** Stand-alone browser demo that proves the core loop: survive waves → brief downtime → pick a boon at a shrine → optional mini-boss → extract or wipe.  
**Target runtime:** Desktop Chrome/Edge (WebGL2), 60 FPS on mid-range laptop iGPU.

---

## 0) Scope & Non-Goals

**MVP must-have**
- 1 arena map (flat + simple cover) with **hand-placed spawn points**.
- **Single-player** (local) with first-person controls and one **primary weapon** archetype.
- **Two enemy types** (Grunt “Sporeling” melee, Ranged “Stalker”) + **1 mini-boss**.
- **Wave system** with standard ramp; **downtime (25s)** between waves.
- **Shrines**: activate **2 deities** per downtime; **pick 1 boon** (slot-based override).
- **Currencies**:  
  - **Essence** (personal, common) → boons/forges  
  - **Fairy Dust** (personal, rare) → high-tier offers (also converts to “ingredient cache” on extract, placeholder message only)
- **UI overlays**: health/shield, ammo/mana, wave timer, downtime/Shrine picker.
- **Config-driven** (JSON) for enemies, waves, boons, spawns.

**Nice-to-have (time-boxed)**
- Neutral **Forge** (simple +DMG / +HP).
- One **round modifier** (Fog: post-FX and enemy vision reduced).
- One **optional boss gate** (portal spawns after Wave 10 → simple arena fight).

**Non-goals (defer)**
- Networking/co-op; hub meta; cosmetics; full deity roster; save persistence; complex physics; inventory UI.

---

## 1) Tech Stack

- **three** (r146+) + **three-stdlib** (PointerLockControls, GLTFLoader)
- **Vite** + **TypeScript** + **ESM**
- **State management**: light **event bus** (pub/sub)
- **Pathfinding**: **three-pathfinding** (Recast navmesh) **or** simple steering to the player (start simple; switchable via flag)
- **Collision**: capsule vs. scene AABBs (no heavy physics)
- **UI**: HTML/CSS overlay (no DOM frameworks)
- **Math/noise**: `seedrandom` for seeded RNG

**Scripts**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

---

## 2) Repo Layout

```
/src
  /app
    main.ts                 // boot, game loop
    App.ts                  // orchestrator
    EventBus.ts             // typed pub/sub
  /core
    Time.ts                 // fixed-step update
    RNG.ts                  // seeded rng
    Input.ts                // pointer lock + keys
    CameraRig.ts            // FPS rig
    Health.ts               // damage/shield pipeline
    Effects.ts              // hit flashes, post-FX toggles
  /game
    GameState.ts            // Boot, InWave, Downtime, MiniBoss, Boss, Extract, Wipe
    World.ts                // scene + object registry
    Player.ts               // movement/shoot/shields/mana
    Weapon.ts               // archetype + firing
    Spellbook.ts            // cooldown abilities (stub)
    Enemy.ts                // base + Sporeling, Stalker, MiniBoss
    WaveManager.ts
    SpawnManager.ts
    ShrineManager.ts
    Economy.ts              // Essence, FairyDust balances
    UI.ts                   // HUD, timers, shrine picker
  /assets
    models/ (placeholders or GLB)
    textures/
    navmesh/ (JSON)
  /config
    enemies.json
    waves.json
    spawns.json
    deities.json
    boons.json
    upgrades.json          // neutral forge
```

---

## 3) Game Loop & States

```text
[Boot] → [InWave] → [WaveClear] → [Downtime (25s)] → (Shrine pick) → [InWave] ...
                  ↘ (every 4–6 waves) [MiniBoss]
After Wave 10 → [BossEligible] → (optional) [BossFight] → [Continue or Extract]
On team (player) death → [Wipe] → [Summary]
On extract → convert leftover Fairy Dust → “Ingredient Cache” (message)
```

**State transitions (events)**
- `wave/start`, `wave/clear`, `downtime/start`, `downtime/end`
- `shrine/offer`, `boon/selected`
- `enemy/miniboss/spawned`, `enemy/boss/spawned`, `player/dead`, `run/extract`

---

## 4) Systems (APIs & Behaviors)

### 4.1 EventBus
```ts
type EventMap = {
  "wave/start": { index: number; seed: string };
  "wave/clear": {};
  "downtime/start": { duration: number; activeDeities: string[] };
  "downtime/end": {};
  "currency/change": { essence: number; fairy: number };
  "boon/selected": { deity: string; boonId: string; slot: "weapon"|"utility"|"defense"|"passive"|"ultimate" };
  "player/hurt": { amount: number };
  "player/dead": {};
};
export class EventBus<E extends Record<string, any>> {
  on<K extends keyof E>(evt: K, cb: (p: E[K])=>void): void; off<K extends keyof E>(evt: K, cb: (p: E[K])=>void): void;
  emit<K extends keyof E>(evt: K, payload: E[K]): void;
}
```

### 4.2 WaveManager
Responsibilities:
- Linear **budget** growth; **maxAlive** cap; **modifier** chance (10%).
- Emits `wave/start` and `wave/clear`.

Config excerpt (`waves.json`):
```json
{
  "startIndex": 1,
  "baseBudget": 20,
  "budgetPerWave": 12,
  "maxAliveBase": 6,
  "maxAlivePerWave": 1.5,
  "modifierChance": 0.1,
  "miniBossEvery": [4,6],
  "bossThresholds": [10,15,20]
}
```

Pseudocode:
```ts
startWave(i){
  const budget = cfg.baseBudget + cfg.budgetPerWave * (i-1);
  maxAlive = Math.min(cfg.maxAliveBase + cfg.maxAlivePerWave*(i-1), 24);
  bus.emit("wave/start", { index:i, seed:RNG.seedFor("wave"+i) });
}
onEnemyKilled(cost){ spent += cost; if (spent >= budget && alive==0) bus.emit("wave/clear",{}); }
```

### 4.3 SpawnManager
- Uses **hand-placed spawn points** (see `spawns.json`) with tags and cooldowns.
- **Proximity activation** (35–55m), **safety bubble** (12–15m), basic LoS check.
- Spawns **batches of 3–5**, per-point cooldown 10–20s.

`spawns.json`:
```json
[
  {"id":"SP_A1","pos":[-10,0,30],"tags":["base"],"cooldown":12},
  {"id":"SP_A2","pos":[15,0,-25],"tags":["base"]},
  {"id":"SP_EL1","pos":[0,0,45],"tags":["elite"]}
]
```

Selection sketch:
```ts
function eligiblePoints(playerPos){ /* distance window, not in no-spawn radius, LoS ok */ }
function spawnBatch(pool){ /* pick point -> instantiate enemy -> mark cooldown */ }
```

### 4.4 Enemies
- **Sporeling (melee)**: HP 40, Dmg 6, Speed 2.2 m/s; cost 1
- **Stalker (ranged)**: HP 35, Dmg 4 (projectile), Speed 2.0 m/s; cost 2
- **Mini-Boss (Bulwark)**: HP 600, Slow aura, Ground slam; cost 20

`enemies.json`:
```json
{
  "sporeling": {"hp":40,"speed":2.2,"cost":1,"ai":"meleeChase"},
  "stalker":   {"hp":35,"speed":2.0,"cost":2,"ai":"rangedKite","proj":{"speed":8,"cooldown":1.4}},
  "bulwark":   {"hp":600,"speed":1.4,"cost":20,"ai":"miniboss","abilities":["slam","slowAura"]}
}
```

AI (simple first):
- **Chase**: move toward player; attack if < 1.5m
- **Ranged**: keep 8–12m distance; fire projectile cone
- **MiniBoss**: periodic AoE; telegraphed wind-up

### 4.5 Player, Camera & Input
- **PointerLockControls** + WASD + Space (jump) + Shift (dash) + R (reload)
- **HUD**: HP, Shield, Ammo, Essence, Fairy Dust, Wave timer
- **Capsule** collision vs. floor & simple AABB props
- **Movement speeds**: walk 5 m/s, dash 8 m/s (0.35s), jump 1.2m

### 4.6 Weapon & Spell
**MVP**: One **Wand** (fast semi-auto)
- Damage 10, fire rate 5/s, mag 20, reload 1.6s, recoil light
- Alt ability (spell): **Arc Burst** — short cone push (CD 12s), costs mana

`Weapon.ts` interface:
```ts
interface WeaponStats { dmg:number; rpm:number; mag:number; reload:number; projectileSpeed:number; }
class Weapon {
  fire(dir:THREE.Vector3) : void;
  reload(): void;
  applyModifier(mod: Partial<WeaponStats>): void; // for boons
}
```

### 4.7 Damage & Elements
- Damage pipeline: `base -> element mods -> crit (if any) -> shield/HP`
- Elements active in MVP: **Fire** (DoT 2s), **Decay** (lifesteal 10% of dmg)
- Status VFX hooks

### 4.8 Economy
- **On kill**: +Essence (1–3); **% chance** for **Fairy Dust** (base 5%; + on mini-boss)
- Essence = auto pickup; Fairy Dust = explicit pickup sphere

```ts
class Economy {
  addEssence(n:number); addFairy(n:number);
  canAfford(cost:{essence?:number; fairy?:number}): boolean;
  spend(cost:Cost): boolean;
}
```

### 4.9 Shrines & Boons
- **2 Deities** in MVP: **Azelor (Fire/Offense)**, **Velune (Team/Mycelium)**.
- **Downtime**: 25s; ShrineManager announces active shrines; player walks to a shrine and picks **1 of 2** rolled boons (per deity).
- **Slot override**: picking a boon for a slot replaces previous deity boon in that slot.

`deities.json`:
```json
{
  "Azelor":{"domain":"fire","slots":["weapon","passive"]},
  "Velune":{"domain":"mycelium","slots":["defense","utility"]}
}
```

`boons.json` (subset):
```json
[
  {"id":"az_weapon_ignite","deity":"Azelor","slot":"weapon","rarity":"rare",
   "cost":{"essence":60},"effect":{"weapon":{"dmg":"+20%"},"element":"fire"}},
  {"id":"vel_defense_sporeGuard","deity":"Velune","slot":"defense","rarity":"rare",
   "cost":{"essence":50},"effect":{"shield":{"max":"+25%","rechargeRate":"+20%"}}}
]
```

UI flow:
- On `downtime/start` → show “Shrines active: Azelor, Velune”
- At shrine trigger → modal with 2 cards (rolled by seed), show cost and stat deltas

### 4.10 Forge (neutral upgrades) — optional
`upgrades.json`:
```json
[
  {"id":"u_dmg_1","cat":"offense","rarity":"common","cost":{"essence":40}, "delta":{"weapon":{"dmg":"+10%"}}},
  {"id":"u_hp_1","cat":"defense","rarity":"common","cost":{"essence":40}, "delta":{"hp":{"max":"+10%"}}}
]
```

---

## 5) Arena & Assets

**Map**: 50×50m square, low walls/rocks, 6–8 spawn points around perimeter.  
**Materials**: flat/toon shading; ambient biolum glow planes for “fungal” mood.  
**Placeholders**:
- Player weapon: simple `CylinderGeometry` + emissive tip
- Sporeling: `CapsuleGeometry` + greenish toon material
- Stalker: `BoxGeometry` + purple eye billboard
- Mini-boss: scaled capsule + spikes (instanced cones)
- Shrine: hex pedestal with rotating rune plane

---

## 6) Config Examples

### 6.1 Wave Composition (simple)
```json
{
  "waves": [
    {"index":1, "composition":[["sporeling",12]], "maxAlive":8},
    {"index":2, "composition":[["sporeling",16]], "maxAlive":10},
    {"index":3, "composition":[["sporeling",16],["stalker",6]], "maxAlive":12},
    {"index":4, "composition":[["sporeling",18],["stalker",8]], "maxAlive":14, "miniboss":false},
    {"index":5, "composition":[["sporeling",20],["stalker",10]],"maxAlive":16, "miniboss":true}
  ]
}
```

### 6.2 Shrine Offer Roll
```ts
// deterministic by downtime seed
function rollBoons(deityId:string, seed:string): Boon[] {
  RNG.seed(seed+deityId);
  return pickTwo(weightedBoonsFor(deityId));
}
```

---

## 7) Update Order (per frame)

```
Time.step(dt_fixed=1/60)
Input.poll()
Player.update()
Enemy.updateAll()
SpawnManager.tick()
WaveManager.tick()
ShrineManager.tick()
Economy.tickFloatingText() // optional
FX.update()
UI.update()
Renderer.render(scene, camera)
```

---

## 8) Controls & UX

- **LMB**: Fire
- **RMB**: Spell (Arc Burst)
- **R**: Reload
- **Shift**: Dash
- **F**: Interact (Shrine/Forge/Portal)
- **Tab**: Toggle metrics (FPS, wave, balances)

---

## 9) Build & Run

1. `npm create vite@latest glock-wizards -- --template vanilla-ts`
2. `npm i three three-stdlib three-pathfinding seedrandom`
3. Copy `/src` & `/config` layout above; add assets (or use primitives).
4. `npm run dev` → http://localhost:5173

---

## 10) Success Criteria (Demo)

- Player can move/shoot; enemies spawn in waves; wave clears when budget exhausted.  
- Downtime starts; **2 shrines** illuminate; player picks **1 boon**; stats change visibly.  
- Essence/Fairy Dust balances update from kills and pickups.  
- After Wave 5, **mini-boss** spawns once; killing it drops bonus Fairy Dust.  
- Optional: Interacting with portal at Wave 10 starts a boss arena (simple).

---

## 11) Performance Budget

- Draw calls < 300; triangles < 300k.  
- No dynamic shadows in MVP (baked/hemisphere + emissive planes).  
- GPU post-FX: toggleable Fog only.

---

## 12) Implementation Sketches

### 12.1 App bootstrap
```ts
// src/app/main.ts
import { App } from "./App";
new App(document.getElementById("app")!);
```

```ts
// src/app/App.ts
export class App {
  constructor(container:HTMLElement){
    // init renderer, scene, camera, controls
    // load config jsons
    // create World, WaveManager, ShrineManager, UI
    // gameloop: requestAnimationFrame(this.tick)
  }
}
```

### 12.2 Player fire → hit test
```ts
// simple hitscan along camera forward
fire(){
  const ray = new THREE.Raycaster(cam.position, cam.getWorldDirection(new V3()), 0, 60);
  const hits = ray.intersectObjects(world.enemyMeshes, true);
  if (hits[0]) enemies.applyDamage(hits[0].object, weapon.stats.dmg, "fire?"); // element mod
}
```

### 12.3 Enemy chase (no navmesh first)
```ts
updateEnemy(e){
  const dir = tmp.copy(player.pos).sub(e.pos).setY(0).normalize();
  e.vel.lerp(dir.multiplyScalar(e.speed), 0.3); // damped
  e.pos.addScaledVector(e.vel, dt);
  if (dist(e,player) < 1.5 && e.atkCD<=0){ player.hurt(e.dmg); e.atkCD = 1.0; }
}
```

### 12.4 Shrine interaction → boon apply
```ts
interactShrine(id){
  const offers = shrine.rollOffers(id); // 2 cards
  ui.showBoonPicker(offers, (boon)=> {
    if (!economy.spend(boon.cost)) return;
    applyBoon(boon);
    bus.emit("boon/selected", { deity: boon.deity, boonId: boon.id, slot: boon.slot });
  });
}
function applyBoon(b:Boon){
  if (b.slot === "weapon") weapon.applyModifier(b.effect.weapon);
  if (b.slot === "defense") player.shield.apply(b.effect.shield);
  // ...
}
```

---

## 13) Tuning Defaults

- **Downtime**: 25s (UI countdown)  
- **Active shrines per downtime**: exactly **2** in MVP (Azelor, Velune)  
- **Mini-boss cadence**: fixed at Wave 5 (demo), then Wave 10  
- **Fairy Dust** drop: base 5%, mini-boss: +40%

---

## 14) Visual Direction (MVP implementation notes)

- **Low-poly realism**: flat/toon materials, warm rim light, emissive mushrooms.
- **Color cues**:  
  - Azelor fire VFX = orange/gold;  
  - Velune mycelial shields = green/teal spores.
- **Shrine** glow color = deity color; rune plane billboard with subtle pulse.

---

## 15) Milestones

**M1 (Day 1-2):** Project scaffold, scene, FPS controls, HUD shell  
**M2 (Day 3-4):** Enemy base + Sporeling + simple spawner; hitscan weapon  
**M3 (Day 5-6):** WaveManager + downtime + shrine activation logic  
**M4 (Day 7-8):** Boon picker UI, stat modifiers, Essence/Fairy Dust pickups  
**M5 (Day 9-10):** Stalker ranged AI, mini-boss, tuning pass  
**M6 (Day 11-12):** Fog modifier toggle, polish VFX, extract/wipe end flow

---

## 16) QA Checklist

- Player cannot get stuck in geometry (capsule step offset ~0.3m)  
- Spawn points never within 12–15m safety bubble  
- Downtime always fires after last enemy dies; shrine UI closes on timeout  
- Boon slot override works (weapon slot changes stats back/forth)  
- FPS > 55 on mid-range laptop (post-FX off)

---

## 17) Future Hooks (post-MVP)

- Switch enemy steering to **three-pathfinding** with a navmesh  
- Add **Forge** neutral upgrades; **Mycelium Thread** team currency (stub)  
- Expand deity roster and slot interactions (override conflicts/duos)  
- Multiplayer: server-auth tick + client prediction

---

## 18) Credits / Licensing (placeholders)

- Use **procedural primitives** for MVP models; no external art required.  
- If you import GLB placeholders, prefer public domain (CC0) assets and record sources in `/assets/CREDITS.md`.

---

### Appendix A — Minimal Config Files

**`/config/deities.json`**
```json
{
  "Azelor": { "color":"#ff7a00", "slots":["weapon","passive"] },
  "Velune": { "color":"#21c48d", "slots":["defense","utility"] }
}
```

**`/config/boons.json`** (fuller sample)
```json
[
  {"id":"az_weapon_ignite","deity":"Azelor","slot":"weapon","rarity":"rare","cost":{"essence":60},
   "effect":{"weapon":{"dmg":"+20%","rpm":"+10%"},"element":"fire"}},
  {"id":"az_passive_blaze","deity":"Azelor","slot":"passive","rarity":"uncommon","cost":{"essence":40},
   "effect":{"passive":{"killMoveSpeed":"+10%","dotBoost":"+25%"}}},
  {"id":"ve_defense_sporeGuard","deity":"Velune","slot":"defense","rarity":"rare","cost":{"essence":50},
   "effect":{"shield":{"max":"+25%","rechargeRate":"+20%","rechargeDelay":"-20%"}}},
  {"id":"ve_utility_threadPulse","deity":"Velune","slot":"utility","rarity":"uncommon","cost":{"essence":35},
   "effect":{"utility":{"reviveShield":"+50","auraRegen":"+1.5/s"}}}
]
```

**`/config/enemies.json`**
```json
{
  "sporeling": {"hp":40,"dmg":6,"speed":2.2,"cost":1,"ai":"melee"},
  "stalker":   {"hp":35,"dmg":4,"speed":2.0,"cost":2,"ai":"ranged","proj":{"speed":8,"cooldown":1.4}},
  "bulwark":   {"hp":600,"dmg":12,"speed":1.4,"cost":20,"ai":"miniboss"}
}
```

**`/config/waves.json`**
```json
{"baseBudget":20,"budgetPerWave":12,"maxAliveBase":6,"maxAlivePerWave":1.5,"modifierChance":0.1,
 "waves":[
   {"index":1,"composition":[["sporeling",12]],"maxAlive":8},
   {"index":2,"composition":[["sporeling",16]],"maxAlive":10},
   {"index":3,"composition":[["sporeling",16],["stalker",6]],"maxAlive":12},
   {"index":4,"composition":[["sporeling",18],["stalker",8]],"maxAlive":14},
   {"index":5,"composition":[["sporeling",20],["stalker",10]],"maxAlive":16,"miniboss":true}
 ]}
```

**`/config/spawns.json`**
```json
[
  {"id":"A1","pos":[-20,0,15],"tags":["base"],"cooldown":12},
  {"id":"A2","pos":[ 25,0,-10],"tags":["base"],"cooldown":12},
  {"id":"A3","pos":[  0,0, 28],"tags":["base"],"cooldown":12},
  {"id":"EL1","pos":[-30,0,-25],"tags":["elite"],"cooldown":18}
]
```
