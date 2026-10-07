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
- A `\cloze` shown as its answer (on a sibling card) no longer runs into a command next to it:
  `\le\cloze{c_0}{}` gives `\le c_0`, not `\lec_0`.

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
- Mobile: swipe left from the right edge to skip and right from the left edge to go back, with
  visual feedback (toggles in a new _Mobile_ settings page); Skip stays visible in the phone
  toolbar.
- A "due first, then random" card order, and a menu on each deck (right-click, or long-press on a
  phone) to review it in another card order for one session.
- Type the answer: switched on per session from the card menu. A card with a short plain-text
  answer gets a field, and text cloze blanks become fields (math clozes do not). The back marks
  wrong and missing letters, and Good or Again is suggested. Ported from
  [Flashcard Studio](https://github.com/Almalkiid/flashcard-studio) (MIT).
- A quiet "new" / "seen" label on each card.
- Important cards: mark a card with `I` or from the card menu (a star shows on it). Review only the
  important cards of a deck from its menu; optionally show them first in every review, and, with
  FSRS, schedule them for a higher retention (settings, _Important cards_).
- Suspend a card from the card menu: it leaves every review until unsuspended. _Suspended cards_
  (deck list header, or the command palette) lists them with Open and Unsuspend.
- Both are stored as markers after the card's schedule (`<!--SR:!...,imp,susp-->`), which the
  original plugin ignores.
- Answer keys: the original layout (1 Hard, 2 Good, 3 Easy, 0 Reset) or Anki's (1 Again, 2 Hard,
  3 Good, 4 Easy), chosen in the settings. Ported from Flashcard Studio.
- The edit card window uses the same embedded Obsidian editor as card notes.

**Card notes**

- Write notes on a card while reviewing; they are stored as a markdown footnote in the note,
  with dated entries.
- The note box is a real Obsidian editor (live preview, editor plugins such as latex-suite).
  Past notes can be edited or deleted, saved right away (`Ctrl/Cmd+Enter`), and long histories
  are folded.

**Performance**

- Parsed notes are kept between syncs and reused while their file is unchanged, so opening a
  review re-reads only the notes that changed instead of every flashcard note (cleared on any
  settings change and each new day). Page ranks for the note review queue are reused while the
  links between notes are unchanged, and math detection skips text without a `$`.
- A note's frontmatter is split off without splitting the whole note into lines.
- Measured on a vault of ~1,070 flashcard notes (~30,000 cards), in plain Node: a refresh with
  nothing changed (opening a review, the reminder timer) went from ~960 ms to ~80 ms, about 11×
  faster; the first load at startup from ~1,080 ms to ~960 ms, about 11% faster.

**Unmerged upstream fixes**, ported with credit to their authors:

- [#1587](https://github.com/st3v3nmw/obsidian-spaced-repetition/pull/1587) by Lorite: notes are
  parsed from Obsidian's cache, not re-read from disk on every review.
- [#1610](https://github.com/st3v3nmw/obsidian-spaced-repetition/pull/1610) by Kian Kyars: FSRS
  settings apply without a reload, FSRS placeholders for unreviewed siblings, due-date stats.
- [#1629](https://github.com/st3v3nmw/obsidian-spaced-repetition/pull/1629) by mayuriphad: a new
  card answered Again comes back in the same session.
- [#1601](https://github.com/st3v3nmw/obsidian-spaced-repetition/pull/1601) by Gwyndolin:
  short-term FSRS cards are requeued on time.

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
