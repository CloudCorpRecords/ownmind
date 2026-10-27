'use strict';
/**
 * OwnMind end-to-end smoke test (mock model mode).
 *
 * Proves the three claims the product makes:
 *   1. STORE   — facts told in chat become receipts in the local vault file.
 *   2. PERSIST — kill the server, restart it on the same file, and the
 *                assistant still recalls the facts (memory != chat context).
 *   3. FORGET  — deleting a receipt removes it from the file, and the
 *                assistant stops knowing it.
 *
 * Run: npm test   (or: node scripts/smoke.js)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4177;
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownmind-smoke-'));
const MEMORY_FILE = path.join(tmpDir, 'memory.json');

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}

async function waitUp(proc) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/status`);
      if (r.ok) return true;
    } catch (_e) {}
    if (proc.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function startServer() {
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      MEMORY_FILE,
      MODEL_MODE: 'mock',
      NEBIUS_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  return proc;
}

async function chat(message) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return r.json();
}

async function main() {
  console.log(`Smoke vault: ${MEMORY_FILE}\n`);

  /* --- Boot 1: store ------------------------------------------------ */
  let server = startServer();
  check('server boots (mock mode)', await waitUp(server));
  const status = await (await fetch(`${BASE}/api/status`)).json();
  check('status reports mock mode', status.mode === 'mock', `mode=${status.mode}`);

  const t1 = await chat(
    "Hi! My name is Rene, I live in Lisbon, and my dog is called Pico. I prefer concise answers."
  );
  console.log('\nTurn 1 reply:', t1.reply);
  console.log('Receipts:', JSON.stringify(t1.receipts, null, 2));
  const texts = (t1.receipts || []).map((r) => r.text).join(' | ');
  check('STORE: name receipt', /name is Rene/i.test(texts));
  check('STORE: home receipt (Lisbon)', /Lisbon/.test(texts));
  check('STORE: dog receipt (Pico)', /Pico/.test(texts));
  check('STORE: preference receipt', /concise/i.test(texts));

  const onDisk = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  check(
    'STORE: vault file on disk holds the memories',
    onDisk.memories.length >= 3 && /Pico/.test(JSON.stringify(onDisk.memories)),
    `${onDisk.memories.length} memories in file`
  );
  const pico = onDisk.memories.find((m) => /Pico/.test(m.text));

  /* --- Boot 2: restart -> persistence ------------------------------- */
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 400));
  server = startServer();
  check('server restarts on same vault file', await waitUp(server));

  const t2 = await chat("What is my dog's name and where do I live?");
  console.log('\nTurn 2 (after restart) reply:', t2.reply);
  check('PERSIST: recalls dog after restart', /Pico/.test(t2.reply));
  check('PERSIST: recalls home after restart', /Lisbon/.test(t2.reply));

  /* --- Forget -------------------------------------------------------- */
  const del = await fetch(`${BASE}/api/memories/${pico.id}`, { method: 'DELETE' });
  const delJson = await del.json();
  check('FORGET: delete returns forgotten=true', delJson.forgotten === true);
  const afterDisk = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  check(
    'FORGET: receipt gone from the file itself',
    !/Pico/.test(JSON.stringify(afterDisk.memories))
  );

  const t3 = await chat("What is my dog's name?");
  console.log('\nTurn 3 (after forget) reply:', t3.reply);
  check('FORGET: assistant no longer knows the dog', !/Pico/.test(t3.reply));
  check(
    'FORGET: other memories survive (Lisbon still known)',
    /Lisbon/.test(JSON.stringify(afterDisk.memories))
  );

  server.kill('SIGTERM');
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
