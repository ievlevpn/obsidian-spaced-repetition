// Context lines shown (greyed, display-only) above an inline cloze card that sits in a list:
// the item's parent items and the lead-in line just above the list. For
//
//     Faux amis:
//     + {{actuellement}} = currently
//
// the card for the second line gets the context ["Faux amis:"].

import { separated } from "src/data/data-structures/card/questions/math-cloze";

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s/;

const indentOf = (line: string): number => line.match(/^\s*/)[0].replace(/\t/g, "    ").length;

/**
 * Collect the list context of the line `lineNum`.
 *
 * Walking upwards: every list item less indented than the current one is a parent; the first
 * non-list line that is not a deeper continuation is the lead-in, and ends the walk. A blank
 * line, a heading or a `---` line also ends it (headings are already in the breadcrumb).
 *
 * @param lines - The note's lines
 * @param lineNum - The (0-based) line of the inline card
 * @returns Context lines, outermost first, cleaned for display; empty if the line is not in a list
 */
export function getListContext(lines: string[], lineNum: number): string[] {
    const own: RegExpMatchArray | null = lines[lineNum]?.match(LIST_ITEM);
    if (!own) return [];

    const context: string[] = [];
    let indent: number = indentOf(lines[lineNum]);
    for (let k = lineNum - 1; k >= 0; k--) {
        const line: string = lines[k];
        const trimmed: string = line.trim();
        if (trimmed.length === 0 || /^#{1,6}\s/.test(trimmed) || trimmed === "---") break;

        const lineIndent: number = indentOf(line);
        if (LIST_ITEM.test(line)) {
            if (lineIndent < indent) {
                context.unshift(cleanContextLine(line));
                indent = lineIndent;
            }
        } else if (lineIndent <= indent && !isContinuation(lines, k)) {
            context.unshift(cleanContextLine(line));
            break;
        }
    }
    return context.filter((line) => line.length > 0);
}

// Whether the non-list line `k` continues a list item above it: the nearest list item in the same
// run of non-blank lines is less indented.
function isContinuation(lines: string[], k: number): boolean {
    const lineIndent: number = indentOf(lines[k]);
    for (let j = k - 1; j >= 0 && lines[j].trim().length > 0; j--) {
        if (LIST_ITEM.test(lines[j])) return indentOf(lines[j]) < lineIndent;
    }
    return false;
}

/**
 * Prepare a context line for display: drop scheduling comments and card-comment references, and
 * show clozes as their plain answers.
 *
 * @param line - A note line
 * @returns The cleaned, trimmed line
 */
export function cleanContextLine(line: string): string {
    return line
        .replace(/<!--SR:.*?-->/g, "")
        .replace(/\[\^sr-[0-9a-f]{6}\]/g, "")
        .replace(/\{\{(?:\d+;;)?(.*?)(?:;;[^}]*)?\}\}/g, "$1")
        .replace(
            /\\cloze\s*\{([^{}]*)\}\s*\{[^{}]*\}/g,
            (match: string, answer: string, offset: number, whole: string) =>
                separated(whole.slice(0, offset), answer, whole.slice(offset + match.length)),
        )
        .trim();
}
