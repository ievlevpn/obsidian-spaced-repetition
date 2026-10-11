import {
    CLOSE_ENOUGH,
    compareTypedAnswer,
    normalizeAnswer,
    typedAnswerTarget,
    worthMarking,
} from "src/scheduling/typed-answer";

describe("typedAnswerTarget", () => {
    test("short plain answers can be typed, formatting is stripped", () => {
        expect(typedAnswerTarget("**Chief Audit Executive**")).toBe("Chief Audit Executive");
        expect(typedAnswerTarget("[[Paris|the capital]]")).toBe("the capital");
    });
    test.each([
        ["a list", "- A\n- B"],
        ["two lines", "A\nB"],
        ["an image", "![[x.png]]"],
        ["code", "`x`"],
        ["math", "$x^2$"],
        ["a long answer", "a".repeat(121)],
        ["a checklist", "- [x] A\n- [ ] B"],
        ["empty", "  "],
    ])("%s is not typed", (_n, back) => expect(typedAnswerTarget(back)).toBeNull());
});

describe("normalizeAnswer", () => {
    test("case, spaces and trailing punctuation do not count", () => {
        expect(normalizeAnswer("  The   Board. ", false)).toBe("the board");
    });
    test("accents count unless ignored", () => {
        expect(normalizeAnswer("Café", false)).toBe("café");
        expect(normalizeAnswer("Café", true)).toBe("cafe");
    });
});

describe("compareTypedAnswer", () => {
    test("an exact answer", () => {
        const r = compareTypedAnswer("the board", "The Board", false);
        expect(r.exact).toBe(true);
        expect(r.typed.every((p) => p.kind === "ok")).toBe(true);
    });
    test("a typo marks the wrong and the missing letters", () => {
        const r = compareTypedAnswer("bord", "board", false);
        expect(r.exact).toBe(false);
        expect(r.expected).toEqual([
            { kind: "ok", text: "bo" },
            { kind: "missing", text: "a" },
            { kind: "ok", text: "rd" },
        ]);
    });
    test("an empty answer is all missing", () => {
        const r = compareTypedAnswer("", "board", false);
        expect(r.exact).toBe(false);
        expect(r.expected).toEqual([{ kind: "missing", text: "board" }]);
        expect(r.typed).toEqual([]);
    });
    test("extra letters are wrong", () => {
        expect(compareTypedAnswer("boards", "board", false).typed).toEqual([
            { kind: "ok", text: "board" },
            { kind: "wrong", text: "s" },
        ]);
    });
});

describe("typedAnswerTarget: formatting and what is not plain text", () => {
    test("emphasis, highlights, links and plain links lose their markup", () => {
        expect(typedAnswerTarget("==key== and *this* and _that_")).toBe("key and this and that");
        expect(typedAnswerTarget("~~old~~ __new__")).toBe("old new");
        expect(typedAnswerTarget("[[Note]] and [a page](https://example.com/x_y)")).toBe(
            "Note and a page",
        );
    });
    test("an underscore inside a word is part of the answer", () => {
        expect(typedAnswerTarget("user_id")).toBe("user_id");
        expect(typedAnswerTarget("the __init__ method")).toBe("the init method");
    });
    test("the answer is trimmed, and blank lines around it do not make it two lines", () => {
        expect(typedAnswerTarget("\n  Paris \n\n")).toBe("Paris");
    });
    test("a limit of 120 characters is inclusive", () => {
        expect(typedAnswerTarget("a".repeat(120))).toBe("a".repeat(120));
    });
    test.each([
        ["a numbered list", "1. one"],
        ["a bullet", "* one"],
        ["a callout", "> [!note] Title"],
        ["a quote", "> quoted"],
        ["a table row", "| a | b |"],
        ["an HTML tag", "a<br>b"],
        ["an HTML comment", "a <!-- x -->"],
        ["an embed link", "![alt](x.png)"],
        ["only markup", "****"],
    ])("%s is not typed", (_n, back) => expect(typedAnswerTarget(back)).toBeNull());
    test("a less-than sign is not a tag, and a leading dash without a space is not a list", () => {
        expect(typedAnswerTarget("x < y")).toBe("x < y");
        expect(typedAnswerTarget("-5 degrees")).toBe("-5 degrees");
    });
});

