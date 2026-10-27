'use strict';
/**
 * OwnMind server — zero dependencies, Node >= 18 (uses global fetch).
 *
 * Run:  node server.js            (or: npm start)
 * Env:  PORT=4173  MEMORY_FILE=./data/memory.json
 *       NEBIUS_API_KEY=...        -> switches the model to live Nemotron
 *       NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1
 *       NEBIUS_MODEL=nvidia/Llama-3.1-Nemotron-70B-Instruct
 *       MODEL_MODE=mock           -> force the local mock even with a key
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { MemoryStore } = require('./src/store');
const modelLib = require('./src/model');
const { handleChat } = require('./src/agent');

const PORT = Number(process.env.PORT || 4173);
const MEMORY_FILE = path.resolve(
  process.env.MEMORY_FILE || path.join(__dirname, 'data', 'memory.json')
);
const PUBLIC_DIR = path.join(__dirname, 'public');

const store = new MemoryStore(MEMORY_FILE);

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function route(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (p === '/api/status') {
    const cfg = modelLib.getConfig();
    return sendJson(res, 200, {
      app: 'OwnMind',
      mode: cfg.mode,
      model: cfg.mode === 'nebius' ? cfg.model : 'local-mock (Nemotron stand-in)',
      liveModel: cfg.model,
      baseUrl: cfg.baseUrl,
      memoryFile: MEMORY_FILE,
      memoryCount: store.count(),
    });
  }

  if (p === '/api/memories' && req.method === 'GET') {
    return sendJson(res, 200, { memories: store.list(), count: store.count() });
  }

  if (p === '/api/memories' && req.method === 'POST') {
    const body = await readBody(req);
    const saved = store.add({
      text: body.text,
      kind: typeof body.kind === 'string' ? body.kind : 'note',
      source: 'manual',
    });
    if (!saved) return sendJson(res, 400, { error: 'text is required' });
    return sendJson(res, 201, { receipt: saved });
  }

  const forgetOne = p.match(/^\/api\/memories\/([0-9a-fA-F-]{36})$/);
  if (forgetOne && req.method === 'DELETE') {
    const ok = store.forget(forgetOne[1]);
    return sendJson(res, ok ? 200 : 404, {
      forgotten: ok,
      memoryCount: store.count(),
    });
  }

  if (p === '/api/memories' && req.method === 'DELETE') {
    const n = store.forgetAll();
    return sendJson(res, 200, { forgotten: n, memoryCount: 0 });
  }

  if (p === '/api/chat' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const out = await handleChat(store, body.message);
      return sendJson(res, 200, out);
    } catch (e) {
      return sendJson(res, 502, { error: String(e.message || e) });
    }
  }

  // Static UI
  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  return sendJson(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    try {
      sendJson(res, 500, { error: String(e.message || e) });
    } catch (_ignored) {}
  });
});

server.listen(PORT, () => {
  const cfg = modelLib.getConfig();
  console.log(`OwnMind running at http://localhost:${PORT}`);
  console.log(
    cfg.mode === 'nebius'
      ? `Model: LIVE Nemotron via Nebius Token Factory (${cfg.model})`
      : 'Model: LOCAL MOCK (no NEBIUS_API_KEY set) — set the key to run live Nemotron on Nebius Token Factory'
  );
  console.log(`Memory vault: ${MEMORY_FILE}`);
});
