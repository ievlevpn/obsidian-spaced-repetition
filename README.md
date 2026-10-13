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
- Mobile: pull a card down from its top to open the card menu, mark it important, bury it until
  tomorrow, or suspend it (chosen on the _Mobile_ settings page). A card scrolled down scrolls back up first, so
  it never competes with scrolling. "Bury until tomorrow" is also in the card menu, and Undo
  brings a buried card back.
- A "due first, then random" card order, and a menu on each deck (right-click, or long-press on a
  phone) to review it in another card order for one session.
- "Due and new mixed" card order: each card drawn at random from all decks, new with a chance set
  on a slider (from due only to new only), due otherwise. From a deck's menu it asks for the
  chance each time; in settings it is a slider under the card order.
- Type the answer: switched on per session from the card menu. A card with a short plain-text
  answer gets a one-line field (an Obsidian editor with live preview; Enter checks), and text
  cloze blanks become fields (math clozes do not). All of them share one quiet look: a soft fill
  and an underline that takes the accent colour while typing. Ported from
  [Flashcard Studio](https://github.com/Almalkiid/flashcard-studio) (MIT), with a smarter
  comparison:
  - word by word: words are paired with words and letters compared within a pair, so a missing
    or extra word is marked as a whole;
  - typos count as right: an extra, missing, wrong or swapped letter (none in words of up to 3
    letters, 1 up to 7, 2 beyond) is marked in amber, and Good is suggested rather than Again;
  - an answer listing alternatives (`gloomy, sullen; угрюмый`, split at `,` `;` `/`) accepts any
    one of them, or several in any order;
  - an answer far from the right one (a different phrasing), or a cloze blank with math, is not
    marked letter by letter: what was typed is shown as it is, beside the answer.

  Every other card
  (a long or multi-line answer, math, a cloze card whose blanks are all math) gets a free box,
  an Obsidian editor with live preview and latex-suite: Check (or Mod+Enter) shows what was typed
  next to the answer (below by default; above, left or right in settings), with nothing compared
  or suggested.
- A quiet "new" / "seen" label on each card.
- A thin progress line under the card toolbar (can be turned off in the settings).
- In a cloze card taller than the view, the cloze being asked (and then its answer) is scrolled
  into view.
- Important cards: mark a card with `I` or from the card menu (a star shows on it). Review only the
  important cards of a deck from its menu; optionally show them first in every review, and, with
  FSRS, schedule them for a higher retention (settings, _Important cards_).
- Suspend a card from the card menu: it leaves every review until unsuspended. _Suspended cards_
  (deck list header, or the command palette) lists them with Open and Unsuspend.
- Both are stored as markers after the card's schedule (`<!--SR:!...,imp,susp-->`), which the
  original plugin ignores.
- Answer keys: the original layout (1 Hard, 2 Good, 3 Easy, 0 Reset) or Anki's (1 Again, 2 Hard,
  3 Good, 4 Easy), chosen in the settings. Ported from Flashcard Studio.
- The edit card window uses the same embedded Obsidian editor as card notes. Tab moves between
  the front and back fields (except on a list line or inside math, where Tab stays with the editor
  for indenting and latex-suite's tabstops), Mod+Enter saves, and Esc cancels, asking first if
  something was changed. Save and Cancel show their keys (⌘↵ / Ctrl+↵, Esc) in the corner, like
  the rating buttons.
- The whole review works from the keyboard (desktop). On a card: `E` edit, `T` type answers on or
  off, `N` write a note (answer side), `M` the card menu (arrow keys and Enter), `B` bury, `R`
  reset (asks; Enter confirms), `C` card info, `Backspace` back to the deck list, `?` the list of
  keys; besides Space/Enter, the digits, `S` skip, `U` undo, `I` important and `J` jump to the
  note. `Shift+S` suspends the card (a notice confirms it, and `U` brings it back); delete stays
  in the card menu. In the deck list: arrow keys move between decks
  and open or close subdecks, Enter reviews, `M` (or the menu key) opens the deck's menu.
  In any answer field (a cloze blank, the typed answer, the note box) Esc only leaves the field, so
  the review keys work again (`S` to skip, ...); it never closes the review window. `Tab` (on the
  question side) puts the cursor back in the answer field.
- _Live preview in cloze blanks_ (settings, off by default; desktop only): each blank is an Obsidian
  editor inline in the text, so math renders as you type and latex-suite works. Enter checks, Esc
  leaves the blank.
- Type answers by default in some decks: _Type answers in this deck_ in a deck's menu. Subdecks
  follow the nearest deck above them that is set either way; `T` still switches it for a session.

**Card notes**

- Write notes on a card while reviewing; they are stored as a markdown footnote in the note,
  with dated entries.
- The note box is a real Obsidian editor (live preview, editor plugins such as latex-suite).
  Past notes can be edited or deleted, saved right away (`Ctrl/Cmd+Enter`, shown beside the save
  link), and long histories are folded. Esc leaves the box (and hands the review keys back)
  rather than closing the review window.

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
