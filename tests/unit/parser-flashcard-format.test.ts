// The vault's flashcard format (Claude/Flashcard Format.md): `---`-terminated region cards with
// lead-in prose, inline cards that never destroy a pending card, inline cloze lines, and math
// where braces belong to LaTeX.

import { CardType } from "src/data/data-structures/card/questions/question";
import { parse, ParserOptions } from "src/parser";

const vault: ParserOptions = {
    singleLineCardSeparator: ":::",
    singleLineReversedCardSeparator: "::::",
    multilineCardSeparator: "?",
    multilineReversedCardSeparator: "??",
    multilineCardEndMarker: "---",
    clozePatterns: ["{{[123;;]answer[;;hint]}}"],
};
const blankLineMode: ParserOptions = { ...vault, multilineCardEndMarker: "" };

const cardsOf = (text: string, options: ParserOptions = vault) =>
    parse(text, options).map((q) => [q.cardType, q.text, q.firstLineNum, q.lastLineNum]);

describe("Region cards in marker mode", () => {
    test("a card spans blank lines, lists and math up to ---", () => {
        const text = "First {{a}} here.\n\n- item\n- item {{b}}\n\n$$x^2$$\n---\nafter";
        expect(cardsOf(text)).toEqual([
            [CardType.Cloze, "First {{a}} here.\n\n- item\n- item {{b}}\n\n$$x^2$$", 0, 5],
        ]);
    });

    test("lead-in prose before the first cloze is part of the card", () => {
        const text = "---\nIntro paragraph.\n\nMore intro.\n\nThe {{answer}}.\n---";
        expect(cardsOf(text)).toEqual([
            [CardType.Cloze, "Intro paragraph.\n\nMore intro.\n\nThe {{answer}}.", 1, 5],
        ]);
    });

    test("leading blank and heading lines are dropped, headings later in the card kept", () => {
        const text = "## Card title\n\nText {{a}}\n\n### Sub\n\nmore\n---";
        expect(cardsOf(text)).toEqual([[CardType.Cloze, "Text {{a}}\n\n### Sub\n\nmore", 2, 6]]);
    });

    test("headings do not end a card", () => {
        const text = "A {{a}}\n\n## Next section\n\nB {{b}}";
        expect(cardsOf(text)).toHaveLength(1);
    });

    test("a section without cards produces nothing", () => {
        expect(cardsOf("Just prose.\n\nMore prose.\n---\nStill prose.")).toEqual([]);
    });

    test("front/back card also starts after the previous ---", () => {
        const text = "---\nContext line.\n\nQuestion?\n?\nAnswer\n\nmore answer\n---";
        expect(cardsOf(text)).toEqual([
            [CardType.MultiLineBasic, "Context line.\n\nQuestion?\n?\nAnswer\n\nmore answer", 1, 7],
        ]);
    });
});

describe("Inline cards never destroy a pending card", () => {
    test("a ::: line after a cloze card keeps the cloze card (marker mode)", () => {
        const text = "Prose with {{a}}.\n\nmore prose\nchien ::: dog\n---";
        expect(cardsOf(text)).toEqual([
            [CardType.Cloze, "Prose with {{a}}.\n\nmore prose", 0, 2],
            [CardType.SingleLineBasic, "chien ::: dog", 3, 3],
        ]);
    });

    test("a ::: line glued below a cloze keeps the cloze card (blank-line mode)", () => {
        expect(cardsOf("The {{a}}\nchien ::: dog", blankLineMode)).toEqual([
            [CardType.Cloze, "The {{a}}", 0, 0],
            [CardType.SingleLineBasic, "chien ::: dog", 1, 1],
        ]);
    });

    test("collection restarts after an inline card", () => {
        const text = "chien ::: dog\nThen {{b}}\n---";
        expect(cardsOf(text)).toEqual([
            [CardType.SingleLineBasic, "chien ::: dog", 0, 0],
            [CardType.Cloze, "Then {{b}}", 1, 1],
        ]);
    });

    test("prose with no card above an inline card is not a card", () => {
        expect(cardsOf("Just prose\nchien ::: dog")).toEqual([
            [CardType.SingleLineBasic, "chien ::: dog", 1, 1],
        ]);
    });
});

