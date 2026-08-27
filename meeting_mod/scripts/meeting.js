// meeting_mod/scripts/meeting.js
// Meeting / voting manager using stable @minecraft/server APIs
// Usage:
//  - Run /function meeting_mod:meeting to start (this tags all players with `meetingStart` which the script detects),
//    OR any player can type `!meeting` in chat to start it.
// Notes:
//  - Titles are set to disappear after 5 seconds using title times (10 100 10) => 0.5s fadeIn, 5s stay, 0.5s fadeOut
//  - Actionbar shows "Voting starts in: Ns" during the countdown

import { world, system } from "@minecraft/server";

const overworld = world.getDimension("overworld");

let meetingState = {
  active: false,
  timer: 0,
  voteActive: false,
  voteTimer: 0,
  votes: new Map(), // targetName -> count
  voted: new Set(), // voterName
  chatSubscription: null,
  intervalId: null
};

// Helper to run commands (returns Promise)
function runCmd(cmd) {
  try {
    return overworld.runCommandAsync(cmd);
  } catch (e) {
    console.error("runCmd failed", cmd, e);
    return Promise.resolve({ statusCode: -1 });
  }
}

async function ensureObjectives() {
  await runCmd("scoreboard objectives add meetingtimer dummy").catch(() => {});
  await runCmd("scoreboard objectives add votes dummy").catch(() => {});
  await runCmd("scoreboard objectives add voted dummy").catch(() => {});
  await runCmd("scoreboard objectives add votetimer dummy").catch(() => {});
}

function broadcastActionbar(text) {
  overworld.runCommandAsync(`title @a actionbar ${JSON.stringify(text)}`).catch(() => {});
}

async function startMeeting() {
  if (meetingState.active) return;
  meetingState.active = true;
  meetingState.timer = 60;
  meetingState.voteActive = false;
  meetingState.voteTimer = 0;
  meetingState.votes = new Map();
  meetingState.voted = new Set();

  console.log("Meeting started!");

  await ensureObjectives();
  await runCmd(`scoreboard players set __meeting_timer meetingtimer ${meetingState.timer}`).catch(() => {});

  overworld.runCommandAsync('tellraw @a {"rawtext":[{"text":"Meeting started: 60s until vote begins."}]}').catch(() => {});

  const intervalId = system.runInterval(() => {
    if (!meetingState.active) return;

    if (!meetingState.voteActive) {
      meetingState.timer -= 1;
      if (meetingState.timer < 0) meetingState.timer = 0;
      overworld.runCommandAsync(`scoreboard players set __meeting_timer meetingtimer ${meetingState.timer}`).catch(() => {});

      if (meetingState.timer > 0 && meetingState.timer <= 60) {
        broadcastActionbar(`Voting starts in: ${meetingState.timer}s`);
      } else {
        broadcastActionbar("");
      }

      if (meetingState.timer === 0) {
        meetingState.voteActive = true;
        meetingState.voteTimer = 15;
        overworld.runCommandAsync('scoreboard objectives add votes dummy').catch(() => {});
        overworld.runCommandAsync('scoreboard objectives add voted dummy').catch(() => {});
        overworld.runCommandAsync('scoreboard players reset @a votes').catch(() => {});
        overworld.runCommandAsync('scoreboard players reset @a voted').catch(() => {});

        // Set title times so titles disappear after ~5s (10 ticks fadeIn, 100 ticks stay, 10 ticks fadeOut)
        overworld.runCommandAsync('title @a times 10 100 10').catch(() => {});
        overworld.runCommandAsync('title @a title "VOTE"').catch(() => {});
        overworld.runCommandAsync('title @a subtitle "Say a username in chat to vote them"').catch(() => {});

        meetingState.chatSubscription = world.events.beforeChat.subscribe(handleChatForVote);
        console.log("Vote phase started!");
      }
    } else {
      meetingState.voteTimer -= 1;
      if (meetingState.voteTimer < 0) meetingState.voteTimer = 0;
      overworld.runCommandAsync(`scoreboard players set __vote_timer votetimer ${meetingState.voteTimer}`).catch(() => {});
      broadcastActionbar(`Vote time left: ${meetingState.voteTimer}s`);

      if (meetingState.voteTimer === 0) {
        if (meetingState.chatSubscription) {
          try { meetingState.chatSubscription.unsubscribe(); } catch (e) {}
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
          overworld.runCommandAsync(`kill "${victimName}"`).catch(() => {});
          overworld.runCommandAsync(`tellraw @a {"rawtext":[{"text":"${victimName} has been voted out (votes: ${maxVotes})"}]}`).catch(() => {});
          console.log(`${victimName} voted out with ${maxVotes} votes`);
        } else if (winners.length > 1) {
          overworld.runCommandAsync('tellraw @a {"rawtext":[{"text":"Voting ended: tie — no action taken."}]}').catch(() => {});
          console.log("Vote tied, no action taken");
        } else {
          overworld.runCommandAsync('tellraw @a {"rawtext":[{"text":"Voting ended: no votes cast — no action taken."}]}').catch(() => {});
          console.log("No votes cast");
        }

        // Cleanup objectives
        overworld.runCommandAsync('scoreboard objectives remove meetingtimer').catch(() => {});
        overworld.runCommandAsync('scoreboard objectives remove votes').catch(() => {});
        overworld.runCommandAsync('scoreboard objectives remove voted').catch(() => {});
        overworld.runCommandAsync('scoreboard objectives remove votetimer').catch(() => {});

        meetingState.active = false;
        meetingState.voteActive = false;
        meetingState.timer = 0;
        meetingState.voteTimer = 0;
        meetingState.votes.clear();
        meetingState.voted.clear();

        if (meetingState.intervalId) {
          system.clearRun(meetingState.intervalId);
          meetingState.intervalId = null;
        }
        broadcastActionbar("");
        console.log("Meeting ended");
      }
    }
  }, 20);

  meetingState.intervalId = intervalId;
}

