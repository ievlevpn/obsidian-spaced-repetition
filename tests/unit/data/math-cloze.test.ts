import {
    containsMathCloze,
    expandMathClozes,
    stripMathClozes,
} from "src/data/data-structures/card/questions/math-cloze";
import { CardType } from "src/data/data-structures/card/questions/question";
import {
    CardFrontBack,
    CardFrontBackUtil,
} from "src/data/data-structures/card/questions/question-type";
import { DEFAULT_SETTINGS } from "src/data/settings";

// Goes through the public expand() path to also cover the QuestionTypeCloze wiring.
const expand = (text: string) => CardFrontBackUtil.expand(CardType.Cloze, text, DEFAULT_SETTINGS);

describe("containsMathCloze", () => {
    test.each([
        ["$\\cloze{a}{b}$", true],
        ["$\\cloze {a}{b}$", true],
        ["plain {{a}} text", false],
        ["$\\clozenot{a}{b}$", false], // command boundary: \clozenot is not \cloze
        ["no math here", false],
    ])("%s -> %s", (text, expected) => {
        expect(containsMathCloze(text)).toBe(expected);
    });
});

describe("expandMathClozes", () => {
    test("inline cloze with hint", () => {
        expect(expand("$f(x) = \\cloze{g(x)}{inner function}$")).toEqual([
            new CardFrontBack(
                "$f(x) = \\color{#2196f3}{[\\text{inner function}]}$",
                "$f(x) = \\color{#2196f3}{g(x)}$",
            ),
        ]);
    });

    test("empty hint falls back to ellipsis placeholder", () => {
        expect(expand("$$\\cloze{c^2}{} = a^2 + b^2$$")).toEqual([
            new CardFrontBack(
                "$$\\color{#2196f3}{[\\ldots]} = a^2 + b^2$$",
                "$$\\color{#2196f3}{c^2} = a^2 + b^2$$",
            ),
        ]);
    });

    test("multiple clozes become sibling cards; non-targets show their answer", () => {
        expect(expand("$$\\cloze{a^2}{} + \\cloze{b^2}{} = c^2$$")).toEqual([
            new CardFrontBack(
                "$$\\color{#2196f3}{[\\ldots]} + b^2 = c^2$$",
                "$$\\color{#2196f3}{a^2} + b^2 = c^2$$",
            ),
            new CardFrontBack(
                "$$a^2 + \\color{#2196f3}{[\\ldots]} = c^2$$",
                "$$a^2 + \\color{#2196f3}{b^2} = c^2$$",
            ),
        ]);
    });

    test("nested braces (e^{x^{2}})", () => {
        expect(expand("$$\\cloze{e^{x^{2}}}{} = 1$$")).toEqual([
            new CardFrontBack(
                "$$\\color{#2196f3}{[\\ldots]} = 1$$",
                "$$\\color{#2196f3}{e^{x^{2}}} = 1$$",
            ),
        ]);
    });

    test("sqrt as last \\frac argument (adjacent inner braces)", () => {
        expect(expand("$x = \\cloze{\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}}{}$")).toEqual([
            new CardFrontBack(
                "$x = \\color{#2196f3}{[\\ldots]}$",
                "$x = \\color{#2196f3}{\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}}$",
            ),
        ]);
    });

    test("escaped braces in the answer (set notation)", () => {
        expect(expand("$S = \\cloze{\\{x : x > 0\\}}{a set}$")).toEqual([
            new CardFrontBack(
                "$S = \\color{#2196f3}{[\\text{a set}]}$",
                "$S = \\color{#2196f3}{\\{x : x > 0\\}}$",
            ),
        ]);
    });

    test("a malformed \\cloze (missing second arg) is left alone", () => {
        // No second {...} -> not a valid cloze -> no cards produced.
        expect(expandMathClozes("$\\cloze{a}$")).toEqual([]);
    });

    test("\\clozeXYZ (command continues with letters) is not a cloze", () => {
        // \clozenot is a different macro; the letter boundary rejects it.
        expect(expandMathClozes("$\\clozenot{a}{b}$")).toEqual([]);
    });

    test("an unclosed brace group produces no card", () => {
        // Second arg opens but never closes -> readBraceGroup returns null.
        expect(expandMathClozes("$\\cloze{a}{b$")).toEqual([]);
    });
});

describe("stripMathClozes", () => {
    test.each([
        ["$x = \\cloze{a}{h}$", "$x = a$"],
        ["$\\cloze{a}{} + \\cloze{b}{}$", "$a + b$"],
        ["$\\cloze{\\frac{1}{2}}{half}$", "$\\frac{1}{2}$"],
        ["no macro here", "no macro here"],
        ["$\\cloze{a}$", "$\\cloze{a}$"], // malformed: left untouched
    ])("%s -> %s", (text, expected) => {
        expect(stripMathClozes(text)).toBe(expected);
    });
});

describe("a block mixing \\cloze with clozecraft deletions", () => {
    // Regression: the math path used to return early, so `==...==` / `{{...}}` deletions sharing a
    // block with a \cloze macro produced no cards at all.
    test("yields one card per deletion, from both syntaxes", () => {
        expect(expand("$E = \\cloze{mc^2}{}$ was published in ==1905==")).toHaveLength(2);
    });

    test("the math card shows the text deletion as its plain answer", () => {
        const [mathCard] = expand("$E = \\cloze{mc^2}{}$ was published in ==1905==");
        expect(mathCard.front).toBe("$E = \\color{#2196f3}{[\\ldots]}$ was published in 1905");
        expect(mathCard.back).toBe("$E = \\color{#2196f3}{mc^2}$ was published in 1905");
    });

    test("the text card shows the \\cloze as its plain answer", () => {
        const [, textCard] = expand("$E = \\cloze{mc^2}{}$ was published in ==1905==");
        expect(textCard.front).toBe(
            "$E = mc^2$ was published in <span style='color:#2196f3'>[...]</span>",
        );
        expect(textCard.back).toBe(
            "$E = mc^2$ was published in <span style='color:#2196f3'>1905</span>",
        );
    });

    test("several of each syntax in one block", () => {
        expect(expand("$\\cloze{a}{} + \\cloze{b}{}$ with ==c== and ==d==")).toHaveLength(4);
    });

    test("a block with only clozecraft deletions is untouched by the math path", () => {
        expect(expand("published in ==1905== by ==Einstein==")).toHaveLength(2);
    });
});
