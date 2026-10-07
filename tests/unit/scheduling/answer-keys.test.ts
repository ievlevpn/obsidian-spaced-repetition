import { DEFAULT_SETTINGS } from "src/data/settings";
import { ReviewResponse } from "src/scheduling/algorithms/base/repetition-item";
import { digitFromKeyCode, responseForDigit } from "src/scheduling/answer-keys";

describe("responseForDigit", () => {
    test("Anki layout: 1 Again, 2 Hard, 3 Good, 4 Easy, nothing else", () => {
        expect(responseForDigit("anki", 1)).toBe(ReviewResponse.Again);
        expect(responseForDigit("anki", 2)).toBe(ReviewResponse.Hard);
        expect(responseForDigit("anki", 3)).toBe(ReviewResponse.Good);
        expect(responseForDigit("anki", 4)).toBe(ReviewResponse.Easy);
        expect(responseForDigit("anki", 0)).toBeNull();
        expect(responseForDigit("anki", 5)).toBeNull();
    });

    test("original layout: 1 Hard, 2 Good, 3 Easy, 0 Reset, nothing else", () => {
        expect(responseForDigit("original", 1)).toBe(ReviewResponse.Hard);
        expect(responseForDigit("original", 2)).toBe(ReviewResponse.Good);
        expect(responseForDigit("original", 3)).toBe(ReviewResponse.Easy);
        expect(responseForDigit("original", 0)).toBe(ReviewResponse.Reset);
        expect(responseForDigit("original", 4)).toBeNull();
    });

    test("existing installs keep the original layout by default", () => {
        expect(DEFAULT_SETTINGS.answerKeys).toBe("original");
    });
});

describe("digitFromKeyCode", () => {
    test("reads the top row and the numpad", () => {
        expect(digitFromKeyCode("Digit1")).toBe(1);
        expect(digitFromKeyCode("Numpad4")).toBe(4);
        expect(digitFromKeyCode("Digit0")).toBe(0);
    });

    test("ignores every other key", () => {
        expect(digitFromKeyCode("KeyU")).toBeNull();
        expect(digitFromKeyCode("Space")).toBeNull();
        expect(digitFromKeyCode("NumpadEnter")).toBeNull();
        expect(digitFromKeyCode("Digit12")).toBeNull();
    });
});
