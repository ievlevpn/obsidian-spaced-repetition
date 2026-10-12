// Decks set to type answers by default. A deck follows the nearest deck above it that is set
// either way (so a subdeck can be switched off under a deck that types), and types nowhere by
// default. Stored in the settings by deck path ("flashcards/french"; "" for all decks).

export type DeckTypingMap = Record<string, boolean>;

function key(path: string[]): string {
    return path.join("/");
}

/** Whether a review of the deck at `path` starts with typing answers on. */
export function typeAnswersForDeck(map: DeckTypingMap, path: string[]): boolean {
    for (let n = path.length; n >= 0; n--) {
        const value: boolean | undefined = map[key(path.slice(0, n))];
        if (value !== undefined) return value;
    }
    return false;
}

/**
 * Sets the deck at `path` to type answers or not. A deck that would follow its parent anyway is
 * left unset, so it keeps following the parent if that changes.
 *
 * @returns The new map (the given one is not changed)
 */
export function setTypeAnswersForDeck(
    map: DeckTypingMap,
    path: string[],
    on: boolean,
): DeckTypingMap {
    const result: DeckTypingMap = { ...map };
    delete result[key(path)];
    const inherited: boolean = path.length > 0 && typeAnswersForDeck(result, path.slice(0, -1));
    if (on !== inherited) result[key(path)] = on;
    return result;
}
