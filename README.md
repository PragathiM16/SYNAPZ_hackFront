# CodeWhy — SYNAPZ

**Track:** Sarvam Track  
**Hackathon:** HackFront India  
**Problem statement:** Why The Code Is Like This  
**Theme:** AI and Developer Tools

---

## What it does

Paste an unfamiliar code snippet, choose an explanation language, and click **Explain with Sarvam**. The local server calls Sarvam-105B and returns a structured six-section explanation that separates:

- **Observable behavior** — what the code demonstrably does
- **Possible intent** — inferences about design choices (clearly labelled as such)
- **Evidence** — specific lines and expressions from your code
- **Uncertainty** — what cannot be concluded from the code alone
- **Verification steps** — how to confirm key claims before changing the code
- **Summary** — a short conclusion

---

## Architecture

```
Browser (index.html)
    |
    | POST /api/explain  {code, language}
    v
Node.js HTTP server (server.mjs)
    |
    | POST https://api.sarvam.ai/v1/chat/completions
    | Header: api-subscription-key: <SARVAM_API_KEY>
    | Model:  sarvam-105b
    v
Sarvam AI  →  structured JSON explanation
    |
    | {explanation: {...}, structured: true}
    v
Browser renders six labelled sections
```

No database, no build step, no external npm dependencies.

---

## Requirements

- Node.js 18 or later — https://nodejs.org/
- A Sarvam API key — https://dashboard.sarvam.ai/

---

## Setup and run (Windows)

```
cd prototype
copy .env.example .env
```

Open `.env` in a text editor and set your key:
```
SARVAM_API_KEY=your_real_key_here
PORT=3000
```

Start the server:
```
npm start
```

Open **http://localhost:3000** in your browser.

No `npm install` needed — the server uses only Node.js built-in modules.

---

## Configuration

| Variable | Required | Description |
|---|---|---|
| `SARVAM_API_KEY` | Yes | Your Sarvam API key from dashboard.sarvam.ai |
| `PORT` | No | Port (default: 3000) |

---

## API integration

The server sends:

| Parameter | Value | Notes |
|---|---|---|
| `model` | `sarvam-105b` | 128K context; recommended for reasoning |
| `messages` | `[{role:"user", content:<prompt>}]` | Prompt instructs structured JSON output |
| `max_tokens` | `2048` | Max reply tokens |
| `temperature` | `0.2` | Focused output |
| `reasoning_effort` | `null` | Disables internal chain-of-thought; output goes to `content` |

Auth header: `api-subscription-key: <SARVAM_API_KEY>`  
Only `choices[0].message.content` is returned. `reasoning_content` is never exposed.

The prompt instructs the model to return a JSON object with six keys. If the model returns unstructured text, the server falls back gracefully and returns it as-is.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Full browser UI — navigation, hero, how-it-works, features, explorer, FAQ, footer |
| `server.mjs` | Node HTTP server + Sarvam integration + structured JSON parsing |
| `test.mjs` | 35-test backend suite (no external test runner) |
| `package.json` | Start and test scripts |
| `.env.example` | Placeholder — copy to `.env` and add your key |
| `PROJECT_SPEC.md` | Product specification |

---

## Running tests

```
npm test
```

No API key needed — all Sarvam calls are mocked.

---

## Test results (verified in this session)

**Unit and integration tests (node test.mjs):**
- 35 tests, 35 passed, 0 failed

**Server smoke tests (curl / Invoke-WebRequest):**
- `node --check server.mjs` — syntax valid
- `GET /` — HTTP 200, correct HTML page
- `GET /health` — `{"status":"ok","apiKeyConfigured":false,"model":"sarvam-105b"}`
- `POST /api/explain` with empty code — HTTP 400, `{"error":"Paste a code snippet first."}`
- `POST /api/explain` with whitespace code — HTTP 400
- `POST /api/explain` with 30,001-char code — HTTP 400
- `POST /api/explain` with no API key — HTTP 503, `{"error":"SARVAM_API_KEY is not configured..."}`

**Live API test:**  
Not re-run in this session (no key available in this environment). A live call was confirmed in a prior session with `def add(a, b): return a + b`; Sarvam-105B returned a 2157-character structured explanation. See Build-Summary for details.

**Not verified in this session:**
- Multilingual explanation quality
- Stranger / usability testing

---

## Error handling

| Situation | Response |
|---|---|
| Empty input | HTTP 400: "Paste a code snippet first." |
| Whitespace-only input | HTTP 400: "Paste a code snippet first." |
| Input over 30,000 chars | HTTP 400: "Code must be under 30,000 characters." |
| Missing API key | HTTP 503: key setup instructions |
| Invalid API key | HTTP 502: "Invalid Sarvam API key" with guidance |
| Rate limit | HTTP 429: "Try again in a moment." |
| Network error | HTTP 502: network error message |
| Non-JSON Sarvam response | HTTP 502: "non-JSON response" error |
| Malformed / unstructured model output | Falls back to raw text; never crashes |

---

## Security

- The API key lives only in `prototype/.env` on your machine.
- `.env` is excluded from Git and from the submission ZIP.
- The browser never receives the API key.
- Code is analysed as text — never executed on the server.
- No shell execution, eval, or dynamic imports.
- No user data is stored; no database is used.

---

## Known limitations

- Accepts snippets only — does not index a full repository.
- Does not modify code.
- Does not cite tests, call sites, Git history, or other external evidence sources.
- Explanation quality depends on Sarvam-105B capabilities for the chosen language.
- This is a local prototype — no hosted deployment is available.

---

## Future improvements

1. Repository evidence ingestion: link model claims to tests, call sites, and Git history.
2. Evidence anchoring: highlight specific lines in the code viewer that correspond to each explanation section.
3. Stranger test: run with a developer unfamiliar with the tool to validate the flow.

---

## Official documentation

- Sarvam API: https://docs.sarvam.ai/
- Chat Completions: https://docs.sarvam.ai/api-reference/chat/chat-completions
- Authentication: https://docs.sarvam.ai/api-reference/authentication