function handleChatForVote(chatEvent) {
  try {
    if (!meetingState.voteActive) return;

    const msg = (chatEvent.message || "").trim();
    const sender = chatEvent.sender;

    if (!sender) return;

    const voterName = (sender.nameTag || sender.name).toString();

    // consume chat message
    chatEvent.cancel = true;

    if (meetingState.voted.has(voterName)) {
      sender.runCommandAsync(`tellraw @s {"rawtext":[{"text":"You have already voted and cannot vote again."}]}`).catch(() => {});
      return;
    }

    const lower = msg.toLowerCase();
    const players = world.getPlayers();
    let found = null;
    for (const p of players) {
      if (!p) continue;
      const pname = (p.nameTag || p.name).toString();
      if (pname.toLowerCase() === lower) {
        found = p;
        break;
      }
    }

    if (!found) {
      sender.runCommandAsync(`tellraw @s {"rawtext":[{"text":"Invalid name. Please vote again with an eligible username."}]}`).catch(() => {});
      return;
    }

    const targetName = (found.nameTag || found.name).toString();
    const prev = meetingState.votes.get(targetName) || 0;
    meetingState.votes.set(targetName, prev + 1);

    overworld.runCommandAsync(`scoreboard players add "${targetName}" votes 1`).catch(() => {});
    overworld.runCommandAsync(`scoreboard players set "${voterName}" voted 1`).catch(() => {});

    meetingState.voted.add(voterName);
    sender.runCommandAsync(`tellraw @s {"rawtext":[{"text":"Vote recorded for ${targetName}."}]}`).catch(() => {});
    console.log(`${voterName} voted for ${targetName}`);
  } catch (e) {
    console.error("Error handling vote chat event", e);
  }
}

// chat-based start (!meeting)
world.events.beforeChat.subscribe((ev) => {
  try {
    const txt = (ev.message || "").trim();
    const sender = ev.sender;
    if (txt === "!meeting") {
      ev.cancel = true;
      if (!meetingState.active) {
        console.log("Meeting requested via chat");
        startMeeting();
      } else {
        sender.runCommandAsync(`tellraw @s {"rawtext":[{"text":"A meeting is already in progress."}]}`).catch(() => {});
      }
    }
  } catch (e) {
    console.error(e);
  }
});

// Poll for meetingStart tag - runs every tick for immediate detection
system.runInterval(() => {
  try {
    if (meetingState.active) return;

    const players = world.getPlayers();
    for (const p of players) {
      if (!p) continue;
      try {
        if (p.hasTag('meetingStart')) {
          try { 
            p.removeTag('meetingStart'); 
          } catch {}
          console.log("Meeting tag detected, starting meeting");
          startMeeting();
          return; // Exit early
        }
      } catch (e) {
        console.error("Error checking player tag:", e);
      }
    }
  } catch (e) { 
    console.error("Error in tag polling interval:", e); 
  }
}, 1); // Run every tick for immediate detection

console.log('Meeting manager loaded and ready!');
