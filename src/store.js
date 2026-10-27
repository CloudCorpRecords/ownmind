'use strict';
/**
 * OwnMind memory store.
 *
 * The whole point of OwnMind: the memory is a plain JSON file that lives on
 * the user's own machine (default ./data/memory.json, override with
 * MEMORY_FILE). No account, no cloud database, no telemetry. The user can
 * open it, read every receipt, back it up, or delete it.
 *
 * Each memory is stored as a "receipt":
 *   { id, text, kind, source, createdAt }
 * so the UI can always answer: what was stored, when, and from where —
 * and forgetting is a real delete from this file, not a UI hide.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'am', 'are', 'was', 'were',
  'i', 'my', 'me', 'you', 'your', 'it', 'its', 'of', 'to', 'in', 'on',
  'for', 'with', 'what', 'whats', "what's", 'do', 'does', 'did', 'can',
  'could', 'please', 'tell', 'about', 'know', 'hi', 'hello', 'hey',
]);

function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’]/g, ' ') // "dog's" -> "dog" + "s" (the "s" is dropped below)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .map(stem);
}

class MemoryStore {
  constructor(filePath) {
    this.file = filePath;
    this.data = { memories: [], history: [] };
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data.memories = Array.isArray(parsed.memories) ? parsed.memories : [];
      this.data.history = Array.isArray(parsed.history) ? parsed.history : [];
    } catch (_err) {
      this.data = { memories: [], history: [] };
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  static normalize(text) {
    return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /** Add a memory unless an identical (normalized) one already exists. */
  add({ text, kind = 'fact', source = 'chat' }) {
    const clean = String(text || '').trim();
    if (!clean) return null;
    const norm = MemoryStore.normalize(clean);
    const dupe = this.data.memories.find(
      (m) => MemoryStore.normalize(m.text) === norm
    );
    if (dupe) return { ...dupe, duplicate: true };
    const receipt = {
      id: crypto.randomUUID(),
      text: clean,
      kind,
      source,
      createdAt: new Date().toISOString(),
    };
    this.data.memories.push(receipt);
    this.save();
    return receipt;
  }

  list() {
    return [...this.data.memories];
  }

  count() {
    return this.data.memories.length;
  }

  /** Real delete. Returns true if something was removed. */
  forget(id) {
    const before = this.data.memories.length;
    this.data.memories = this.data.memories.filter((m) => m.id !== id);
    if (this.data.memories.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  forgetAll() {
    const n = this.data.memories.length;
    this.data.memories = [];
    this.save();
    return n;
  }

  /**
   * Keyword-overlap recall: score each memory by how many meaningful
   * tokens it shares with the query. Deterministic and inspectable —
   * the UI shows exactly which memories were recalled for an answer.
   */
  search(query, limit = 5) {
    const qTokens = new Set(tokenize(query));
    if (qTokens.size === 0) return [];
    return this.data.memories
      .map((m) => {
        const mTokens = tokenize(m.text);
        let score = 0;
        for (const t of mTokens) if (qTokens.has(t)) score += 1;
        return { memory: m, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.memory);
  }

  addHistory(role, content) {
    this.data.history.push({ role, content, at: new Date().toISOString() });
    if (this.data.history.length > 60) {
      this.data.history = this.data.history.slice(-60);
    }
    this.save();
  }

  history() {
    return [...this.data.history];
  }
}

module.exports = { MemoryStore, tokenize };
