'use strict';
/**
 * OwnMind agent orchestration — one chat turn:
 *
 *   1. EXTRACT  Ask the model (Nemotron live / heuristic mock) what durable
 *               facts the user just stated.
 *   2. STORE    Write each new fact to the user's local vault, producing a
 *               visible memory receipt (what / when / source).
 *   3. RECALL   Pull the memories relevant to this message (or the whole
 *               vault for audit questions like "what do you know about me?").
 *   4. ANSWER   Call the model with the recalled memories as context.
 *
 * The vault is updated BEFORE the answer, so a fact told in this very
 * message can already be used — and a forgotten fact is gone from the
 * file before the next answer is generated. Forgetting is real.
 */
const model = require('./model');

const AUDIT_RE =
  /\b(what do you (know|remember)|what have you (stored|saved|learned)|show me (your|my) memor|list.*memor)/i;

const SYSTEM_TEMPLATE = (memories) => `You are OwnMind, a private personal AI assistant. Your memory is NOT stored by any company: it lives in a local file owned by the user, and every stored fact is shown to the user as a receipt they can delete at any time.

Rules:
- Answer using the known memories below when they are relevant. Never invent personal facts that are not in the list.
- If a fact is not in the list, say it is not in the vault — do not guess.
- Be concise, warm, and concrete. Mention the vault/receipts naturally when you use or store a memory.
- You are powered by NVIDIA Nemotron served via the Nebius Token Factory (or a clearly-labeled local mock when no API key is configured).

KNOWN MEMORIES:
${memories.length ? memories.map((m) => `- ${m.text}`).join('\n') : '- (vault is empty)'}
`;

async function handleChat(store, userText) {
  const text = String(userText || '').trim();
  if (!text) throw new Error('message is required');

  // 1+2. Extract and store (receipts for anything genuinely new)
  const existingTexts = store.list().map((m) => m.text);
  const candidates = await model.extractFacts(text, existingTexts);
  const receipts = [];
  for (const c of candidates) {
    const saved = store.add({ text: c.text, kind: c.kind, source: 'chat' });
    if (saved && !saved.duplicate) {
      receipts.push({
        id: saved.id,
        text: saved.text,
        kind: saved.kind,
        createdAt: saved.createdAt,
      });
    }
  }

  // 3. Recall
  const isAudit = AUDIT_RE.test(text);
  const recalled = isAudit ? store.list() : store.search(text, 5);
  // Always include just-stored facts in context for this answer
  const contextMap = new Map();
  for (const r of recalled) contextMap.set(r.id, r);
  for (const r of receipts) {
    const full = store.list().find((m) => m.id === r.id);
    if (full) contextMap.set(full.id, full);
  }
  const context = [...contextMap.values()];

  // 4. Answer (short recent history for continuity, memories do the long-term work)
  const history = store
    .history()
    .slice(-6)
    .map((h) => ({ role: h.role, content: h.content }));
  const messages = [
    { role: 'system', content: SYSTEM_TEMPLATE(context) },
    ...history,
    { role: 'user', content: text },
  ];
  const result = await model.chat(messages);

  store.addHistory('user', text);
  store.addHistory('assistant', result.content);

  return {
    reply: result.content,
    receipts, // memories stored by THIS message
    recalled: context.map((m) => ({ id: m.id, text: m.text })),
    mode: result.mode,
    model: result.model,
    memoryCount: store.count(),
  };
}

module.exports = { handleChat };
