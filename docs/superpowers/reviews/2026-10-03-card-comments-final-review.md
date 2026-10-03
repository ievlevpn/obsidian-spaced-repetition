# Final whole-branch review — `feat/card-comment-footnotes`

Range `3d5079f..cc73895` (13 commits; first three are spec/plan/plan-fix).
Spec: `docs/superpowers/specs/2026-10-03-card-comment-footnotes-design.md`.
Reviewed against the methodology at
`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/requesting-code-review/code-reviewer.md`.
Read-only on the checkout: nothing committed, no HEAD/index/branch mutation. Scratch tests were
written under `tests/unit/`, run, and deleted; `styles.css` remains modified by the production
build, as expected.

Verification re-run on `cc73895`:

| Check | Result |
|---|---|
| `npx tsc -noEmit -skipLibCheck` | clean |
| `npx jest tests/unit --coverage=false` | **462 passed / 45 suites** (the brief said 433/44 — measure again; no failures either way) |
| `npx eslint src --ext .ts,.tsx` | 0 errors, 50 warnings (all pre-existing `no-unsafe-*` in settings UI) |
| `node esbuild.config.mjs production` | succeeds, CSS bundled |

---

## Verdict

**Do not ship as-is.** One Critical and two Important findings, all localised. The Critical is a
two-token regex change plus one missing test; Important 2 is a three-line rollback; Important 3 is a
small parser restructure that also disposes of a ledger item the controller accepted. After those,
I would ship.

The branch's central claim — *put only a stable token in the rewritten region and the unbounded-append
class of bug disappears* — is **true for every card shape I could construct except one**, and that one
exception reproduces the archived design's exact death mode. The claim is sound as a design; the
implementation does not yet fully realise it, because the token is only stable when a `<!--SR:-->`
comment sits behind it on the same line. Where it has to stand alone, the parser cannot see it.

---

## Strengths (measured, not assumed)

These are the things I actively tried to break and could not.

