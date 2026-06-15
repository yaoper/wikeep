# Chrome DevTools MCP — setup for Wikeep development

Google's `chrome-devtools-mcp` gives Claude real Chrome DevTools powers (navigate,
inspect the DOM, read the console, capture network requests, run JS in the page,
record performance traces, take screenshots). This is useful for debugging the
Wikeep side panel, content script, and DeepWiki capture flow.

## Requirements

- **Node.js** LTS (18+; 22 recommended — your Nix flake already provides `nodejs_22`).
- **Google Chrome** installed (stable channel by default).
- macOS / Apple Silicon: both are fine.

No global install is needed — `npx` downloads the server on first run.

## 1. Add the MCP server to the Claude desktop app

Open the config file:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

(In the app you can also reach it via **Settings → Developer → Edit Config**.)

Add a `chrome-devtools` entry under `mcpServers` (merge with anything already there):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

Save and **fully restart** the Claude app. The Chrome DevTools tools will then be
available. Quick test prompt: *"Use Chrome DevTools to open example.com and list the console messages."*

`@latest` keeps you on the newest server version automatically.

## 2. Make it debug the Wikeep extension (important)

By default the server launches its **own** fresh Chrome with **no extensions**, so
it won't see Wikeep. To debug the actual extension, start Chrome yourself with the
unpacked `dist/` loaded **and** a remote-debugging port, then have the MCP connect
to that instance.

### a) Launch Chrome with Wikeep + remote debugging

```bash
nix develop --command npm run build   # ensure dist/ is current

open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir="$PWD/.chrome-dev-profile" \
  --disable-extensions-except="$PWD/dist" \
  --load-extension="$PWD/dist"
```

> Tip: this is your existing `wikeep-open-chrome` helper plus
> `--remote-debugging-port=9222`. You can add that one flag to the helper in
> `flake.nix` so it's always debuggable. See section 3.

### b) Point the MCP at the running instance

Change the config args to connect instead of launching its own browser:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--browserUrl=http://127.0.0.1:9222"
      ]
    }
  }
}
```

Restart the app. Now Claude's DevTools tools operate on the Chrome that has Wikeep
loaded — you can inspect the side panel page, read the content script's console on
`deepwiki.com/search/*`, and watch the `api.devin.ai/ada/query/*` network calls.

> Chrome 144+ alternative: enable remote debugging at `chrome://inspect/#remote-debugging`
> and use `--autoConnect` instead of `--browserUrl`.

## 3. Optional: bake the debug flag into `wikeep-open-chrome`

In `flake.nix`, add the remote-debugging port to the macOS launch branch so the
helper always opens a debuggable browser:

```diff
   if [ -d "/Applications/Google Chrome.app" ]; then
-    exec open -na "Google Chrome" --args "''${FLAGS[@]}"
+    exec open -na "Google Chrome" --args --remote-debugging-port=9222 "''${FLAGS[@]}"
   fi
```

Then `wikeep-open-chrome` + the `--browserUrl` config in section 2 is a one-command
debug setup.

## Useful flags

- `--browserUrl=http://127.0.0.1:9222` — attach to a running Chrome (extension debugging).
- `--autoConnect` — auto-attach to a Chrome that enabled remote debugging (Chrome 144+).
- `--channel=canary|beta|dev` — use a non-stable Chrome channel.
- `--headless` — run without a visible window (not useful for manual side-panel testing).
- `--isolated` — temporary, auto-cleaned user-data-dir.
- `npx chrome-devtools-mcp@latest --help` — list everything.

## Security note

This MCP can drive a real browser and execute JavaScript in pages. Only connect it
to Chrome instances and sites you trust, and avoid pointing it at a profile with
sensitive logged-in sessions. The `.chrome-dev-profile/` used above is a throwaway
profile, which is the safe choice for development.

## Reference

Official repo: https://github.com/ChromeDevTools/chrome-devtools-mcp
