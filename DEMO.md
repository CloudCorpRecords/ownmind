# Demo Video Script — OwnMind (≤ 3 minutes, real runs only)

**Format:** screen recording of the real app at http://localhost:4173,
terminal visible for the restart beat. Record in mock mode (badge is
labeled on screen — say so out loud; honesty is the product). If the
Nebius key is in by recording time, re-record the same script in LIVE
mode and keep the mock mention as one line.

Setup before recording: fresh vault (`rm -f data/memory.json`), server
running (`npm start`), browser at 1440×900.

---

**[0:00–0:20] The hook**
Show the OwnMind UI, vault empty.
NARRATION: "Every AI assistant is getting a memory — stored on their
servers, invisible to you. OwnMind is a personal AI whose memory lives
in a file on your machine. Watch: everything it remembers, it shows
you."

**[0:20–0:55] Store — receipts appear live**
Type in chat: *"Hi! My name is Rene, I live in Lisbon, and my dog is
called Pico. I prefer concise answers."* Send.
Point at the vault panel as four receipts land.
NARRATION: "I told it four facts. Nemotron extracts the durable ones —
and each becomes a receipt: what was stored, when, from where. Nothing
is stored silently. The reasoning runs on NVIDIA Nemotron via Nebius
Token Factory — the memory never leaves this disk."

**[0:55–1:25] Restart — memory is not chat context**
Switch to terminal: Ctrl-C the server, `npm start` again. Reload the
page — receipts still there. Ask in chat: *"What is my dog's name and
where do I live?"*
NARRATION: "New process, new session. It still knows: Pico, Lisbon.
Because the memory is a file I own — not a conversation the vendor
keeps."

**[1:25–1:50] Audit**
Ask: *"What do you know about me?"*
NARRATION: "Full audit, any time. Every line maps to a receipt in this
panel — which maps to a line in a JSON file I can open, back up, or
export."

**[1:50–2:25] Forget — and prove it**
Click **Forget** on the Pico receipt. Show it vanish. Ask again:
*"What is my dog's name?"* — the assistant says it doesn't know.
NARRATION: "Forgetting here isn't a UI trick. The fact is deleted from
the file itself, so the model stops knowing it. Show me another
assistant that lets you do that."

**[2:25–2:55] The live switch + close**
Terminal: show `NEBIUS_API_KEY=… npm start` (key redacted) *or* the
`.env.example` if recording in mock. Show the status line / README
integration table briefly.
NARRATION: "One environment variable switches OwnMind to live
Nemotron inference on Nebius Token Factory — OpenAI-compatible, two
calls per turn: extract, then answer strictly from the vault. Your
memory is yours. Your AI should act like it. OwnMind."
