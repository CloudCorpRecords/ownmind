'use strict';
/**
 * Model layer for OwnMind.
 *
 * Live mode (hackathon requirement): NVIDIA Nemotron served by the
 * Nebius Token Factory inference API, which is OpenAI-compatible.
 *   POST {NEBIUS_BASE_URL}/chat/completions   (default base:
 *   https://api.tokenfactory.nebius.com/v1)
 *   Authorization: Bearer $NEBIUS_API_KEY
 *   model: $NEBIUS_MODEL (default nvidia/Llama-3.1-Nemotron-70B-Instruct)
 *
 * Mock mode (default when no key is set): a local, deterministic stand-in
 * that implements exactly the same chat-completions message shape the rest
 * of the app uses. It is clearly labeled in the UI and in /api/status.
 * Mock mode exists so the full product — memory store, receipts, recall,
 * forget — can be demoed end-to-end with zero accounts. Setting
 * NEBIUS_API_KEY is the ONLY change needed to run on real Nemotron.
 */

const DEFAULT_BASE_URL = 'https://api.tokenfactory.nebius.com/v1';
const DEFAULT_MODEL = 'nvidia/Llama-3.1-Nemotron-70B-Instruct';

function getConfig() {
  const apiKey = process.env.NEBIUS_API_KEY || '';
  const forced = (process.env.MODEL_MODE || '').toLowerCase();
  const mode = forced === 'mock' ? 'mock' : apiKey ? 'nebius' : 'mock';
  return {
    mode,
    apiKey,
    baseUrl: (process.env.NEBIUS_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    model: process.env.NEBIUS_MODEL || DEFAULT_MODEL,
  };
}

/* ------------------------------------------------------------------ */
/* Live: Nebius Token Factory (OpenAI-compatible)                      */
/* ------------------------------------------------------------------ */
async function liveChat(config, messages, { temperature = 0.4, maxTokens = 700 } = {}) {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Nebius Token Factory error ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const content =
    json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : '';
  return { content: String(content || '').trim(), usage: json.usage || null };
}

/* ------------------------------------------------------------------ */
/* Mock: deterministic local stand-in, same message shape              */
/* ------------------------------------------------------------------ */

/**
 * Heuristic fact extraction used by the mock model. In live mode this
 * same job is done by Nemotron from a JSON-only instruction prompt;
 * the app calls model.extractFacts() either way.
 */
function mockExtractFacts(userText) {
  const text = String(userText || '').trim();
  const facts = [];
  const push = (t, kind) => {
    const clean = t.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
    if (clean.length >= 3) facts.push({ text: clean, kind });
  };

  // "remember (that) X" / "note that X"
  const rememberMatch = text.match(/\b(?:remember|note)\s+(?:that\s+)?(.+)/i);
  if (rememberMatch) push(capitalize(rememberMatch[1]), 'note');

  let m;
  if ((m = text.match(/\bmy name is\s+([A-Za-z][A-Za-z' -]*?)(?=[.,;!]|\s+and\s|\s+i\s|$)/i)))
    push(`User's name is ${m[1].trim()}`, 'identity');
  if ((m = text.match(/\bcall me\s+([A-Za-z][A-Za-z' -]*?)(?=[.,;!]|$)/i)))
    push(`User prefers to be called ${m[1].trim()}`, 'identity');
  if ((m = text.match(/\bi live in\s+([A-Za-z][A-Za-z' -]*?)(?=[.,;!]|\s+and\s|$)/i)))
    push(`User lives in ${m[1].trim()}`, 'place');
  if ((m = text.match(/\bmy\s+(dog|cat|pet)\s+(?:is called|is named|name is)\s+([A-Za-z][A-Za-z'-]*)/i)))
    push(`User's ${m[1].toLowerCase()} is called ${m[2]}`, 'pet');
  if ((m = text.match(/\bmy\s+([a-z][a-z -]{1,30}?)\s+is\s+([A-Za-z0-9][^.,;!]*?)(?=[.,;!]|\s+and\s|$)/i))) {
    // generic "my X is Y" — skip if already captured as name/pet above
    const label = m[1].trim().toLowerCase();
    if (!/name/.test(label)) push(`User's ${label} is ${m[2].trim()}`, 'fact');
  }
  if ((m = text.match(/\bi\s+(?:really\s+)?(?:like|love|enjoy|prefer)\s+([^.,;!]+)/i)))
    push(`User likes ${m[1].trim()}`, 'preference');
  if ((m = text.match(/\bi\s+(?:work as|work as a|am a|i'm a)\s+([^.,;!]+)/i)))
    push(`User works as ${m[1].trim()}`, 'work');
  if ((m = text.match(/\bmy birthday is\s+([^.,;!]+)/i)))
    push(`User's birthday is ${m[1].trim()}`, 'identity');
  if ((m = text.match(/\bi am allergic to\s+([^.,;!]+)/i)))
    push(`User is allergic to ${m[1].trim()}`, 'health');

  // De-duplicate within this turn
  const seen = new Set();
  return facts.filter((f) => {
    const k = f.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Deterministic mock answer generator. It only answers from the memory
 * context it is handed in the system prompt (parsed back out below),
 * which is exactly the contract the live model gets — so recall and
 * forget behave identically in both modes.
 */
function mockChat(messages) {
  const system = messages.find((x) => x.role === 'system');
  const userMsgs = messages.filter((x) => x.role === 'user');
  const lastUser = userMsgs.length ? userMsgs[userMsgs.length - 1].content : '';

  const memories = [];
  if (system) {
    const idx = system.content.indexOf('KNOWN MEMORIES:');
    if (idx !== -1) {
      for (const line of system.content.slice(idx).split('\n').slice(1)) {
        const mm = line.match(/^- (.+)$/);
        if (mm) memories.push(mm[1].trim());
      }
    }
  }

  const q = lastUser.toLowerCase();
  const findMem = (re) => memories.find((t) => re.test(t.toLowerCase()));
  // Only treat a message as a question if it is actually interrogative —
  // "my dog is called Pico" is a statement to store, not a question.
  const isQuestion =
    /\?\s*$/.test(lastUser.trim()) ||
    /^(what|where|who|when|do you|can you|tell me)\b/i.test(lastUser.trim());

  // "what do you know/remember about me"
  if (/\b(what do you (know|remember)|what have you (stored|saved|learned)|show me (your|my) memor)/.test(q)) {
    if (!memories.length && !findMem(/[\s\S]/))
      return "So far my vault is empty — tell me something about yourself and I'll store a receipt for it here, on your machine only.";
    const all = memories.length
      ? memories
      : [];
    if (!all.length)
      return "Nothing relevant is in my vault for that yet — everything I store shows up as a receipt you can delete.";
    return (
      "Here's what I hold in your vault right now:\n" +
      all.map((t) => `• ${t}`).join('\n') +
      '\nEvery line is a receipt in your local memory file — you can forget any of it with one click.'
    );
  }

  // targeted questions answered strictly from recalled memories;
  // compound questions ("dog's name AND where do I live?") get both parts
  if (isQuestion) {
    const parts = [];
    const asksDog =
      /\bdog('s)?\s+name|name of (my|the) dog/.test(q) ||
      (/\bdog\b/.test(q) && /\b(name|called)\b/.test(q));
    if (asksDog) {
      const mem = findMem(/dog is called/);
      parts.push(
        mem
          ? `From your vault: ${mem}.`
          : "I don't have your dog's name in the vault — if you told me before, it's not stored (or it was forgotten). Tell me and I'll keep a receipt."
      );
    }
    if (/\bwhere do i live|where.*i live|my (home|city)/.test(q)) {
      const mem = findMem(/lives in/);
      parts.push(
        mem
          ? `From your vault: ${mem}.`
          : "I don't have where you live in the vault yet."
      );
    }
    if (/\bwhat('s| is) my name|who am i\b/.test(q)) {
      const mem = findMem(/name is/);
      parts.push(
        mem
          ? `From your vault: ${mem}.`
          : "You haven't told me your name yet — when you do, I'll store it as a receipt you own."
      );
    }
    if (parts.length) return parts.join(' ');
  }

  // generic question: quote the best-matching recalled memories, if any
  if (memories.length) {
    const { tokenize } = require('./store');
    const qTokens = new Set(tokenize(lastUser));
    const scored = memories
      .map((t) => {
        let s = 0;
        for (const tok of tokenize(t)) if (qTokens.has(tok)) s++;
        return { t, s };
      })
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);
    if (scored.length) {
      return (
        `Using what I remember about you: ${scored[0].t}.` +
        (scored[1] ? ` Also relevant: ${scored[1].t}.` : '') +
        ' (Answered from your local vault — nothing left this machine.)'
      );
    }
  }

  // acknowledgement / small talk grounded in what was just said
  if (/\b(hi|hello|hey)\b/.test(q) && memories.length === 0) {
    return "Hello! I'm OwnMind — a personal AI whose memory lives in a file on your machine, not in a company's cloud. Tell me things like “my dog is called Pico” or “remember that I prefer concise answers” and I'll keep visible receipts you can forget at any time.";
  }
  if (memories.length) {
    return `Got it — I've noted that in your vault (see the new receipt). I currently hold ${memories.length} memor${memories.length === 1 ? 'y' : 'ies'} for you, all stored locally. Ask me “what do you know about me?” any time to audit them.`;
  }
  return "Got it. Tell me a fact about yourself — your name, where you live, a preference — and I'll store it as a visible receipt in your local vault, then use it in later answers. You can forget any of it, any time.";
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
async function chat(messages, opts) {
  const config = getConfig();
  if (config.mode === 'nebius') {
    const out = await liveChat(config, messages, opts);
    return { ...out, mode: 'nebius', model: config.model };
  }
  return { content: mockChat(messages), usage: null, mode: 'mock', model: 'local-mock (Nemotron stand-in)' };
}

/**
 * Extract durable facts from a user message.
 * Live: Nemotron with a JSON-only instruction. Mock: regex heuristics.
 * Returns [{text, kind}]. Never throws — extraction failure means no
 * new memories this turn, not a broken chat.
 */
async function extractFacts(userText, existingTexts) {
  const config = getConfig();
  if (config.mode !== 'nebius') return mockExtractFacts(userText);
  try {
    const out = await liveChat(
      config,
      [
        {
          role: 'system',
          content:
            'You extract durable personal facts a user states about themselves (identity, home, pets, work, preferences, health constraints, explicit "remember that" notes). ' +
            'Reply with ONLY a JSON array of objects {"text": "...", "kind": "..."} where text is a short third-person statement like "User lives in Lisbon" and kind is one of identity|place|pet|work|preference|health|note|fact. ' +
            'If the message states no durable fact, reply with []. Do not invent facts.',
        },
        {
          role: 'user',
          content:
            `Already known (do not repeat): ${JSON.stringify(existingTexts)}\n\nMessage: ${userText}`,
        },
      ],
      { temperature: 0, maxTokens: 300 }
    );
    const start = out.content.indexOf('[');
    const end = out.content.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    const parsed = JSON.parse(out.content.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f) => f && typeof f.text === 'string' && f.text.trim().length >= 3)
      .map((f) => ({ text: f.text.trim(), kind: typeof f.kind === 'string' ? f.kind : 'fact' }));
  } catch (_err) {
    return [];
  }
}

module.exports = { chat, extractFacts, getConfig, DEFAULT_BASE_URL, DEFAULT_MODEL };
