import { CardType } from "src/data/data-structures/card/questions/question";
import { CardFrontBackUtil } from "src/data/data-structures/card/questions/question-type";
import { DEFAULT_SETTINGS } from "src/data/settings";

// Typing the answer re-expands a cloze card with its blanks as fields
const typing = {
    ...DEFAULT_SETTINGS,
    clozePatterns: ["{{[123;;]answer[;;hint]}}"],
    convertClozePatternsToInputs: true,
};

describe("cloze cards expanded for typing", () => {
    test("a text cloze becomes a field on the front and a checked answer on the back", () => {
        const [card] = CardFrontBackUtil.expand(CardType.Cloze, "le {{chien}} = the dog", typing);
        expect(card.front).toContain('<input class="cloze-input"');
        expect(card.back).toContain('<span class="cloze-answer"');
        expect(card.back).toContain("chien");
    });

    test("a math cloze keeps its LaTeX blank and gets no field", () => {
        const cards = CardFrontBackUtil.expand(
            CardType.Cloze,
            "the {{sup}} of $\\cloze{X_t}{}$ over $t$",
            typing,
        );
        expect(cards).toHaveLength(2);
        const mathCard = cards.find((c) => !c.front.includes("<input"));
        const textCard = cards.find((c) => c.front.includes("<input"));
        expect(mathCard).toBeDefined();
        expect(mathCard!.front).toContain("\\ldots");
        expect(mathCard!.front).not.toContain("cloze-input");
        expect(textCard).toBeDefined();
        expect(textCard!.front).not.toContain("\\color{");
    });
});
