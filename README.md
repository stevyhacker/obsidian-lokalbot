# LokalBot for Obsidian

Search, sync, and ask your local [LokalBot](https://www.lokalbot.com/) meeting notes, transcripts, and open action items directly inside Obsidian — with zero cloud uploads and no account.

## Features

- **Meetings sidebar:** Browse recent meetings, open or import Markdown notes with YAML frontmatter (`lokalbot_id`, date, duration, source, tags), summary, action items checklist, and an optional collapsed transcript callout.
- **Idempotent vault sync:** Batch-sync recent meetings into your configured folder (default `Meetings/`) without creating duplicate notes.
- **Full-text search across meetings:** Search titles, summaries, and transcripts from the sidebar or Command Palette (`Search meetings`), even when the LokalBot desktop app is closed.
- **Open action items for Daily Notes:** Browse open and overdue commitments in the sidebar, or run `Insert open action items` to drop a `- [ ]` checklist right at your cursor.
- **Ask your meetings locally:** Run `Ask about your meetings` to query LokalBot's on-device model and insert a cited answer callout block with links back to the source meetings.
- **Catch-up briefing:** Run `Insert catch-up briefing` (`lokalbot-cli brief`) to drop a concise summary of recent work and open actions into your Daily Note.

## Privacy & local-first architecture

- Makes **zero network requests** from Obsidian.
- Reads your local library strictly through the bundled read-only `lokalbot-cli` executable on macOS, Windows, and Linux.
- Never modifies or deletes files inside LokalBot's library.

## Prerequisites

1. **Install [LokalBot](https://www.lokalbot.com/)** (free, open source, GPLv3):
   - **macOS (Apple Silicon, macOS 15+):** `brew install --cask stevyhacker/tap/lokalbot` or download the `.dmg` from [GitHub Releases](https://github.com/stevyhacker/LokalBot/releases/latest)
   - **Windows (x64):** `scoop bucket add lokalbot https://github.com/stevyhacker/scoop-bucket && scoop install lokalbot/lokalbot` or run the Windows installer from [GitHub Releases](https://github.com/stevyhacker/LokalBot/releases/latest)
   - **Linux (x86_64):** install the `.deb`, `.rpm`, Arch package, or tarball from [GitHub Releases](https://github.com/stevyhacker/LokalBot/releases/latest)
2. **Allow read-only external access in LokalBot:**
   - macOS: **Settings → External Agents** → enable **Allow external agents to read your LokalBot data** and tick **Meetings**.
   - Windows & Linux: **Settings → AI agents** → enable **Meetings**.

## Commands

Open the Command Palette (`Cmd/Ctrl+P`) and search for **LokalBot**:

- `Open meetings sidebar`
- `Search meetings`
- `Sync recent meetings to vault`
- `Insert open action items`
- `Ask about your meetings`
- `Insert catch-up briefing`

## Development

```bash
npm install
npm test
npm run lint
npm run build
```

## License

GNU General Public License v3.0 (`GPL-3.0-only`), matching [LokalBot](https://github.com/stevyhacker/LokalBot).
