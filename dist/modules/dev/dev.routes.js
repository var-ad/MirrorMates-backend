"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.devRouter = void 0;
const express_1 = require("express");
const env_1 = require("../../config/env");
exports.devRouter = (0, express_1.Router)();
function renderGoogleAuthTestPage() {
    const googleClientId = env_1.env.GOOGLE_CLIENT_ID ?? "";
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MirrorMates Google Auth Test</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f1e8;
        --panel: #fffdf9;
        --ink: #1f2937;
        --muted: #5b6470;
        --line: #dccfbd;
        --accent: #b44f2b;
        --accent-soft: #f7d7c6;
        --ok: #14532d;
        --ok-bg: #dcfce7;
        --warn: #854d0e;
        --warn-bg: #fef3c7;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, #f7d7c6 0, transparent 28%),
          radial-gradient(circle at bottom right, #d6e6d9 0, transparent 24%),
          var(--bg);
        color: var(--ink);
      }

      main {
        max-width: 860px;
        margin: 0 auto;
        padding: 40px 20px 56px;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 2.5rem;
        line-height: 1.05;
      }

      p {
        margin: 0 0 16px;
        line-height: 1.6;
      }

      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 20px;
        box-shadow: 0 12px 40px rgba(31, 41, 55, 0.08);
        margin-top: 20px;
      }

      .eyebrow {
        display: inline-block;
        margin-bottom: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.85rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .status {
        display: inline-block;
        padding: 8px 12px;
        border-radius: 999px;
        font-weight: 600;
        margin-bottom: 16px;
      }

      .status.ok {
        background: var(--ok-bg);
        color: var(--ok);
      }

      .status.warn {
        background: var(--warn-bg);
        color: var(--warn);
      }

      .grid {
        display: grid;
        gap: 16px;
      }

      @media (min-width: 760px) {
        .grid {
          grid-template-columns: 1fr 1fr;
        }
      }

      .label {
        display: block;
        margin-bottom: 8px;
        font-size: 0.9rem;
        color: var(--muted);
      }

      code,
      pre {
        font-family: Consolas, "Courier New", monospace;
      }

      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        background: #f7f4ee;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 14px;
        min-height: 100px;
      }

      .mono {
        padding: 12px 14px;
        background: #f7f4ee;
        border: 1px solid var(--line);
        border-radius: 14px;
        word-break: break-all;
      }

      ol {
        margin: 0;
        padding-left: 20px;
      }

      li + li {
        margin-top: 8px;
      }

      .button-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
      }

      .button-row button {
        border: 0;
        border-radius: 999px;
        background: var(--accent);
        color: white;
        padding: 10px 16px;
        font: inherit;
        cursor: pointer;
      }

      .button-row button.secondary {
        background: #3c4a5f;
      }
    </style>
  </head>
  <body>
    <main>
      <span class="eyebrow">MirrorMates Dev Tool</span>
      <h1>Google Sign-In Test</h1>
      <p>This page helps you get a real Google <code>idToken</code> and send it to <code>/auth/google</code> on this backend.</p>

      <section class="card">
        <div id="client-status" class="status warn">Checking Google client configuration...</div>
        <p><strong>Backend origin:</strong> <span id="backend-origin"></span></p>
        <p><strong>GOOGLE_CLIENT_ID:</strong></p>
        <div id="client-id" class="mono"></div>
      </section>

      <section class="card">
        <p><strong>Before testing, make sure Google Cloud has this Authorized JavaScript origin:</strong></p>
        <div class="mono"><code id="origin-value"></code></div>
        <ol>
          <li>Open Google Cloud Console.</li>
          <li>Go to your OAuth 2.0 web client.</li>
          <li>Add the exact local origin shown above.</li>
          <li>Save, then refresh this page.</li>
        </ol>
      </section>

      <section class="card">
        <p><strong>Sign in with Google</strong></p>
        <div class="button-row">
          <div id="google-button"></div>
          <button id="retry-init" class="secondary" type="button">Retry Button Init</button>
        </div>
      </section>

      <section class="card grid">
        <div>
          <label class="label" for="token-output">Google ID token preview</label>
          <pre id="token-output">No token received yet.</pre>
        </div>
        <div>
          <label class="label" for="response-output">Backend response</label>
          <pre id="response-output">No backend call made yet.</pre>
        </div>
      </section>
    </main>

    <script>
      const googleClientId = ${JSON.stringify(googleClientId)};
      const backendOrigin = window.location.origin;
      const backendGoogleEndpoint = backendOrigin + "/auth/google";

      function setText(id, value) {
        document.getElementById(id).textContent = value;
      }

      function setJson(id, value) {
        document.getElementById(id).textContent = JSON.stringify(value, null, 2);
      }

      function setStatus(message, kind) {
        const node = document.getElementById("client-status");
        node.textContent = message;
        node.className = "status " + kind;
      }

      function initGoogleButton() {
        if (!googleClientId) {
          setStatus("GOOGLE_CLIENT_ID is missing in backend .env", "warn");
          setText("response-output", "Set GOOGLE_CLIENT_ID in the backend .env, restart the server, and refresh this page.");
          return;
        }

        if (!window.google || !window.google.accounts || !window.google.accounts.id) {
          setStatus("Google script has not loaded yet", "warn");
          return;
        }

        document.getElementById("google-button").innerHTML = "";

        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleCredentialResponse
        });

        window.google.accounts.id.renderButton(document.getElementById("google-button"), {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "signin_with"
        });

        setStatus("Google Sign-In is ready", "ok");
      }

      async function handleCredentialResponse(response) {
        const token = response && response.credential ? response.credential : "";

        if (!token) {
          setText("token-output", "Google did not return a credential.");
          return;
        }

        setText("token-output", token.slice(0, 80) + "...\\n\\nLength: " + token.length + "\\nSegments: " + token.split(".").length);

        try {
          const res = await fetch(backendGoogleEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ idToken: token })
          });

          const data = await res.json().catch(() => ({ message: "Backend returned non-JSON response" }));
          setJson("response-output", {
            status: res.status,
            ok: res.ok,
            body: data
          });
        } catch (error) {
          setJson("response-output", {
            status: "network-error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }

      window.handleCredentialResponse = handleCredentialResponse;

      setText("backend-origin", backendOrigin);
      setText("origin-value", backendOrigin);
      setText("client-id", googleClientId || "(missing)");

      document.getElementById("retry-init").addEventListener("click", initGoogleButton);
      window.addEventListener("load", initGoogleButton);
    </script>
    <script src="https://accounts.google.com/gsi/client" async defer></script>
  </body>
</html>`;
}
exports.devRouter.get("/dev/google-auth-test", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://accounts.google.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://*.googleusercontent.com",
        "connect-src 'self' https://accounts.google.com",
        "frame-src https://accounts.google.com",
        "frame-ancestors 'self'",
        "base-uri 'self'"
    ].join("; "));
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.type("html").send(renderGoogleAuthTestPage());
});
