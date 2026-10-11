// Typing the answer during review: which answers can be typed, and a letter-by-letter comparison
// of what was typed with the expected answer. Ported from Flashcard Studio
// (github.com/Almalkiid/flashcard-studio, MIT), without its multiple choice cards.

export const MAX_TYPED_ANSWER_LENGTH = 120;

// Below this similarity, marking letters says nothing useful (a different phrasing, not a
// misspelling): what was typed is shown as it is, next to the answer
export const CLOSE_ENOUGH = 0.6;

/**
 * Whether a comparison is worth marking letter by letter: close enough overall, or a part of
 * the answer typed right word for word ("крона" for "крона дерева").
 */
export function worthMarking(comparison: TypedComparison): boolean {
    return (
        comparison.exact ||
        comparison.similarity >= CLOSE_ENOUGH ||
        comparison.typedWordsInAnswer === true
    );
}

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
    // "other": the rest of an answer with alternatives, beside the one that was matched
    kind: "ok" | "wrong" | "missing" | "other";
    text: string;
}

export interface TypedComparison {
    exact: boolean;
    // Matched letters over the longer of the two (0..1): how close the answer came
    similarity: number;
    // Every typed word is a word of the answer, or a typo of one: a part of it, typed right
    typedWordsInAnswer?: boolean;
    // Not exact, but only by typos: every word of each side paired with one of the other within
    // its typo allowance. Counts as right.
    typosOnly?: boolean;
    // Matched against one of the answer's alternatives ("gloomy" in "gloomy, sullen")
    alternative?: boolean;
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

// What separates the alternatives of an answer ("gloomy, sullen; угрюмый / мрачный")
const ALTERNATIVE = /[^,;/]+/g;

/** The alternatives of an answer, trimmed, with where each starts in it. */
export function answerAlternatives(text: string): { text: string; start: number }[] {
    const result: { text: string; start: number }[] = [];
    for (const match of text.matchAll(ALTERNATIVE)) {
        const trimmed = match[0].trim();
        if (trimmed === "") continue;
        result.push({ text: trimmed, start: (match.index ?? 0) + match[0].indexOf(trimmed) });
    }
    return result;
}

/**
 * Compares what was typed with the expected answer letter by letter, on the text as written. `exact` is true when
 * both fold to the same text.
 *
 * An answer listing alternatives ("gloomy, sullen, тоскливый") also accepts any one of them, or
 * several typed the same way, each matching one. An answer close to a single alternative is
 * marked against that one. The expected parts then cover the whole answer: the matched
 * alternatives marked, the rest as "other".
 */
export function compareTypedAnswer(
    typed: string,
    expected: string,
    ignoreAccents: boolean,
): TypedComparison {
    const whole = compareWhole(typed, expected, ignoreAccents);
    const alternatives = answerAlternatives(expected);
    if (whole.exact || alternatives.length < 2) return whole;

    const typedItems = answerAlternatives(typed);
    if (typedItems.length === 0) return whole;
    const best = typedItems.map((item) => {
        const comparisons = alternatives.map((alt) =>
            compareWhole(item.text, alt.text, ignoreAccents),
        );
        let index = 0;
        comparisons.forEach((c, i) => {
            if (c.similarity > comparisons[index].similarity) index = i;
        });
        return { index, comparison: comparisons[index] };
    });

    // Each typed item is one of the alternatives (allowing typos)
    if (best.every((b) => b.comparison.exact || b.comparison.typosOnly)) {
        const anyTypo: boolean = best.some((b) => !b.comparison.exact);
        const matched = new Map<number, DiffPart[]>(
            best.map((b) => [
                b.index,
                b.comparison.exact
                    ? [{ kind: "ok", text: alternatives[b.index].text }]
                    : b.comparison.expected,
            ]),
        );
        return {
            exact: !anyTypo,
            typosOnly: anyTypo,
            similarity: 1,
            typedWordsInAnswer: true,
            alternative: true,
            typed: stitchItems(
                typed,
                typedItems,
                best.map((b, i) =>
                    b.comparison.exact
                        ? [{ kind: "ok", text: typedItems[i].text }]
                        : b.comparison.typed,
                ),
            ),
            expected: withOtherParts(expected, alternatives, matched),
        };
    }

    // One item, closer to an alternative than to the whole answer: marked against that one
    if (typedItems.length === 1 && best[0].comparison.similarity > whole.similarity) {
        const { index, comparison } = best[0];
        return {
            exact: false,
            similarity: comparison.similarity,
            typedWordsInAnswer: comparison.typedWordsInAnswer,
            alternative: true,
            typed: comparison.typed,
            expected: withOtherParts(
                expected,
                alternatives,
                new Map([[index, comparison.expected]]),
            ),
        };
    }
    return whole;
}

// The typed text as parts: each item with its own parts, the separators between them "ok"
function stitchItems(
    typed: string,
    items: { text: string; start: number }[],
    itemParts: DiffPart[][],
): DiffPart[] {
    const parts: DiffPart[] = [];
    let at = 0;
    items.forEach((item, i) => {
        if (item.start > at) parts.push({ kind: "ok", text: typed.slice(at, item.start) });
        parts.push(...itemParts[i]);
        at = item.start + item.text.length;
    });
    return mergeParts(parts);
}

// Joins neighbouring parts of the same kind
function mergeParts(parts: DiffPart[]): DiffPart[] {
    const merged: DiffPart[] = [];
    for (const part of parts) {
        const last = merged[merged.length - 1];
        if (last !== undefined && last.kind === part.kind) last.text += part.text;
        else merged.push({ ...part });
    }
    return merged;
}

// The whole answer as parts: the given alternatives with their own parts, everything else "other"
function withOtherParts(
    expected: string,
    alternatives: { text: string; start: number }[],
    matched: Map<number, DiffPart[]>,
): DiffPart[] {
    const parts: DiffPart[] = [];
    let at = 0;
    const other = (end: number) => {
        if (end > at) parts.push({ kind: "other", text: expected.slice(at, end) });
    };
    alternatives.forEach((alt, i) => {
        const own = matched.get(i);
        if (own === undefined) return;
        other(alt.start);
        parts.push(...own);
        at = alt.start + alt.text.length;
    });
    other(expected.length);
    return parts;
}

/**
 * How many typos a word of `length` letters may have and still count: none for up to 3 letters,
 * 1 for up to 7, 2 for longer words.
 */
export function typoAllowance(length: number): number {
    return length <= 3 ? 0 : length <= 7 ? 1 : 2;
}

/**
 * Edit distance counting an inserted, deleted or replaced letter, or two neighbouring letters
 * swapped, as one edit each (optimal string alignment).
 */
export function editDistance(a: string[], b: string[]): number {
    const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        }
    }
    return d[a.length][b.length];
}

