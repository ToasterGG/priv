import { world, system } from "@minecraft/server";

// ─── Constants ──────────────────────────────────────────────────────────

const MOVEMENT_TAGS = ["Sneaking", "Sprinting", "Walking", "Idle"];

// Pre-build the full health tag list for fast lookup/cleanup
const HEALTH_TAGS = [];
for (let i = 1; i <= 20; i++) HEALTH_TAGS.push(`Health${i}`);
HEALTH_TAGS.push("Health21+");

// ─── Respawn Detection ───────────────────────────────────────────────────────
// playerSpawn fires on BOTH initial join and respawn.
// The event exposes `initialSpawn: boolean` — false means the player just died.

world.afterEvents.playerSpawn.subscribe((event) => {
  const { player, initialSpawn } = event;
  if (initialSpawn) return; // skip first join

  // Tag immediately on respawn
  player.addTag("Died");

  // Remove after 20 ticks (~1 second)
  system.runTimeout(() => {
    if (player.isValid()) player.removeTag("Died");
  }, 20);
});

// ─── Per-Tick State Polling ───────────────────────────────────────────────────
// system.runInterval fires every N ticks on all online players.
// We use 1-tick interval for near-instant tag response.

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    updateMovementTags(player);
    updateHealthTags(player);
  }
}, 1);

// ─── Movement Tags ────────────────────────────────────────────────────────
// Priority order: Sneaking > Sprinting > Walking > Idle
// Walking = has velocity but isn't sprinting or sneaking.

function updateMovementTags(player) {
  const sneaking  = player.isSneaking;
  const sprinting = player.isSprinting;

  // Check if the player has any horizontal velocity (XZ plane)
  const vel = player.getVelocity();
  const moving = (vel.x * vel.x + vel.z * vel.z) > 0.0001;

  let activeTag;
  if (sneaking)            activeTag = "Sneaking";
  else if (sprinting)      activeTag = "Sprinting";
  else if (moving)         activeTag = "Walking";
  else                     activeTag = "Idle";

  // Only touch tags that need to change (avoids spamming commands)
  for (const tag of MOVEMENT_TAGS) {
    const has = player.hasTag(tag);
    if (tag === activeTag && !has) player.addTag(tag);
    if (tag !== activeTag && has)  player.removeTag(tag);
  }
}

// ─── Health Tags ─────────────────────────────────────────────────────────
// Reads the player's current health component and syncs one health tag.
// Tags: Health1–Health20 for exact HP, Health21+ for anything above.

function updateHealthTags(player) {
  const hpComp = player.getComponent("minecraft:health");
  if (!hpComp) return;

  const hp = Math.floor(hpComp.currentValue);

  // Determine which tag SHOULD be active
  let activeTag;
  if (hp <= 0)       activeTag = null;          // dead / transitioning
  else if (hp >= 21) activeTag = "Health21+";
  else               activeTag = `Health${hp}`;

  for (const tag of HEALTH_TAGS) {
    const has = player.hasTag(tag);
    if (tag === activeTag && !has) player.addTag(tag);
    if (tag !== activeTag && has)  player.removeTag(tag);
  }
}

// ─── Action Prevention Tags (beforeEvents) ─────────────────────────────────
// These tags silently prevent player actions when manually added.

// CantBreak: Prevents breaking blocks
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  if (event.player.hasTag("CantBreak")) {
    event.cancel = true;
  }
});

// CantPlace: Prevents placing blocks
world.beforeEvents.playerPlaceBlock.subscribe((event) => {
  if (event.player.hasTag("CantPlace")) {
    event.cancel = true;
  }
});

// CantInteract: Prevents interacting with blocks/entities (chests, doors, levers, etc.)
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  if (event.player.hasTag("CantInteract")) {
    event.cancel = true;
  }
});

// CantDamage: Prevents damaging entities (players and mobs)
world.beforeEvents.entityHurt.subscribe((event) => {
  if (event.damageSource.damagingEntity && event.damageSource.damagingEntity.typeId === "minecraft:player") {
    if (event.damageSource.damagingEntity.hasTag("CantDamage")) {
      event.cancel = true;
    }
  }
});

// NoFall: Prevents fall damage
world.beforeEvents.entityHurt.subscribe((event) => {
  if (event.damageSource.cause === "fall" && event.hurtEntity.typeId === "minecraft:player") {
    if (event.hurtEntity.hasTag("NoFall")) {
      event.cancel = true;
    }
  }
});

// NoDrown: Prevents drowning damage
world.beforeEvents.entityHurt.subscribe((event) => {
  if (event.damageSource.cause === "drowning" && event.hurtEntity.typeId === "minecraft:player") {
    if (event.hurtEntity.hasTag("NoDrown")) {
      event.cancel = true;
    }
  }
});
