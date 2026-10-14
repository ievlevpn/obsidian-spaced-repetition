import { t } from "src/lang/helpers";
export interface CardCommentEntry {
    date: string;
    text: string;
}

const REF_PREFIX = "sr-";
// At most 3 leading spaces: that is markdown's limit for a footnote definition, and it stops
// this matching our own indented entry (4 spaces) and continuation (6 spaces) lines, or a
// "[^x]:" a user typed as a later line of a comment.
const DEFINITION_LINE_REGEX = /^ {0,3}\[\^[^\]]+\]:/;
// \s, not a literal space: in the own-line case (a card ending in a code fence, or
// cardCommentOnSameLine: false) the token is preceded by a NEWLINE, not a space.
// Exactly 6 hex digits, matching what generateCardCommentLabel emits.
const CARD_COMMENT_REF_ENDOFLINE_REGEX = /\s\[\^(sr-[0-9a-f]{6})\]$/;
const ENTRY_INDENT = "    ";
const CONTINUATION_INDENT = "      ";
const DATED_ENTRY_REGEX = /^-\s+\*(\d{4}-\d{2}-\d{2}):\*\s?(.*)$/;
const PLAIN_ENTRY_REGEX = /^-\s+(.*)$/;

/**
 * Escapes a single line of user text so it cannot forge a bullet.
 * Only the leading character is significant to markdown here.
 */
function escapeLine(line: string): string {
    return line.replace(/^(\s*)(\\*[->])/, "$1\\$2");
}

function unescapeLine(line: string): string {
    return line.replace(/^(\s*)\\(\\*[->])/, "$1$2");
}

/** True if the line opens ANY markdown footnote definition, not only the plugin's. */
export function isFootnoteDefinitionLine(line: string): boolean {
    return DEFINITION_LINE_REGEX.test(line);
}

/**
 * True if the line is an indented continuation of a footnote definition.
 *
 * LIMITATION, and the one hand-editing rule this feature has:
 * **leave a blank line before anything you add under an `sr-` footnote.**
 *
 * This predicate is deliberately markdown's own lazy-continuation rule: ANY indented
 * non-blank line continues the definition above it. So content a user glues directly beneath
 * an entry - an indented code block, a nested table - is read back as continuation text of
 * that entry by parseCardCommentDefinition, and re-emitted by formatCardCommentDefinition at
 * this module's uniform CONTINUATION_INDENT. Nothing is deleted; the TEXT survives in full.
 * But a 4/8-space nesting comes back flattened to a single 6-space level, which destroys the
 * code or table as structure while leaving it intact as prose - silent, and semantic rather
 * than visible. A single blank line before the added content stops it completely, because it
 * ends the definition's range.
 *
 * The write path can never create this shape itself: an append always inserts a blank line
 * and always targets the end of the note. It takes a hand-edit.
 */
export function isFootnoteContinuationLine(line: string): boolean {
    return /^[ \t]+\S/.test(line);
}

/**
 * Index of the first line after the footnote definition that opens at `start`: its continuation
 * lines run on, and so does an all-space line with a continuation line after it. That is how
 * formatCardCommentDefinition writes the empty line between two paragraphs of an entry, and
 * a truly empty line still ends the definition.
 */
export function footnoteDefinitionEnd(lines: string[], start: number): number {
    let end = start + 1;
    while (end < lines.length) {
        if (isFootnoteContinuationLine(lines[end])) end++;
        else if (
            /^[ \t]+$/.test(lines[end]) &&
            end + 1 < lines.length &&
            isFootnoteContinuationLine(lines[end + 1])
        )
            end += 2;
        else break;
    }
    return end;
}

export function formatCardCommentRef(label: string): string {
    return `[^${label}]`;
}

/**
 * Splits the plugin's own footnote reference off the END of a line.
 * Returns [text without the reference, label] or [text, null].
 * A reference that is not ours, or not at the end, is left alone.
 */
export function extractCardCommentRef(text: string): [string, string | null] {
    const match = text.match(CARD_COMMENT_REF_ENDOFLINE_REGEX);
    if (!match) return [text, null];
    return [text.substring(0, text.length - match[0].length).trimEnd(), match[1]];
}

/**
 * Renders a complete footnote definition, with no trailing newline.
 *
 * Every continuation line is emitted at CONTINUATION_INDENT, a single uniform level. This
 * pairs with parseCardCommentDefinition, which flattens any multi-level indentation it reads
 * into continuation text; together they re-indent hand-edited indented content glued under an
 * entry. See the limitation on isFootnoteContinuationLine above: leave a blank line before
 * anything you add under an `sr-` footnote.
 */
export function formatCardCommentDefinition(label: string, entries: CardCommentEntry[]): string {
    if (entries.length === 0) return "";

    const lines: string[] = [];
    entries.forEach((entry, idx) => {
        const textLines = entry.text.split("\n");
        const prefix = entry.date ? `*${entry.date}:* ` : "";
        const bullet = `- ${prefix}${escapeLine(textLines[0])}`;
        lines.push(idx === 0 ? `[^${label}]: ${bullet}` : `${ENTRY_INDENT}${bullet}`);
        for (const continuation of textLines.slice(1)) {
            lines.push(CONTINUATION_INDENT + escapeLine(continuation));
        }
    });
    return lines.join("\n");
}

