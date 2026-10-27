# OwnMind — Private Personal AI with a Memory You Own

**Track: Personal AI** · Nebius x NVIDIA Global AI Hackathon

> Every personal AI today remembers you on *their* servers, under *their*
> privacy policy, in a database you can never see. OwnMind inverts that:
> the assistant's long-term memory is a **plain JSON file on your own
> machine**. Every fact it stores appears as a visible **memory receipt** —
> what was stored, when, and from where — and forgetting is a real,
> one-click delete from that file. The reasoning runs on **NVIDIA Nemotron
> served by Nebius Token Factory**; the memory never leaves your disk.

## The problem

Personal AI assistants are getting persistent memory — and users have no
idea what is being remembered, no way to audit it, and no real way to make
the assistant forget. Memory is the most intimate dataset a person will
ever produce, and right now it lives in vendor clouds by default.

## What OwnMind does

- **Chat with memory** — tell it facts ("My name is Rene, I live in
  Lisbon, my dog is called Pico, I prefer concise answers") and it
  extracts the durable ones automatically.
- **Memory receipts** — every stored fact shows up instantly in the
  Memory Vault panel with its text, category, timestamp, and source.
  Nothing is stored silently.
- **Recall you can inspect** — each answer shows how many memories were
  recalled to produce it. Ask "what do you know about me?" for a full
  audit at any time.
- **Forget means forget** — delete one receipt (or the whole vault) and
  the fact is removed from the file itself. Ask again and the assistant
  genuinely no longer knows it. Export your memory as JSON whenever you
  want — it's yours.
- **Persistent across restarts** — memory lives outside the chat session;
  kill the server, restart it, and the assistant still knows you. The
  smoke test (`npm test`) proves store → restart → recall → forget
  end-to-end.

## How Nemotron / Nebius Token Factory is used

All reasoning goes through a single model layer (`src/model.js`) that
speaks the OpenAI-compatible chat-completions API:

| Setting | Value |
|---|---|
| Endpoint | `https://api.tokenfactory.nebius.com/v1/chat/completions` |
| Auth | `Authorization: Bearer $NEBIUS_API_KEY` |
| Model | NVIDIA **Nemotron** — default `nvidia/Llama-3.1-Nemotron-70B-Instruct` (env `NEBIUS_MODEL`; verify the exact ID in the Token Factory catalog via `GET /v1/models` — newer options include `nvidia/Nemotron-3.5-Super-VL`) |
| Calls per turn | 1 fact-extraction call (JSON-only instruction, temperature 0) + 1 answer call grounded in the recalled memories |

Nemotron does two jobs: (1) **extract** durable facts from each message
as structured JSON, and (2) **answer** using only the recalled memories —
instructed never to invent personal facts that aren't in the vault.

### Going live on Nebius (the only remaining step)

The build ships with a clearly-labeled local mock model so the entire
product can be demoed with zero accounts. To run on live Nemotron:

1. Join the free **Nebius Builder Program** (hackathon credits — no
   purchase necessary) and create a Token Factory account.
2. In the Token Factory console, create an API key.
3. Set one environment variable and restart:

   ```bash
   export NEBIUS_API_KEY=<your-token-factory-key>
   npm start
   ```

   The header badge flips from "LOCAL MOCK MODEL" to
   "● LIVE · Nemotron on Nebius Token Factory", and every call goes to
   Token Factory. Nothing else changes — same vault, same receipts.

## Run it

```bash
node --version   # >= 18, zero npm dependencies
npm start        # http://localhost:4173
npm test         # end-to-end smoke test: store → restart → recall → forget
```

Configuration (see `.env.example`): `PORT`, `MEMORY_FILE`
(default `./data/memory.json`), `NEBIUS_API_KEY`, `NEBIUS_BASE_URL`,
`NEBIUS_MODEL`, `MODEL_MODE=mock` to force the mock.

## Architecture

```
Browser UI (public/index.html)
  chat pane + Memory Vault (receipts, forget, export)
        │  fetch
Server (server.js, Node http, zero deps)
  /api/chat  /api/memories  /api/status
        │
Agent (src/agent.js) — per turn: EXTRACT → STORE (receipt) → RECALL → ANSWER
        ├── Memory store (src/store.js) — user-owned JSON file,
        │     keyword recall with light stemming, real deletes
        └── Model layer (src/model.js) — Nebius Token Factory
              (OpenAI-compatible) with live Nemotron, or the local mock
```

Design choices worth noting: recall is deterministic keyword scoring
(transparent, and the UI shows exactly what was recalled); the vault is
written *before* the answer is generated, so a fact told in this message
is already usable — and a forgotten fact is gone before the next answer.

## Feedback on the tools (for the hackathon feedback form)

Token Factory's OpenAI-compatible API made the integration a one-file
job: `base_url` + key + model ID, standard chat-completions shape,
structured JSON extraction worked at temperature 0. The mock-first
design was only possible because the API contract is the familiar one.
Wish list: a public, no-login playground tier for hackathon prototyping
(the console requires a full account before any key exists), and a
canonical Nemotron model-ID list surfaced in the docs — IDs differ
across Nebius pages.

## License

MIT — see `LICENSE`.

---

**Build Disclosure: AI-built.** Built by AI agents (Tree / Muse fleet)
directed by Rene Turcios during the hackathon period; Rene set the
direction and reviewed; agents designed, coded, and tested.
