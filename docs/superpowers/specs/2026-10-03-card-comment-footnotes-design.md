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

Two refinements the implementation had to add, both found by the final whole-branch review:

- A definition line **terminates** any card accumulating above it, exactly as a blank line
  does. Merely dropping the line while accumulation continued past it left
  `questionText.original` non-contiguous in the note, so `MultiLineTextFinder` missed forever,
  every write was suppressed, and the card's schedule silently never persisted. Terminating
  also keeps `ParsedQuestionInfo.lastLineNum` honest; dropping inflated it by one plus the
  definition's continuation count, without bound.
- The single-line lookahead must absorb a **bare** own-line reference, not only one followed by
  a schedule comment: `/^\[\^sr-[0-9a-f]{6}\]( <!--SR:|$)/`. A card with no schedule yet has
  no comment for the reference to sit in front of, so `formatForNote` emits a bare
  `\n[^sr-xxxxxx]` line under own-line placement. Unabsorbed, the card re-parsed without its
  reference, minted a fresh label, and appended another reference line and another definition
  on **every** comment - the archived design's exact unbounded-append death mode, dormant
  behind one boolean (`cardCommentOnSameLine`, whose shipped default is `false`). 641 of this
  vault's 6385 cards were at risk under that default.

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
- **Two byte-identical cards in one note**: a comment is **refused**, not written.
  `MultiLineTextFinder` takes the first match, so a comment typed on the second copy would be
  planted on the first - visibly, permanently - and the next comment would mint a second label
  and a surplus definition. There is nothing to disambiguate with: the label *is* card
  identity, but it cannot be used for lookup until it has already been written. So
  `NotesDataStore.write` counts the card text's matches in the note and, when there is more
  than one, discards the staged comment with a `console.warn`. The schedule write still goes
  ahead: the copies are byte-identical, so their schedules are interchangeable, and writing to
  the first match is pre-existing upstream behaviour. As soon as the copies differ - including
  because one of them has acquired a different schedule comment - commenting works normally.
- **The card's text cannot be found at all** (the note changed under us): nothing is written,
  and the label allocated during this write is **rolled back** onto the question. Leaving it
  there meant the next successful write - a short-term requeue, or Edit Card, which writes
  unconditionally - emitted `[^sr-...]` into the user's prose with no definition anywhere. A
  reference must never outlive its definition. The staged comment text is dropped.

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
Edit Card. The archived attempt shipped three of these and lost text on the other two.
**Delete Card discards the typed text by design** - `NotesDataStore.delete` removes the card
and leaves any definition behind as harmless clutter, so there is nothing to attach a new
entry to. Cram mode neither shows the box nor writes anything, with the
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
   carrying an Obsidian block id as well as a reference. Both at the
   `QuestionText`/`formatForNote` level **and** as a full parse -> write -> re-parse through
   the sequencer.
3. Trailing-token loop strip: reference only, block id only, both in either order.
4. Repeated review cycles converge — three successive rated reviews of a commented card leave
   the note byte-identical apart from the schedule and the new entries. This is the test the
   archived design failed. **Byte equality, not fragment matching**, over every card shape
   under **both** `cardCommentOnSameLine` values, and for an unscheduled card driven by
   `flushPendingCardComment` as well as a scheduled one driven by `processReview`. The
   unscheduled own-line case is the one that did not converge, and a weaker version of this
   test is what let it through six task reviews. Use `ReviewResponse.Again` in the loop:
   `Good` pushes the due date past the static test date, the card leaves the queue, and
   `currentCard` is null on the second iteration.
5. Content **after** the card, and after the definition, is byte-identical following a write.
6. Parser skips definitions containing `:::`, `{{x}}`, `$\cloze{a}{b}$`, and a definition
   directly under a multi-line card with no blank line — no phantom cards, host card intact.
7. `updateCardCommentDefinition`: appends when absent; replaces in place when present,
   preserving the rest of the file; handles a file with no trailing newline; leaves a user's
   own numeric footnotes untouched.