- **Byte-for-byte convergence over four write/re-parse cycles**, with everything outside the
  definition identical and the definition growing by exactly one entry per cycle, for: inline card
  with a schedule (both `cardCommentOnSameLine` values), multi-line card, card ending in a ```` ``` ````
  fence (scheduled and unscheduled), card ending in a `$$` math block, three-cloze card with a single
  comment, card with an Obsidian block id (both emission orders), card in a nested list, note with the
  user's own numeric footnotes, note whose last line is a definition with no trailing newline, note
  with YAML frontmatter, a definition the user hand-moved *above* the card, a reference whose definition
  was hand-deleted (recreated under the same label), and two cards deliberately sharing one label.
  No whitespace drift, no wandering `<!--SR:-->`, no second definition, no indentation creep.
- **`textHash` is byte-identical** across no-reference / same-line reference / own-line reference
  (all three → `469a9ca64920a`). The bury list and the schedule lookup keyed on it are unaffected,
  which was the single most important invariant to get right and it is right.
- **The parser change is a measured no-op on the live vault.** I re-parsed all 650 notes containing
  `<!--SR:` under the vault's real settings: 307 notes yielded 4263 cards and **every one of them is
  still contiguous in its note** (`MultiLineTextFinder` locates all 4263). Across all 4438 vault notes
  there are 530 footnote definitions and **zero** sit inside or adjacent to a card region, **zero**
  contain card syntax (so no existing phantom cards are removed), and **zero** are followed by an
  indented line. Nothing in the vault changes.
- **Adversarial comment bodies all round-trip**: `a ::: b`, `has ==a cloze== here`, a *literal*
  `<!--SR:!2030-01-01,1,250-->`, a three-line body, bodies starting `-`, `>`, and `\-`. None produces
  a phantom card, none corrupts the host card, the escaping is reversible, and the parse-back is exact.
  The literal-`<!--SR:-->` case the spec declared "documented rather than defended against" is in fact
  harmless, because the definition line is skipped before `removeScheduleInfo` ever sees it.
- **Exactly one file write per rated review**, locked in by a spy test rather than inspection — the
  property this whole design was chosen for.
- **The miss guard genuinely helps.** On a `findAndReplace` miss the write count is now 0 (measured),
  where upstream performed a no-op whole-file write. In a Syncthing vault that is a real conflict
  source removed, not just a comment-feature nicety.
- Cram mode writes nothing, guarded inside the sequencer so all call sites are covered. Edit Card hands
  the user a clean `"Q1:::A1"` with the reference hidden, and the reference survives the edit. A
  cloze-count shrink triggering the load-time `Note.writeNoteFile` rewrite preserves the reference and
  leaves the definition untouched.
- The two pure modules (`src/utils/card-comment.ts`, `src/utils/note-footnotes.ts`) are genuinely pure
  and genuinely unit-testable; the regex tightening the controller ruled in Tasks 1 and 4
  (`^ {0,3}\[\^`, `sr-[0-9a-f]{6}`) is correct and consistently applied in all three places.

---

## Issues

### Critical

#### C1 — Unbounded reference-and-definition accumulation when the reference must stand on its own line

`src/parser.ts:166-176`, `src/data/data-structures/card/questions/question.ts:280-284`.

`Question.appendCardCommentRef` emits a **bare** `\n[^sr-xxxxxx]` whenever the question has no
schedule and `isCardCommentsOnSameLine()` is false. The parser's single-line lookahead only absorbs a
following line that starts with `<!--SR:` or matches `/^\[\^sr-[0-9a-f]{6}\] <!--SR:/`. A bare
reference line matches neither, so the card re-parses **without** its reference, a fresh label is
minted, a fresh reference line is appended, and a fresh definition is written at EOF — on every
comment, without bound.

Measured, `#flashcards Q1::A1` under `DEFAULT_SETTINGS`, four comment writes:

```
#flashcards Q1::A1
[^sr-8f3e46]
[^sr-f1e4fc]
[^sr-2e6d96]
[^sr-69ce2c]

[^sr-69ce2c]: - *2026-01-01:* entry 1

[^sr-2e6d96]: - *2026-01-02:* entry 2

[^sr-f1e4fc]: - *2026-01-03:* entry 3

[^sr-8f3e46]: - *2026-01-04:* entry 4
```

This is the archived callout design's failure mode verbatim: *"appended a new callout block on every
review, without bound."*

**Reachability.** Requires (no schedule yet) **and** (`cardCommentOnSameLine: false` **or** the card
text ends in ```` ``` ````) **and** the card parses as `SingleLineBasic`/`SingleLineReversed`. Cloze
and multi-line cards accumulate the following line and are safe. Hard numbers from the live vault
(6385 parsed cards):

| Setting | at-risk cards |
|---|---|
| `cardCommentOnSameLine: true` (this vault's live value) | **0** — no card in the vault has `endsWithCodeBlock()` true |
| `cardCommentOnSameLine: false` (the plugin's shipped default) | **641** |

So today, in this vault, with this setting, it cannot fire. But 4128 of 6385 cards are unscheduled, so
the no-schedule emission branch is the *common* path; the only thing standing between it and this bug
is one boolean in `data.json`. That is an accident, not the structural guarantee the spec claims.

**Fix.** Widen the lookahead so a bare own-line reference is absorbed the same way a schedule line is:

```ts
const nextIsSchedule: boolean =
    nextLine.startsWith("<!--SR:") || /^\[\^sr-[0-9a-f]{6}\]( <!--SR:|$)/.test(nextLine);
```

I verified the downstream half of this independently of the parser: with the absorbed text
`"#flashcards Q1:::A1\n[^sr-a3f91c]"`, `QuestionText.create` yields `actualQuestion = "Q1:::A1"`,
`cardCommentRef = "sr-a3f91c"`, and `formatForNote` reproduces the input **byte-identically** under
`cardCommentOnSameLine: false`. The round trip closes.

Then add the test that would have caught this (see "Spec vs delivery", item 4): a full
parse → write → re-parse loop, three cycles, `cardCommentOnSameLine: false`, on an **unscheduled**
single-line card, asserting exactly one reference and one definition.

---

### Important

#### I2 — A write miss leaves the card holding a label that exists nowhere, and the next successful write emits an orphaned reference

`src/data/data-store/notes-data-store/notes-data-store.ts:90-113`,
`src/data/data-structures/card/questions/question.ts:319-339`.

`resolveCardComment` allocates the label and calls `setCardCommentRef` **before**
`updateQuestionWithinNoteText` can report a miss. `write()` then returns early without rolling that
back, so the in-memory question now carries a reference for which no definition exists anywhere.

Measured — note changes under us (the Syncthing scenario the T5 ruling was written for), then the note
comes back and the card is written again:

```
after miss:            cardCommentRef=sr-36e942   file unchanged
after recovery write:  "#flashcards Q1:::A1 [^sr-36e942] <!--SR:!2023-09-02,4,270-->\n"
```

No definition. Same result via Edit Card, which reaches `Question.writeQuestion` and writes
unconditionally regardless of `lastUpdateFoundOriginal`. The user is left with a broken footnote marker
in their prose. This is precisely the invariant Task 5's Ruling 1 set out to enforce — it was enforced
for the blank-text path but not for the miss path, which is the one that actually occurs.

**Fix.** In `write()`, snapshot the reference before resolving and restore it on the early return:

```ts
const refBefore = question.questionText.cardCommentRef;
const definition = question.resolveCardComment(fileText);
const newText = question.updateQuestionWithinNoteText(fileText, this.settings);
if (!question.lastUpdateFoundOriginal) {
    question.questionText.cardCommentRef = refBefore;   // never leave a ref with no definition
    return;
}
```

Consider also re-staging the pending text instead of dropping it; the ledger accepted the drop as a
limitation, which is defensible, but the orphaned reference is not.

#### I3 — A footnote-definition line inside a card's text region makes that card permanently unwritable, silently

`src/parser.ts:115-121`.

The new skip uses `continue` without flushing the accumulating card, so a definition line that falls
*inside* a multi-line or cloze card is dropped from `cardText` while accumulation continues past it.
The resulting `original` is non-contiguous in the note, `MultiLineTextFinder` misses forever, and with
C1's sibling guard in place **no write happens at all**. Measured on
`#flashcards\nHow do you write a footnote?\n?\n[^1]: the text\nand more answer`:

```
parsed 1: [[MultiLineBasic, 0, 4, "#flashcards\nHow do you write a footnote?\n?\nand more answer"]]
lastUpdateFoundOriginal=false
file after write: unchanged
```

The card stays in the review queue, is rated every day, and its schedule **never persists**. Any
comment on it is silently discarded. The only signal is a `console.warn`. Same for the cloze variant.

This is a **new regression**: before the skip, that line was absorbed into `cardText`, the card was
contiguous, and the write worked. Note the shape is not purely theoretical in a vault that has the
`obsidian-footnotes` plugin installed and makes cards about markdown syntax.

**Vault impact: zero today** — 0 of 4263 parsed cards are non-contiguous, and no vault definition sits
in a card region. But a single hand-edit creates it and the failure is invisible.

**Fix.** When `cardText` is non-empty, treat a definition line as a **card terminator** (flush the card
exactly as a blank line does, then skip the definition and its continuations) rather than dropping the
line mid-card. This preserves contiguity, still prevents the absorption the spec was built to prevent,
and — as a free side effect — eliminates the inflated `lastLineNum` the controller accepted in Task 2.

#### I4 — Two identical cards: the first comment lands on the wrong card and is stranded there

`src/utils/strings.ts` (`MultiLineTextFinder.findAndReplace`, first-match-wins) interacting with the
new write path. Measured on two byte-identical cards, commenting on index 1:

```
cycle 1:  ref + definition written onto card 0   (the wrong card)
cycle 2:  card 1 still has no ref  -> second label, second definition
final:    two refs, two definitions, entry 1 permanently attached to the wrong card
```

Spec test 10 claims first-match-wins is *"not made worse."* It is observably worse. Before, the
mis-attribution swapped two identical schedules — invisible, and self-correcting in effect. Now it
plants a visible footnote marker and a dated entry on the wrong card, permanently, plus a surplus
definition. No test in the diff covers this (spec item 10 is undelivered).

This is not fixable without real card identity — which is, ironically, exactly what this label *is*,
but it cannot be used for lookup until it is already written. The honest response is to move it into
the spec's documented-degenerate-case list beside "two cards carrying the same label", and stop
claiming parity.

#### I5 — Hand-edited indented content beneath an `sr-` definition is re-indented and flattened

`src/utils/note-footnotes.ts:10-20` (`findDefinitionRange`) + `src/utils/card-comment.ts:38-40`
(`isFootnoteContinuationLine` = *any* indented non-blank line) + `parseCardCommentDefinition`'s
"an indented line that is not a bullet continues the entry above it".

The spec explicitly invites the user to edit this log by hand. Measured, a hand-written indented code
block glued under a definition:

```
before:                              after one comment write:
[^sr-aaaaaa]: - *2026-01-01:* old    [^sr-aaaaaa]: - *2026-01-01:* old
    def f(x):                              def f(x):
        return x + 1                       return x + 1
                                         - *2026-01-01:* entry 1
```

The 4/8-space nesting collapses to a uniform 6 spaces; the code is destroyed as code. A tab-indented
table becomes 6-space-indented. **Content is not lost** — so the ledger's recorded cost
("loses the glued lines") is wrong in a way that matters: the lines survive, absorbed into the
preceding entry's text, which is why nothing warns and why the damage is semantic rather than visible.
A blank line before the added content stops it entirely (verified).

Either document the rule — *leave a blank line before anything you add under an `sr-` footnote* — in
the spec and the module header, or have `findDefinitionRange` stop at the first line that is neither a
4-space bullet nor a 6-space continuation. Documentation is the proportionate fix; silence is not.

#### I6 — The blockquote guard is an undocumented feature restriction, broader than it reads

`src/ui/.../card-container/card-container.tsx:387-394`. The comment box is suppressed for any card
whose `questionText.original` contains a line whose trimmed start is `>`. That is not "a card hosted
in a blockquote" — it is **any card whose answer contains a quote line or a `> [!note]` callout**,
which in a maths/philosophy vault is a normal thing for an answer to contain.

Measured: **17 of 4263 cards** (0.4%) will silently show no comment box, with no explanation to the
user. The restriction appears in neither the spec nor any per-task review, so no one has signed off on
the trade. Keep it if the reason is sound (I could not find a correctness reason — the reference lands
on the card line, inside the blockquote, and renders fine; the definition goes to EOF as always) but
either justify it in the spec or drop it. If kept, show a disabled box with a reason rather than
nothing.

---

### Minor

- **M7 — the CRLF work buys less than its ruling claims.** A plain schedule write on a CRLF note already
  produces a *mixed* file (`"…A1\n<!--SR:…-->\r\nprose\r\n"`) because `MultiLineTextFinder` emits LF —
  pre-existing. When a comment is written, `usedCrlf = noteText.includes("\r\n")` rewrites **every** LF
  in the whole note to CRLF, which happens to repair the card line but is itself the whole-file
  line-ending rewrite the Task 4 ruling was trying to avoid. Net effect is benign, arguably an
  improvement. The code is fine; the ruling's reasoning does not hold. Worth one sentence in the module
  comment so the next reader is not misled.
- **M8 — the first append strips the user's trailing blank lines.** `base = normalised.replace(/\n+$/, "")`
  collapses any number of trailing newlines to one. Cosmetic, one-time per note.
- **M9 — label generation scans definitions only, not references.** `collectCardCommentLabels` keys off
  definition lines, so a card whose definition was hand-deleted is invisible to collision checking.
  2^-24 per allocation. The spec's "checks the note's existing `[^sr-…]` labels" slightly over-claims;
  fix the sentence, not the code.
- **M10 — `findDefinitionRange` takes the first match, `collectCardCommentDefinitions` the last.** With
  two definitions sharing one label (hand-edit only), the UI reads the last and the write overwrites the
  first with the last's content plus the new entry — i.e. the failure direction is **duplication**, not
  loss. The ledger records the asymmetry but not the consequence. Unreachable from normal use; stands.
- **M11 — `Note.writeNoteFile` silently drops a staged comment.** Confirmed: it clears `hasChanged`
  without consuming `pendingCardCommentText`. The staged text then lives only in memory and is either
  lost or written later with its original (now stale) date by a subsequent `DataStore.write` of the same
  object — which I reproduced. Reachable only via the load-time opportunistic rewrite, which fires only
  when a question has more schedules than cards. No note damage. Stands.
- **M12 — `card-comment.tsx:38` says "up to the cap set in CSS"**; `card-comment.css` has no max-height,
  the cap is in `_autoGrow` (96px phone / 160px desktop). Trivial, but it is a comment that sends a
  future reader to the wrong file.
- **M13 — `extractObsidianBlockId` declares `[string, string]` and returns null.** Pre-existing upstream;
  the new strip loop handles it correctly via `if (foundBlockId)`. Stands.
- **M14 — `SRModalView.onClose` flush is fire-and-forget** and has no `.catch`, so a rejected write
  becomes an unhandled rejection. Unavoidable given Obsidian's synchronous `onClose`; add
  `.catch(console.error)` for parity with the `void context.close().catch(...)` already at
  `ui-manager.tsx:350`.
- **M15 — `generateCardCommentLabel`'s retry loop is unbounded.** 16.7M space, a handful taken per note.
  Stands.
- **M16 — test-count drift.** I measure 462 tests / 45 suites on `cc73895`, not the 433/44 in the brief.
  No failures either way; re-measure before quoting the number anywhere.

---

## Spec vs delivery

| Spec item | Status |
|---|---|
| Storage format, label scheme, `sr-` + 6 hex, round-tripped verbatim, never derived from `textHash` | delivered, verified |
| Token immediately before `<!--SR:-->`, placement delegated to `isCardCommentsOnSameLine` | delivered; the **no-schedule** branch has no comment to sit before, which is C1 |
| Survives `removeScheduleInfo`; never lands in a fence/math block/table | delivered, verified on all shapes |
| Both tokens excluded from `textHash` | delivered, verified byte-identical |
| Trailing-token strip in a loop, order-independent | delivered, verified both orders |
| Parser skips definition lines + continuations | delivered — but see I3 for the mid-card case the rule does not consider |
| Read path: `label → definition` map built once per note, exact-label lookup | delivered |
| Degenerate case: reference present, definition missing | delivered, verified (recreated under the same label) |
| Degenerate case: two cards sharing one label, first definition wins | delivered, verified |
| Exactly one file write per review | delivered, now test-locked |
| Append semantics: blank line before, one trailing newline, neighbours byte-identical | delivered, verified; see M8 |
| Staging on the sequencer, `flushPendingCardComment` for the no-rating exits | delivered |
| UI: always-visible textarea, answer side only, never focused, Esc blurs, capped growth, past entries via `RenderMarkdownWrapper` | delivered |
| "All five exits harvest the typed text … Edit/**Delete** Card" | **delivered differently** — Delete Card discards by design (T5 ruling: `NotesDataStore.delete` leaves the definition behind). The ruling is right; the spec sentence is now stale and should be corrected. |
| Cram mode shows nothing and writes nothing, guarded in the sequencer | delivered, verified |
| **Testing item 4** — "three successive rated reviews leave the note **byte-identical** apart from the schedule and the new entries. *This is the test the archived design failed.*" | **NOT delivered as specified.** The committed test asserts four `toContain` fragments, never byte equality, and covers only a scheduled inline card with `cardCommentOnSameLine: true`. The single configuration that does **not** converge is the configuration the test does not cover. This is the most consequential gap on the branch and it is the gap that let C1 through. |
| **Testing item 2** — round-trip per card type under **both** `cardCommentOnSameLine` settings | partly delivered: both settings are covered at the `QuestionText`/`formatForNote` level, but no test runs a full parse → write → parse round trip under `cardCommentOnSameLine: false`. |
| **Testing item 10** — "two identical cards in one file still behave" | **no such test exists**, and behaviour is worse than before (I4). |
| Not delivered, as the plan itself declared | no automated UI coverage; the manual Obsidian pass remains the gate for the multi-entry-definition rendering open question. |
| Undocumented addition | the blockquote guard (I6). |

---

## Triage of the ledger's deferred Minors and accepted rulings

Taking each item as recorded in `progress.md`, with a must-fix / can-stand call.

1. **T1 — `generateCardCommentLabel` retry loop probabilistic, not formally bounded.**
   **Can stand.** 16.7M label space against a handful of labels per note. A bound would be noise.

2. **T1 / T4 — the `^ {0,3}\[\^` and `sr-[0-9a-f]{6}` tightenings the controller ruled in rather than deferred.**
   **Correct calls, and they held up.** I re-checked all three regexes against col-0, 3-space, 4-space,
   6-space and tab-indented definitions, and against our own entry (4) and continuation (6) indents. No
   false positive. Standardising the hex length to exactly 6 across `parser.ts`, `card-comment.ts` and
   `note-footnotes.ts` is what makes C1's fix a one-line change rather than three.

3. **T2 — `isFootnoteContinuationLine` accepts any 1-space-indented non-blank line.**
   **Must be addressed before real-vault use — at minimum by documentation.** This predicate *is* the
   mechanism behind I5, and the ledger filed it as a note about lazy-continuation semantics without
   connecting it to the write path. The cheapest sufficient fix is the blank-line rule written into the
   spec and the module header; the stronger fix is to stop the range at the first line that is neither a
   4-space bullet nor a 6-space continuation.

4. **T2 (accepted rather than fixed) — inflated `lastLineNum` when a definition sits directly under a multi-line card.**
   **Can stand as a bug — but fix it for free as part of I3, and correct the record.** The ledger and the
   T2 reviewer are right that the card's *text* is correct and nothing the writer touches is affected,
   and right that the only consumer in `src/` is `isQuestionLineNum` → `isNoteLevelFlashcardTag`
   (I re-verified: one call site, `note-question-parser.ts:314`, nothing locates or rewrites a card by it).
   The worst case really is a mis-filed deck for a card with a `#flashcards` tag typed inside an adjacent
   footnote. **But the ledger understates the size:** it records "3 rather than 2", i.e. one line. The
   inflation is actually *one plus the number of continuation lines* — measured
   `lastLineNum = 5` for a 3-line card with a two-continuation definition glued beneath, and it grows
   without limit with the definition's length. That widens the window for the mis-attribution the ruling
   accepted. The controller's reason for not fixing it (the fix needs a last-content-line tracker in the
   shared push path, wider blast radius than the bug) was sound **in isolation**; it stops being sound
   now that I3 requires touching that same skip anyway. Terminating the card at the definition line fixes
   both with one change and no new tracker.

5. **T3 — `extractObsidianBlockId` declares `[string, string]` but returns null.**
   **Can stand.** Pre-existing upstream, untouched, and the new strip loop consumes it correctly.

6. **T4 — `findDefinitionRange` first-match vs `collectCardCommentDefinitions` last-match on duplicate labels.**
   **Can stand.** Unreachable under collision-checked generation. One correction to the record: the
   consequence is content **duplication** (the first definition is overwritten with the second's content
   plus the new entry, the second survives), not loss or ambiguity. Worth one line in the module comment.

7. **T4 (accepted rather than fixed) — continuation over-consumption in `findDefinitionRange`.**
   **Must be addressed before real-vault use — see I5 — and the recorded cost is wrong.** The ruling's
   reasoning that the adjacency is inherently ambiguous and that *our own* writes can never create it is
   correct: append always inserts a blank line and always targets EOF, which I verified, and a blank line
   does stop the range. But the ruling's stated cost — *"a hand-edit of that exact shape loses the glued
   lines on the next comment write"* — is not what happens. The lines are **not lost**: they are absorbed
   into the previous entry's text and re-emitted at a uniform 6-space indent. That is worse in one
   specific way and better in another. Better, because nothing is deleted — the June-2026 failure class
   is genuinely excluded. Worse, because the damage is *silent and semantic*: an indented code block or
   table a user adds under an entry comes back structurally destroyed but textually intact, so neither a
   diff reviewer nor the user notices until they next read that snippet. Given that the spec explicitly
   positions this log as hand-editable, "clutter, not corruption" is not the right characterisation. I
   would not block a merge on the code change, but I would block it on the documentation: the blank-line
   rule must be written down where a future hand-editor will see it.

8. **T5 — `Note.writeNoteFile` clears `hasChanged` but not `pendingCardCommentText`.**
   **Can stand.** Reproduced; confirmed no note damage. The comment is either silently lost or written
   later with a stale date, and only via the narrow more-schedules-than-cards rewrite path. A one-line
   `question.discardPendingCardComment()` in `writeNoteFile` would close it if anyone is passing by.

9. **T5 — the `question.cardCommentDefinition = definition` write-back is untested and "redundant given the `findFootnoteDefinition` fallback".**
   **Can stand, but it is not redundant.** It is what keeps the past-entry list fresh for a card that is
   short-term-requeued and shown again in the same session without a note re-read. Worth one test, not a
   blocker.

10. **T5 Ruling 2 (fixed) — skip the definition upsert *and* the file write on a `MultiLineTextFinder` miss.**
    **Correct, verified, and stronger than the reviewer proposed — but incomplete.** I confirmed 0 writes
    on a miss and confirmed the re-review's point that `lastUpdateFoundOriginal` defaults true and is set
    in both branches immediately before being read. Suppressing the pre-existing no-op whole-file write is
    a genuine Syncthing-conflict improvement beyond the comment feature. What the ruling missed is that
    the early return leaves the freshly allocated label behind — that is I2, and it is the one place where
    the branch can still put a reference into a user's note with no definition anywhere.

11. **T6 — `SRModalView.onClose` flush is fire-and-forget.**
    **Can stand.** Obsidian's `onClose` is synchronous; there is no alternative. Add `.catch`.

12. **T2 Ruling — the implementer's correction of six `CardType` expectations.**
    **Confirmed correct.** `parser.test.ts`'s own `parserOptions` sets `singleLineReversedCardSeparator`
    to `":::"`, so `"Q1:::A1"` is `SingleLineReversed`, matching the pre-existing assertion at
    `parser.test.ts:105`. The controller's own vault settings (`:::` basic / `::::` reversed) were the
    source of the confusion, and the inline note in the test records it properly.

---

## Recommendations

1. Fix C1 (one regex), I2 (three lines), I3 (terminate the card at a definition line). I3 subsumes
   ledger item 4.
2. Add the convergence test the spec actually asked for: a full parse → write → re-parse loop asserting
   **byte equality modulo the new entry**, parameterised over both `cardCommentOnSameLine` values and
   over at least {unscheduled single-line, scheduled single-line, multi-line, fence-ending, cloze}. The
   masking helper is three lines (replace the `[^sr-…]` definition block and labels with placeholders,
   compare). Had this existed, C1 would have been caught in Task 3.
3. Add the missing spec-item-10 test for two identical cards, asserting the *actual* behaviour, so the
   mis-attribution is recorded rather than implied.
4. Correct four statements in the spec: Delete Card discards by design; label generation scans definitions
   not references; first-match-wins **is** made worse for duplicate cards; add the "leave a blank line
   before anything you add under an `sr-` footnote" rule.
5. Decide on I6 and write the decision down either way.
6. Unrelated but worth knowing before anyone flips a setting: **`convertFoldersToDecks: true` deletes the
   `#flashcards` tag from the card line on every write.** I confirmed this on the base commit's code path
   with no comment involved (`"#flashcards Q1::A1 <!--SR:…-->"` → `"Q1::A1\n<!--SR:…-->"`), so it is a
   pre-existing upstream bug, not this branch's. It is out of scope here, but it means this branch cannot
   be exercised under that setting, and it is a tag-deletion bug in a fork whose whole premise is not
   losing bytes the plugin does not own.

## Assessment

**Ready to merge? With fixes — C1, I2, I3, plus the convergence test.**

**Reasoning:** The design is right and the engineering around it is careful — the token stays outside
the rewritten region, `textHash` is untouched, one write per review is now test-locked, and a 4263-card
re-parse of the live vault shows the parser change is a measured no-op. But the token is only *stable*
while a `<!--SR:-->` comment anchors it; standing alone it is invisible to the parser, and the result is
the archived design's unbounded append, dormant behind one boolean. Two smaller holes — an orphaned
reference after a write miss, and a card made permanently unwritable by a definition line inside it —
are both silent failures in a feature whose entire justification is that silent note damage is excluded
by construction. All three are small, localised fixes. Fix them, add the byte-equality convergence test
the spec already specifies, and this is a sound piece of work.
