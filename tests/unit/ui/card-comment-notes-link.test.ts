import { notesLinkLabel } from "src/utils/card-comment";

describe("notesLinkLabel", () => {
    test("no link when nothing is folded away and the notes fit", () => {
        expect(notesLinkLabel(0, false, false)).toBeNull();
    });

    test("counts the notes folded away", () => {
        expect(notesLinkLabel(1, false, false)).toBe("show 1 earlier note");
        expect(notesLinkLabel(5, true, false)).toBe("show 5 earlier notes");
    });

    test("offers to expand when the latest notes alone overflow the cap", () => {
        expect(notesLinkLabel(0, true, false)).toBe("expand");
    });

    test("expanded: always offers to show fewer", () => {
        expect(notesLinkLabel(0, true, true)).toBe("show fewer");
        expect(notesLinkLabel(4, false, true)).toBe("show fewer");
    });
});
