import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

// Load .env without external deps; shell env vars take precedence
try {
  const envText = await readFile(path.join(root, ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep < 1) continue;
    const name = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (name && process.env[name] === undefined) process.env[name] = value;
  }
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

const PORT = Number(process.env.PORT) || 3000;
const ENDPOINT = "https://api.sarvam.ai/v1/chat/completions";

function send(res, status, body, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

/**
 * Build a structured prompt that instructs the model to return valid JSON
 * with the six required sections. Separating observable facts from inferences
 * is the core product promise.
 */
function buildPrompt(code, language) {
  return `You are CodeWhy, a code comprehension assistant. A developer has pasted an unfamiliar code snippet and needs to understand it before making changes. Respond in ${language}.

IMPORTANT: You must reply with ONLY a valid JSON object. No markdown fences, no prose outside the JSON. Use the exact keys shown below.

{
  "behavior": "...",
  "intent": "...",
  "evidence": "...",
  "uncertainty": "...",
  "verification": "...",
  "summary": "..."
}

Field instructions:
- "behavior": Describe only what the code demonstrably does. Cover important statements, control flow, inputs, outputs, and observable side effects. Do not claim code was executed.
- "intent": Describe plausible reasons for the implementation or design choices. EVERY claim here must be labelled as inference (e.g., "This appears to be...", "A likely reason is...", "One possible explanation is..."). Never state the original developer's intent as a verified fact.
- "evidence": Cite specific lines, function names, variable names, or expressions from the code that support your observations. Quote brief excerpts where useful. Do NOT invent line numbers or variable names that do not exist.
- "uncertainty": Identify what is ambiguous, what context is missing, and what cannot be concluded from the code alone. Distinguish established observations from AI-generated interpretations.
- "verification": Recommend concrete steps the developer can take to verify key claims. Suggest input/output examples, edge cases, or inspection steps. State expected outcomes only when reasonably derivable. Label these as suggestions until executed.
- "summary": A short, plain-language conclusion appropriate for the likely experience level of a developer reading unfamiliar code.

Code to analyse:
\`\`\`
${code}
\`\`\``;
}

/**
 * Attempt to parse the model response as structured JSON.
 * If the model wraps JSON in markdown fences, strip them first.
 * If parsing fails, return the raw text as the "behavior" field so the
 * frontend always has something meaningful to display.
 */
function parseExplanation(raw) {
  // Strip optional markdown code fences
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(cleaned);
    // Validate that it has at least one expected key
    const keys = ["behavior", "intent", "evidence", "uncertainty", "verification", "summary"];
    const hasStructure = keys.some(k => typeof parsed[k] === "string" && parsed[k].trim().length > 0);
    if (hasStructure) return { structured: true, data: parsed };
  } catch { /* fall through */ }

  // Fallback: return raw text — caller will render it as plain explanation
  return { structured: false, data: { behavior: raw.trim() } };
}

async function callSarvam(code, language) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    const e = new Error("SARVAM_API_KEY is not configured. Add it to prototype/.env.");
    e.statusCode = 503;
    throw e;
  }

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey,
      },
      body: JSON.stringify({
        model: "sarvam-105b",
        messages: [{ role: "user", content: buildPrompt(code, language) }],
        max_tokens: 2048,
        temperature: 0.2,
        reasoning_effort: null,
      }),
    });
  } catch (netErr) {
    const e = new Error("Network error reaching Sarvam API: " + netErr.message);
    e.statusCode = 502;
    throw e;
  }

  const raw = await response.text();

  if (!response.ok) {
    let errMsg = `Sarvam API returned HTTP ${response.status}.`;
    try {
      const d = JSON.parse(raw);
      if (response.status === 403) {
        errMsg = d?.error?.code === "invalid_api_key_error"
          ? "Invalid Sarvam API key. Check SARVAM_API_KEY in your .env file."
          : `Sarvam API forbidden (${d?.error?.code || 403}). Check your key and quota.`;
      } else if (response.status === 429) {
        errMsg = "Sarvam API rate limit hit. Try again in a moment.";
      } else {
        errMsg = d?.error?.message || errMsg;
      }
    } catch { /* use default errMsg */ }
    const e = new Error(errMsg);
    e.statusCode = response.status === 429 ? 429 : 502;
    throw e;
  }

  let data;
  try { data = JSON.parse(raw); }
  catch {
    const e = new Error("Sarvam returned a non-JSON response.");
    e.statusCode = 502;
    throw e;
  }

  // Only use content — reasoning_content is internal chain-of-thought and must never be shown to users.
  const text = data?.choices?.[0]?.message?.content;

  if (!text || text.trim().length === 0) {
    const e = new Error("Sarvam returned no explanation text. Try a shorter snippet.");
    e.statusCode = 502;
    throw e;
  }

  return parseExplanation(text);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    });
    return res.end();
  }

  if (req.url === "/api/explain" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      let parsed;
      try { parsed = JSON.parse(body); }
      catch { return send(res, 400, JSON.stringify({ error: "Invalid JSON body." })); }

      const { code, language = "English" } = parsed;

      if (!code || typeof code !== "string" || code.trim().length === 0)
        return send(res, 400, JSON.stringify({ error: "Paste a code snippet first." }));
      if (code.length > 30000)
        return send(res, 400, JSON.stringify({ error: "Code must be under 30,000 characters." }));
      if (typeof language !== "string" || language.trim().length === 0)
        return send(res, 400, JSON.stringify({ error: "Invalid language selection." }));

      try {
        const result = await callSarvam(code.trim(), language.trim());
        send(res, 200, JSON.stringify({ explanation: result.data, structured: result.structured }));
      } catch (err) {
        send(res, err.statusCode || 500, JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    return send(res, 200, JSON.stringify({
      status: "ok",
      apiKeyConfigured: !!process.env.SARVAM_API_KEY,
      model: "sarvam-105b",
    }));
  }

  if (req.method === "GET") {
    try {
      const html = await readFile(path.join(root, "index.html"));
      return send(res, 200, html, "text/html; charset=utf-8");
    } catch {
      return send(res, 404, JSON.stringify({ error: "Not found." }));
    }
  }

  send(res, 404, JSON.stringify({ error: "Not found." }));
});

server.listen(PORT, () => console.log(`CodeWhy running at http://localhost:${PORT}`));
