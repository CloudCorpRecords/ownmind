# Devpost Submission — OwnMind (paste-ready)

**Hackathon:** Nebius x NVIDIA Global AI Hackathon
**Track:** Personal AI
**Project name:** OwnMind

---

## Tagline

A private personal AI whose persistent memory lives in a file you own —
with visible receipts for everything it remembers, and forgetting that
actually forgets. Reasoning by NVIDIA Nemotron on Nebius Token Factory.

## About the project (description)

### The problem

Personal AI assistants are all getting persistent memory — and keeping it
on their servers, under their privacy policies, in databases you can
never inspect. You can't see what your assistant remembers about you,
you can't correct it, and "delete" usually means "hide." Memory is the
most intimate dataset a person will ever produce. It should belong to
the person.

### What OwnMind does

OwnMind is a personal AI assistant whose long-term memory is a **plain
JSON file on the user's own machine** (`data/memory.json`). The cloud
model reasons; it never stores.

- **Tell it facts naturally.** "My name is Rene, I live in Lisbon, and
  my dog is called Pico. I prefer concise answers." Nemotron extracts
  the durable facts as structured JSON and each one is written to the
  vault.
- **Memory receipts.** Every stored fact appears immediately in the
  Memory Vault panel: the fact, its category, the exact timestamp, and
  its source. Nothing is ever stored silently.
- **Inspectable recall.** Every answer shows how many memories were
  recalled to produce it, and "What do you know about me?" audits the
  whole vault on demand.
- **Real forgetting.** One click deletes the receipt from the file
  itself — ask again and the assistant genuinely doesn't know. There's
  also one-click JSON export: your memory is portable because it's
  yours.
- **It survives restarts.** Memory is not chat context. Kill the
  server, restart it, and OwnMind still knows you. Our smoke test
  proves the full loop: store → restart → recall → forget.

### How we built it

Zero-dependency Node.js. A small agent loop runs per chat turn:
**extract → store (receipt) → recall → answer**. Recall is
deterministic keyword scoring (light stemming, stopword filtering) so
users can see exactly why a memory was used — transparency beats magic
for a privacy product. The model layer speaks the OpenAI-compatible
chat-completions API, so Nebius Token Factory slots in with just a
base URL, an API key, and a model ID.

### How Nemotron + Nebius Token Factory are used

- **Model:** NVIDIA Nemotron (default `nvidia/Llama-3.1-Nemotron-70B-Instruct`,
  configurable via `NEBIUS_MODEL`)
- **Endpoint:** `https://api.tokenfactory.nebius.com/v1/chat/completions`
- **Two calls per turn:** a temperature-0 extraction call that returns
  durable facts as JSON only, and an answer call grounded strictly in
  the recalled memories — instructed never to invent personal facts
  that aren't in the vault.
- The app ships with a clearly-labeled local mock implementing the
  identical API shape, so the full product demos with zero accounts;
  setting `NEBIUS_API_KEY` (free Builder Program credits) is the only
  step that switches it to live Nemotron inference.

### Challenges

Recall quality in the deterministic layer: possessives ("dog's") and
morphology ("live" vs "lives") silently zeroed out matches — fixed
with apostrophe splitting and light stemming, verified by the smoke
test going red first. The discipline of "answer only from the vault"
also had to hold in mock mode, so the mock implements the same
system-prompt contract the live model receives.

### What's next

Encrypted-at-rest vault option, per-fact expiry, memory categories
with different retention rules, and a "memory diff" view between
sessions. The architecture already supports swapping the local file
for a user-hosted store without touching the model layer.

## Built with

- Node.js (zero dependencies)
- Nebius Token Factory (inference API)
- NVIDIA Nemotron (open model)
- Vanilla HTML/CSS/JS

## Try it

- **Repo:** (public GitHub URL — added at publish)
- **Live demo:** (hosted URL — added at publish; runs in mock mode
  publicly, live Nemotron when `NEBIUS_API_KEY` is set)
- **Video:** (public YouTube URL, ≤3 min — added at publish)

## Feedback for Nebius / NVIDIA (submission form field)

Token Factory's OpenAI-compatible surface made integration a one-file
job — base URL + key + model ID, standard chat-completions, and
JSON-only extraction at temperature 0 worked cleanly. Two requests:
(1) a no-login playground/trial tier so hackathon teams can prototype
before account verification, and (2) one canonical Nemotron model-ID
list in the docs — IDs vary across pages, which cost us a verification
pass.

---

**Build Disclosure: AI-built.** Built by AI agents (Tree / Muse fleet)
directed by Rene Turcios during the hackathon period; Rene set the
direction and reviewed; agents designed, coded, and tested.
