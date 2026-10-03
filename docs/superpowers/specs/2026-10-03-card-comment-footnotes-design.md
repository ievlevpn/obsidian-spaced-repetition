# Per-card review comments, stored as footnotes

*Design, 2026-10-03. Branch `feat/card-comment-footnotes`, based on `upstream/main`.*

## Goal

While reviewing a flashcard, jot a thought about it and have it persist in the same note,
accumulating as a dated log. Must work on iPhone and macOS, and must never rewrite prose the
plugin does not own.

Private-fork feature: no settings toggle, no upstream-presentable shims, no migration (no
comment exists anywhere in the vault yet).

## Why this design, and what it replaces

A previous attempt stored the comment as a `> [!sr-note]` callout directly below the card. It
is archived at tag `archive/card-comments-callout` and was abandoned after review, for a
single structural reason worth recording so it is not re-attempted:

The plugin's write-back replaces a card's parsed text verbatim with `Question.formatForNote()`
output. `formatForNote` can only emit the comment **last**. But the parser accumulates lines
until a blank line, so for multi-line and cloze cards a comment block could have card content
*after* it. The writer then physically could not reproduce its input, and every repair attempt
made it worse: first it destroyed the trailing text, then — after a fix — it deleted blank
lines from inside users' fenced code blocks and appended a new callout block on every review,
without bound.

The lesson: **comment text must not live inside the region the card writer replaces.** This
design puts only a short, stable token there and keeps the text outside it.

## Storage format

A footnote reference on the card, and a footnote definition at the end of the file:

```markdown
#flashcards Gaussian width ::: $\mathbb{E}\sup_t X_t$ [^sr-a3f91c] <!--SR:!2026-11-02,14,250-->

... rest of the note ...

[^sr-a3f91c]: - *2026-10-03:* the sup is over the index set, not the sample paths
    - *2026-10-19:* finally clicked via the finite case, cf. [[Dudley's Inequality]]
```

Ordinary markdown: renders as a footnote with hover preview, found by Obsidian search,
editable by hand, survives uninstalling the fork. Dated ISO prefixes because this log is meant
to span years.

**Label scheme.** `sr-` plus six lowercase hex characters, e.g. `[^sr-a3f91c]`. Generated once
when a card first gets a comment and thereafter round-tripped verbatim as card data, never
re-derived. It must not be derived from `textHash`, because editing a card's text would then
change its label and orphan its comment. Generation checks the note's existing `[^sr-…]`
labels and retries on collision. The vault currently holds 530 footnote definitions, all
numeric (`[^1]`…`[^13]`), so the `sr-` namespace is free.

The label is also, incidentally, the stable per-card identifier this codebase lacks — card
identity is otherwise `(file path, verbatim question text, card index)`. The existing TODO at
`src/note/note-question-parser.ts:129` ("Replace question hash with a blockid -> read & write")
asks for exactly this.

## Where the reference token goes

**Immediately before the `<!--SR:...-->` comment, wherever that comment goes.**

Placement is delegated entirely to logic the plugin already has and already trusts:
`Question.isCardCommentsOnSameLine()` consults `endsWithCodeBlock()` and forces the schedule
onto its own line when a card ends in a fence. The token inherits that decision.

```
inline card, schedule on the same line (this vault's setting):
  #flashcards Q ::: A [^sr-a3f91c] <!--SR:!2026-11-02,14,250-->

multi-line card:
  #flashcards Front
  ?
  Answer text [^sr-b7102e] <!--SR:!2026-11-02,14,250-->

card ending in a code fence — the plugin already moves the schedule to its own line:
  #flashcards How do you ... Python?
  ?
  ```
  print("hi")
  ```
  [^sr-c92aa0] <!--SR:!2026-11-02,14,250-->
```

Three properties follow, and they are the point:

1. The token is always **after all card content**, so it can never land inside a code fence, a
   `$$` math block, or a table row. No card shape needs special handling. Appending to the
   card's last line or its first line both break on real shapes in this vault (a card ending
   in a fence; a math card whose front opens with `$$`), which is why neither was chosen.