interface Word {
    // Indices of its characters in the normalized text
    idx: number[];
    // Its letters and digits, for comparing words
    key: string[];
}

function splitWords(text: NormalizedText): Word[] {
    const words: Word[] = [];
    let idx: number[] = [];
    const flush = () => {
        if (idx.length === 0) return;
        const key = idx.map((i) => text.chars[i]).filter((c) => /[\p{L}\p{N}]/u.test(c));
        words.push({ idx, key: key.length > 0 ? key : idx.map((i) => text.chars[i]) });
        idx = [];
    };
    text.chars.forEach((c, i) => {
        if (c === " ") flush();
        else idx.push(i);
    });
    flush();
    return words;
}

// How well two words match: 2 when the same, 1 within the answer word's typo allowance, else 0
function wordMatch(typed: Word, expected: Word): number {
    const distance = editDistance(typed.key, expected.key);
    if (distance === 0) return 2;
    return distance <= typoAllowance(expected.key.length) ? 1 : 0;
}

/**
 * Pairs typed words with answer words in order, as many and as well matched as possible (a
 * weighted longest common subsequence of words).
 */
function alignWords(a: Word[], b: Word[]): [number, number][] {
    const score: number[][] = Array.from({ length: a.length }, (_, i) =>
        b.map((_w, j) => wordMatch(a[i], b[j])),
    );
    const best: number[][] = Array.from({ length: a.length + 1 }, () =>
        new Array<number>(b.length + 1).fill(0),
    );
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            best[i][j] = Math.max(
                best[i + 1][j],
                best[i][j + 1],
                score[i][j] > 0 ? score[i][j] + best[i + 1][j + 1] : 0,
            );
        }
    }
    const pairs: [number, number][] = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (score[i][j] > 0 && best[i][j] === score[i][j] + best[i + 1][j + 1]) {
            pairs.push([i, j]);
            i++;
            j++;
        } else if (best[i][j] === best[i][j + 1]) {
            j++;
        } else {
            i++;
        }
    }
    return pairs;
}

