# SDD ledger — plan: docs/superpowers/plans/2026-10-03-card-comment-footnotes.md

Spec: docs/superpowers/specs/2026-10-03-card-comment-footnotes-design.md (read, reachable)
Branch: feat/card-comment-footnotes, based on upstream/main. Not a worktree.
Ruling: proceed on the branch in place — it is already an isolated feature branch and is not
  main/master nor the fork's derived `vault-build`. Cost if wrong: work lands on the feature
  branch, which is where the plan wants it.
Prior attempt: tag archive/card-comments-callout (callout-based, abandoned after review).
  Several files are ported from it; `git show archive/card-comments-callout:<path>` retrieves them.

## Pre-flight scan

### Cross-task pairs (shared files / interfaces)

| Pair | Produced → Consumed | Finding |
|---|---|---|
| T1 → T2 | `isFootnoteDefinitionLine`, `isFootnoteContinuationLine` | clean |
| T1 → T3 | `extractCardCommentRef`, `formatCardCommentRef` | **DEFECT, fixed pre-flight** (see rulings) |
| T1 → T4 | both footnote line predicates | clean |
| T1 → T5 | `appendCardCommentEntry`, `generateCardCommentLabel` | clean |
| T1 → T6 | `parseCardCommentDefinition` | clean |
| T3 → T5 | `QuestionText.cardCommentRef`, `Question.setCardCommentRef` | clean |
| T4 → T5 | `collectCardCommentLabels/Definitions`, `findFootnoteDefinition`, `upsertFootnoteDefinition` | clean |
| T5 → T6 | the two sequencer methods (on the interface), `Question.cardCommentDefinition` | clean — interface declaration is specified in T5, which T6 depends on; `ContentManager.reviewSequencer` is typed as the interface |
| T3 & T5 both touch `question.ts` | T3 adds the field/strip/emit, T5 adds staging + `resolveCardComment` | sequential, no contention; T5's commit list includes `question.ts` |

### Per-task self-consistency (traced by hand against the specified code)

| Task | Finding |
|---|---|
| T1 | entry format ↔ parse traced for: single entry, two entries (4-space indent), multi-line entry (6-space continuation), escaped leading `-`, undated bullet, bulletless hand-written definition. All round-trip. |
| T2 | skip placement is before `cardText += currentLine`, matching the archived lesson. Own-line lookahead regex `^\[\^sr-[0-9a-f]+\] <!--SR:` traced against the single-line branch. |
| T3 | **DEFECT found and fixed pre-flight** — see rulings. Token/block-id loop traced in both orders; `extractObsidianBlockId` cannot false-match inside `[^sr-…]` because its `^` is preceded by `[`, not a space. All four `formatForNote` branches traced. |
| T4 | `upsertFootnoteDefinition` replace-shorter case traced (does not swallow following lines); append cases cover no-trailing-newline and already-blank-line. |
| T5 | write ordering traced: resolve → card rewrite → definition upsert, one read, one write. `resolveCardComment` clears staged text on every path. |
| T6 | no automated coverage (no DOM harness) — declared in the plan; manual pass is the gate. |

### Rulings

Ruling: T1's `CARD_COMMENT_REF_ENDOFLINE_REGEX` required a literal space before the token, but
  in the own-line case (card ending in a code fence, or `cardCommentOnSameLine: false`) the
  token is preceded by a NEWLINE. The regex would never have matched, so `splitText` would
  have left the token inside `actualQuestion` — polluting `textHash`, breaking the round-trip,
  and rendering the token as card text. Fixed in the plan before dispatch: `\s` instead of a
  literal space, plus two regression tests covering the newline case. Cost if wrong: none; `\s`
  is a strict superset and the trailing `trimEnd` handles both.

## Task log
Task 1: dispatched (haiku, transcription+port), BASE=383e723
Task 1: controller-verified the ported escapeLine/unescapeLine regexes are byte-identical to
  archive/card-comments-callout (diff, exit 0), so the reviewer was told not to re-check it.
