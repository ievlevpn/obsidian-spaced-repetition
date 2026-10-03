# Final fix wave — `feat/card-comment-footnotes`

Branch `feat/card-comment-footnotes`, from `340b86a`. Three commits:

| SHA | What |
|---|---|
| `c15a826` | `test:` the byte-identity convergence test — **RED on purpose** |
| `92e3418` | `fix:` C1, I2, I3, I4 + the `lastLineNum` inflation, with tests |
| `11d95ac` | `docs:` I5 and I6 written down, four stale spec statements corrected |

Verification on `11d95ac`:

| Check | Result |
|---|---|
| `npx tsc -noEmit -skipLibCheck` | clean |
| `npx jest tests/unit --coverage=false` | **467 passed / 44 suites** (baseline on `340b86a`: 433 / 44) |
| `npx eslint src --ext .ts,.tsx` | 0 errors, 50 warnings (all pre-existing `no-unsafe-*` in settings UI) |
| `node esbuild.config.mjs production` | succeeds, CSS bundled; generated `styles.css` reverted, not committed |

Working tree clean apart from an untracked `.DS_Store`, which was left alone. No `git clean`,
nothing under `.superpowers/` touched except this file.

The brief's 433 is the correct baseline. The review's 462 included its own scratch tests.

---

## Step 1 — what the convergence test showed BEFORE any fix

`tests/unit/scheduling/flashcard-review-sequencer.test.ts`, new `describe("card comment
convergence")`. 22 new cases: 5 card shapes × {3 rated reviews, 3 comment flushes} ×
{`cardCommentOnSameLine: true`, `false`}, plus the round-trip case per setting.

