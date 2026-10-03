import { ClozeCrafter } from "clozecraft";

import { SR_METADATA_CALLOUT } from "src/data/constants";
import { CardType } from "src/data/data-structures/card/questions/question";
import { isFootnoteContinuationLine, isFootnoteDefinitionLine } from "src/utils/card-comment";
import { findMathSpans, MathSpan, splitMath } from "src/utils/math-spans";

export let debugParser = false;

export interface ParserOptions {
    singleLineCardSeparator: string;
    singleLineReversedCardSeparator: string;
    multilineCardSeparator: string;
    multilineReversedCardSeparator: string;
    multilineCardEndMarker: string;
    clozePatterns: string[];
    // Every line containing a cloze is its own (inline) card: the note's `sr-inline: true`
    inlineClozeLines?: boolean;
}

export function setDebugParser(value: boolean) {
    debugParser = value;
}

export class ParsedQuestionInfo {
    cardType: CardType;
    text: string;

    // Line numbers start at 0
    firstLineNum: number;
    lastLineNum: number;

    constructor(cardType: CardType, text: string, firstLineNum: number, lastLineNum: number) {
        this.cardType = cardType;
        this.text = text;
        this.firstLineNum = firstLineNum;
        this.lastLineNum = lastLineNum;
    }

    isQuestionLineNum(lineNum: number): boolean {
        return lineNum >= this.firstLineNum && lineNum <= this.lastLineNum;
    }
}

function markerInsideCodeBlock(text: string, marker: string, markerIndex: number): boolean {
    let goingBack = markerIndex - 1,
        goingForward = markerIndex + marker.length;
    let backTicksBefore = 0,
        backTicksAfter = 0;

    while (goingBack >= 0) {
        if (text[goingBack] === "`") backTicksBefore++;
        goingBack--;
    }

    while (goingForward < text.length) {
        if (text[goingForward] === "`") backTicksAfter++;
        goingForward++;
    }

    // If there's an odd number of backticks before and after,
    //  the marker is inside an inline code block
    return backTicksBefore % 2 === 1 && backTicksAfter % 2 === 1;
}

function hasInlineMarker(text: string, marker: string): boolean {
    // No marker provided
    if (marker.length === 0) return false;

    // Check if the marker is in the text
    const markerIdx = text.indexOf(marker);
    if (markerIdx === -1) return false;

    // Check if it's inside an inline code block
    return !markerInsideCodeBlock(text, marker, markerIdx);
}

/**
 * Returns flashcards found in `text`
 *
 * It is best that the text does not contain frontmatter, see extractFrontmatter for reasoning
 *
 * Card boundaries (see Claude/Flashcard Format.md in the vault):
 * - Inline cards are a single line: `:::` / `::::` cards, and inline cloze lines (a `+` list item
 *   with a cloze, or any cloze line when `inlineClozeLines` is set). An inline card ends a card
 *   pending above it (that card is kept) and collection restarts after it.
 * - Other cards end at a blank line, or, when `multilineCardEndMarker` is set, only at a line
 *   equal to the marker. In marker mode a card starts right after the previous marker, so lead-in
 *   prose is part of it; leading blank and heading lines are dropped.
 * - Inside math (`$...$`, `$$...$$`) braces belong to LaTeX: `{{...}}` there is not a cloze, and
 *   `\cloze{answer}{hint}` counts only there.
 *
 * @param text - The text to extract flashcards from
 * @param ParserOptions - Parser options
 * @returns An array of parsed question information
 */
