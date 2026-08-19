# Example Bedrock Mod — Clean Slate

This folder is an empty scaffold. No scripting modules are registered in manifest.json and scripts/main.js contains no runtime code. Use this as a starting point for new behavior pack development.

Installation
1. Copy the `example_bedrock_mod` folder into your Minecraft behavior_packs directory for your platform.
2. Add the behavior pack to a world and start the world. Since manifest.json has no scripting modules, no code will run.

Notes
- Update `manifest.json` to register a scripting module and provide dependencies when you're ready to add runtime code.
- Change the UUIDs in manifest.json when you install multiple copies of this pack in the same world.
