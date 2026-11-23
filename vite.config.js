import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production-only Content-Security-Policy: scripts only from this origin, and the
// page may talk only to the three provider APIs. Limits damage from any injected script.
// (Skipped in `npm run dev`, where Vite needs inline scripts and a websocket.)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

const cspPlugin = {
  name: "inject-csp",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
  ],
};

export default defineConfig({ plugins: [react(), cspPlugin] });
