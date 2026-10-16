import { notesLinkLabel, notesPaneMinHeight } from "src/utils/card-comment";

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

describe("notesPaneMinHeight", () => {
    test("keeps the rest of the pane and a floor of notes", () => {
        // pane 300 = list 200 + 100 of bar and box; notes 500 tall, floor 60
        expect(notesPaneMinHeight(300, 200, 500, 60)).toBe(160);
    });

    test("notes shorter than the floor keep all their room", () => {
        expect(notesPaneMinHeight(140, 40, 40, 60)).toBe(140);
    });

    test("the same while the list is squeezed", () => {
        expect(notesPaneMinHeight(130, 30, 500, 60.4)).toBe(161);
    });
});
