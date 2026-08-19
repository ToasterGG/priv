# Example Bedrock Mod

This folder is a minimal scaffold for a Minecraft Bedrock behavior pack that uses the scripting API.

Installation
1. Copy the `example_bedrock_mod` folder into your Minecraft behavior_packs directory for your platform.
2. Enable the experimental features required for scripting (in World Settings: Enable "Scripting" / "Enable Game Test Framework" if needed).
3. Add the behavior pack to a world and start the world. The script entry `scripts/main.js` will run automatically.

Notes
- Adjust the UUIDs in manifest.json if you run multiple copies of this pack in the same world.
- This is a scaffold — replace `scripts/main.js` with your mod logic.
