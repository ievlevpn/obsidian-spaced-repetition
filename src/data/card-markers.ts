// Markers a card carries in its `<!--SR:...-->` comment, after the fields of its schedule:
//
//     <!--SR:!fsrs,2026-11-02T10:00:00.000Z,14,...,2026-10-19T10:00:00.000Z,imp,susp-->
//
// The schedule parser reads a fixed number of fields per segment and ignores the rest, so the
// markers are invisible to it (and to the original plugin). An unreviewed card that carries a
// marker gets a placeholder segment to hold it.

/**
 * @property {boolean} suspended - Left out of every review until unsuspended
 * @property {boolean} important - Can be reviewed on its own, shown first, kept at a higher retention
 * @property {string[]} extras - Tokens this version does not know, kept as they are when written
 */
export interface CardMarkers {
    suspended: boolean;
    important: boolean;
    extras: string[];
}

export const SUSPENDED_TOKEN = "susp";
export const IMPORTANT_TOKEN = "imp";

// The fields of a schedule before any markers: FSRS has the prefix and nine values, SM-2 three
const FSRS_FIELDS = 10;
const SM2_FIELDS = 3;

export function emptyCardMarkers(): CardMarkers {
    return { suspended: false, important: false, extras: [] };
}

/** Whether the markers need to be written to the note. */
export function hasCardMarkers(markers: CardMarkers): boolean {
    return markers.suspended || markers.important || markers.extras.length > 0;
}

/**
 * Reads the markers of one schedule segment (the text between two `!` of the comment).
 */
export function parseSegmentMarkers(segment: string): CardMarkers {
    const markers = emptyCardMarkers();
    const fields: string[] = segment.trim().split(",");
    const fixed: number = fields[0] === "fsrs" ? FSRS_FIELDS : SM2_FIELDS;
    for (const token of fields.slice(fixed).map((f) => f.trim())) {
        if (token === "") continue;
        if (token === SUSPENDED_TOKEN) markers.suspended = true;
        else if (token === IMPORTANT_TOKEN) markers.important = true;
        else markers.extras.push(token);
    }
    return markers;
}

/**
 * Reads the markers of every card from a question's text, in card order; an empty list when the
 * text has no schedule comment.
 */
export function parseCardMarkers(questionText: string): CardMarkers[] {
    const comment: string | undefined = questionText.match(/<!--SR:(.+?)-->/m)?.[1];
    if (!comment) return [];
    return comment
        .split("!")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
        .map(parseSegmentMarkers);
}

/**
 * The markers as they follow a schedule segment, e.g. `,imp,susp`; empty when there are none.
 */
export function formatCardMarkers(markers: CardMarkers): string {
    const tokens: string[] = [];
    if (markers.important) tokens.push(IMPORTANT_TOKEN);
    if (markers.suspended) tokens.push(SUSPENDED_TOKEN);
    tokens.push(...markers.extras);
    return tokens.map((token) => "," + token).join("");
}
