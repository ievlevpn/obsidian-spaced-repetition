import {
    clampNotesHeight,
    NOTES_MAX_FRACTION,
    NOTES_MIN_HEIGHT,
    notesLinkLabel,
} from "src/utils/card-comment";

describe("notesLinkLabel", () => {
    test("no link when nothing is folded away", () => {
        expect(notesLinkLabel(0, false)).toBeNull();
    });

    test("counts the notes folded away", () => {
        expect(notesLinkLabel(1, false)).toBe("show 1 earlier note");
        expect(notesLinkLabel(5, false)).toBe("show 5 earlier notes");
    });

    test("expanded: offers to show fewer", () => {
        expect(notesLinkLabel(4, true)).toBe("show fewer");
    });
});

describe("clampNotesHeight", () => {
    test("keeps a height within bounds, rounded", () => {
        expect(clampNotesHeight(200.4, 1000)).toBe(200);
    });

    test("never smaller than about one note", () => {
        expect(clampNotesHeight(-50, 1000)).toBe(NOTES_MIN_HEIGHT);
    });

    test("never taller than most of the window", () => {
        expect(clampNotesHeight(5000, 1000)).toBe(1000 * NOTES_MAX_FRACTION);
    });

    test("a tiny window still allows the minimum", () => {
        expect(clampNotesHeight(100, 40)).toBe(NOTES_MIN_HEIGHT);
    });
});