Task 1: review 1 — spec ✅, quality Approved (1 Important, 2 Minor). Review at task-1-review.md
Task 1: Ruling: the Important finding WILL be fixed now rather than deferred. `isFootnoteDefinitionLine`
  uses `^\s*\[\^[^\]]+\]:` — unbounded leading whitespace — so it matches an indented line inside
  our OWN definition (entry lines are indented 4, continuations 6) and any `[^x]:` a user types as
  a later line of a comment. Harmless inside Task 1, but Tasks 2 and 4 both scan raw note text with
  this predicate to find definition boundaries, so a false positive there would mis-slice a
  definition or make the parser skip a real card line. Markdown only allows up to 3 leading spaces
  on a definition, so tightening to `^ {0,3}\[\^` is both more correct and removes the hazard.
  My own test asserting a 2-space-indented definition still passes. Cost if wrong: a definition
  indented 4+ spaces is not recognised — which is not a definition in markdown anyway.
Task 1: Ruling: bundling Minor 1 (hex length) into the same round, against the usual
  minors-never-enter-the-loop rule, because it is a one-character change to the very regexes being
  edited AND it is a cross-task interface question: Task 2's lookahead and Task 4's label regex use
  the same `sr-[0-9a-f]+` shape. Standardising on exactly `{6}` now prevents a later cross-task
  mismatch and stops a hand-typed `[^sr-a]` being claimed by the plugin. Carried into the T2 and T4
  dispatches. Cost if wrong: if the label length ever changes, three regexes change with it.
Task 1: minor (deferred): generateCardCommentLabel's retry loop is probabilistic rather than
  formally bounded (~16.7M label space, a handful per note). For final-review triage.
Task 1: fix round 1/5 (2 addressed, 0 open; commits 0821378..fe87223). Re-review was terse, so the
  controller verified both regexes directly against 10 inputs (col-0, 3-space, 4-space, 6-space,
  tab-indented, our own entry line; ref after space, after newline, too-short, too-long) — all
  correct.
Task 1: complete (commits 383e723..fe87223, review clean)
Task 2: dispatched (sonnet — precise insertion into the parser loop), BASE=fe87223
Task 2: implemented cb4a596 (DONE_WITH_CONCERNS), 395/395 full suite.
Task 2: Ruling: the implementer's correction of 6 CardType expectations is CORRECT and my plan was
  wrong. Verified: parser.test.ts's own parserOptions set singleLineReversedCardSeparator to ":::",
  and a pre-existing test at parser.test.ts:105 already asserts "Question:::Answer" is
  SingleLineReversed. (The vault's live settings are ::: basic / :::: reversed, which is what misled
  me.) The correction is documented inline in the test. Cost if wrong: none; it matches the parser's
  documented longest-separator-first behaviour.
Task 2: Ruling: ACCEPT the inflated lastLineNum (3 rather than 2) when a definition sits directly
  under a multi-line card, rather than fix it now. The card's TEXT is correct — no absorption, so
  nothing the writer touches is affected, which is this feature's dominant risk. The inaccuracy is
  metadata only: isQuestionLineNum would call the definition line part of the question, so a
  #flashcards tag typed INSIDE a footnote definition adjacent to a card could be mis-read as that
  card's topic. That requires a deliberately odd note. The fix needs a last-content-line tracker in
  the push path shared by every card type, so its blast radius is wider than the bug's. The
  implementer documented the quirk inline. Flagged for final-review triage with full context.
  Cost if wrong: a tag inside a footnote adjacent to a card misfiles that card's deck.
Task 2: review 1 — spec ✅, quality Approved (2 Minor, both acceptable, no fix round needed).
  Reviewer independently confirmed the lastLineNum ruling and narrowed it: the ONLY consumer of
  lastLineNum in src/ is note-question-parser.ts:314 via isQuestionLineNum, used solely by
  isNoteLevelFlashcardTag. Nothing uses it to locate or rewrite a card on disk, so the worst case
  really is a mis-attributed topic tag. Review at task-2-review.md
Task 2: minor (deferred): isFootnoteContinuationLine accepts any 1-space-indented non-blank line,
  so a hand-typed footnote followed with no blank line by an unrelated indented block swallows it.
  Matches real lazy-continuation footnote semantics. For final-review triage.
