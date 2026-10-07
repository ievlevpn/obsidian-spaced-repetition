import { Card } from "src/data/data-structures/card/card";
import { ReviewResponse } from "src/scheduling/algorithms/base/repetition-item";

// A finished card's segment of the progress bar: its worst rating this session, or "other" when
// it left the queue without one (skipped, suspended, or buried as a sibling of the card answered)
export type Segment = "again" | "hard" | "good" | "other";

function segmentFor(responses: ReviewResponse[]): Segment {
    if (responses.some((r) => r === ReviewResponse.Again || r === ReviewResponse.Reset)) {
        return "again";
    }
    if (responses.includes(ReviewResponse.Hard)) return "hard";
    return "good";
}

/**
 * How each finished card of a session went, one segment per card done, in the order they were
 * done. Follows the session's count of cards done, so skips, buried siblings and undo all line up.
 */
export class ProgressSegments {
    private segments: Segment[] = [];
    // The ratings each card got this session, and the segment the next card done should get
    private ratings: Map<Card, ReviewResponse[]> = new Map();
    private pending: Segment | null = null;

    get list(): readonly Segment[] {
        return this.segments;
    }

    reset(): void {
        this.segments = [];
        this.ratings.clear();
        this.pending = null;
    }

    /** A card was rated; if that finishes it, its segment shows its worst rating so far. */
    noteRating(card: Card, response: ReviewResponse): void {
        const list: ReviewResponse[] = this.ratings.get(card) ?? [];
        list.push(response);
        this.ratings.set(card, list);
        this.pending = segmentFor(list);
    }

    /** A card left the queue without a rating (skipped, suspended, deleted). */
    noteOther(): void {
        this.pending = "other";
    }

    /** The last rating of `card` was undone. */
    undoRating(card: Card | null): void {
        if (card) this.ratings.get(card)?.pop();
        this.pending = null;
    }

    /**
     * Brings the segments in line with the count of cards done: new ones for cards done since
     * the last call (the first takes the pending colour, the others are siblings that left with
     * it), and undo trims them.
     */
    follow(done: number): void {
        while (this.segments.length < done) {
            this.segments.push(this.pending ?? "other");
            this.pending = null;
        }
        if (this.segments.length > done) this.segments.length = Math.max(0, done);
    }

    /** The segments as runs of one colour each, for drawing. */
    runs(): { segment: Segment; length: number }[] {
        const result: { segment: Segment; length: number }[] = [];
        for (const segment of this.segments) {
            const last = result[result.length - 1];
            if (last?.segment === segment) last.length++;
            else result.push({ segment, length: 1 });
        }
        return result;
    }
}