2. It **survives `removeScheduleInfo`**. That regex is a greedy `/<!--SR:.+-->/gm`, deleting
   from `<!--SR:` to the line's last `-->`; sitting before the comment is what keeps the token
   safe.
3. A card with **no schedule yet** uses the same decision for where the schedule *would* go,
   so new cards need no separate rule.

In the own-line case the token shares a line with the schedule comment. That comment is
invisible in reading view, so the line renders as a bare superscript marker under the card.

## Extracting it back out

A card line can carry two trailing tokens — this one and an Obsidian block id — and
`formatForNote` orders them differently in the same-line and own-line cases (`^abc` after the
schedule in one, before it in the other). Rather than depend on that order,
`QuestionText.splitText` strips trailing tokens in a **loop**: repeatedly remove whichever of
block-id or footnote-reference matches at the end, until neither does. At most two passes,
order-independent, no case analysis.

Both live in their own fields and are **excluded from `textHash`**, exactly as the block id
already is. `textHash` is `cyrb53(formatTopicAndQuestion())`, so adding or changing a comment
must leave it byte-identical — otherwise a comment silently changes a card's identity and
invalidates its entry in the bury list.

## Parser rule

`src/parser.ts` must skip footnote definition lines: a line matching `^\s*\[\^[^\]]+\]:` and
any immediately following indented continuation lines.

This is required, not cosmetic. Verified against the real parser: a definition containing
`:::` becomes a phantom single-line card, a definition containing `{{x}}` becomes a phantom
cloze card, and a definition placed directly under a multi-line card with no blank line is
absorbed into that card's text. The skip removes all three.

It is a *skip*, strictly simpler than the archived design's absorb-and-re-emit: comment text
never enters a card's text region, so the parser never has to give it back.

## Read path: showing past entries

`NoteQuestionParser` already holds the whole note in `this.noteLines` and loops over parsed
questions in `createQuestionList`. It builds a `label → definition body` map once per note and
attaches the matching body to each question. One new read path, no new write path, and the
lookup is by exact label so it cannot mis-attribute.

Two degenerate cases, decided here rather than discovered later:

- **Reference present, definition missing** (the user deleted the definition by hand): the card
  reads as having no comment, and it keeps its existing label. A new comment re-creates the
  definition under that same label rather than allocating a new one.
- **Two cards carrying the same label** (only reachable by hand-editing): the first definition
  found wins for both, and a write from either card rewrites that one definition. Not defended
  against; labels are generated unique and this cannot arise from normal use.

## Write path

Still **exactly one file write per review**. `NotesDataStore.write` does read → transform →
write. The comment adds a second *pure string transform* over the same note text, composed
with the existing one inside that single read-modify-write:

1. `question.updateQuestionWithinNoteText(noteText, settings)` — unchanged mechanism; now also
   re-emits the footnote reference token.
2. `updateCardCommentDefinition(noteText, label, body)` — replaces the `[^label]: …` line and
   its continuations if present, otherwise appends the definition at the end of the file.

   Exact append behaviour, so it is not left to interpretation: the definition goes at the very
   end of the note text, preceded by a blank line when the note does not already end with one,
   and the note keeps exactly one trailing newline. Replacement rewrites the matched definition
   line plus its contiguous indented continuations and nothing else, so neighbouring footnotes —
   including the user's own numeric ones — are untouched byte for byte.

Both are pure functions of the note text, unit-testable without Obsidian. The definition edit
targets a unique label, so unlike the card replace it has no first-match-wins ambiguity.

Staging mirrors the archived design, which reviewed clean: text typed during review is staged
on the sequencer and applied just before the existing `writeSchedule`, so a comment costs no
extra write. `flushPendingCardComment` covers the exits that never rate the card.

## UI

Unchanged from the archived branch, which passed review: an always-visible textarea in
`CardContainer`, rendered only on the answer side, **never focused programmatically** (on
desktop that swallows the rating shortcuts; on the iPhone it raises the keyboard over the
rating buttons on every card), `Esc` blurs, grows to a small cap, past entries rendered above
it through `RenderMarkdownWrapper`. The review keydown handler already bails when
`activeElement` is a `TEXTAREA`, so shortcuts need no work.