export function parse(text: string, options: ParserOptions): ParsedQuestionInfo[] {
    if (debugParser) {
        console.log("Text to parse:\n<<<" + text + ">>>");
    }

    // Sort inline separators by length, longest first
    const inlineSeparators = [
        { separator: options.singleLineCardSeparator, type: CardType.SingleLineBasic },
        { separator: options.singleLineReversedCardSeparator, type: CardType.SingleLineReversed },
    ];
    inlineSeparators.sort((a, b) => b.separator.length - a.separator.length);

    const marker: string = options.multilineCardEndMarker;
    const cards: ParsedQuestionInfo[] = [];
    let cardText = "";
    let cardType: CardType | null = null;
    let firstLineNo = 0;

    const clozecrafter = new ClozeCrafter(options.clozePatterns);
    const normalized: string = text.replaceAll("\r\n", "\n");
    const lines: string[] = normalized.split("\n");

    // Cloze detection looks for `{{...}}` only outside math and for `\cloze` only inside it.
    const mathSpans: MathSpan[] = findMathSpans(normalized);
    const { textOnly, mathOnly } = splitMath(normalized, mathSpans);
    const textOnlyLines: string[] = textOnly.split("\n");
    const mathOnlyLines: string[] = mathOnly.split("\n");
    const lineStarts: number[] = [];
    for (let i = 0, offset = 0; i < lines.length; offset += lines[i].length + 1, i++) {
        lineStarts.push(offset);
    }
    const isClozeLine = (i: number): boolean =>
        clozecrafter.isClozeNote(textOnlyLines[i]) || /\\cloze\s*\{/.test(mathOnlyLines[i]);
    // A line that is part of a multi-line `$$` block can never be a card on its own.
    const crossesMathBoundary = (i: number): boolean => {
        const start: number = lineStarts[i],
            end: number = start + lines[i].length;
        return mathSpans.some(
            (s) => (s.start < start && s.end > start) || (s.start < end && s.end > end),
        );
    };
    const isInlineClozeLine = (i: number): boolean =>
        (!!options.inlineClozeLines || /^\s*\+\s/.test(lines[i])) &&
        isClozeLine(i) &&
        !crossesMathBoundary(i);

    // Record a card. Leading blank lines, and in marker mode leading headings (already shown in
    // the card's context breadcrumb), are not part of it.
    const pushCard = (type: CardType, raw: string, first: number, last: number): void => {
        const rawLines: string[] = raw.split("\n");
        while (
            rawLines.length > 0 &&
            (rawLines[0].trim().length === 0 || (!!marker && /^#{1,6}\s/.test(rawLines[0])))
        ) {
            rawLines.shift();
            first++;
        }
        const cardBody: string = rawLines.join("\n").trimEnd();
        if (cardBody.length > 0) cards.push(new ParsedQuestionInfo(type, cardBody, first, last));
    };

    for (let i = 0; i < lines.length; i++) {
        const currentLine = lines[i],
            currentTrimmed = lines[i].trim();

        // HTML comments are never interpreted. Inside a card being collected they are kept
        // verbatim, so the card's text stays contiguous with the note (write-back finds a card
        // by its exact text); otherwise they are skipped.
        if (currentLine.startsWith("<!--") && !currentLine.startsWith("<!--SR:")) {
            let end = i;
            while (end + 1 < lines.length && !lines[end].includes("-->")) end++;
            if (cardText.length > 0) {
                for (let k = i; k <= end; k++) cardText += "\n" + lines[k].trimEnd();
            } else {
                firstLineNo = end + 1;
            }
            i = end;
            continue;
        }

        // Skip footnote definitions wholesale, including indented continuations. Their text
        // is prose the plugin must not interpret: a definition containing ":::" would
        // otherwise be picked up as a card, and one sitting directly under a multi line card
        // would be absorbed into it. This also protects the user's own footnotes.
        //
        // A definition line TERMINATES any card accumulating above it, exactly as a blank
        // line does; it must not merely be dropped while accumulation continues past it.
        // Dropping it would leave questionText.original non-contiguous in the note, so
        // MultiLineTextFinder would miss forever, every write would be suppressed, and the
        // card's schedule would silently never persist. Terminating here also keeps
        // lastLineNum honest: it used to be inflated by one plus the definition's
        // continuation count, growing without bound with the definition's length.
        //
        // NOTE for hand-editors: isFootnoteContinuationLine treats ANY indented non-blank
        // line as a continuation, so content glued directly under a definition is consumed
        // into it. Leave a blank line before anything you add under an `sr-` footnote. See
        // the comment on formatCardCommentDefinition in src/utils/card-comment.ts.
        if (isFootnoteDefinitionLine(currentLine)) {
            if (cardType) pushCard(cardType, cardText, firstLineNo, i - 1);
            cardType = null;
            cardText = "";
            while (i + 1 < lines.length && isFootnoteContinuationLine(lines[i + 1])) i++;
            firstLineNo = i + 1;
            continue;
        }

        // Have we reached the end of a card?
        const isEmptyLine = currentTrimmed.length === 0;
        const isEndMarker: boolean = !!marker && currentTrimmed === marker;
        if ((isEmptyLine && !marker) || isEndMarker) {
            if (cardType) pushCard(cardType, cardText, firstLineNo, i - 1);
            cardType = null;
            cardText = "";
            firstLineNo = i + 1;
            continue;
        }
        if (isEmptyLine && cardText.length === 0) {
            // Marker mode: blank lines before anything has been collected
            firstLineNo = i + 1;
            continue;
        }

        // Update card text
        const pendingType: CardType | null = cardType;
        const pendingText: string = cardText;
        if (cardText.length > 0) {
            cardText += "\n";
        }
        cardText += currentLine.trimEnd();

        // Pick up inline cards
        let inlineType: CardType | null = null;
        for (const { separator, type } of inlineSeparators) {
            if (hasInlineMarker(currentLine, separator)) {
                inlineType = type;
                break;
            }
        }
        if (inlineType === null && isInlineClozeLine(i)) inlineType = CardType.Cloze;

        if (inlineType !== null) {
            // A card pending above this line ends here; it is kept, never discarded.
            if (pendingType !== null) pushCard(pendingType, pendingText, firstLineNo, i - 1);

            let inlineText: string = currentLine;
            const inlineFirst: number = i;

            // Pick up scheduling information if present. The line may begin with this
            // plugin's footnote reference, which travels immediately before the schedule.
            const nextLine: string = i + 1 < lines.length ? lines[i + 1] : "";
            // The `$` alternative is load bearing, not defensive. A card with no schedule yet
            // has no comment for the reference to sit in front of, so formatForNote emits a
            // BARE "\n[^sr-xxxxxx]" line (own-line placement: cardCommentOnSameLine false, or
            // a card ending in a code fence). If that line is not absorbed here, the card
            // re-parses WITHOUT its reference, mints a fresh label, and appends another
            // reference line and another definition on every single comment, without bound -
            // which is exactly the death mode that got the earlier callout design abandoned.
            const nextIsScheduleOrCommentRef: boolean =
                nextLine.startsWith("<!--SR:") ||
                /^\[\^sr-[0-9a-f]{6}\]( <!--SR:|$)/.test(nextLine);
            if (nextIsScheduleOrCommentRef) {
                inlineText += "\n" + lines[i + 1];
                i++;
            } else if (i + 1 < lines.length && lines[i + 1].startsWith(SR_METADATA_CALLOUT)) {
                for (let j = i + 1; j < lines.length; j++) {
                    inlineText += "\n" + lines[j];
                    i++;
                    if (lines[j].includes("<!--SR:")) {
                        break;
                    }
                }
            }

            cards.push(new ParsedQuestionInfo(inlineType, inlineText, inlineFirst, i));

            cardType = null;
            cardText = "";
            firstLineNo = i + 1;
        } else if (currentTrimmed === options.multilineCardSeparator) {
            // Ignore card if the front of the card is empty
            if (cardText.length > 1) {
                // Pick up multiline basic cards
                cardType = CardType.MultiLineBasic;
            }
        } else if (currentTrimmed === options.multilineReversedCardSeparator) {
            // Ignore card if the front of the card is empty
            if (cardText.length > 1) {
                // Pick up multiline basic cards
                cardType = CardType.MultiLineReversed;
            }
        } else if (currentLine.startsWith("```") || currentLine.startsWith("~~~")) {
            // Pick up codeblocks
            const codeBlockClose = currentLine.match(/`+|~+/)[0];
            while (i + 1 < lines.length && !lines[i + 1].startsWith(codeBlockClose)) {
                i++;
                cardText += "\n" + lines[i];
            }
            cardText += "\n" + codeBlockClose;
            i++;
        } else if (cardType === null && isClozeLine(i)) {
            // Pick up cloze cards (clozecraft patterns outside math, \cloze{answer}{hint} inside)
            cardType = CardType.Cloze;
        }
    }

    // Do we have a card left in the queue?
    if (cardType && cardText) {
        pushCard(cardType, cardText, firstLineNo, lines.length - 1);
    }

    if (debugParser) {
        console.log("Parsed cards:\n", cards);
    }

    return cards;
}
