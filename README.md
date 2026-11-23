# LLM Token Counter (Anthropic · OpenAI · Gemini)

A React (Vite) app that counts tokens for predefined text samples using each provider's official
token counting API. Enter your own key(s) and compare the counts side by side.

| Provider | Endpoint | Docs |
|---|---|---|
| Anthropic | `POST /v1/messages/count_tokens` | [docs](https://docs.anthropic.com/en/docs/build-with-claude/token-counting) |
| OpenAI | `POST /v1/responses/input_tokens` | [docs](https://platform.openai.com/docs/guides/token-counting) |
| Gemini | `POST /v1beta/models/{model}:countTokens` | [docs](https://ai.google.dev/gemini-api/docs/tokens) |

## Setup

Requires Node.js 18+ and an API key for at least one provider.

```bash
npm install
npm run dev      # http://localhost:5173
```

Production build: `npm run build`, then `npm run preview`.

## Usage

1. Paste an API key for **at least one** provider. The other two are optional; add more to compare providers side by
   side. Each provider has its own card, key field and model dropdown, and only providers with a key take part.
2. Click **Count All Sample Texts** (or **Count all samples** next to the Comparison heading). All requests run in
   parallel.
3. Read the **Comparison**: total tokens per provider as bars (lowest marked), and for every sample the count from each
   provider side by side, with the lowest highlighted. Each cell shows a spinner while loading.

A failure in one provider (for example a bad key) is shown on that provider's card and does not affect the others.

### Your own text

Type or paste text (up to 4000 characters) under **Try your own text** and click **Count my text** (or Ctrl+Enter). The
result appears right there, one count per provider. It is not added to the sample list or the totals.

### Counting one sample

Every sample has its own **Count this text** button (**Recount** afterwards) that counts only that sample with every
provider that has a key, without re-sending the others.

## Error handling

| Situation | Message |
|---|---|
| Empty key | Button disabled / prompt to enter a key |
| Invalid key (401, or 400 "API key not valid" on Gemini) | Invalid API key |
| 403 | Key not permitted |
| 404 | Model not available |
| 429 / 5xx / 529 | Rate-limit/quota or server messages, retry later |
| Network failure | Connectivity message |

Failures that would repeat for every sample (bad key, wrong model, offline) abort the remaining requests.

## API key security

- Held only in React component state: no `localStorage`, cookies, URL, or env file; gone on refresh.
- Each key is used only for its own provider's requests, so a key is never sent to another provider's host.
- Never hardcoded and never logged (`console` is not used anywhere).
- Sent only in request headers (never in URLs) to the selected provider's host, with `credentials: "omit"` and `no-referrer`.
- Input is `type="password"` (not inside a `<form>`, with `autocomplete="new-password"` and password-manager opt-out attributes); Delete a key by clearing its field; **Clear results** keeps your keys and only resets the counts.
- No backend or proxy, so the key never touches a third-party server.
- Production builds include a Content-Security-Policy (see `vite.config.js`): scripts only from the app's own origin, and
  network requests only to the three provider APIs. If you add a provider, add its host to `connect-src`.

### Limitations

- The key is visible to you in the browser's Network tab, and a malicious browser extension with page access could read it.
  This is inherent to any browser-only app; use a dedicated, revocable, low-limit key.
- Password-manager opt-outs are requests, not guarantees; some managers ignore them.
- The CSP applies to `npm run build` / `preview` output, not the `npm run dev` server.
- Serve the built app over HTTPS (most hosts do by default).

**Browser-call note:** Anthropic blocks browser calls by default; this app sends the
`anthropic-dangerous-direct-browser-access: true` header. That is acceptable because every user supplies their
*own* key. Never embed a shared key in a front-end like this; for a shared deployment use a backend proxy.

## Project structure

```
src/providers.js  provider configs + shared fetch/error mapping
src/samples.js    predefined texts
src/App.jsx       UI (provider tabs) and state
src/styles.css    responsive, dark-mode aware styles
```