Task 2: complete (commits fe87223..cb4a596, review clean)
Task 3: dispatched (sonnet — multi-point edit of a load-bearing class), BASE=cb4a596
Task 3: review 1 — spec ✅, quality Issues (1 Important, 2 Minor). Review at task-3-review.md
Task 3: Ruling: the Important finding WILL be fixed even though it is unreachable today. In
  formatForNote, when hasSchedule is true but questionFormatScheduleAsHtmlComment returns a falsy
  string, the branch handles only blockId and never emits `ref` — so the reference would be silently
  dropped, and a dropped reference orphans the user's comment definition. The only shipped
  IDataStoreAlgorithm always returns a non-empty string, so nothing triggers it now, but this is
  exactly the not-re-emitted-equals-deleted failure class the whole design is built to exclude, and
  it costs three lines. Fixing via a small private helper shared with the no-schedule branch rather
  than duplicating the logic. Cost if wrong: one unused code path.
Task 3: Ruling: bundling the first Minor (no test for no-schedule + blockId + reference together)
  into the same round. The reviewer hand-traced it as correct, so this only locks in behaviour that
  already works, in a file already being edited. Cost if wrong: one extra test.
Task 3: minor (deferred): extractObsidianBlockId's return type is [string, string] though it returns
  null for a missing id. Pre-existing upstream, untouched by this branch. For final-review triage.
Task 3: fix round 1/5 (1 addressed, 0 open; commits 591fd99..963a6b3)
Task 3: complete (commits cb4a596..963a6b3, review clean)
Task 4: Ruling: the plan's `note-footnotes.ts` declares `LABEL_REGEX = /^\s*\[\^([^\]]+)\]:/` —
  unbounded leading whitespace, the exact defect fixed in Task 1. Left as-is it would reintroduce
  the hazard in the module that slices definitions out of raw note text: an indented `[^foo]:` a
  user typed as a later line of a comment, or our own 4-space entry lines, could be mistaken for a
  definition start and mis-slice a definition. Correcting to `/^ {0,3}\[\^([^\]]+)\]:/` for
  consistency with `isFootnoteDefinitionLine`. Cost if wrong: a definition indented 4+ spaces is
  not found — not a definition in markdown anyway.
Task 4: Ruling: also tightening `CARD_COMMENT_LABEL_REGEX` to `/^sr-[0-9a-f]{6}$/`, per the
  cross-task standardisation ruled in Task 1. Cost if wrong: three regexes change together if the
  label length ever changes.
Task 4: dispatched (haiku — complete code in the brief, transcription + tests), BASE=963a6b3
Task 4: review 1 — spec ✅, quality Issues (2 Important, 1 Minor). Review at task-4-review.md
Task 4: Ruling: CRLF normalisation (Important) WILL be fixed, although not reachable in this vault.
  Established by measurement rather than argument: 5 of 4448 vault notes contain CRLF and all five
  are plugin READMEs or downloaded Excalidraw scripts — no flashcard note is CRLF — and the plugin
  already normalises line endings when parsing (strings.ts:75, parser.ts:103). So severity today is
  theoretical. Fixing anyway because it is three lines in note-mutating code and because preserving
  bytes the plugin does not own is this feature's entire premise; a whole-file LF rewrite would show
  every line as changed and is a Syncthing conflict magnet across the Mac and the iPhone. Cost if
  wrong: one extra branch in upsertFootnoteDefinition.
Task 4: Ruling: continuation over-consumption (Important) is ACCEPTED as a documented limitation,
  not fixed. It is inherently ambiguous: a multi-line entry's continuation is arbitrary indented
  text, indistinguishable from a user's indented prose, so no predicate can separate them. Our own
  writes cannot create the adjacency — append always inserts a blank line before the definition and
  puts it at EOF — so it requires a hand-edit that glues indented content directly beneath a
  definition. Recorded for the manual pass and for final-review triage. Cost if wrong: a hand-edit
  of that exact shape loses the glued lines on the next comment write.
Task 4: minor (deferred): findDefinitionRange takes the first match on duplicate labels while
  collectCardCommentDefinitions records the last. Unreachable under collision-checked generation.
Task 4: fix round 1/5 (1 addressed, 0 open; commits f6c7d69..43846dd)
Task 4: complete (commits 963a6b3..43846dd, review clean)
Task 5: dispatched (sonnet — read/write path integration across four files), BASE=43846dd
Task 5: review 1 (opus) — spec ✅, quality Issues (0 Critical, 2 Important, 3 Minor).
  Reviewer empirically settled the hasChanged question I asked about: forcing Note.writeNoteFile on a
  question with a staged comment left the note BYTE-IDENTICAL, with no reference emitted without its
  definition, because the label is only ever allocated inside resolveCardComment, which composes the
  definition in the same expression. Review at task-5-review.md
