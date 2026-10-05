import {
    collectCardCommentDefinitions,
    collectCardCommentLabels,
    findFootnoteDefinition,
    removeFootnoteDefinition,
    upsertFootnoteDefinition,
} from "src/utils/note-footnotes";

const note = [
    "# A note",
    "",
    "Q1:::A1 [^sr-a3f91c]",
    "",
    "Some prose with a footnote[^1]",
    "",
    "[^1]: the user's own footnote",
    "[^sr-a3f91c]: - *2026-10-03:* first",
    "    - *2026-10-19:* second",
    "",
].join("\n");

describe("findFootnoteDefinition", () => {
    test("returns a definition including its indented continuations", () => {
        expect(findFootnoteDefinition(note, "sr-a3f91c")).toBe(
            "[^sr-a3f91c]: - *2026-10-03:* first\n    - *2026-10-19:* second",
        );
    });

    test("returns the user's own definition when asked for it", () => {
        expect(findFootnoteDefinition(note, "1")).toBe("[^1]: the user's own footnote");
    });

    test("returns null when absent", () => {
        expect(findFootnoteDefinition(note, "sr-ffffff")).toBe(null);
    });
});

describe("upsertFootnoteDefinition", () => {
    test("replaces in place, leaving every other line byte-identical", () => {
        const updated = upsertFootnoteDefinition(
            note,
            "sr-a3f91c",
            "[^sr-a3f91c]: - *2026-10-03:* rewritten",
        );
        expect(updated).toContain("[^1]: the user's own footnote");
        expect(updated).toContain("[^sr-a3f91c]: - *2026-10-03:* rewritten");
        expect(updated).not.toContain("first");
        expect(updated).not.toContain("second");
        expect(updated.split("\n").slice(0, 7)).toEqual(note.split("\n").slice(0, 7));
    });

    test("appends at the end when absent", () => {
        const base = "Q1:::A1 [^sr-b7102e]\n";
        expect(upsertFootnoteDefinition(base, "sr-b7102e", "[^sr-b7102e]: - *2026-10-03:* x")).toBe(
            "Q1:::A1 [^sr-b7102e]\n\n[^sr-b7102e]: - *2026-10-03:* x\n",
        );
    });

    test("appends correctly when the note has no trailing newline", () => {
        const base = "Q1:::A1 [^sr-b7102e]";
        expect(upsertFootnoteDefinition(base, "sr-b7102e", "[^sr-b7102e]: - *2026-10-03:* x")).toBe(
            "Q1:::A1 [^sr-b7102e]\n\n[^sr-b7102e]: - *2026-10-03:* x\n",
        );
    });

    test("does not add a second blank line when one is already there", () => {
        const base = "Q1:::A1 [^sr-b7102e]\n\n";
        expect(upsertFootnoteDefinition(base, "sr-b7102e", "[^sr-b7102e]: - *2026-10-03:* x")).toBe(
            "Q1:::A1 [^sr-b7102e]\n\n[^sr-b7102e]: - *2026-10-03:* x\n",
        );
    });

    test("a replacement that spans fewer lines does not swallow what follows", () => {
        const base = [
            "[^sr-a3f91c]: - *2026-10-03:* first",
            "    - *2026-10-19:* second",
            "",
            "trailing prose",
            "",
        ].join("\n");
        expect(
            upsertFootnoteDefinition(base, "sr-a3f91c", "[^sr-a3f91c]: - *2026-10-03:* only"),
        ).toBe("[^sr-a3f91c]: - *2026-10-03:* only\n\ntrailing prose\n");
    });

    test("preserves CRLF line endings when the note uses them", () => {
        const base = "Q1:::A1 [^sr-b7102e]\r\n";
        expect(upsertFootnoteDefinition(base, "sr-b7102e", "[^sr-b7102e]: - *2026-10-03:* x")).toBe(
            "Q1:::A1 [^sr-b7102e]\r\n\r\n[^sr-b7102e]: - *2026-10-03:* x\r\n",
        );
    });

    test("preserves CRLF when replacing an existing definition", () => {
        const base =
            "Q1:::A1 [^sr-a3f91c]\r\n\r\n[^sr-a3f91c]: - *2026-10-03:* first\r\n    - *2026-10-19:* second\r\n";
        const updated = upsertFootnoteDefinition(
            base,
            "sr-a3f91c",
            "[^sr-a3f91c]: - *2026-10-03:* rewritten",
        );
        expect(updated).toBe(
            "Q1:::A1 [^sr-a3f91c]\r\n\r\n[^sr-a3f91c]: - *2026-10-03:* rewritten\r\n",
        );
        expect(updated).not.toContain("second");
    });

    test("leaves an LF note with LF endings", () => {
        const base = "Q1:::A1 [^sr-b7102e]\n";
        const updated = upsertFootnoteDefinition(
            base,
            "sr-b7102e",
            "[^sr-b7102e]: - *2026-10-03:* x",
        );
        expect(updated).not.toContain("\r");
    });
});

describe("collect helpers", () => {
    test("collects only the plugin's labels", () => {
        expect(collectCardCommentLabels(note)).toEqual(new Set(["sr-a3f91c"]));
    });

    test("maps labels to their definitions", () => {
        const map = collectCardCommentDefinitions(note);
        expect(map.get("sr-a3f91c")).toBe(
            "[^sr-a3f91c]: - *2026-10-03:* first\n    - *2026-10-19:* second",
        );
        expect(map.has("1")).toBe(false);
    });
});

describe("removeFootnoteDefinition", () => {
    test("removes a definition at the end with the blank line before it", () => {
        const text =
            "Card [^sr-a3f91c]\n\n[^sr-a3f91c]: - *2026-01-01:* note\n    - *2026-01-02:* more\n";
        expect(removeFootnoteDefinition(text, "sr-a3f91c")).toBe("Card [^sr-a3f91c]\n");
    });

    test("keeps one blank line between the text around a definition in the middle", () => {
        const text = "Above\n\n[^sr-a3f91c]: - note\n\nBelow";
        expect(removeFootnoteDefinition(text, "sr-a3f91c")).toBe("Above\n\nBelow");
    });

    test("leaves other definitions and CRLF line endings alone", () => {
        const text = "A\r\n\r\n[^sr-a3f91c]: - x\r\n[^sr-bbbbbb]: - y";
        expect(removeFootnoteDefinition(text, "sr-a3f91c")).toBe("A\r\n\r\n[^sr-bbbbbb]: - y");
    });

    test("a missing label changes nothing", () => {
        expect(removeFootnoteDefinition("no footnotes", "sr-a3f91c")).toBe("no footnotes");
    });
});
