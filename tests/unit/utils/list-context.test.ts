import { cleanContextLine, getListContext } from "src/utils/list-context";

const ctx = (text: string, lineNum: number) => getListContext(text.split("\n"), lineNum);

describe("getListContext", () => {
    test("lead-in line above the list", () => {
        const text = "Faux amis:\n+ {{actuellement}} = currently\n+ {{éventuellement}} = possibly";
        expect(ctx(text, 1)).toEqual(["Faux amis:"]);
        expect(ctx(text, 2)).toEqual(["Faux amis:"]);
    });

    test("parent items, outermost first, then the lead-in", () => {
        const text = "Verbs:\n- être\n    - present\n        + je {{suis}}";
        expect(ctx(text, 3)).toEqual(["Verbs:", "- être", "- present"]);
    });

    test("siblings at the same depth are not context", () => {
        const text = "Words:\n+ {{a}} = 1\n+ {{b}} = 2";
        expect(ctx(text, 2)).toEqual(["Words:"]);
    });

    test("a blank line, heading or --- ends the walk", () => {
        expect(ctx("Lead-in\n\n+ {{a}}", 2)).toEqual([]);
        expect(ctx("## Heading\n+ {{a}}", 1)).toEqual([]);
        expect(ctx("---\n+ {{a}}", 1)).toEqual([]);
    });

    test("deeper continuation lines are skipped", () => {
        const text = "Lead:\n- parent\n  continued text\n    + {{x}}";
        expect(ctx(text, 3)).toEqual(["Lead:", "- parent"]);
    });

    test("a line that is not a list item has no list context", () => {
        expect(ctx("Lead\nle {{chien}} = dog", 1)).toEqual([]);
    });
});

describe("cleanContextLine", () => {
    test("drops schedule comments and comment refs, shows cloze answers", () => {
        expect(
            cleanContextLine("- {{chien;;animal}} = dog [^sr-a3f91c] <!--SR:!2026-01-01,3,250-->"),
        ).toBe("- chien = dog");
        expect(cleanContextLine("$x = \\cloze{a}{h}$")).toBe("$x = a$");
        expect(cleanContextLine("{{1;;grouped}} item")).toBe("grouped item");
    });
});
