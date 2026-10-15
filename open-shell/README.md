# Open-shell extensions

These schema-3 packages run in the TeleCoding open shell. Old schema-1/2 packages remain at the parent catalog for old clients. Update **both the PC host and Android app** for this new protocol.

The previous update service is no longer available. Install this transition once using the links below. Subsequent releases read the public [GitHub update channels](https://raw.githubusercontent.com/teydra/telecoding-releases/main/channels.json), without an embedded account key or a separate version database. Project status exposes only a count, not project paths or transcripts.

- [Android](https://github.com/teydra/telecoding-releases/releases/latest/download/TeleCoding.apk)
- [PC host](https://github.com/teydra/telecoding-releases/releases/download/pc/TeleCoding-PC.zip) (Node 22 or newer)

The PC release contains the signed packages and optional MCP producer. Installed Codex, Claude Code, OpenCode and project-status extensions migrate when the new host starts. Disabled extensions stay disabled; uninstalled extensions stay uninstalled. Original state files are preserved. The previously built-in Standard conversation path is retired and is not silently reinstalled.

On a fresh PC, run `start.cmd --configure-extensions extension-source.json`, then install a package from the phone's extension library. Configuration creates a catalog source and explicit local MCP connections; it does not start models or install the provider CLIs. Codex, Claude Code and OpenCode must already be installed and signed in on that PC. Missing tools or credentials are reported by their services.

Each extension owns its chat/project selection and UI. Native provider history is read directly. Runtime jobs expose progress and explicit stopping; sending is never automatically retried after a connection loss. Codex supports native approval requests. Claude Code and OpenCode offer read/full modes, not a simulated approval flow. Provider permission controls depend on the provider; they are not OS isolation of the producer process. OpenCode's read mode supplies restrictive native permission configuration ([official CLI](https://docs.opencode.ai/docs/cli/), [permissions](https://docs.opencode.ai/docs/tools/)). The optional Codex browser connects to an existing Codex integrated browser; it does not create a replacement Chrome profile. Native voice and the former Standard agent are not provided by these packages.

## Use the producers from another MCP client

Download `native-clients.mjs` and configure an ordinary stdio MCP connection with command `node` and args `["/absolute/path/native-clients.mjs", "codex"]`. The other producer names are `claude`, `opencode`, and `status`. Optional `AGENT_CONFIG_DIR` selects the existing TeleCoding data directory. No TeleCoding transport is required for these tools.

`tools/list` describes `workspace.list`, `thread.read/create/send/status/stop`, project selection, model discovery and applicable approval/settings/browser tools. `thread.send` requires a fresh `requestId` and returns immediately; read status afterwards. `extension://state` supports standard resource subscriptions. Native transcript data remains with the provider. Old app files are read for retained project/session links; per-extension files contain configuration and native session markers, not another provider transcript.

## Publish your own views

The shell has no required chats, projects, provider, agent or official catalog. An independent publisher can supply any self-contained HTML view or `ui://` MCP HTML resource using [MCP Apps](https://apps.extensions.modelcontextprotocol.io/). HTML runs in an isolated iframe. Network, native files and devices are unavailable directly; allowed tool/resource requests go through the host's MCP connection.

Download `build-extensions.mjs`, use Node 22+, and prepare a directory of JSON files:

```json
{
  "manifest": {
    "schemaVersion": 3,
    "id": "example.workspace",
    "version": "1.0.0",
    "publisherName": "Your name",
    "presentation": {"name": "Your workspace", "description": "Your own view"},
    "views": [{"id": "main", "title": "Your workspace"}]
  },
  "documents": {"main": "<!doctype html><html><body>Your own content</body></html>"}
}
```

```text
node build-extensions.mjs --source ./sources --output ./published --key ./publisher-private.pem
```

Use an Ed25519 private key, keep it private, and preserve it for updates. The standalone builder produces signed packages, `catalog.json` and the public key. Host those files together on HTTPS. The host owner adds the catalog URL/public key to `shell.json` and explicitly configures the extension's MCP process or HTTPS endpoint and allowed tools/resources. A UI package cannot grant itself executable commands, server endpoints or broader access.

Example host configuration (use your own public key and server):

```json
{
  "sources": [{"id":"example.registry","name":"Your catalog","url":"https://example.com/catalog.json","publicKey":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}],
  "connections": {
    "example.workspace": {"transport":"stdio","command":"node","args":["/absolute/path/your-mcp-server.mjs"],"tools":["your.tool"],"resources":["ui://example/*"]}
  }
}
```

The actual signed source is `https://raw.githubusercontent.com/teydra/Teydra-Extensions/signed-release/open-shell/catalog.json`. Its key is included in the PC's `extension-source.json`. Signatures prove publisher identity and unchanged bytes, not that a publisher is harmless. `NOTICE.txt` contains the product license and the actual bundled dependency license texts. Open interfaces do not change the product's PolyForm Noncommercial license.

Validation distinguishes encrypted protocol/browser tests, Windows host execution, Android compilation and physical-device operation. A physical Android test, other operating systems and a complete voice/Workforce runtime are not implied by this release.
