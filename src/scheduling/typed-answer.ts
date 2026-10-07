// Typing the answer during review: which answers can be typed, and a letter-by-letter comparison
// of what was typed with the expected answer. Ported from Flashcard Studio
// (github.com/Almalkiid/flashcard-studio, MIT), without its multiple choice cards.

export const MAX_TYPED_ANSWER_LENGTH = 120;

// A list item, a quote or callout, a table row, or an HTML tag or comment: not plain text
const LIST_START = /^([-*+]|\d+[.)])\s/;
const HTML_TAG = /<\/?[a-z][^>]*>|<!--/i;

/**
 * The plain text to type for a card's answer, or null when the answer is not short plain text.
 */
export function typedAnswerTarget(back: string): string | null {
    const lines = back.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length !== 1) return null;
    const line = lines[0].trim();
    if (
        line.includes("![") ||
        line.includes("`") ||
        line.includes("$") ||
        HTML_TAG.test(line) ||
        line.startsWith("|") ||
        line.startsWith(">") ||
        LIST_START.test(line)
    ) {
        return null;
    }

    const plain = line
        .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
        .replace(/\[\[([^\]]*)\]\]/g, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\*\*|__|~~|==/g, "")
        // A single marker is only emphasis around text: the underscore in user_id stays
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, "$1$2")
        .trim();
    if (plain === "" || plain.length > MAX_TYPED_ANSWER_LENGTH) return null;
    return plain;
}

// The trailing characters an answer may leave out or add: spaces and . , ; : ! ?
const TRAILING = /^[\s.,;:!?]$/;

interface NormalizedText {
    /** The display text as characters (composed accents). */
    display: string[];
    /** The normalized characters, and for each the index of the display character it came from. */
    chars: string[];
    source: number[];
}

/**
 * Folds an answer for comparison and remembers where each folded character came from, so a comparison can be
 * shown on the text as written.
 */
function normalizeWithSource(text: string, ignoreAccents: boolean): NormalizedText {
    const display = Array.from(text.normalize("NFC"));
    let end = display.length;
    while (end > 0 && TRAILING.test(display[end - 1])) end--;

    const chars: string[] = [];
    const source: number[] = [];
    for (let i = 0; i < end; i++) {
        const ch = display[i];
        if (/\s/.test(ch)) {
            // Leading spaces and repeated spaces do not count
            if (chars.length > 0 && chars[chars.length - 1] !== " ") {
                chars.push(" ");
                source.push(i);
            }
            continue;
        }
        let folded = ch.toLowerCase();
        if (ignoreAccents) folded = folded.normalize("NFD").replace(/\p{M}/gu, "");
        for (const c of Array.from(folded)) {
            chars.push(c);
            source.push(i);
        }
    }
    return { display, chars, source };
}

/**
 * Lowercase, trimmed, single spaces, no trailing `.,;:!?`; with `ignoreAccents` also without accents.
 */
export function normalizeAnswer(text: string, ignoreAccents: boolean): string {
    return normalizeWithSource(text, ignoreAccents).chars.join("");
}

export interface DiffPart {
    kind: "ok" | "wrong" | "missing";
    text: string;
}

export interface TypedComparison {
    exact: boolean;
    typed: DiffPart[];
    expected: DiffPart[];
}

/**
 * Which characters of `a` and of `b` are in their longest common subsequence.
 */
function commonCharacters(a: string[], b: string[]): { inA: boolean[]; inB: boolean[] } {
    // lcs[i][j]: length of the longest common subsequence of a[i..] and b[j..]
    const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
        new Array<number>(b.length + 1).fill(0),
    );
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i][j] =
                a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }
    // Walk forwards, so that among equally long matches the earliest one wins: "print" against
    // "prints; imprints" matches the first word, not the "print" inside "imprints"
    const inA = new Array<boolean>(a.length).fill(false);
    const inB = new Array<boolean>(b.length).fill(false);
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            inA[i] = true;
            inB[j] = true;
            i++;
            j++;
        } else if (lcs[i][j + 1] >= lcs[i + 1][j]) {
            j++;
        } else {
            i++;
        }
    }
    return { inA, inB };
}

/**
 * The text as written, cut into runs of the same kind. A display character that folding dropped (a trailing full
 * stop, an extra space) does not count against the answer; one that folded into several characters is only right if
 * all of them matched.
 */
function diffParts(side: NormalizedText, matched: boolean[], missingKind: DiffPart["kind"]) {
    const wrong = new Set<number>();
    matched.forEach((isMatched, index) => {
        if (!isMatched) wrong.add(side.source[index]);
    });
    const parts: DiffPart[] = [];
    side.display.forEach((ch, index) => {
        const kind = wrong.has(index) ? missingKind : "ok";
        const last = parts[parts.length - 1];
        if (last !== undefined && last.kind === kind) last.text += ch;
        else parts.push({ kind, text: ch });
    });
    return parts;
}

/**
 * Compares what was typed with the expected answer letter by letter, on the text as written. `exact` is true when
 * both fold to the same text.
 */
export function compareTypedAnswer(
    typed: string,
    expected: string,
    ignoreAccents: boolean,
): TypedComparison {
    const typedText = normalizeWithSource(typed, ignoreAccents);
    const expectedText = normalizeWithSource(expected, ignoreAccents);
    const { inA, inB } = commonCharacters(typedText.chars, expectedText.chars);
    return {
        exact: typedText.chars.join("") === expectedText.chars.join(""),
        typed: typedText.chars.length === 0 ? [] : diffParts(typedText, inA, "wrong"),
        expected: diffParts(expectedText, inB, "missing"),
    };
}