Task 5: Ruling: Important 1 (blank staged text emits an orphaned reference, because
  setCardCommentRef runs before the definition is known non-empty) WILL be fixed. Latent today — the
  sequencer blank-guards first — but the invariant is enforced in a different class from the one that
  can break it, and an orphaned reference is a footnote marker pointing at nothing in the user's note.
  Cost if wrong: none; it only reorders two statements.
Task 5: Ruling: Important 2 (on a MultiLineTextFinder miss the definition upsert still runs, appending
  an orphaned definition) WILL be fixed, and fixed more strongly than the reviewer proposed: skip the
  definition upsert AND skip the file write entirely. A miss means the note changed under us — most
  plausibly Syncthing delivering a phone edit mid-review, which is a real scenario in this vault — so
  writing anything is wrong, and the pre-change no-op whole-file write was itself a conflict risk.
  Cost if wrong: on a miss the typed comment is lost rather than written to a note we can no longer
  locate the card in. Recorded as a limitation.
Task 5: Ruling: bundling Minor 3 (no committed test asserts the write COUNT) into the same round. The
  one-write-per-review property is the core reason this design was chosen over the callout one, and it
  currently rests on code inspection alone. A spy asserting exactly one write locks it in. Cost if
  wrong: one extra test.
Task 5: minor (deferred): Note.writeNoteFile clears hasChanged but not pendingCardCommentText, so an
  unresolved stage goes silent. No note damage. For final-review triage.
Task 5: minor (deferred): the `question.cardCommentDefinition = definition` write-back is untested and
  redundant given the findFootnoteDefinition fallback.
Task 5: Ruling: TWO CORRECTIONS TO THE TASK 6 PLAN, carried into its dispatch. (a) Task 6 must await
  flushPendingCardComment() BEFORE updateCurrentQuestionTextAndCards, or staged text survives only in
  memory and dies on the next exit. (b) Task 6 must NOT flush on the delete-card path: NotesDataStore
  .delete leaves the [^sr-...] definition behind, so flushing there writes a definition orphaned a
  moment later. My plan's Step 4 said to flush on delete; that is wrong and is overridden — on delete
  the staged text is discarded. Cost if wrong: a comment typed immediately before deleting its own
  card is dropped, which is the desired behaviour anyway.
Task 5: fix round 1/5 (2 addressed, 0 open; commits 639f605..15f2ce7). Re-review confirmed the new
  skip-the-write path cannot stop a schedule being saved: lastUpdateFoundOriginal defaults true, is
  set in both branches, and is read only immediately after being set by the same write() call.
Task 5: complete (commits 43846dd..15f2ce7, review clean)
Task 6: dispatched (sonnet — multi-file UI integration + ports), BASE=15f2ce7
Task 6: agent was stopped mid-run by the user, then resumed by the user. At the moment of the stop
  its work was present but UNCOMMITTED (two new component files plus six modified files). Controller
  verified the uncommitted state independently: tsc clean (exit 0), 433/433 tests across 44 suites,
  i.e. no regression against the Task 5 baseline. Outstanding at that point: eslint, production
  build, commit. Controller deliberately did NOT commit or edit those files, since the resumed agent
  owns them. Awaiting its completion notification.
Task 6: review 1 — spec ✅, quality Approved (2 Minor, both acceptable, no fix round). Reviewer
  enumerated all seven exits: rate (stage only, single write), skip, back-to-deck, close view (now
  awaited), close modal (best-effort, sync caller), Edit Card (flush BEFORE the text update) all
  persist; Delete Card discards by design. Both of my Task 5 corrections verified present. eslint
  clean (0 errors). Review at task-6-review.md
Task 6: minor (deferred): SRModalView.onClose flush is fire-and-forget because Obsidian's modal
  onClose is synchronous and cannot be awaited. Documented in code.
Task 6: complete (commits 15f2ce7..cc73895, review clean)
All 6 tasks complete. Proceeding to final whole-branch review.