/**
 * Marks word by word: letters are matched only within a typed word and the answer word it is
 * paired with; an unpaired word is wrong (typed) or missing (answer) as a whole, with the space
 * before it.
 */
function markByWords(
    typedText: NormalizedText,
    expectedText: NormalizedText,
): { inA: boolean[]; inB: boolean[]; pairs: number; typedWords: number; answerWords: number } {
    const a = splitWords(typedText);
    const b = splitWords(expectedText);
    const pairs = alignWords(a, b);
    const inA = new Array<boolean>(typedText.chars.length).fill(false);
    const inB = new Array<boolean>(expectedText.chars.length).fill(false);
    const pairedA = new Set<number>();
    const pairedB = new Set<number>();
    for (const [i, j] of pairs) {
        pairedA.add(i);
        pairedB.add(j);
        const common = commonCharacters(
            a[i].idx.map((k) => typedText.chars[k]),
            b[j].idx.map((k) => expectedText.chars[k]),
        );
        a[i].idx.forEach((k, n) => (inA[k] = common.inA[n]));
        b[j].idx.forEach((k, n) => (inB[k] = common.inB[n]));
    }
    // The space before a word goes with it
    const spaces = (words: Word[], paired: Set<number>, marks: boolean[]) =>
        words.forEach((w, n) => {
            if (n > 0 && paired.has(n)) marks[w.idx[0] - 1] = true;
        });
    spaces(a, pairedA, inA);
    spaces(b, pairedB, inB);
    return { inA, inB, pairs: pairs.length, typedWords: a.length, answerWords: b.length };
}

function compareWhole(typed: string, expected: string, ignoreAccents: boolean): TypedComparison {
    const typedText = normalizeWithSource(typed, ignoreAccents);
    const expectedText = normalizeWithSource(expected, ignoreAccents);
    const exact: boolean = typedText.chars.join("") === expectedText.chars.join("");
    const letters = commonCharacters(typedText.chars, expectedText.chars);
    const lettersMatched: number = letters.inA.filter(Boolean).length;
    const longer: number = Math.max(typedText.chars.length, expectedText.chars.length);

    // Word by word, unless that loses much of what a plain letter match finds (words run
    // together or split differently: "adjacencymatrix")
    const words = markByWords(typedText, expectedText);
    const allTypedPaired: boolean = words.typedWords > 0 && words.pairs === words.typedWords;
    const useWords: boolean =
        allTypedPaired || words.inA.filter(Boolean).length >= 0.8 * lettersMatched;
    const { inA, inB } = useWords ? words : letters;
    return {
        exact,
        similarity: longer === 0 ? 1 : lettersMatched / longer,
        typedWordsInAnswer: allTypedPaired,
        typosOnly: !exact && allTypedPaired && words.pairs === words.answerWords,
        typed: typedText.chars.length === 0 ? [] : diffParts(typedText, inA, "wrong"),
        expected: diffParts(expectedText, inB, "missing"),
    };
}
