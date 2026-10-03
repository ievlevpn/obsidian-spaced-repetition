import { findMathSpans, isInsideMath, splitMath } from "src/utils/math-spans";

const mathOf = (text: string) => findMathSpans(text).map((s) => text.slice(s.start, s.end));

describe("findMathSpans", () => {
    test("inline math", () => {
        expect(mathOf("a $x^2$ b $y$ c")).toEqual(["$x^2$", "$y$"]);
    });

    test("display math on one line and across lines", () => {
        expect(mathOf("a $$x$$ b")).toEqual(["$$x$$"]);
        expect(mathOf("before\n$$\n\\frac{a}{b}\n$$\nafter")).toEqual(["$$\n\\frac{a}{b}\n$$"]);
    });

    test("dollar amounts are not math", () => {
        expect(mathOf("costs $5 and $10")).toEqual([]);
        expect(mathOf("between $ 5 $ and")).toEqual([]);
    });

    test("escaped dollars are not delimiters", () => {
        expect(mathOf("price \\$5, then $x$")).toEqual(["$x$"]);
        expect(mathOf("$a \\$ b$")).toEqual(["$a \\$ b$"]);
    });

    test("inline code is not math", () => {
        expect(mathOf("use `$x$` literally, but $y$")).toEqual(["$y$"]);
        expect(mathOf("``a ` $x$ ``")).toEqual([]);
    });

    test("fenced code blocks are not math", () => {
        expect(mathOf("```\n$x$\n$$\ny\n$$\n```\n$z$")).toEqual(["$z$"]);
        expect(mathOf("~~~\n$x$\n~~~\n$z$")).toEqual(["$z$"]);
    });

    test("an unclosed $$ is not math", () => {
        expect(mathOf("$$ never closed\n{{x}}")).toEqual([]);
    });

    test("braces inside math are part of the span", () => {
        expect(mathOf("$\\frac{{a}}{b}$ and {{cloze}}")).toEqual(["$\\frac{{a}}{b}$"]);
    });
});

describe("splitMath", () => {
    test("keeps length and newlines, blanks the other part", () => {
        const text = "a {{x}} $\\cloze{y}{}$\n$$\n{{z}}\n$$";
        const { textOnly, mathOnly } = splitMath(text);
        expect(textOnly.length).toBe(text.length);
        expect(mathOnly.length).toBe(text.length);
        expect(textOnly.split("\n")).toEqual(["a {{x}}              ", "  ", "     ", "  "]);
        expect(mathOnly).toContain("\\cloze{y}{}");
        expect(mathOnly).toContain("{{z}}");
        expect(textOnly).not.toContain("{{z}}");
    });
});

describe("isInsideMath", () => {
    test("positions inside and outside a span", () => {
        const text = "a $x$ b";
        const spans = findMathSpans(text);
        expect(isInsideMath(spans, text.indexOf("x"))).toBe(true);
        expect(isInsideMath(spans, text.indexOf("b"))).toBe(false);
    });
});
