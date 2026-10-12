import { setTypeAnswersForDeck, typeAnswersForDeck } from "src/utils/deck-typing";

describe("typing answers by default, per deck", () => {
    test("off unless a deck is set", () => {
        expect(typeAnswersForDeck({}, ["flashcards", "french"])).toBe(false);
    });

    test("subdecks follow the nearest deck that is set", () => {
        const map = { flashcards: true, "flashcards/math": false };
        expect(typeAnswersForDeck(map, ["flashcards"])).toBe(true);
        expect(typeAnswersForDeck(map, ["flashcards", "french", "verbs"])).toBe(true);
        expect(typeAnswersForDeck(map, ["flashcards", "math", "topology"])).toBe(false);
        expect(typeAnswersForDeck(map, ["other"])).toBe(false);
    });

    test("all decks (the empty path) covers every deck", () => {
        expect(typeAnswersForDeck({ "": true }, ["flashcards", "french"])).toBe(true);
    });

    test("setting a deck like its parent leaves it unset, to keep following", () => {
        let map = setTypeAnswersForDeck({}, ["flashcards"], true);
        expect(map).toEqual({ flashcards: true });
        map = setTypeAnswersForDeck(map, ["flashcards", "math"], false);
        expect(map).toEqual({ flashcards: true, "flashcards/math": false });
        map = setTypeAnswersForDeck(map, ["flashcards", "math"], true);
        expect(map).toEqual({ flashcards: true });
        map = setTypeAnswersForDeck(map, ["flashcards"], false);
        expect(map).toEqual({});
    });

    test("does not change the given map", () => {
        const map = { flashcards: true };
        setTypeAnswersForDeck(map, ["flashcards"], false);
        expect(map).toEqual({ flashcards: true });
    });
});
