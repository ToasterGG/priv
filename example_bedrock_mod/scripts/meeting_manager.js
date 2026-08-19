// example_bedrock_mod/scripts/meeting_manager.js
// Meeting / voting manager using stable @minecraft/server APIs
// Usage:
//  - Run /function example_bedrock_mod:meeting to start (this tags all players with `meetingStart` which the script detects),
//    OR any player can type `!meeting` in chat to start it.
// Behavior summary:
//  - Starts a 60s meeting timer (scoreboard 'meetingtimer') shown in the actionbar while 60 > timer > 0.
//  - When timer reaches 0: shows title "VOTE" and subtitle "say a username in chat to vote them"; creates scoreboards 'votes' and 'voted' and a 15s votetimer.
//  - During the 15s voting window, players vote by saying an eligible player's username in chat (case-insensitive).
//    A successful vote increments target's 'votes' score and marks the voter in 'voted' so they cannot vote again.
//    Invalid names cause a private whisper asking to vote again.
//  - After votetimer expires, the player with the highest votes (unique) is killed; ties do nothing.
//  - All created scoreboards are removed and internal state reset so the meeting can be started again.

import { world, system } from "@minecraft/server";

const overworld = world.getDimension("overworld");

let meetingState = {
  active: false,
  timer: 0,
  voteActive: false,
  voteTimer: 0,
  votes: new Map(), // targetName -> count
  voted: new Set(), // voterName
  chatSubscription: null
};

// Helper to run commands (returns Promise)
function runCmd(cmd) {
  try {
    return overworld.runCommandAsync(cmd);
  } catch (e) {
    // best-effort: ignore
    console.error("runCmd failed", cmd, e);
    return Promise.resolve({ statusCode: -1 });
  }
}

async function ensureObjectives() {
  // create objectives if they don't exist (ignore errors)
  await runCmd("scoreboard objectives add meetingtimer dummy").catch(() => {});
  await runCmd("scoreboard objectives add votes dummy").catch(() => {});
  await runCmd("scoreboard objectives add voted dummy").catch(() => {});
}

function broadcastActionbar(text) {
  // show actionbar to all players
  overworld.runCommandAsync(`title @a actionbar ${JSON.stringify(text)}`);
}

async function startMeeting() {
  if (meetingState.active) return; // already running
  meetingState.active = true;
  meetingState.timer = 60;
  meetingState.voteActive = false;
  meetingState.voteTimer = 0;
  meetingState.votes = new Map();
  meetingState.voted = new Set();

  await ensureObjectives();
  // set scoreboard meetingtimer to 60 on a fake player name __meeting_timer
  await runCmd(`scoreboard players set __meeting_timer meetingtimer ${meetingState.timer}`).catch(() => {});

  // Announce
  overworld.runCommandAsync('tellraw @a {"rawtext":[{"text":"Meeting started: 60s until vote begins."}]}');

  // Start the 1s tick loop (uses system.runInterval)
  const intervalId = system.runInterval(() => {
    if (!meetingState.active) return;

    if (!meetingState.voteActive) {
      // Meeting countdown
      meetingState.timer -= 1;
      if (meetingState.timer < 0) meetingState.timer = 0;
      // update scoreboard
      overworld.runCommandAsync(`scoreboard players set __meeting_timer meetingtimer ${meetingState.timer}`);

      // show actionbar when 60 >= timer > 0
      if (meetingState.timer > 0 && meetingState.timer <= 60) {
        broadcastActionbar(`Meeting starts in: ${meetingState.timer}s`);
      } else {
        // hide actionbar by sending empty
        broadcastActionbar("");
      }

      if (meetingState.timer === 0) {
        // move to voting phase
        meetingState.voteActive = true;
        meetingState.voteTimer = 15;
        // create/reset votes and voted objectives
        overworld.runCommandAsync('scoreboard objectives add votes dummy').catch(() => {});
        overworld.runCommandAsync('scoreboard objectives add voted dummy').catch(() => {});
        // reset any previous scores
        overworld.runCommandAsync('scoreboard players reset @a votes').catch(() => {});
        overworld.runCommandAsync('scoreboard players reset @a voted').catch(() => {});

        // Show titles for vote
        overworld.runCommandAsync('title @a title \"VOTE\"');
        overworld.runCommandAsync('title @a subtitle \"Say a username in chat to vote them\"');

        // subscribe to chat for votes
        meetingState.chatSubscription = world.events.beforeChat.subscribe(handleChatForVote);
      }
    } else {
      // Voting countdown
      meetingState.voteTimer -= 1;
      if (meetingState.voteTimer < 0) meetingState.voteTimer = 0;
      // show votetimer in actionbar for players who haven't voted yet
      broadcastActionbar(`Vote time left: ${meetingState.voteTimer}s`);

      if (meetingState.voteTimer === 0) {
        // End voting
        // Unsubscribe chat
        if (meetingState.chatSubscription) {
          meetingState.chatSubscription.unsubscribe();
          meetingState.chatSubscription = null;
        }

        // Determine winner
        let maxVotes = 0;
        let winners = [];
        for (const [name, count] of meetingState.votes.entries()) {
          if (count > maxVotes) {
            maxVotes = count;
            winners = [name];
          } else if (count === maxVotes) {
            winners.push(name);
          }
        }

        if (maxVotes > 0 && winners.length === 1) {
          const victimName = winners[0];
          // kill the player with that name (exact match)
          // Use execute to ensure proper selection by name
          overworld.runCommandAsync(`kill \"${victimName}\"`).catch(() => {});
          overworld.runCommandAsync(`tellraw @a {\"rawtext\":[{\"text\":\"${victimName} has been voted out (votes: ${maxVotes})\"}]}`).catch(() => {});
        } else {
          overworld.runCommandAsync('tellraw @a {"rawtext":[{"text":"Voting ended: no unique highest vote — no action taken."}]}').catch(() => {});
        }

        // Cleanup objectives
        overworld.runCommandAsync('scoreboard objectives remove meetingtimer').catch(() => {});
        overworld.runCommandAsync('scoreboard objectives remove votes').catch(() => {});
        overworld.runCommandAsync('scoreboard objectives remove voted').catch(() => {});

        // Reset state
        meetingState.active = false;
        meetingState.voteActive = false;
        meetingState.timer = 0;
        meetingState.voteTimer = 0;
        meetingState.votes.clear();
        meetingState.voted.clear();

        // Stop the interval
        system.clearRun(intervalId);
      }
    }
  }, 20); // 20 ticks = approx 1 second
}