/** Parses a definition (including its `[^label]: ` prefix) back into entries. */
export function parseCardCommentDefinition(definition: string): CardCommentEntry[] {
    const entries: CardCommentEntry[] = [];
    const rawLines = definition.replaceAll("\r\n", "\n").split("\n");

    // An empty line inside an entry (between its paragraphs), kept once text follows it
    let emptyLine = false;
    rawLines.forEach((rawLine, idx) => {
        // The first line carries the "[^label]: " prefix; strip it before matching
        const body = idx === 0 ? rawLine.replace(DEFINITION_LINE_REGEX, "").trimStart() : rawLine;
        const trimmed = body.trim();
        if (trimmed.length === 0) {
            emptyLine = entries.length > 0;
            return;
        }
        const paragraphBreak: boolean = emptyLine;
        emptyLine = false;

        const dated = trimmed.match(DATED_ENTRY_REGEX);
        if (dated) {
            entries.push({ date: dated[1], text: unescapeLine(dated[2]) });
            return;
        }

        const plain = trimmed.match(PLAIN_ENTRY_REGEX);
        if (plain) {
            entries.push({ date: "", text: unescapeLine(plain[1]) });
            return;
        }

        if (entries.length > 0) {
            // An indented line that is not a bullet continues the entry above it. Its own
            // indentation is discarded here and re-emitted at the single uniform
            // CONTINUATION_INDENT by formatCardCommentDefinition - see the limitation noted
            // on isFootnoteContinuationLine.
            entries[entries.length - 1].text +=
                (paragraphBreak ? "\n\n" : "\n") + unescapeLine(trimmed);
        } else {
            // A hand-written definition with no bullet at all
            entries.push({ date: "", text: unescapeLine(trimmed) });
        }
    });

    return entries;
}

/**
 * Appends a dated entry. Returns the new definition, or the definition unchanged
 * (possibly null) when there is nothing to add.
 */
export function appendCardCommentEntry(
    definition: string | null,
    label: string,
    text: string,
    date: string,
): string | null {
    const trimmed = text.trim();
    if (trimmed.length === 0) return definition;

    const entries = definition ? parseCardCommentDefinition(definition) : [];
    entries.push({ date, text: trimmed });
    return formatCardCommentDefinition(label, entries);
}

/**
 * Replaces the text of entry `index` (keeping its date), or deletes the entry when `text` is
 * blank. Returns the new definition, "" when no entries remain (the footnote should then be
 * removed), or the definition unchanged when `index` does not exist.
 */
export function editCardCommentEntry(
    definition: string | null,
    label: string,
    index: number,
    text: string,
): string | null {
    const entries = definition ? parseCardCommentDefinition(definition) : [];
    if (index < 0 || index >= entries.length) return definition;
    const trimmed = text.trim();
    if (trimmed.length === 0) entries.splice(index, 1);
    else entries[index] = { ...entries[index], text: trimmed };
    return formatCardCommentDefinition(label, entries);
}

/** Generates a label not present in `taken`. */
export function generateCardCommentLabel(taken: Set<string>): string {
    for (;;) {
        const hex = Math.floor(Math.random() * 0x1000000)
            .toString(16)
            .padStart(6, "0");
        const label = REF_PREFIX + hex;
        if (!taken.has(label)) return label;
    }
}

/**
 * What the link above the past notes offers: the notes folded away, or folding them again.
 *
 * @param hidden - Notes folded away behind "show N earlier notes"
 * @param expanded - Whether every note is shown
 * @returns The link's label, or null for no link
 */
export function notesLinkLabel(hidden: number, expanded: boolean): string | null {
    if (expanded) return t("CARD_NOTE_SHOW_FEWER");
    if (hidden === 1) return t("CARD_NOTE_SHOW_EARLIER_ONE");
    if (hidden > 1) return t("CARD_NOTE_SHOW_EARLIER", { count: hidden });
    return null;
}

// The notes list's height, set by dragging its grip: at least about one note, at most most of
// the window, so the card and the rating buttons always keep some room
export const NOTES_MIN_HEIGHT = 48;
export const NOTES_MAX_FRACTION = 0.7;

/**
 * The height a drag of the notes list's grip asks for, kept within bounds.
 *
 * @param height - Requested height (px)
 * @param windowHeight - The window's inner height (px)
 * @returns The height to apply (px, whole)
 */
export function clampNotesHeight(height: number, windowHeight: number): number {
    const max: number = Math.max(NOTES_MIN_HEIGHT, windowHeight * NOTES_MAX_FRACTION);
    return Math.round(Math.min(max, Math.max(NOTES_MIN_HEIGHT, height)));
}

/**
 * Whether a card's comment reference would land inside a quote or callout. The reference goes
 * at the end of the card's last line, before its schedule comment, while the definition goes at
 * the end of the note, outside any quote; a reference on a quoted line would read as part of a
 * quote the user did not write. So only the last line counts: a card that quotes a theorem
 * above an unquoted line is fine. (When the schedule goes on a line of its own, a quoted last
 * line would be fine too; refusing it is the conservative choice.)
 *
 * @param cardText - The card's text as written in the note
 * @returns True when the comment box should be refused
 */
export function cardCommentRefInQuote(cardText: string): boolean {
    const lines: string[] = cardText.trimEnd().split("\n");
    return lines[lines.length - 1].trimStart().startsWith(">");
}
