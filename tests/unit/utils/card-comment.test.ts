import {
    appendCardCommentEntry,
    CardCommentEntry,
    editCardCommentEntry,
    extractCardCommentRef,
    formatCardCommentDefinition,
    formatCardCommentRef,
    generateCardCommentLabel,
    isFootnoteContinuationLine,
    isFootnoteDefinitionLine,
    parseCardCommentDefinition,
} from "src/utils/card-comment";

describe("footnote line predicates", () => {
    test("recognises any footnote definition line, not only ours", () => {
        expect(isFootnoteDefinitionLine("[^sr-a3f91c]: - *2026-10-03:* x")).toBe(true);
        expect(isFootnoteDefinitionLine("[^1]: an ordinary footnote")).toBe(true);
        expect(isFootnoteDefinitionLine("  [^note]: indented definition")).toBe(true);
        expect(isFootnoteDefinitionLine("Q1:::A1")).toBe(false);
        expect(isFootnoteDefinitionLine("a [^1] reference in prose")).toBe(false);
    });

    test("recognises indented continuation lines", () => {
        expect(isFootnoteContinuationLine("    - *2026-10-19:* second")).toBe(true);
        expect(isFootnoteContinuationLine("\tcontinued with a tab")).toBe(true);
        expect(isFootnoteContinuationLine("not indented")).toBe(false);
        expect(isFootnoteContinuationLine("")).toBe(false);
    });

    test("does not treat an indented line as a definition", () => {
        // Our own entry and continuation indents, and a "[^x]:" typed inside a comment
        expect(isFootnoteDefinitionLine("    - *2026-10-19:* second")).toBe(false);
        expect(isFootnoteDefinitionLine("    [^foo]: inside our own definition")).toBe(false);
        expect(isFootnoteDefinitionLine("      [^foo]: a continuation line")).toBe(false);
        // Up to 3 leading spaces is still a definition
        expect(isFootnoteDefinitionLine("   [^1]: three spaces is allowed")).toBe(true);
    });
});

describe("the reference token", () => {
    test("formats a label", () => {
        expect(formatCardCommentRef("sr-a3f91c")).toBe("[^sr-a3f91c]");
    });

    test("extracts our reference from the end of a card line", () => {
        expect(extractCardCommentRef("Q1:::A1 [^sr-a3f91c]")).toEqual(["Q1:::A1", "sr-a3f91c"]);
    });

    test("extracts it when preceded by a newline, not a space", () => {
        // The own-line case: a card ending in a code fence, or cardCommentOnSameLine false
        expect(extractCardCommentRef("Q1:::A1\n[^sr-a3f91c]")).toEqual(["Q1:::A1", "sr-a3f91c"]);
        expect(extractCardCommentRef("F\n?\n```\ncode\n```\n[^sr-a3f91c]")).toEqual([
            "F\n?\n```\ncode\n```",
            "sr-a3f91c",
        ]);
    });

    test("ignores a reference that is not ours", () => {
        expect(extractCardCommentRef("Q1:::A1 [^1]")).toEqual(["Q1:::A1 [^1]", null]);
        expect(extractCardCommentRef("Q1:::A1 [^mynote]")).toEqual(["Q1:::A1 [^mynote]", null]);
    });

    test("ignores one that is not at the end", () => {
        expect(extractCardCommentRef("Q [^sr-a3f91c] ::: A")).toEqual([
            "Q [^sr-a3f91c] ::: A",
            null,
        ]);
    });

    test("returns the text unchanged when there is no reference", () => {
        expect(extractCardCommentRef("Q1:::A1")).toEqual(["Q1:::A1", null]);
    });

    test("only claims labels of exactly six hex digits", () => {
        expect(extractCardCommentRef("Q1:::A1 [^sr-a3f91c]")).toEqual(["Q1:::A1", "sr-a3f91c"]);
        expect(extractCardCommentRef("Q1:::A1 [^sr-a]")).toEqual(["Q1:::A1 [^sr-a]", null]);
        expect(extractCardCommentRef("Q1:::A1 [^sr-a3f91cde]")).toEqual([
            "Q1:::A1 [^sr-a3f91cde]",
            null,
        ]);
        expect(extractCardCommentRef("Q1:::A1 [^sr-ZZZZZZ]")).toEqual([
            "Q1:::A1 [^sr-ZZZZZZ]",
            null,
        ]);
    });
});

describe("formatCardCommentDefinition", () => {
    test("formats one entry on the definition line", () => {
        const entries: CardCommentEntry[] = [{ date: "2026-10-03", text: "the sup is over T" }];
        expect(formatCardCommentDefinition("sr-a3f91c", entries)).toBe(
            "[^sr-a3f91c]: - *2026-10-03:* the sup is over T",
        );
    });

    test("indents later entries under the definition", () => {
        const entries: CardCommentEntry[] = [
            { date: "2026-10-03", text: "first" },
            { date: "2026-10-19", text: "second" },
        ];
        expect(formatCardCommentDefinition("sr-a3f91c", entries)).toBe(
            "[^sr-a3f91c]: - *2026-10-03:* first\n    - *2026-10-19:* second",
        );
    });

    test("indents a multi-line entry under its own bullet", () => {
        const entries: CardCommentEntry[] = [{ date: "2026-10-03", text: "line one\nline two" }];
        expect(formatCardCommentDefinition("sr-a3f91c", entries)).toBe(
            "[^sr-a3f91c]: - *2026-10-03:* line one\n      line two",
        );
    });

    test("escapes text that could forge a bullet", () => {
        const entries: CardCommentEntry[] = [{ date: "2026-10-03", text: "- not a bullet" }];
        expect(formatCardCommentDefinition("sr-a3f91c", entries)).toBe(
            "[^sr-a3f91c]: - *2026-10-03:* \\- not a bullet",
        );
    });

    test("returns an empty string for no entries", () => {
        expect(formatCardCommentDefinition("sr-a3f91c", [])).toBe("");
    });
});