## Final whole-branch review (opus) — DO NOT SHIP: 1 Critical + 5 Important
Full review at final-review.md.
CONTROLLER ERROR, disclosed: I ran sr-fork-install.sh while the final reviewer was still running.
  The script does `git checkout -B vault-build upstream/main` plus merges, so the repo moved off
  cc73895 mid-review. That is why the reviewer measured 462 tests / 45 suites instead of 433 / 44 —
  it was reading vault-build (upstream/main + all four feature branches). Findings still apply
  because vault-build contains this branch's code, but its "verified clean" measurements were taken
  on a tree that also carries cloze-latex-macro, due-first-random-deck and phone-skip-button. Any
  re-verification after the fixes must run on the feature branch itself.
Reachability measured against the live vault and settings, to size each finding rather than argue:
  - Critical (unbounded ref+definition accumulation): NOT reachable today. It needs own-line
    placement, i.e. cardCommentOnSameLine false or endsWithCodeBlock() true. Live setting is true
    and the reviewer measured 0 of 4263 cards ending in a code fence. Becomes reachable for 641
    cards the moment that setting is flipped to the plugin default.
  - Important (orphaned ref after a findAndReplace miss): reachable — Syncthing delivering a phone
    edit mid-review is the realistic trigger. Consequence is a visible marker pointing at nothing.
  - Important (definition line inside a card makes it permanently unwritable, schedule silently
    never persists): 0 occurrences in the vault; only reachable if such a card is authored.
  - Important (two identical cards in one note): NOT reachable. I measured it directly — the vault
    has exactly 2 duplicated card texts ("boue ::: mud", "well done ::: Gut gemacht") and ZERO notes
    containing a duplicate within a single note, which is the only case first-match-wins affects.
  - Important (hand-edited indented content under a definition re-indented to 6 spaces): requires
    the user to hand-edit that shape.
  - Important (blockquote guard suppresses the box for any card with a ">" line): 17 of 4263 cards,
    cosmetic, and it is my own Task 6 ruling having erred wide. Reviewer is right that it is
    undocumented.
Ruling: the plugin stays INSTALLED for now rather than being rolled back, because the Critical is
  not reachable under the live settings and the one thing no review can answer — Obsidian's actual
  rendering of a multi-entry definition — needs a human in Obsidian. Conditions handed to the user:
  do not flip cardCommentOnSameLine, do not comment on a card ending in a code fence, prefer a
  scratch note. Rollback is one command. Cost if wrong: an orphaned marker or a stray definition in
  a test note, recoverable from the 4448-note backup taken before install.
Hotfix (user-directed, outside the review loop): 340b86a — the comment box was attached to
  .sr-scroll-wrapper, which is `display: flex` with no direction and therefore a ROW, so the box
  rendered squeezed into a narrow column beside the card text. Reattached to this.view (a column
  flex) and added flex-shrink: 0 / width: 100%. Verified tsc + 433 tests + eslint 0 errors, built
  and installed (vault-build 7fe3ba0). Controller made this edit directly rather than dispatching,
  as a one-word user-visible fix while the user was mid-test. My plan was the source of the error:
  Task 6 Step 3 explicitly said to attach it to scrollWrapper.
Install gate widened: sr-fork-install.sh ran only math-cloze.test.ts + parser.test.ts (37 tests) as
  its pre-install gate, which did not cover this feature at all — a broken feature branch could have
  installed cleanly. Now runs the whole unit suite. Backup at /tmp/sr-fork-install.sh.bak2.
Verified the INSTALLED build (vault-build, all four features merged), which had never been tested as
  a whole: 462 tests / 45 suites passing, tsc clean, eslint 0 errors.
Fix wave: dispatched (opus — 1 Critical + 5 Important + the missing convergence test), BASE=340b86a
RESOLVED by manual verification in Obsidian (user, 2026-10-03): a multi-entry footnote definition
  renders as TWO DATED LINES, not one run-together paragraph. This was the spec's only declared
  open question and the one thing no automated review could reach. Consequence: the indented
  `- *YYYY-MM-DD:* text` continuation format in formatCardCommentDefinition is correct and stays
  as written — the "isolated to one function if it reads badly" fallback is not needed. The spec's
  "Open question for manual verification" section should be rewritten as a confirmed decision once
  the fix-wave agent finishes, since that agent is currently editing the same spec file for the
  Step 6 and Step 7 documentation.