describe("normalizeAnswer: more", () => {
    test("several trailing marks and spaces go, inner ones stay", () => {
        expect(normalizeAnswer("Yes, really?!  ", false)).toBe("yes, really");
        expect(normalizeAnswer("...", false)).toBe("");
    });
    test("decomposed and composed accents are the same letter", () => {
        expect(normalizeAnswer("Café", false)).toBe("café");
        expect(normalizeAnswer("Café", true)).toBe("cafe");
    });
    test("non-Latin text lowercases and keeps its letters", () => {
        expect(normalizeAnswer("ПАРИЖ.", false)).toBe("париж");
        expect(normalizeAnswer("مرحبا!", false)).toBe("مرحبا");
    });
});

describe("compareTypedAnswer: more", () => {
    test("case, spacing and a trailing full stop still count as exact, and show as right", () => {
        const r = compareTypedAnswer("  the   BOARD.", "The board", false);
        expect(r.exact).toBe(true);
        expect(r.typed).toEqual([{ kind: "ok", text: "  the   BOARD." }]);
        expect(r.expected).toEqual([{ kind: "ok", text: "The board" }]);
    });
    test("accents count unless ignored", () => {
        expect(compareTypedAnswer("cafe", "Café", false).exact).toBe(false);
        expect(compareTypedAnswer("cafe", "Café", true).exact).toBe(true);
    });
    test("a wrong letter is wrong in what was typed and missing in the expected text", () => {
        const r = compareTypedAnswer("cat", "cot", false);
        expect(r.typed).toEqual([
            { kind: "ok", text: "c" },
            { kind: "wrong", text: "a" },
            { kind: "ok", text: "t" },
        ]);
        expect(r.expected).toEqual([
            { kind: "ok", text: "c" },
            { kind: "missing", text: "o" },
            { kind: "ok", text: "t" },
        ]);
    });
    test("input made only of spaces or marks counts as nothing typed", () => {
        const r = compareTypedAnswer("  ...", "board", false);
        expect(r.exact).toBe(false);
        expect(r.typed).toEqual([]);
        expect(r.expected).toEqual([{ kind: "missing", text: "board" }]);
    });
    test("two empty strings are exact and show nothing", () => {
        expect(compareTypedAnswer("", "", false)).toEqual({
            exact: true,
            similarity: 1,
            typedWordsInAnswer: false,
            typed: [],
            expected: [],
        });
    });
    test("a whole different word is all wrong and all missing", () => {
        const r = compareTypedAnswer("xyz", "abc", false);
        expect(r.typed).toEqual([{ kind: "wrong", text: "xyz" }]);
        expect(r.expected).toEqual([{ kind: "missing", text: "abc" }]);
    });
    test("a missing word in the middle is one missing run", () => {
        const r = compareTypedAnswer("the board", "the audit board", false);
        expect(r.typed).toEqual([{ kind: "ok", text: "the board" }]);
        expect(r.expected.map((p) => p.kind)).toEqual(["ok", "missing", "ok"]);
        expect(r.expected.map((p) => p.text).join("")).toBe("the audit board");
    });
    test("a letter that folds into two characters is only right when both match", () => {
        const r = compareTypedAnswer("İ", "i", false);
        expect(r.exact).toBe(false);
        expect(r.typed).toEqual([{ kind: "wrong", text: "İ" }]);
    });
});