describe("Inline cloze lines", () => {
    test("each + item with a cloze is its own card", () => {
        const text = "Faux amis:\n+ {{actuellement}} = currently\n+ {{éventuellement}} = possibly";
        expect(cardsOf(text)).toEqual([
            [CardType.Cloze, "+ {{actuellement}} = currently", 1, 1],
            [CardType.Cloze, "+ {{éventuellement}} = possibly", 2, 2],
        ]);
    });

    test("an unmarked list is content of the region card", () => {
        const text = "- {{a}} one\n- {{b}} two\n---";
        expect(cardsOf(text)).toEqual([[CardType.Cloze, "- {{a}} one\n- {{b}} two", 0, 1]]);
    });

    test("+ items split a region and keep the part above", () => {
        const text = "Prose {{a}}\n+ {{b}} item\nTail {{c}}\n---";
        expect(cardsOf(text)).toEqual([
            [CardType.Cloze, "Prose {{a}}", 0, 0],
            [CardType.Cloze, "+ {{b}} item", 1, 1],
            [CardType.Cloze, "Tail {{c}}", 2, 2],
        ]);
    });

    test("indented + items and their schedule comments", () => {
        const text = "- topic\n    + {{x}} = y <!--SR:!2026-11-02,14,250-->";
        expect(cardsOf(text)).toEqual([
            [CardType.Cloze, "    + {{x}} = y <!--SR:!2026-11-02,14,250-->", 1, 1],
        ]);
    });

    test("a + item without a cloze is ordinary text", () => {
        expect(cardsOf("+ plain item\n+ another")).toEqual([]);
    });

    test("inlineClozeLines makes every cloze line its own card", () => {
        const options = { ...vault, inlineClozeLines: true };
        const text = "Vocabulary:\n- {{chien}} = dog\n1. {{chat}} = cat\nle {{oiseau}} = bird";
        expect(cardsOf(text, options)).toEqual([
            [CardType.Cloze, "- {{chien}} = dog", 1, 1],
            [CardType.Cloze, "1. {{chat}} = cat", 2, 2],
            [CardType.Cloze, "le {{oiseau}} = bird", 3, 3],
        ]);
    });

    test("inlineClozeLines keeps front/back cards working", () => {
        const options = { ...vault, inlineClozeLines: true };
        expect(cardsOf("Question\n?\nAnswer\n---", options)).toEqual([
            [CardType.MultiLineBasic, "Question\n?\nAnswer", 0, 2],
        ]);
    });

    test("a line inside a multi-line $$ block is never an inline card", () => {
        const options = { ...vault, inlineClozeLines: true };
        const text = "$$\n\\cloze{a}{} = b\n$$\n---";
        expect(cardsOf(text, options)).toEqual([
            [CardType.Cloze, "$$\n\\cloze{a}{} = b\n$$", 0, 2],
        ]);
    });
});

describe("Math: braces are LaTeX's business", () => {
    test("{{...}} inside inline math is not a cloze", () => {
        expect(cardsOf("$\\frac{{a}}{b}$ and no cloze", blankLineMode)).toEqual([]);
    });

    test("{{...}} inside display math is not a cloze", () => {
        expect(cardsOf("$$\n{{n} \\choose {k}}\n$$", blankLineMode)).toEqual([]);
    });

    test("\\cloze inside math is a cloze, also on a line of a multi-line block", () => {
        expect(cardsOf("$$\nx = \\cloze{a}{}\n$$", blankLineMode)).toEqual([
            [CardType.Cloze, "$$\nx = \\cloze{a}{}\n$$", 0, 2],
        ]);
    });

    test("\\cloze outside math is plain text", () => {
        expect(cardsOf("Write `\\cloze` as \\cloze{answer}{hint} in math.", blankLineMode)).toEqual(
            [],
        );
    });

    test("{{...}} outside math still works next to math", () => {
        expect(cardsOf("$x^2$ is {{a square}}", blankLineMode)).toEqual([
            [CardType.Cloze, "$x^2$ is {{a square}}", 0, 0],
        ]);
    });
});

describe("HTML comments", () => {
    test("the line after a comment is parsed", () => {
        expect(cardsOf("<!-- note -->\nchien ::: dog", blankLineMode)).toEqual([
            [CardType.SingleLineBasic, "chien ::: dog", 1, 1],
        ]);
    });

    test("a comment inside a card keeps the card's text contiguous", () => {
        const text = "A {{a}}\n<!-- remark -->\nB\n---";
        expect(cardsOf(text)).toEqual([[CardType.Cloze, "A {{a}}\n<!-- remark -->\nB", 0, 2]]);
    });

    test("an unterminated comment line does not swallow the rest of the note", () => {
        expect(cardsOf("<!-- open\nstill comment -->\nchien ::: dog", blankLineMode)).toEqual([
            [CardType.SingleLineBasic, "chien ::: dog", 2, 2],
        ]);
    });
});

describe("inlineClozeLines keeps tables and callouts together", () => {
    const options: ParserOptions = { ...vault, inlineClozeLines: true };

    test("a table with clozes stays one card", () => {
        const text = "- {{a}} = 1\n| k | v |\n|---|---|\n| x | {{y}} |\n| z | {{w}} |\n---";
        expect(cardsOf(text, options)).toEqual([
            [CardType.Cloze, "- {{a}} = 1", 0, 0],
            [CardType.Cloze, "| k | v |\n|---|---|\n| x | {{y}} |\n| z | {{w}} |", 1, 4],
        ]);
    });

    test("a callout with a cloze stays one card", () => {
        const text = "> [!comment]\n> the {{answer}}\n---";
        expect(cardsOf(text, options)).toEqual([
            [CardType.Cloze, "> [!comment]\n> the {{answer}}", 0, 1],
        ]);
    });
});
