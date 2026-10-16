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

### Optional icons, navigation and details

A content view can include `icon`, a signed `data:image/png;base64,...` image (maximum 8,192 characters, dimensions up to 128×128). The shell shows content views in a horizontal, single-tap switcher. Without an icon it uses the view title's initial. Icons do not fetch external URLs.

An extension can additionally declare one view with `placement: "navigation"` and one with `placement: "detail"`. Omit `placement` for ordinary content. The navigation document occupies an 80-point strip above the content; it can render its own scrolling agent buttons, icons and arbitrary design. Details open through an explicit action, next to content on wide screens or below it on narrow screens. Both surfaces use the same HTML sandbox, MCP permissions and lifecycle as content. They are optional; `views: []` is valid too.

For example, `views: [{"id":"workspace","title":"Work"},{"id":"switcher","title":"Choose","placement":"navigation"},{"id":"inspect","title":"Details","placement":"detail"}]` needs three matching signed HTML documents (or corresponding MCP `ui://` resources). These are presentation slots, not core agent, chat or project records. All views of an extension can use its authorized MCP service and resource notifications; the service owns the selected agent and data. There is no mandatory double-click behavior. A publisher can implement other gestures within its own view.

These fields require the matching updated PC host and mobile shell. Existing views without them continue to work. Updating a package preserves its disabled state; an uninstalled package is never automatically reinstalled.

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


## Multi-PC selection in the existing chat layout

Update the Android app and PC host together. The existing dark header and three bottom destinations remain. Choose one or several PCs in the chat sidebar; All and None are available. Extensions with the same ID and verified publisher appear together. An entry and all its tool calls stay bound to the PC that produced it. An unavailable PC does not disconnect other PCs.

The first row selects an extension; the second row selects producer-defined items. Items can represent anything. Tapping an already selected item expands or collapses optional children in thinner rows. No agent, group, chat or project database is required in the shell. The optional native clients use a provider item and their existing native threads as children. Their New chat action belongs to those extensions; other producers can omit it or define different actions.

To use the native rails, declare `"navigation": {"resourceUri":"extension://navigation"}` in the signed schema-3 manifest. The owner must also grant that resource through the normal MCP connection. Serve `application/json` through standard `resources/read`; optional resource subscriptions update the rails live:

```json
{
  "items": [{"id":"group-1","title":"My group","viewId":"main","context":{"opaqueId":"123"},"children":[{"id":"child-1","title":"A detail","viewId":"main"}]}],
  "actions": [{"id":"create","title":"Create entry","glyph":"add"}]
}
```

Both arrays may be empty. IDs are unique within the tree, targets must be declared content views, and optional icons use the same bounded PNG format as view icons. Limits: 96,000 JSON characters, 512 items, depth 8, 12 actions and 4,000 characters per context object. Without this resource the shell falls back to the declared content views, with no header action. Custom navigation/detail HTML remains available through the existing optional placements.

Through the standard MCP Apps handshake, `app.getHostContext().teydra` contains `selection: {id, context?}`, `source: {id, name}`, `refreshToken` and optional opaque `state`. Handle `app.onhostcontextchanged` to update content without replacing the document. A foreground refresh or pull-to-refresh updates metadata and the token; it never repeats a writing tool call. Handle the experimental `ui/notifications/teydra/action` notification with `{id}` to execute a declared header action inside your view. Send `ui/notifications/teydra/selection` with `{id}` to select a newly created item after updating the navigation resource.

The optional `teydra/ui-state` request takes `{value: object|null}` and returns `{}` after saving. This is bounded widget state, for example unsent input, scoped by PC, verified publisher, extension and view. It is not a transcript mirror. Limits are 96,000 characters per view and 4 MiB overall; overflow returns an error and preserves existing input. Use the MCP Apps protocol request method with a real result schema and handle errors. Producers that do not need local state can ignore it entirely.

Codex 3.2.0 and the other 2.2.0 packages add this navigation resource and input preservation without expanding the existing tool/resource grants. Original catalogs and package versions remain available for older clients. New optional navigation fields require this matching host generation; older schema-3 validators may reject the new catalog until the host is updated.
