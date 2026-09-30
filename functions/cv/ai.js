// The model behind "Condense" on the server. One small interface,
// complete({ system, user }) -> text, with two implementations: Anthropic,
// and any OpenAI-compatible chat endpoint (OpenAI, OpenRouter, Ollama,
// LM Studio). A deployed function can only reach hosted providers; the
// emulator can point "openai" at a model on this machine.

const PROVIDERS = ["anthropic", "openai"];
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

// Returns a provider, or null when none is configured.
function createProvider({ provider, model, baseUrl, apiKey } = {}) {
  const name = (provider || "").trim().toLowerCase();
  if (!name) return null;
  if (!PROVIDERS.includes(name))
    throw new Error(`Unknown AI provider "${name}" (use anthropic or openai)`);
  const chosen = (model || "").trim();
  const key = (apiKey || "").trim();
  if (name === "anthropic") {
    if (!key) throw new Error("AI_API_KEY is not set for the Anthropic provider");
    const m = chosen || DEFAULT_ANTHROPIC_MODEL;
    return { name, model: m, complete: anthropic(m, key) };
  }
  // OpenAI-compatible endpoints differ too much for a default model.
  if (!chosen) throw new Error("AI_MODEL is required for the openai provider");
  const root = ((baseUrl || "").trim() || DEFAULT_OPENAI_BASE_URL).replace(
    /\/+$/,
    ""
  );
  return { name, model: chosen, complete: openaiCompatible(chosen, root, key) };
}

function anthropic(model, apiKey) {
  return async ({ system, user }) => {
    // Loaded on demand so the other provider and the tests never pay for it.
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") {
      const why = response.stop_details && response.stop_details.explanation;
      throw new Error(`The model declined${why ? `: ${why}` : ""}`);
    }
    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  };
}

function openaiCompatible(model, baseUrl, apiKey) {
  return async ({ system, user }) => {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      throw new Error(`${baseUrl} answered ${res.status}: ${body.slice(0, 300)}`);
    }
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(`${baseUrl} did not return JSON`);
    }
    const choice = data.choices && data.choices[0];
    const content = choice && choice.message && choice.message.content;
    if (typeof content !== "string")
      throw new Error(`${baseUrl} returned no message content`);
    return content;
  };
}

module.exports = { createProvider, PROVIDERS, DEFAULT_ANTHROPIC_MODEL };
