# Example Bedrock Mod — Meeting

This scaffold implements an in-world "meeting" mechanic (countdown + voting) using the stable Bedrock scripting API.

How to start
- Use the function: /function example_bedrock_mod:meeting — this tags all players with 'meetingStart' and the script will start the meeting.
- Or let any player type !meeting in chat to start it.

Notes and limitations
- Uses @minecraft/server scripting API (stable). The script listens to chat during the voting window and will capture/handle chat messages used as votes.
- The script attempts to show an actionbar and titles using vanilla commands. Closing arbitrary client UI is not supported by vanilla commands; the script shows titles which will display prominently.
- After voting completes the created scoreboards are removed so the function can be run again.

Files of interest
- scripts/meeting_manager.js — main implementation
- functions/meeting.mcfunction — server-side function to request a meeting