8. Label generation is unique against the note's existing `[^sr-…]` **definition** labels.
   (It scans definition lines, not references, so a card whose definition was hand-deleted is
   invisible to the collision check - 2^-24 per allocation, accepted.)
9. Entry formatting: multi-line input, leading `-`/`>`/`\` escaping reversible, blank input
   is not an entry, two entries on one day stay two entries.
10. Two identical cards in one file: the comment is refused rather than attributed to the
    wrong copy, nothing accumulates however many comments are typed, the schedules still
    persist, and commenting works again once the copies differ. (The earlier claim that
    first-match-wins was "not made worse" was false: before, a mis-attribution swapped two
    identical schedules and was invisible and self-correcting; with a comment it planted a
    visible marker and a dated entry on the wrong card, permanently, plus a surplus
    definition.)
11. Cram mode writes nothing.

## Limitations

Known, accepted, and written down here because each one is silent.

### Leave a blank line before anything you add under an `sr-` footnote

This log is meant to be hand-edited, and this is the one rule for doing it.

`isFootnoteContinuationLine` is markdown's own lazy-continuation rule: **any** indented
non-blank line continues the definition above it. So content glued directly beneath an entry -
an indented code block, a nested table - is read back as continuation *text* of that entry and
re-emitted at this module's single uniform continuation indent on the next comment write:

```
before:                              after one comment write:
[^sr-aaaaaa]: - *2026-01-01:* old    [^sr-aaaaaa]: - *2026-01-01:* old
    def f(x):                              def f(x):
        return x + 1                       return x + 1
                                         - *2026-01-01:* entry 1
```

**Nothing is deleted - the text survives in full.** But 4/8-space nesting comes back flattened
to one 6-space level, and a tab-indented table comes back 6-space indented, which destroys the
snippet as *structure* while leaving it intact as prose. That makes the damage semantic and
invisible to both a diff reviewer and the user until they next read that snippet. A single
blank line before the added content stops it completely, because it ends the definition's
range.

The write path can never create this shape by itself: an append always inserts a blank line
and always targets the end of the note. It takes a hand-edit.

### The comment box is hidden for any card containing a `>` line

`CardContainer` suppresses the box when any line of `questionText.original` trim-starts with
`>`. This is **wider than "the card is hosted in a blockquote"**: it also catches a card whose
*answer* merely quotes something, or contains a `> [!note]` callout, which in a maths or
philosophy vault is a normal thing for an answer to contain. Measured on a 4263-card vault:
**17 cards (0.4%)**, with no explanation shown to the user.

The width is deliberate, not an oversight. An earlier attempt checked only the first line and
missed the common case of a card whose quote starts further down, which is the shape that
actually occurs. The reason to suppress at all: the reference lands on the card line inside
the quoted region, but the definition it points at necessarily lands at the end of the note,
outside the quote, so the pair reads as part of a quote the user did not write.

### Smaller ones

- **The first append to a note collapses its trailing blank lines** to one. Cosmetic, one-time
  per note.
- **A definition line inside a card's text region ends the card there**, exactly as a blank
  line would, so such a card may lose its answer side. Strictly better than the alternative
  (a non-contiguous card whose schedule silently never persists), and 0 of this vault's 4263
  cards have the shape.
- **`findDefinitionRange` takes the first definition for a label,
  `collectCardCommentDefinitions` the last.** Only reachable by hand-editing two definitions
  onto one label; the consequence is content *duplication*, not loss.
- **`Note.writeNoteFile` drops a staged comment**, reachable only via the load-time rewrite
  that fires when a question has more schedules than cards. No note damage.

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

## Resolved: multi-entry rendering (verified 2026-10-03)

This was the design's one open question, and the only claim no automated review could reach.
Confirmed by hand in Obsidian: a **multi-entry definition renders as separate dated lines**, not
as one run-together paragraph.

So the indented `- *YYYY-MM-DD:* text` continuation produced by `formatCardCommentDefinition`
stays exactly as written. The contingency noted here before — "all definition formatting lives
in one module, so it is one function to change" — is not needed, though it remains true if the
format is ever revisited.
