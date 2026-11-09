# Clean AI Paste Local 1.5.1

Based on Jeremy Hou's Clean AI Paste 1.5.0, commit `985baa72753d1c7058debea9eb92c69e8239c6f8`. MIT licensed; original license retained.

## Windows: a few clicks

1. Download `Clean-AI-Paste-Local-1.5.1.zip` from this fork's Releases and extract the entire ZIP.
2. Open `Install.cmd` and choose your Obsidian vault folder (the folder containing `.obsidian`).
3. In Obsidian, open **Settings > Community plugins** and enable **Clean AI Paste Local**. Restart Obsidian if it is not listed. Disable the original **Clean AI Paste** if installed so two formatters do not compete.

The installer copies only `main.js` and `manifest.json` to `.obsidian/plugins/clean-ai-paste-local/`. It preserves local `data.json`, other plugins, and the enabled-plugin list. If no local preferences exist, it imports the original plugin's preferences once. Existing local code is backed up under the plugin's `backups` folder before replacement. Installation works offline and needs no administrator privileges. Windows may ask you to confirm opening a downloaded script.

If scripts are blocked, copy the supplied `clean-ai-paste-local` folder into `<vault>/.obsidian/plugins/`, then enable it in Obsidian. This also works on macOS/Linux; the Windows installer is optional.

## Changes

- Each parsed MathML node's TeX conversion is cached, preventing repeated recursive computation through rows, unknown tags, tables and binomials.
- MathML has input-size, node-count and nesting limits. The whole HTML paste and aggregate formula work are bounded too. Rejected formatting falls back to plain text, including the legacy paste shortcut.
- Settings use a text donation link instead of a remote Ko-fi image. User-clicked donation and GitHub links remain. No automatic clipboard upload was added.
- Separate plugin ID `clean-ai-paste-local` keeps this local fork distinct from the community-store original. It will not receive the original plugin's updates. Update this fork manually after reviewing changes.

Obsidian's own converter/renderer and OS clipboard APIs remain host dependencies. This patch is not a sandbox and does not restrict other plugins. Do not publish sensitive raw clipboard/debug data in public issue reports.

## Development

No package installation or external test dependencies are required:

```powershell
node --check main.js
node --test tests/plugin.test.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/install.test.ps1
```

Tests exercise the actual plugin code in a Node VM with stubbed Obsidian APIs. They cover the reported nested formula, unknown wrappers, table/binomial variants, resource limits, normal formula outputs, paste fallbacks and the raw-text bypass. They do not replace a real desktop/mobile Obsidian smoke test.
