// example_bedrock_mod/scripts/main.js
// Minimal Bedrock scripting API example module
import { world, system } from "@minecraft/server";

system.run(() => {
  try {
    world.say("Example Bedrock Mod loaded.");
  } catch (err) {
    // In some runtimes world.say may not be available; log to console
    console.error("Example Bedrock Mod loaded (console):", err?.message ?? err);
  }
});

// Tick event example: runs every tick, keep light-weight
world.events.tick.subscribe(() => {
  // placeholder for mod logic
});
