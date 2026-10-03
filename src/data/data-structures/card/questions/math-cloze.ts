// The `\cloze{answer}{hint}` LaTeX macro. Unlike `{{...}}`, this token never occurs in ordinary
// LaTeX, so there are no false positives, and a global MathJax macro (registered in
// cloze-math-macro.ts) renders it as the answer in normal preview. Here we parse it for flashcard
// review: each `\cloze` becomes one sibling card whose answer is occluded on the front and
// revealed (highlighted) on the back. Other clozes in the same note show their answer plainly.
//
// The macro only counts inside math (`$...$` / `$$...$$`): outside math it is plain text, for
// example in a note documenting the syntax.
//
// Returns bare { front, back } pairs (not CardFrontBack) so this stays a leaf module with no
// dependency back on question-type.

import { findMathSpans, isInsideMath, splitMath } from "src/utils/math-spans";

const CLOZE_COLOR = "#2196f3";

interface MathCloze {
    start: number; // index of the leading backslash
    end: number; // index just past the closing brace of the hint arg
    answer: string;
    hint: string;
}

/**
 * Whether `text` contains at least one `\cloze{...}{...}` macro inside math.
 *
 * @param text - The text to test (a whole card; math spans are located within it)
 * @returns True if a `\cloze{` macro is present inside `$...$` or `$$...$$`
 */
export function containsMathCloze(text: string): boolean {
    return /\\cloze\s*\{/.test(splitMath(text).mathOnly);
}

/**
 * Expand the `\cloze{answer}{hint}` macros in `text` into one flashcard per cloze.
 *
 * @param text - The card text, typically containing `$...$` / `$$...$$` math
 * @returns One `{ front, back }` per cloze; on each card the target cloze is occluded on the
 *     front and revealed (highlighted) on the back, while the other clozes show their answer
 */
/**
 * Replace every `\cloze{answer}{hint}` with its bare `answer`.
 *
 * Used when expanding the *other* cloze syntax in the same block: a `{{...}}` card should show
 * the math clozes as ordinary formula text rather than as `\cloze` markup.
 *
 * @param text - The card text
 * @returns `text` with every `\cloze` macro collapsed to its answer
 */
export function stripMathClozes(text: string): string {
    const clozes = findMathClozes(text);
    if (clozes.length === 0) return text;
    let out = "";
    let prev = 0;
    for (const cloze of clozes) {
        out += text.slice(prev, cloze.start) + cloze.answer;
        prev = cloze.end;
    }
    return out + text.slice(prev);
}

export function expandMathClozes(text: string): { front: string; back: string }[] {
    const clozes = findMathClozes(text);
    const cards: { front: string; back: string }[] = [];
    for (let target = 0; target < clozes.length; target++) {
        cards.push({
            front: renderCard(text, clozes, target, false),
            back: renderCard(text, clozes, target, true),
        });
    }
    return cards;
}

// Rebuild the card text, replacing each `\cloze{...}{...}` with its front/back rendering.
function renderCard(
    text: string,
    clozes: MathCloze[],
    targetIndex: number,
    isBack: boolean,
): string {
    let out = "";
    let cursor = 0;
    for (let k = 0; k < clozes.length; k++) {
        const cloze = clozes[k];
        out += text.slice(cursor, cloze.start);
        out += renderCloze(cloze, k === targetIndex, isBack);
        cursor = cloze.end;
    }
    return out + text.slice(cursor);
}

function renderCloze(cloze: MathCloze, isTarget: boolean, isBack: boolean): string {
    if (!isTarget) return cloze.answer; // shown normally on every card
    if (isBack) return `\\color{${CLOZE_COLOR}}{${cloze.answer}}`; // revealed answer
    const placeholder = cloze.hint.trim().length ? `[\\text{${cloze.hint.trim()}}]` : "[\\ldots]";
    return `\\color{${CLOZE_COLOR}}{${placeholder}}`;
}

// Locate every `\cloze{answer}{hint}` inside math, reading both arguments as balanced-brace groups.
function findMathClozes(text: string): MathCloze[] {
    const result: MathCloze[] = [];
    const spans = findMathSpans(text);
    const cmd = "\\cloze";
    let i = text.indexOf(cmd);
    while (i !== -1) {
        const after = i + cmd.length;
        // Outside math the macro is plain text.
        if (!isInsideMath(spans, i)) {
            i = text.indexOf(cmd, after);
            continue;
        }
        // Reject `\clozeXYZ` (a TeX command name continues with letters).
        if (/[a-zA-Z]/.test(text[after] ?? "")) {
            i = text.indexOf(cmd, after);
            continue;
        }
        const answer = readBraceGroup(text, after);
        const hint = answer && readBraceGroup(text, answer.end);
        if (answer && hint) {
            result.push({ start: i, end: hint.end, answer: answer.content, hint: hint.content });
            i = text.indexOf(cmd, hint.end);
        } else {
            i = text.indexOf(cmd, after);
        }
    }
    return result;
}

// From `pos` (skipping whitespace), read a `{ ... }` group with balanced braces, ignoring escaped
// braces (\{ \}). Returns the inner content and the index past the closing brace, or null.
function readBraceGroup(text: string, pos: number): { content: string; end: number } | null {
    let p = pos;
    while (p < text.length && /\s/.test(text[p])) p++;
    if (text[p] !== "{") return null;

    let depth = 0;
    for (let j = p; j < text.length; j++) {
        const ch = text[j];
        if (ch === "\\") {
            j++; // skip the escaped character (\{ \} \\)
            continue;
        }
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return { content: text.slice(p + 1, j), end: j + 1 };
        }
    }
    return null;
}
