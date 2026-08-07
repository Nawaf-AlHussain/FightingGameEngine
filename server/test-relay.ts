// Quick integration test for the relay server
// Run: deno run --allow-net test-relay.ts                          # tests localhost
// Run: RELAY_URL=https://fge-relay.nawaf-al-hussain.deno.net deno run --allow-net test-relay.ts  # tests live

const RELAY_URL = Deno.env.get("RELAY_URL") || "http://localhost:8080";

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function log(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  const icon = passed ? "✓" : "✗";
  console.log(`${icon} ${name}: ${detail}`);
}

function makeWebSocket(sessionId: string): WebSocket {
  const wsUrl = RELAY_URL.replace(/^http/, "ws").replace(/\/$/, "") + "/ws?session_id=" + sessionId;
  return new WebSocket(wsUrl);
}

function waitForMessage(ws: WebSocket, type: string, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeEventListener("message", handler);
      reject(new Error(`Timeout waiting for ${type}`));
    }, timeoutMs);
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === type) {
          clearTimeout(timeout);
          ws.removeEventListener("message", handler);
          resolve(msg);
        }
      } catch {}
    };
    ws.addEventListener("message", handler);
  });
}

function send(ws: WebSocket, msg: any) {
  ws.send(JSON.stringify(msg));
}

async function main() {
  console.log("=== Testing relay server ===\n");

  // Test 1: Health check
  try {
    const resp = await fetch(`${RELAY_URL}/`);
    const data = await resp.json();
    log("Health check", data.status === "ok", `status=${data.status}, rooms=${data.rooms}`);
  } catch (e) {
    log("Health check", false, String(e));
  }

  // Test 2: Create room
  const ws1 = makeWebSocket("session1");
  await new Promise((r) => (ws1.onopen = r));
  send(ws1, { type: "create_room", session_id: "session1" });

  const roomCreated = await waitForMessage(ws1, "room_created");
  const roomCode = roomCreated.room_code;
  log("Create room", roomCreated.room_code.length === 6, `code=${roomCode}, slot=${roomCreated.slot}`);

  // Test 3: Join room
  const ws2 = makeWebSocket("session2");
  await new Promise((r) => (ws2.onopen = r));

  // Set up listener on ws1 for player_joined BEFORE sending join_room,
  // because the server broadcasts player_joined synchronously when join_room arrives
  const playerJoinedPromise = waitForMessage(ws1, "player_joined");

  send(ws2, { type: "join_room", session_id: "session2", room_code: roomCode });

  const roomJoined = await waitForMessage(ws2, "room_joined");
  log("Join room", roomJoined.slot === 2, `slot=${roomJoined.slot}`);

  const playerJoined = await playerJoinedPromise;
  log("Player joined broadcast", playerJoined.slot === 2, `slot=${playerJoined.slot}`);

  // Test 4: Set character
  const charSetPromise = waitForMessage(ws2, "character_selected");
  send(ws1, { type: "set_character", character: "Songoku" });
  const charSet = await charSetPromise;
  log("Character selection broadcast", charSet.character === "Songoku", `char=${charSet.character}, slot=${charSet.slot}`);

  // Test 5: Set stage
  const stageSetPromise = waitForMessage(ws2, "stage_selected");
  send(ws1, { type: "set_stage", stage: "uiu_campus_low.def" });
  const stageSet = await stageSetPromise;
  log("Stage selection broadcast", stageSet.stage === "uiu_campus_low.def", `stage=${stageSet.stage}`);

  // Test 6: Ready + game_start
  // First set ws2's character so game_start includes it
  const charSet2Promise = waitForMessage(ws1, "character_selected");
  send(ws2, { type: "set_character", character: "Vegeta" });
  await charSet2Promise;

  // Now set up listeners for game_start BEFORE sending ready
  const gameStart1Promise = waitForMessage(ws1, "game_start");
  const gameStart2Promise = waitForMessage(ws2, "game_start");

  send(ws1, { type: "ready" });
  await new Promise((r) => setTimeout(r, 100));
  send(ws2, { type: "ready" });

  const gameStart1 = await gameStart1Promise;
  const gameStart2 = await gameStart2Promise;
  log(
    "Game start broadcast",
    gameStart1.p1_char === "Songoku" && gameStart2.p2_char === "Vegeta" && gameStart1.stage === "uiu_campus_low.def",
    `p1=${gameStart1.p1_char}, p2=${gameStart2.p2_char}, stage=${gameStart1.stage}, delay=${gameStart1.input_delay}`
  );

  // Test 7: Input forwarding
  const remoteInputPromise = waitForMessage(ws2, "remote_input");
  send(ws1, { type: "input", frame: 1, data: "Ua" });
  const remoteInput = await remoteInputPromise;
  log(
    "Input forwarding",
    remoteInput.data === "Ua" && remoteInput.from_slot === 1,
    `data=${remoteInput.data}, from_slot=${remoteInput.from_slot}`
  );

  // Test 8: Ping/pong
  const pingTs = Date.now();
  const pongPromise = waitForMessage(ws1, "pong");
  send(ws1, { type: "ping", ts: pingTs });
  const pong = await pongPromise;
  log("Ping/pong", pong.ts === pingTs, `ts match=${pong.ts === pingTs}`);

  // Test 9: Leave room (disconnect)
  const playerLeftPromise = waitForMessage(ws1, "player_left");
  ws2.close();
  const playerLeft = await playerLeftPromise;
  log("Player left broadcast", playerLeft.slot === 2, `slot=${playerLeft.slot}`);

  ws1.close();

  // Summary
  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`${passed}/${total} tests passed`);
  if (passed !== total) {
    Deno.exit(1);
  }
}

main().catch((e) => {
  console.error("Test runner failed:", e);
  Deno.exit(1);
});