function handleChatForVote(chatEvent) {
  // chatEvent has message and sender
  try {
    const msg = chatEvent.message.trim();
    const sender = chatEvent.sender;

    if (!meetingState.voteActive) return; // ignore if voting not active

    // Cancel the normal chat message from being broadcast
    chatEvent.cancel = true;

    const voterName = sender.nameTag || sender.name;
    if (meetingState.voted.has(voterName)) {
      // tell them they already voted
      sender.runCommandAsync(`tellraw @s {"rawtext":[{"text":"You have already voted and cannot vote again."}]}`);
      return;
    }

    // Find eligible player by name (case-insensitive exact match)
    const lower = msg.toLowerCase();
    const players = world.getPlayers();
    let found = null;
    for (const p of players) {
      const pname = (p.nameTag || p.name).toString();
      if (pname.toLowerCase() === lower) {
        found = p;
        break;
      }
    }

    if (!found) {
      // invalid name
      sender.runCommandAsync(`tellraw @s {"rawtext":[{"text":"Invalid name. Please vote again with an eligible username."}]}`);
      return;
    }

    const targetName = (found.nameTag || found.name).toString();

    // Record vote
    const prev = meetingState.votes.get(targetName) || 0;
    meetingState.votes.set(targetName, prev + 1);

    // mark in scoreboard and voted
    overworld.runCommandAsync(`scoreboard players add "${targetName}" votes 1`).catch(() => {});
    overworld.runCommandAsync(`scoreboard players set "${voterName}" voted 1`).catch(() => {});

    meetingState.voted.add(voterName);

    // Confirm to voter
    sender.runCommandAsync(`tellraw @s {"rawtext":[{"text":"Vote recorded for ${targetName}."}]}`);
  } catch (e) {
    console.error("Error handling vote chat event", e);
  }
}

// Allow starting meeting via chat command '!meeting' or by tagging players with 'meetingStart' via the /function (see functions/meeting.mcfunction)
world.events.beforeChat.subscribe((ev) => {
  try {
    const txt = ev.message.trim();
    const sender = ev.sender;
    if (txt === "!meeting") {
      ev.cancel = true; // consume the command chat
      // only start if not active
      if (!meetingState.active) {
        startMeeting();
      } else {
        sender.runCommandAsync(`tellraw @s {"rawtext":[{"text":"A meeting is already in progress."}]}`);
      }
    }
  } catch (e) {
    console.error(e);
  }
});

// Poll for meetingStart tag (set by /function example_bedrock_mod:meeting). If found, start meeting and remove tags.
system.runInterval(() => {
  try {
    if (meetingState.active) return;
    const players = world.getPlayers();
    for (const p of players) {
      if (p.hasTag && p.hasTag('meetingStart')) {
        // remove the tag and start meeting
        try { p.removeTag('meetingStart'); } catch {}
        startMeeting();
        break;
      }
    }
  } catch (e) { console.error(e); }
}, 10 * 20); // check every 10 seconds (20 ticks = ~1s)

console.log('Meeting manager loaded');
