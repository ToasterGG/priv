# Start meeting function
# Usage: /function example_bedrock_mod:meeting
# This function tags all players with 'meetingStart' — the scripting module detects it and begins the meeting.
tag @a add meetingStart
tellraw @a {"rawtext":[{"text":"Meeting requested — starting shortly."}]}
