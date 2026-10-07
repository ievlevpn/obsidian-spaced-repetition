// Which answer each number key gives during review. Ported from Flashcard Studio
// (github.com/Almalkiid/flashcard-studio, MIT).

import { ReviewResponse } from "src/scheduling/algorithms/base/repetition-item";

/**
 * Which answer each number key gives. "anki" is Anki's layout (1 Again, 2 Hard, 3 Good, 4 Easy); "original" is the
 * layout of the Spaced Repetition plugin (1 Hard, 2 Good, 3 Easy, 0 Reset), kept for existing installs.
 */
export type AnswerKeys = "anki" | "original";

/**
 * The answer for a number key (0 to 9), or null when the key answers nothing in this layout.
 */
export function responseForDigit(keys: AnswerKeys, digit: number): ReviewResponse | null {
    if (keys === "anki") {
        switch (digit) {
            case 1:
                return ReviewResponse.Again;
            case 2:
                return ReviewResponse.Hard;
            case 3:
                return ReviewResponse.Good;
            case 4:
                return ReviewResponse.Easy;
            default:
                return null;
        }
    }

    switch (digit) {
        case 0:
            return ReviewResponse.Reset;
        case 1:
            return ReviewResponse.Hard;
        case 2:
            return ReviewResponse.Good;
        case 3:
            return ReviewResponse.Easy;
        default:
            return null;
    }
}

/**
 * Reads the number key from a keyboard event's `code` ("Digit3" or "Numpad3"), or null for any other key.
 */
export function digitFromKeyCode(code: string): number | null {
    const match = /^(?:Digit|Numpad)([0-9])$/.exec(code);
    return match ? Number(match[1]) : null;
}
