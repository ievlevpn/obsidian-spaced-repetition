export interface CardCommentEntry {
    date: string;
    text: string;
}

const REF_PREFIX = "sr-";
const DEFINITION_LINE_REGEX = /^\s*\[\^[^\]]+\]:/;
// \s, not a literal space: in the own-line case (a card ending in a code fence, or
// cardCommentOnSameLine: false) the token is preceded by a NEWLINE, not a space.
const CARD_COMMENT_REF_ENDOFLINE_REGEX = /\s\[\^(sr-[0-9a-f]+)\]$/;
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

/** True if the line is an indented continuation of a footnote definition. */
export function isFootnoteContinuationLine(line: string): boolean {
    return /^[ \t]+\S/.test(line);
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

/** Renders a complete footnote definition, with no trailing newline. */
export function formatCardCommentDefinition(
    label: string,
    entries: CardCommentEntry[],
): string {
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

    rawLines.forEach((rawLine, idx) => {
        // The first line carries the "[^label]: " prefix; strip it before matching
        const body = idx === 0 ? rawLine.replace(DEFINITION_LINE_REGEX, "").trimStart() : rawLine;
        const trimmed = body.trim();
        if (trimmed.length === 0) return;

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
            // An indented line that is not a bullet continues the entry above it
            entries[entries.length - 1].text += "\n" + unescapeLine(trimmed);
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