Shapes: inline, multi-line, cloze, a card ending in a ```` ``` ```` fence, and a card with an
Obsidian block id. Every shape sits in a note that also carries a `# Heading`, prose after the
card, the user's own `[^1]` footnote **with an indented continuation**, and a named `[^note]`
footnote — so spec item 6 (the user's own numeric footnotes) is covered by every one of the 22
cases rather than by one dedicated case.

The assertion is byte equality of a `skeleton()` of the note — the `sr-` definition block cut
away, every reference token removed together with the one space or newline separating it, and
`<!--SR:…-->` masked — against the skeleton of the note the plugin itself produced before any
comment existed. Plus: exactly one reference and exactly one definition in the final note, and
all three entries present in that one definition, in order. `ReviewResponse.Again` throughout,
per the brief.

Two methodological choices worth recording:

- The scheduled baseline is **learned, not hard-coded**: the test does one rated review with no
  comment and uses the result as the comparison point. My first attempt hand-wrote the
  scheduled fixtures and four shapes failed on *my* guesses about schedule placement rather
  than on the bug (e.g. a card ending in ```` ``` ```` does **not** take `endsWithCodeBlock()`
  here, so its schedule goes on the fence line, not the next one). Learning the layout removes
  a whole class of false red.
- `skeleton()` strips `[^sr-xxxxxx] ` (token + following space) **before** ` [^sr-xxxxxx]`
  (preceding space/newline + token). Getting that order wrong made an own-line reference appear
  to move the schedule onto the card line, which is the artefact, not the behaviour.

**Result on `c15a826`: 455 tests, 2 failing.** Both are `cardCommentOnSameLine: false` with an
unscheduled card driven by `flushPendingCardComment` — the inline card and the block-id card.
Both showed the archived design's exact death mode. Verbatim note content after three comments:

```
# Heading

#flashcards Q1::A1
[^sr-4ec7f7]
[^sr-8ed9b1]
[^sr-7ad73f]

prose after the card

[^1]: the user's own numbered footnote
    with an indented continuation line
[^note]: a named footnote of the user's

[^sr-7ad73f]: - *2023-09-06:* alpha

[^sr-8ed9b1]: - *2023-09-06:* beta

[^sr-4ec7f7]: - *2023-09-06:* gamma
```

Three bare reference lines, three separate definitions, one label per comment, unbounded. The
same note under `cardCommentOnSameLine: true` converged correctly to one reference and one
three-entry definition, which is exactly why the committed four-`toContain` test never saw it.

Everything else converged: multi-line, cloze and fence-ending cards absorb the following line
and were safe under both settings, as the review said.

One thing the test exercises that is worth naming: the bug needs `hasSchedule === false` at
`formatForNote` time. `processReview` always gives the card a schedule, so the reachable path is
`flushPendingCardComment` — the user types a comment and then skips the card or closes the view
without rating it. That is not an edge case; it is how a comment gets written on a brand-new
card. The 641 at-risk vault cards under the default setting are reachable this way.

---

## Step 2 — C1, Critical: unbounded accumulation

`src/parser.ts`. The single-line lookahead:

```ts
nextLine.startsWith("<!--SR:") || /^\[\^sr-[0-9a-f]{6}\]( <!--SR:|$)/.test(nextLine);
```

The `$` alternative is the fix. `nextIsSchedule` renamed to `nextIsScheduleOrCommentRef`, with
a comment explaining that the alternative is load-bearing and naming the death mode, so nobody
"simplifies" it back.

Both red cases now pass. Nothing else in the suite moved.

## Step 3 — I2, Important: orphaned reference after a write miss

`src/data/data-store/notes-data-store/notes-data-store.ts`. Snapshot before resolving, restore
on the early return:

```ts
const refBeforeResolve: string | null = question.questionText.cardCommentRef;
const definition: string | null = question.resolveCardComment(fileText);
const newText: string = question.updateQuestionWithinNoteText(fileText, this.settings);
if (!question.lastUpdateFoundOriginal) {
    question.questionText.cardCommentRef = refBeforeResolve;
    return;
}
```

Restoring the snapshot rather than nulling matters: a card that already had a label with a real
definition must keep it. Two tests, one per case.

I did **not** re-stage the pending comment text. The ledger accepted dropping it, and
re-staging would write it later with a stale date, which is the M11 failure the review filed as
"can stand". Dropping is the lesser of the two and it is now documented in the spec.

## Step 4 — I3, Important: a definition line inside a card

`src/parser.ts`. The definition skip now terminates the accumulating card exactly as a blank
line does, instead of dropping the line and continuing:

```ts
if (isFootnoteDefinitionLine(currentLine)) {
    if (cardType) {
        cards.push(new ParsedQuestionInfo(cardType, cardText.trimEnd(), firstLineNo, i - 1));
        cardType = null;
    }
    cardText = "";
    while (i + 1 < lines.length && isFootnoteContinuationLine(lines[i + 1])) i++;
    firstLineNo = i + 1;
    continue;
}
```

`questionText.original` is now always a contiguous slice of the note, so `MultiLineTextFinder`
finds it and the schedule persists. Tests assert both the parse result and, explicitly, that
`noteText.toContain(parsedCardText)`.

Consequence worth stating: a card whose answer side begins with a definition line now has an
**empty** answer, because the card ends at the definition. That is identical to what a blank
line in the same position already does, which is the point — the shape behaves like a card the
user ended early, not like a card that silently stops saving. Recorded in the spec's
limitations.

## Step 5 — I4, Important: two identical cards

Fixed, without touching `MultiLineTextFinder.find` or `findAndReplace`.

- `MultiLineTextFinder.countMatches(sourceLines, searchLines)` — new, additive, same trimmed
  line-by-line comparison as `find`, counts non-overlapping whole matches. 6 unit tests,
  including one asserting that `find` returning a position implies `countMatches >= 1`.
- `Question.isTextAmbiguousWithinNote(noteText)` and
  `Question.discardPendingCardComment()` — new.
- `NotesDataStore.write` discards the staged comment with a `console.warn` when the card's text
  matches in more than one place.

The **schedule** write still goes ahead. The copies are byte-identical, so their schedules are
interchangeable, and first-match-wins there is pre-existing upstream behaviour that is not this
feature's to change. What is suppressed is only the part that plants something visible and
permanent on the wrong card.

Why line-based counting rather than `indexOf`: a substring count would fire spuriously whenever
one card's text is a prefix of another's line, silently eating a comment on an innocent card.
Whole-trimmed-line matching makes the detector precise — verified by a test that
`"Q1::A1"` does **not** match inside `"Q1::A1 <!--SR:…-->"`.

Three tests: the scheduled pair (comment refused, warn fired), an **unscheduled** pair over
three flushes (the file comes back byte-identical to its input — nothing accumulates, ever),
and a non-identical pair to prove commenting still works. The unscheduled pair is the honest
shape: the scheduled pair stops being ambiguous the moment the first review gives one copy a
different schedule comment, after which commenting correctly resumes.

## Step 6 — I5, Important: re-indentation under a definition

Documentation, as the review recommended. The code change (stopping `findDefinitionRange` at
the first line that is neither a 4-space bullet nor a 6-space continuation) would narrow
markdown's own lazy-continuation rule and risk *losing* a line, which is the failure class this
whole branch exists to exclude. Documented instead:

- A new **Limitations** section in
  `docs/superpowers/specs/2026-10-03-card-comment-footnotes-design.md`, leading with the rule —
  *leave a blank line before anything you add under an `sr-` footnote* — and the
  before/after example, stating plainly that **nothing is deleted**, the text survives, and the
  damage is the flattening of 4/8-space nesting to a single 6-space level: silent and semantic.
  The ledger's "loses the glued lines" is corrected there.
- Code comments on all three halves of the mechanism: `isFootnoteContinuationLine` (the long
  one), the `formatCardCommentDefinition` / `parseCardCommentDefinition` pair, and
  `findDefinitionRange` in `note-footnotes.ts`.
- Cross-referenced from the parser's definition-skip comment, since that is where a future
  reader of the parse side lands first.

## Step 7 — I6, Important: the blockquote guard

Kept wide, as ruled. Added:

- A code comment at `card-container.tsx:392` saying it is deliberately conservative, that it
  catches any card containing a `>` line and not just a card hosted in a blockquote, that the
  measured cost is 17 of 4263 vault cards, that the first-line-only version was tried and
  missed the common case, and why suppression is right at all (the reference lands inside the
  quoted region but its definition necessarily lands at EOF outside it, so the pair reads as
  part of a quote the user did not write).
- Its own subsection in the spec's new Limitations section.

I did not change it to show a disabled box with a reason. That is a UI change with no test
coverage on this branch and the brief said keep the behaviour.

## Step 8 — `lastLineNum` inflation

Fixed for free by Step 4: the card is pushed with `lastLineNo = i - 1` at the definition line,
so it can no longer absorb the definition or its continuations. `tests/unit/parser.test.ts` had
an assertion that *encoded* the inflated value (`0, 3` where the card's last content line is
2); it now asserts `0, 2`, and its comment explains the correction instead of the old
behaviour. A second case covers a definition with two continuations, which used to push
`lastLineNum` out by three.

## Step 9 — the other missing spec tests

- Item 2, full round trip under both settings: the convergence block's `round trip: the
  re-parsed card drops the reference from its own text` — asserts `front`, `back`,
  `cardCommentRef` matching `^sr-[0-9a-f]{6}$`, and that `actualQuestion` does **not** contain
  the token.
- Item 10, two identical cards: the three tests under Step 5.

---

## Vault impact — measured, not assumed

A scratch test (written, run, deleted — not committed) walked all 4437 `.md` files under
`<vault>`, re-parsed the 650 notes containing `<!--SR:` under the vault's
live separators, and compared a digest of `(file, cardType, firstLineNum, lastLineNum, text)`
for every card between `340b86a`'s `src/parser.ts` and the fixed one:

```
{ "files": 4437, "notes": 650, "cards": 3598, "nonContiguous": 0, "ambiguous": 0 }
digest diff: IDENTICAL
```

- **The parser change is a byte-for-byte no-op on the live vault.** Same 3598 cards, same
  types, same line numbers, same text. No existing card gains or loses a line, and the
  `lastLineNum` correction changes nothing in practice because no vault definition is adjacent
  to a card.
- **0 cards are non-contiguous**, so `MultiLineTextFinder` locates every one and no vault card
  is unwritable.
- **0 cards are ambiguous**, so the new duplicate-card guard never fires on this vault — no
  comment of the user's will be silently refused today.

(3598 vs the review's 4263: I ran raw `parse()` over notes containing `<!--SR:`, not the full
`NoteQuestionParser` deck build, which also picks up note-level flashcard tags. The comparison
is before/after on the same measurement, so the absolute number does not matter here.)

---

## Deliberately not done

- Everything on the brief's out-of-scope list: the `generateCardCommentLabel` retry loop,
  `extractObsidianBlockId`'s return type, the `findDefinitionRange` / `collectCardCommentDefinitions`
  first-vs-last asymmetry (documented in a comment, not changed), `Note.writeNoteFile` not
  clearing the pending comment (documented in the spec, not changed), the
  `cardCommentDefinition` write-back, the modal flush's missing `.catch`, the `*`-escaping and
  `TextDirection.Unspecified` rulings.
- `findDefinitionRange` narrowing — see Step 6.
- Re-staging the dropped comment on a write miss — see Step 3.
- `prettier --write` on `src/utils/card-comment.ts` and the spec. Both already fail
  `prettier --check` on `340b86a`, and running it reformats unrelated lines (the spec's tables,
  code fences and italic header). The pre-existing warnings are left pre-existing; my added
  lines are hand-formatted to the surrounding style.
- No UI/manual-Obsidian pass. The multi-entry-definition rendering question in the spec is
  still open and still the manual gate.

## New concerns

1. **The duplicate-card guard trades a visible wrong write for a silent refusal.** The warning
   goes to the developer console, which the user will never see. It is 0 cards on this vault
   today, so the exposure is nil, but if it ever fires the user will type a comment, press a
   rating, and get nothing, with no explanation. A `Notice` would fix that; it needs UI plumbing
   and is not covered by any test on this branch, so I left it. Worth doing before anyone else
   uses this fork.
2. **A card whose answer begins with a footnote definition now parses with an empty answer**
   (Step 4). Safe, consistent with how a blank line behaves, 0 occurrences in the vault — but it
   is a behaviour change on a shared code path, and it is the one place where this fix wave
   alters what a card *is* rather than how it is written.
3. **The convergence test's learned baseline means it cannot catch a one-time corruption that
   happens on the very first schedule write.** It compares against the plugin's own post-first-
   review output, so a defect in the no-comment write path is invisible to it. That path is
   upstream's and is covered elsewhere, but the gap is real and worth knowing if anyone extends
   this test.
4. **`convertFoldersToDecks: true` still deletes the `#flashcards` tag from the card line on
   every write** — pre-existing upstream, confirmed by the review on the base commit, untouched
   here. This branch cannot be exercised under that setting. Unrelated to comments, but it is a
   tag-deletion bug in a fork whose premise is not losing bytes the plugin does not own.
