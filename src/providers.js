// Each provider describes how to call its official token-counting endpoint.
// Keys are only ever placed in request headers, never in URLs, storage or logs.

export const PROVIDERS = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    keyPlaceholder: "sk-ant-...",
    docsUrl: "https://docs.anthropic.com/en/docs/build-with-claude/token-counting",
    host: "api.anthropic.com",
    // Source: platform.claude.com/docs/en/about-claude/models/overview (checked 2026-11-23).
    models: [
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
      { id: "claude-fable-5-2", label: "Claude Fable 5.2" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
      { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    ],
    note: "Counts are for a single user message, so they include a few tokens of message-format overhead.",
    request: ({ apiKey, model, text }) => ({
      url: "https://api.anthropic.com/v1/messages/count_tokens",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        // Required by Anthropic for calls made directly from a browser (CORS).
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: { model, messages: [{ role: "user", content: text }] },
    }),
    parse: (data) => data?.input_tokens,
  },

  openai: {
    id: "openai",
    label: "OpenAI",
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/docs/guides/token-counting",
    host: "api.openai.com",
    // Source: developers.openai.com/api/docs/models/all (checked 2026-11-23). Current general text
    // models only: deprecated/shut-down, specialized (cyber, life-sciences) and open-weight ones are omitted.
    models: [
      { id: "gpt-6-luna", label: "GPT-6 Luna" },
      { id: "gpt-6-sol", label: "GPT-6 Sol" },
      { id: "gpt-6-astra", label: "GPT-6 Astra" },
      { id: "gpt-6.1-terra", label: "GPT-6.1 Terra" },
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
      { id: "gpt-6.2-sol", label: "GPT-6.2 Sol" },
      { id: "gpt-6.2-astra", label: "GPT-6.2 Astra" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.5-pro", label: "GPT-5.5 Pro" },
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
      { id: "gpt-5.4-pro", label: "GPT-5.4 Pro" },
      { id: "gpt-5.2", label: "GPT-5.2" },
      { id: "gpt-5.2-pro", label: "GPT-5.2 Pro" },
    ],
    note: "Uses the Responses API input-token counting endpoint (POST /v1/responses/input_tokens).",
    request: ({ apiKey, model, text }) => ({
      url: "https://api.openai.com/v1/responses/input_tokens",
      headers: { authorization: `Bearer ${apiKey}` },
      body: { model, input: text },
    }),
    parse: (data) => data?.input_tokens,
  },

  gemini: {
    id: "gemini",
    label: "Gemini",
    keyPlaceholder: "AIza...",
    docsUrl: "https://ai.google.dev/gemini-api/docs/tokens",
    host: "generativelanguage.googleapis.com",
    // Source: aistudio.google.com/docs/models (checked 2026-11-23). Current language models only:
    // deprecated (2.5 Flash/Pro), shut-down, agent and non-text (image, audio, embedding) models are omitted.
    models: [
      { id: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen" },
      { id: "gemini-4-carbon", label: "Gemini 4 Carbon" },
      { id: "gemini-4-neon", label: "Gemini 4 Neon" },
      { id: "gemini-4-argon", label: "Gemini 4 Argon" },
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
      { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
    ],
    note: "Uses the Gemini API models.countTokens method.",
    request: ({ apiKey, model, text }) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:countTokens`,
      headers: { "x-goog-api-key": apiKey },
      body: { contents: [{ parts: [{ text }] }] },
    }),
    parse: (data) => data?.totalTokens,
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

export class ApiError extends Error {
  constructor(message, { status, fatal = false } = {}) {
    super(message);
    this.status = status;
    // fatal = the same error would hit every sample (bad key, wrong model, offline)
    this.fatal = fatal;
  }
}

function describeStatus(status, apiMessage) {
  const detail = apiMessage ? `: ${apiMessage}` : ".";
  // Gemini reports an invalid key as HTTP 400 rather than 401.
  if (status === 400 && /api key|api_key/i.test(apiMessage)) {
    return ["Invalid API key. Check the key and try again.", true];
  }
  switch (status) {
    case 401:
      return ["Invalid API key. Check the key and try again.", true];
    case 403:
      return [`This API key is not permitted to use this API${detail}`, true];
    case 404:
      return ["Model not found or not available to this key.", true];
    case 429:
      return [`Rate limit or quota reached${detail}`, false];
    case 400:
      return [`Bad request${detail}`, false];
    case 413:
      return ["Text is too large for the API.", false];
    case 529:
      return ["The API is overloaded. Try again shortly.", false];
    default:
      if (status >= 500) return ["The API had a server error. Try again shortly.", false];
      return [`Request failed (HTTP ${status})${detail}`, false];
  }
}

/** Returns the input token count for one text sample. Never logs the key. */
export async function countTokens({ provider, apiKey, model, text, signal }) {
  const { url, headers, body } = PROVIDERS[provider].request({ apiKey, model, text });

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      signal,
      referrerPolicy: "no-referrer",
      credentials: "omit",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError("Network error. Check your internet connection and try again.", { fatal: true });
  }

  if (!res.ok) {
    let apiMessage = "";
    try {
      apiMessage = (await res.json())?.error?.message ?? "";
    } catch {
      /* non-JSON error body */
    }
    const [message, fatal] = describeStatus(res.status, apiMessage);
    throw new ApiError(message, { status: res.status, fatal });
  }

  const tokens = PROVIDERS[provider].parse(await res.json());
  if (typeof tokens !== "number") throw new ApiError("Unexpected response from the API.");
  return tokens;
}
