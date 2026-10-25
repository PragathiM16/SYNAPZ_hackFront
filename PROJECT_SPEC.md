# PROJECT_SPEC.md — CodeWhy / SYNAPZ / Sarvam Track

## 1. User

Developers who inherit or must modify unfamiliar code and need to understand it before changing behaviour.

## 2. Problem

Developers can observe what code does but often cannot reconstruct why it was structured that way. Before changing it they must piece together context from tests, documentation, call sites, Git history, and teammates. CodeWhy provides a fast first-pass explanation that separates observable fact from inference so the developer knows which claims to verify.

## 3. One flow

Paste a code snippet → choose explanation language (English or Indian language) → click Explain → Sarvam-105B analyses it → explanation distinguishes observable behaviour from inference → developer verifies uncertain intent before editing.

## 4. Architecture

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
Sarvam AI  →  explanation text
    |
    | JSON {explanation}
    v
Browser displays explanation
```

No database, no build step, no external npm dependencies. The server loads `.env` using Node.js built-ins.

## 5. Requirements

- Accept a focused code snippet (max 30,000 characters).
- Call Sarvam-105B via the official Chat Completions API.
- Support English and ten Indian-language explanation options.
- Explicitly separate observable behaviour from inference in the prompt and in the displayed output.
- Never expose the API key to browser code or return it in any response.
- Handle empty input, missing key, invalid key (HTTP 403), rate limit (HTTP 429), and network errors with readable messages.
- Provide a loading state so the user knows a request is in progress.
- Work with a plain Node.js server — no install step required.

## 6. API integration (verified against official docs, 24 Oct 2026)

- Endpoint: `POST https://api.sarvam.ai/v1/chat/completions`
- Auth header: `api-subscription-key: <key>` (preferred per official Sarvam docs)
- Model: `sarvam-105b` (128K context, recommended for reasoning and agentic tasks)
- Auth failure status: HTTP 403 with `error.code = "invalid_api_key_error"`
- Parameters sent: `model`, `messages`, `max_tokens: 2048`, `temperature: 0.2`, `reasoning_effort: null`
- `reasoning_effort: null` disables internal chain-of-thought so the model outputs visible text directly
- Only `choices[0].message.content` is returned to the user; internal `reasoning_content` is never exposed

## 7. Exclusions

- No automatic code modification.
- No claim that Sarvam knows the original author's undocumented historical intent as fact.
- No repository-wide indexing in Module 1.
- No credentials in the ZIP, source, screenshots, or documentation.
- No fabricated user research, interviews, or market-size figures.

## 8. Success criteria

- A stranger completes the flow without coaching.
- The explanation is readable in the selected language.
- Observable claims and inferences are visibly separated.
- API errors show a readable message rather than a crash or fake AI output.
- At least one concrete verification step is included in every response.

## 9. Stack and rationale

| Layer | Choice | Reason |
|---|---|---|
| Frontend | HTML / CSS / Vanilla JS | No build step; portable; easy to inspect |
| Backend | Node.js native HTTP | No npm install; minimal surface area |
| AI | Sarvam-105B via Chat Completions API | Required by the track; 128K context suits code |
| Storage | None | Not needed for Module 1 |

## 10. Test status (24 Oct 2026)

**Verified — observed in this session:**
- JavaScript syntax check: `node --check server.mjs` — pass
- `GET /` — HTTP 200, correct HTML page
- `GET /health` — `{"status":"ok","apiKeyConfigured":true}` when key present
- `POST /api/explain` with empty code — HTTP 400, `{"error":"Paste a code snippet first."}`
- **Live Sarvam API call** — `POST /api/explain` with a real key and `def add(a, b): return a + b` returned HTTP 200; `sarvam-105b` returned a 2157-character structured explanation covering observable behaviour, control flow, dependencies, inferences, and verification steps

**Not verified:**
- `POST /api/explain` with no key configured — confirmed in a prior session (HTTP 503); not re-run in this session
- Multilingual output quality
- Human usability / stranger test

## 11. Limitations

- Accepts snippets only — does not index a full repository.
- Does not modify code.
- Does not cite tests, call sites, or Git history (planned for future iteration).
- Explanation quality depends on Sarvam-105B capabilities for the chosen language.

## 12. Future work (if user tests validate the approach)

Add repository evidence ingestion: tests, call sites, documentation, and Git history. Link model claims to those sources so the explanation distinguishes "I inferred this" from "the tests say this."