describe("compareTypedAnswer: alignment", () => {
    test("among equally good matches the earliest wins", () => {
        const r = compareTypedAnswer("print", "prints; imprints", false);
        expect(r.typed).toEqual([{ kind: "ok", text: "print" }]);
        // "prints; imprints" lists two alternatives: marked against the first, the rest as is
        expect(r.expected).toEqual([
            { kind: "ok", text: "print" },
            { kind: "missing", text: "s" },
            { kind: "other", text: "; imprints" },
        ]);
    });
});

describe("worthMarking", () => {
    test("a misspelling is marked letter by letter", () => {
        const c = compareTypedAnswer("adjacency matix", "adjacency matrix", false);
        expect(c.similarity).toBeGreaterThan(0.9);
        expect(worthMarking(c)).toBe(true);
    });

    test("a different phrasing is not", () => {
        const c = compareTypedAnswer(
            "number of k step walks",
            "walks of length k from u to v",
            false,
        );
        expect(c.similarity).toBeLessThan(CLOSE_ENOUGH);
        expect(worthMarking(c)).toBe(false);
    });

    test("an exact answer always is", () => {
        expect(worthMarking(compareTypedAnswer("Paris", "paris", false))).toBe(true);
    });
});

describe("compareTypedAnswer: an answer listing alternatives", () => {
    const answer = "gloomy, sullen, тоскливый, угрюмый";

    test("any one alternative is exact", () => {
        const c = compareTypedAnswer("gloomy", answer, false);
        expect(c.exact).toBe(true);
        expect(c.alternative).toBe(true);
        expect(c.expected).toEqual([
            { kind: "ok", text: "gloomy" },
            { kind: "other", text: ", sullen, тоскливый, угрюмый" },
        ]);
        expect(compareTypedAnswer("Угрюмый", answer, false).exact).toBe(true);
    });

    test("several alternatives typed, each one of them, are exact", () => {
        const c = compareTypedAnswer("угрюмый; gloomy", answer, false);
        expect(c.exact).toBe(true);
        expect(c.expected).toEqual([
            { kind: "ok", text: "gloomy" },
            { kind: "other", text: ", sullen, тоскливый, " },
            { kind: "ok", text: "угрюмый" },
        ]);
    });

    test("a misspelt alternative is marked against that alternative", () => {
        const c = compareTypedAnswer("sulen", answer, false);
        expect(c.exact).toBe(false);
        expect(c.alternative).toBe(true);
        expect(worthMarking(c)).toBe(true);
        expect(c.expected[0]).toEqual({ kind: "other", text: "gloomy, " });
        expect(c.expected.map((p) => p.text).join("")).toEqual(answer);
    });

    test("one right and one wrong is not exact", () => {
        expect(compareTypedAnswer("gloomy, happy", answer, false).exact).toBe(false);
    });

    test("an answer without separators is compared whole", () => {
        const c = compareTypedAnswer("walks", "walks of length k", false);
        expect(c.exact).toBe(false);
        expect(c.alternative).toBeUndefined();
    });
});

describe("worthMarking: a part of the answer typed word for word", () => {
    test("one word of a longer answer is marked", () => {
        const c = compareTypedAnswer("крона", "крона дерева", false);
        expect(c.similarity).toBeLessThan(CLOSE_ENOUGH);
        expect(worthMarking(c)).toBe(true);
        expect(c.typed).toEqual([{ kind: "ok", text: "крона" }]);
        expect(c.expected).toEqual([
            { kind: "ok", text: "крона" },
            { kind: "missing", text: " дерева" },
        ]);
    });

    test("a word that is not in the answer is not", () => {
        expect(worthMarking(compareTypedAnswer("крон", "крона дерева", false))).toBe(true);
        expect(worthMarking(compareTypedAnswer("ствол", "крона дерева", false))).toBe(false);
    });
});

test("the earlier rephrased answer is still shown as typed", () => {
    const c = compareTypedAnswer("number of k step walks", "walks of length k from u to v", false);
    expect(worthMarking(c)).toBe(false);
});