All five exits harvest the typed text: rate, skip, close view/modal, back-to-deck-list, and
Edit/Delete Card. The archived attempt shipped three of these and lost text on the other two;
all five are required here. Cram mode neither shows the box nor writes anything, with the
guard inside the sequencer methods so every call site is covered.

## Reused from `archive/card-comments-callout`

Port these rather than rewrite them; each reviewed clean there:

| What | Change needed |
|---|---|
| dated-entry formatting, parsing, escaping (`src/utils/card-comment.ts`) | keep entry-level logic incl. the reversible leading-backslash escaping; replace the callout wrapper with the footnote-definition wrapper |
| sequencer staging (`setPendingCardComment` / `applyPendingCardComment` / `flushPendingCardComment`, declared on `IFlashcardReviewSequencer`) | none |
| the UI component, its CSS, and the five harvest call sites | none |
| `CARD_NOTE_PLACEHOLDER` in `en.ts` and `base-locale.ts` | none |
| the `actualQuestion.trimEnd()` fix in `splitText`'s topic-path branch | none — an independent real bug, live in this vault because `cardCommentOnSameLine: true` |

Dropped: the callout absorption in `parser.ts`, `isCardCommentBodyLine`, `extractCardComment`,
and all of the blank-line-splice and declined-block repair logic. This design makes them
unnecessary.

## Testing

TDD. Models: `tests/unit/parser.test.ts` (its `parseT` wrapper),
`tests/unit/data/question.test.ts`, and the `TestContext` fixture in
`tests/unit/scheduling/flashcard-review-sequencer.test.ts`, whose `UnitTestSRFile` allows
assertions against the real written file. Note `question.test.ts` tests that call
`QuestionText.create` or `splitText` need `unitTestSetupStandardDataStoreAlgorithm` in a
`beforeEach`, or they throw on `DataStore.getInstance()`.

1. `textHash` byte-identical for the same card with and without a reference token.
2. Round-trip, for each card type, under both `cardCommentOnSameLine` settings: inline,
   single-line-reversed, multi-line, multi-line ending in a code fence, cloze, and a card
   carrying an Obsidian block id as well as a reference.
3. Trailing-token loop strip: reference only, block id only, both in either order.
4. Repeated review cycles converge — three successive rated reviews of a commented card leave
   the note byte-identical apart from the schedule and the new entries. This is the test the
   archived design failed.
5. Content **after** the card, and after the definition, is byte-identical following a write.
6. Parser skips definitions containing `:::`, `{{x}}`, `$\cloze{a}{b}$`, and a definition
   directly under a multi-line card with no blank line — no phantom cards, host card intact.
7. `updateCardCommentDefinition`: appends when absent; replaces in place when present,
   preserving the rest of the file; handles a file with no trailing newline; leaves a user's
   own numeric footnotes untouched.
8. Label generation is unique against existing `[^sr-…]` labels in the note.
9. Entry formatting: multi-line input, leading `-`/`>`/`\` escaping reversible, blank input
   is not an entry, two entries on one day stay two entries.
10. Two identical cards in one file still behave (first-match-wins in
    `MultiLineTextFinder.findAndReplace` not made worse).
11. Cram mode writes nothing.

## Out of scope

- Any settings toggle.
- Garbage-collecting a definition orphaned by hand-deleting its card. It is clutter, not
  corruption, and a dangling definition renders harmlessly.
- `useCalloutsForSchedulingComments: true`. This vault keeps it `false`, and that machinery
  caused the June 2026 corruption of 11,027 lines.
- Editing or deleting past entries from the review screen; they are read-only there and edited
  by hand in the note. This keeps the review-side write path to pure appends.
- A literal `<!--SR:...-->` typed inside a comment body. Inherent to the format; documented
  rather than defended against.

## Open question for manual verification

Obsidian's rendering of a **multi-entry** definition — an indented `-` list continuation — is
unverified, as is how `sr-` definitions read when mixed into a note that already has numeric
footnotes. A single-entry definition certainly renders. All definition formatting lives in one
module, so if the multi-entry form reads badly it is one function to change, with no effect on
anything else in this design.