describe("parseCardCommentDefinition", () => {
    test("is the inverse of format for a multi-entry, multi-line comment", () => {
        const entries: CardCommentEntry[] = [
            { date: "2026-10-03", text: "first\nwrapped" },
            { date: "2026-10-19", text: "second" },
        ];
        expect(
            parseCardCommentDefinition(formatCardCommentDefinition("sr-a3f91c", entries)),
        ).toEqual(entries);
    });

    test("round-trips text that legitimately begins with a backslash", () => {
        const entries: CardCommentEntry[] = [
            { date: "2026-10-03", text: "\\- a literal escaped hyphen" },
        ];
        expect(
            parseCardCommentDefinition(formatCardCommentDefinition("sr-a3f91c", entries)),
        ).toEqual(entries);
    });

    test("leaves LaTeX leading backslashes byte-identical in the stored text", () => {
        const entries: CardCommentEntry[] = [
            { date: "2026-10-03", text: "\\cloze{a}{b} and \\sum_i x_i" },
        ];
        const def = formatCardCommentDefinition("sr-a3f91c", entries);
        expect(def).toBe("[^sr-a3f91c]: - *2026-10-03:* \\cloze{a}{b} and \\sum_i x_i");
        expect(parseCardCommentDefinition(def)).toEqual(entries);
    });

    test("tolerates a hand-written entry with no date prefix", () => {
        expect(parseCardCommentDefinition("[^sr-a3f91c]: - just a thought")).toEqual([
            { date: "", text: "just a thought" },
        ]);
    });

    test("tolerates a hand-written definition with no bullet at all", () => {
        expect(parseCardCommentDefinition("[^sr-a3f91c]: just a thought")).toEqual([
            { date: "", text: "just a thought" },
        ]);
    });
});

describe("appendCardCommentEntry", () => {
    test("creates a definition when there is none", () => {
        expect(appendCardCommentEntry(null, "sr-a3f91c", "first thought", "2026-10-03")).toBe(
            "[^sr-a3f91c]: - *2026-10-03:* first thought",
        );
    });

    test("appends to an existing definition, preserving earlier entries", () => {
        const existing = "[^sr-a3f91c]: - *2026-10-03:* first";
        expect(appendCardCommentEntry(existing, "sr-a3f91c", "second", "2026-10-19")).toBe(
            "[^sr-a3f91c]: - *2026-10-03:* first\n    - *2026-10-19:* second",
        );
    });

    test("two entries on the same day stay two entries", () => {
        const existing = "[^sr-a3f91c]: - *2026-10-03:* first";
        expect(appendCardCommentEntry(existing, "sr-a3f91c", "second", "2026-10-03")).toBe(
            "[^sr-a3f91c]: - *2026-10-03:* first\n    - *2026-10-03:* second",
        );
    });

    test("blank input changes nothing", () => {
        expect(appendCardCommentEntry(null, "sr-a3f91c", "   \n  ", "2026-10-03")).toBe(null);
        const existing = "[^sr-a3f91c]: - *2026-10-03:* first";
        expect(appendCardCommentEntry(existing, "sr-a3f91c", "", "2026-10-19")).toBe(existing);
    });
});

describe("generateCardCommentLabel", () => {
    test("produces a well-formed label", () => {
        expect(generateCardCommentLabel(new Set())).toMatch(/^sr-[0-9a-f]{6}$/);
    });

    test("never returns a label already taken", () => {
        const taken = new Set<string>();
        for (let i = 0; i < 200; i++) {
            const label = generateCardCommentLabel(taken);
            expect(taken.has(label)).toBe(false);
            taken.add(label);
        }
    });
});

describe("editCardCommentEntry", () => {
    const def = "[^sr-a3f91c]: - *2026-01-01:* first\n    - *2026-01-02:* second";

    test("replaces an entry's text and keeps its date", () => {
        expect(editCardCommentEntry(def, "sr-a3f91c", 1, "  revised  ")).toBe(
            "[^sr-a3f91c]: - *2026-01-01:* first\n    - *2026-01-02:* revised",
        );
    });

    test("blank text deletes the entry", () => {
        expect(editCardCommentEntry(def, "sr-a3f91c", 0, " ")).toBe(
            "[^sr-a3f91c]: - *2026-01-02:* second",
        );
    });

    test("deleting the last entry leaves an empty definition", () => {
        expect(editCardCommentEntry("[^sr-a3f91c]: - *2026-01-01:* only", "sr-a3f91c", 0, "")).toBe(
            "",
        );
    });

    test("an index that does not exist changes nothing", () => {
        expect(editCardCommentEntry(def, "sr-a3f91c", 5, "x")).toBe(def);
        expect(editCardCommentEntry(null, "sr-a3f91c", 0, "x")).toBeNull();
    });

    test("multi-line text is kept as continuation lines", () => {
        expect(editCardCommentEntry(def, "sr-a3f91c", 0, "line 1\nline 2")).toBe(
            "[^sr-a3f91c]: - *2026-01-01:* line 1\n      line 2\n    - *2026-01-02:* second",
        );
    });
});
