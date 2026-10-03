import { isFootnoteContinuationLine, isFootnoteDefinitionLine } from "src/utils/card-comment";

// At most 3 leading spaces, markdown's limit for a footnote definition. Unbounded whitespace
// would match our own indented entry (4 spaces) and continuation (6 spaces) lines, and any
// "[^x]:" a user typed as a later line of a comment, mis-slicing a definition.
const LABEL_REGEX = /^ {0,3}\[\^([^\]]+)\]:/;
const CARD_COMMENT_LABEL_REGEX = /^sr-[0-9a-f]{6}$/;

/**
 * Index range [start, endExclusive) of the definition's lines, or null.
 *
 * The range runs to the first non-continuation line, i.e. the first blank or unindented line.
 * That means content a user glued directly beneath an entry is INSIDE the range and will be
 * re-emitted at a uniform indent - see the limitation on isFootnoteContinuationLine in
 * src/utils/card-comment.ts. Takes the FIRST definition matching `label`, where
 * collectCardCommentDefinitions takes the last; with two definitions sharing one label (only
 * reachable by hand-edit, since generation is collision-checked) the consequence is content
 * DUPLICATION, not loss: the first is overwritten with the last's content plus the new entry,
 * and the last survives.
 */
function findDefinitionRange(lines: string[], label: string): [number, number] | null {
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(LABEL_REGEX);
        if (!match || match[1] !== label) continue;

        let end = i + 1;
        while (end < lines.length && isFootnoteContinuationLine(lines[end])) end++;
        return [i, end];
    }
    return null;
}

/** Returns the full definition text for `label`, continuations included, or null. */
export function findFootnoteDefinition(noteText: string, label: string): string | null {
    const lines = noteText.replaceAll("\r\n", "\n").split("\n");
    const range = findDefinitionRange(lines, label);
    if (!range) return null;
    return lines.slice(range[0], range[1]).join("\n");
}

/**
 * Replaces `label`'s definition in place, or appends it at the end of the note.
 * Everything else in the note is preserved byte for byte.
 */
export function upsertFootnoteDefinition(
    noteText: string,
    label: string,
    definition: string,
): string {
    // Preserve the note's own line endings: this function rewrites the whole note text, and
    // silently converting a CRLF note to LF would show every line as changed.
    const usedCrlf: boolean = noteText.includes("\r\n");
    const normalised = noteText.replaceAll("\r\n", "\n");
    const lines = normalised.split("\n");
    const range = findDefinitionRange(lines, label);

    let result: string;
    if (range) {
        result = [
            ...lines.slice(0, range[0]),
            ...definition.split("\n"),
            ...lines.slice(range[1]),
        ].join("\n");
    } else {
        let base = normalised.replace(/\n+$/, "");
        if (base.length > 0) base += "\n\n";
        result = base + definition + "\n";
    }

    return usedCrlf ? result.replaceAll("\n", "\r\n") : result;
}

/** Every label in the note that belongs to this plugin. */
export function collectCardCommentLabels(noteText: string): Set<string> {
    const labels = new Set<string>();
    for (const line of noteText.replaceAll("\r\n", "\n").split("\n")) {
        if (!isFootnoteDefinitionLine(line)) continue;
        const match = line.match(LABEL_REGEX);
        if (match && CARD_COMMENT_LABEL_REGEX.test(match[1])) labels.add(match[1]);
    }
    return labels;
}

/** Maps each of this plugin's labels to its full definition text. */
export function collectCardCommentDefinitions(noteText: string): Map<string, string> {
    const map = new Map<string, string>();
    const lines = noteText.replaceAll("\r\n", "\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(LABEL_REGEX);
        if (!match || !CARD_COMMENT_LABEL_REGEX.test(match[1])) continue;

        let end = i + 1;
        while (end < lines.length && isFootnoteContinuationLine(lines[end])) end++;
        map.set(match[1], lines.slice(i, end).join("\n"));
        i = end - 1;
    }
    return map;
}
