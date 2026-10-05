# Spaced Repetition — personal fork

> **This is a personal fork, maintained for one person's own vault. It comes with no guarantees,
> no support and no release schedule. Features can change or disappear at any time, and some of
> them rely on Obsidian internals that may break with future Obsidian versions. If you want the
> plugin, use the original: [st3v3nmw/obsidian-spaced-repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition).**

This fork is based on [Obsidian Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition)
by Stephen Mwangi (version 1.15.4). For what the plugin does and how to use it, see the
[original README](https://github.com/st3v3nmw/obsidian-spaced-repetition#readme) (also kept here as
[README-upstream.md](README-upstream.md)) and the
[documentation](https://stephenmwangi.com/obsidian-spaced-repetition/).

## What this fork adds

**Math clozes**

- `\cloze[seq]{answer}{hint}` inside `$...$` / `$$...$$`, with optional sequence numbers or
  overlapping strings (`[2]`, `[ahs]`) and an optional hint; it renders as the answer when reading.
  Submitted upstream as [#1584](https://github.com/st3v3nmw/obsidian-spaced-repetition/pull/1584).
- Inside math, braces belong to LaTeX: `{{...}}` there is never a cloze. `\cloze` outside math is
  plain text.

**Card format** (with the end marker set to `---`)

- A card runs from one `---` to the next, blank lines included, so whole passages of a note can be
  one card; lead-in prose is part of it.
- One-line cloze cards: a `+` list item with a cloze, or every cloze line of a note with
  `sr-inline: true` in its frontmatter. Such cards show the line above the list (and parent
  bullets) as context.
- An inline `:::` card no longer discards the card above it; a card right after an HTML comment
  is no longer skipped; indented cards (from nested lists) no longer render as code blocks.

**Reviewing**

- Undo: go back to the previous card after an answer or skip (button, or `U`), restoring its
  schedule in the note.
- Mobile: swipe left from the right edge to skip, with visual feedback (toggle in a new
  _Mobile_ settings page); Skip stays visible in the phone toolbar.
- A "due first, then random" card order.

**Card notes**

- Write notes on a card while reviewing; they are stored as a markdown footnote in the note,
  with dated entries.
- The note box is a real Obsidian editor (live preview, editor plugins such as latex-suite).
  Past notes can be edited or deleted, saved right away (`Ctrl/Cmd+Enter`), and long histories
  are folded.

**Fork housekeeping**

- The manifest version is `900.0.0`, so Obsidian never offers the store version as an update
  (which would replace the fork), and the built-in upstream update check is off.

## Installing

There are no releases. Build it and copy the three files over the plugin's folder in a vault:

```bash
pnpm install
pnpm build
cp build/main.js manifest.json styles.css <vault>/.obsidian/plugins/obsidian-spaced-repetition/
```

The plugin id is unchanged, so the existing settings and review data are kept. Do not update the
plugin from Obsidian's community plugin list afterwards: that installs the original over it.

## License

MIT, as the original: see [LICENSE](LICENSE). Original work © 2021–2024 Stephen Mwangi; the
fork's changes are released under the same license.
