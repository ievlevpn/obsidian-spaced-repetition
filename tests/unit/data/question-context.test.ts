import { HeadingCache } from "obsidian";

import { questionContextFromHeadings } from "src/data/data-structures/file/note-file";

const heading = (text: string, level: number, start: number, end: number = start): HeadingCache =>
    ({
        heading: text,
        level,
        position: {
            start: { line: start, col: 0, offset: 0 },
            end: { line: end, col: 0, offset: 0 },
        },
    }) as HeadingCache;

describe("questionContextFromHeadings", () => {
    test("nests # headings above the card", () => {
        const headings = [heading("Top", 1, 0), heading("Sub", 2, 4), heading("Later", 2, 20)];
        expect(questionContextFromHeadings(headings, 10)).toEqual(["Top", "Sub"]);
    });

    test("skips a setext heading made by a card's last line and the --- under it", () => {
        const headings = [
            heading("Top", 1, 0),
            heading("Card note. <!--SR:!2026-10-17,4,250-->", 2, 6, 7),
        ];
        expect(questionContextFromHeadings(headings, 10)).toEqual(["Top"]);
    });
});
