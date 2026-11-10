# dsh-sidebar-panel-visibility

Add a **visibility toggle for sidebar panel entries** to the DeepSeek Harness (DSH) web client. Hide the panel icons you don't want from the "More" menu — the choice survives restarts.

> A community DSH plugin. It patches nothing inside `node_modules`; everything goes through DSH's own slot contracts.

## Why

DSH's sidebar panel entries are registered by plugins, and once registered they stay visible forever. Install a few plugins that ship a panel and the left column fills up — with **no official UI to turn any of them off**.

The upstream code actually has the hook: `SidebarRoot` in `@deepseek-ai/dsh-client-ui-sidebar` passes `onPinnedChange` (its internal `setPinned`) into the `sidebar.panellist.actions` slot, but **no UI consumes it**. The package that occupies that slot, `dsh-client-ui-entry-customization`, opens with `const moreEntries = region === "conversation" ? entries : [];` — so in the sidebar (`region === "sidebar"`) it is always an empty array.

That state is also purely in memory. The upstream comment says it outright: `held in memory until plugin reload`.

This plugin does two things:

1. Registers a block of toggle rows into `sidebar.panellist.actions`, wiring up the hook upstream left dangling.
2. Persists the choice in `localStorage` and replays it when the plugin reloads.

## Install

```bash
dsh plugin --profile <your-profile> add dsh-sidebar-panel-visibility
```

Local development:

```bash
dsh plugin --profile <profile> add link:/absolute/path/dsh-sidebar-panel-visibility
```

> The desktop app owns the `desktop` profile exclusively and `dsh plugin` refuses to write to it. In that case edit `profiles/desktop/package.json`: add the package to `dependencies` (`link:` or a version) and to `dsh.profile.bundles`, then run `pnpm install` inside the profile directory.

Restart DSH afterwards.

## Usage

1. Expand the left sidebar (on narrow screens, expand it first).
2. Click the "**More**" button at the bottom of the column (the square-plus icon).
3. The top section of the menu is "**Sidebar entries**", one row per panel: name on the left, "Shown / Hidden" on the right.
4. Click a row to toggle. A hidden panel disappears from the column immediately; click again to bring it back.

The "Plugins" panel is protected by the hardcoded `FIXED_PANEL_ID` upstream and cannot be hidden — deliberately, since losing the plugin page would make the plugin manager unreachable.

## Storage

Key `dsh.sidebar.panelPins.v1`, value is the array of **hidden** panel ids:

```json
["files", "jobs"]
```

Storing the hidden set rather than the shown set means the default (key absent) naturally equals "everything visible" — the safe direction to degrade in. Any failure (storage disabled in private mode, corrupt JSON, a value written by some other script) yields an empty array: the worst case is losing the setting, never losing a panel entry.

To reset completely, delete the key in devtools or run `localStorage.removeItem("dsh.sidebar.panelPins.v1")`.

## Compatibility

| Item | Value |
| --- | --- |
| DSH | verified on 0.2.2-rc.1 |
| Platform | Web / desktop (Electron) renderer |
| Browser | any modern browser with `localStorage` |
| Slot used | `sidebar.panellist.actions` (`kind: "list"`) |
| Services used | `slots`, `locale` |

The slot is a `list`, so this plugin renders **alongside** the built-in entry-customization rather than shadowing it. It registers with `order: -10`, placing the toggles above "Browse more plugins / Create your own plugin".

## Known limitations

- **Left sidebar only.** The conversation-header and right-sidebar "More" menus do not show these toggles — the entries there have different semantics and mixing them invites misclicks.
- **Stale ids survive uninstalls.** Uninstall a plugin and its id stays in `localStorage`. Harmless (that panel no longer exists) and it takes effect again if you reinstall. No expiry cleanup for now.
- **`localStorage` is per browser.** Another browser, or clearing site data, loses the setting. That matches the "UI preference" framing; it is not written into the profile config.
- **No reordering.** Upstream `setPinned` is a boolean toggle; ordering needs a different contract and is out of scope here.

## Development

```bash
node --check lib/index.js
node --check lib/client.js
node test/storage.test.mjs
```

`test/storage.test.mjs` boots the `lib/client.js` factory behind a minimal `window` stub, so the tests exercise **the exact code that ships**, not a copy.

### Layout

```
lib/index.js    host half: an empty shell so the cordis loader can mount the plugin row
lib/client.js   browser half: toggle component + localStorage I/O + 8 locale dictionaries
cordis.patch.yml  bundle patch: inserts the plugin row into the profile
test/storage.test.mjs  pure-function unit tests
```

### Why not patch node_modules

The `@deepseek-ai/dsh-client-ui-*` packages have **no real directory** in the profile's `node_modules`; the client module loader (`window.__ModuleLoader__`) resolves them in the browser. Even if you edit a published `lib/client.js`, those files are usually pnpm store hardlinks (`nlink=2`) — writing in place pollutes the global store, so you must `unlink` first. Every DSH upgrade wipes the edit anyway.

The slot contract has none of those problems: the plugin is a standalone package, upgrades don't touch it, and uninstalling is clean.

## License

MIT

---

[![](https://img.shields.io/badge/powered_by-dafeiyu-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/Dafeiyu111)
