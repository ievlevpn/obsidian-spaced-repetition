import { Card } from "src/data/data-structures/card/card";
import { ReviewResponse } from "src/scheduling/algorithms/base/repetition-item";
import { ProgressSegments } from "src/ui/obsidian-ui-components/content-container/card-container/toolbar/progress-bar/progress-segments";

describe("progress bar segments", () => {
    const a = new Card({ front: "A" });
    const b = new Card({ front: "B" });

    test("a card done shows its worst rating of the session", () => {
        const s = new ProgressSegments();
        s.noteRating(a, ReviewResponse.Again); // A comes back later
        s.follow(0);
        s.noteRating(b, ReviewResponse.Good);
        s.follow(1);
        s.noteRating(a, ReviewResponse.Good); // A is done now, but went badly earlier
        s.follow(2);
        expect(s.list).toEqual(["good", "again"]);
    });

    test("hard, and good or easy", () => {
        const s = new ProgressSegments();
        s.noteRating(a, ReviewResponse.Hard);
        s.follow(1);
        s.noteRating(b, ReviewResponse.Easy);
        s.follow(2);
        expect(s.list).toEqual(["hard", "good"]);
    });

    test("skips and siblings buried with a card are neutral", () => {
        const s = new ProgressSegments();
        s.noteOther(); // skipped
        s.follow(1);
        s.noteRating(a, ReviewResponse.Good); // answered, two siblings buried with it
        s.follow(4);
        expect(s.list).toEqual(["other", "good", "other", "other"]);
    });

    test("undo trims the last segment and forgets the undone rating", () => {
        const s = new ProgressSegments();
        s.noteRating(a, ReviewResponse.Again);
        s.follow(1);
        s.undoRating(a);
        s.follow(0);
        s.noteRating(a, ReviewResponse.Good);
        s.follow(1);
        expect(s.list).toEqual(["good"]);
    });

    test("runs of one colour", () => {
        const s = new ProgressSegments();
        for (const card of [a, b]) {
            s.noteRating(card, ReviewResponse.Good);
            s.follow(s.list.length + 1);
        }
        s.noteOther();
        s.follow(3);
        expect(s.runs()).toEqual([
            { segment: "good", length: 2 },
            { segment: "other", length: 1 },
        ]);
    });

    test("a new session starts empty", () => {
        const s = new ProgressSegments();
        s.noteRating(a, ReviewResponse.Again);
        s.follow(1);
        s.reset();
        s.noteRating(a, ReviewResponse.Good);
        s.follow(1);
        expect(s.list).toEqual(["good"]);
    });
});
