import "src/ui/obsidian-ui-components/content-container/card-container/toolbar/progress-bar/progress-bar.css";

import { Card } from "src/data/data-structures/card/card";
import { ReviewResponse } from "src/scheduling/algorithms/base/repetition-item";
import { ProgressSegments } from "src/ui/obsidian-ui-components/content-container/card-container/toolbar/progress-bar/progress-segments";

/** "plain": one muted colour; "ratings": each finished card coloured by how it went; "off" */
export type ProgressBarStyle = "plain" | "ratings" | "off";

/**
 * A thin line along the bottom of the card toolbar, filling as the session's cards are done.
 * Progress uses the same numbers as the toolbar's "12/40" counter.
 */
export default class ProgressBarComponent {
    private el: HTMLDivElement;
    private fill: HTMLDivElement;
    private segments: ProgressSegments = new ProgressSegments();

    constructor(parentEl: HTMLElement) {
        this.el = parentEl.createDiv("sr-progress-bar");
        this.fill = this.el.createDiv("sr-progress-fill");
    }

    /** A new session: nothing done yet. */
    public reset(): void {
        this.segments.reset();
    }

    /** A card was rated; if that finishes it, its segment shows its worst rating so far. */
    public noteRating(card: Card, response: ReviewResponse): void {
        this.segments.noteRating(card, response);
    }

    /** A card left the queue without a rating (skipped, suspended, deleted). */
    public noteOther(): void {
        this.segments.noteOther();
    }

    /** The last rating of `card` was undone. */
    public undoRating(card: Card | null): void {
        this.segments.undoRating(card);
    }

    public update(done: number, total: number, style: ProgressBarStyle): void {
        // Kept in step even while hidden, so switching it on mid-session lines up
        this.segments.follow(done);
        this.el.toggleClass("sr-is-hidden", style === "off" || total <= 0);
        this.el.parentElement?.toggleClass("sr-has-progress-bar", style !== "off" && total > 0);
        if (style === "off" || total <= 0) return;

        this.el.setAttr("title", `${done} / ${total}`);
        this.el.setAttr("aria-label", `${done} / ${total}`);
        this.fill.setCssProps({ width: `${(100 * Math.min(done, total)) / total}%` });
        this.fill.toggleClass("is-ratings", style === "ratings");
        this.fill.empty();
        if (style !== "ratings") return;

        // Runs of the same colour as one stretch each
        for (const { segment, length } of this.segments.runs()) {
            const run = this.fill.createDiv(`sr-progress-segment is-${segment}`);
            run.setCssProps({ "flex-grow": String(length) });
        }
    }
}
