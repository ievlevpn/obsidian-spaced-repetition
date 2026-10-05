import "src/ui/obsidian-ui-components/content-container/card-container/swipe-feedback/swipe-feedback.css";
import { setIcon } from "obsidian";

import { EdgeSide, MIN_DISTANCE } from "src/utils/edge-swipe";

// How long the card takes to slide out after a committed swipe, and to spring back otherwise.
// Keep in sync with the transitions in swipe-feedback.css.
const SLIDE_OUT_MS = 150;
const SPRING_BACK_MS = 200;

const STATE_CLASSES = [
    "sr-swipe-dragging",
    "sr-swipe-out",
    "sr-swipe-back",
    "sr-swipe-side-left",
    "sr-swipe-side-right",
];

export interface SwipeFeedbackOptions {
    side: EdgeSide;
    icon: string;
    label: string;
    // Shown once releasing would commit
    armedLabel: string;
}

/**
 * Visual feedback for an edge swipe: the card content follows the finger, and an indicator
 * slides in from that edge, turning to its "release to …" state once the swipe would commit.
 * One host can carry a feedback for each edge: positions are CSS variables (--sr-swipe-dx,
 * --sr-swipe-progress) on the host, the phase and the active side are classes on it.
 */
export default class SwipeFeedbackComponent {
    private parentEl: HTMLElement;
    private options: SwipeFeedbackOptions;
    private indicator: HTMLDivElement;
    private label: HTMLDivElement;
    private pendingTimeout: number | null = null;

    /**
     * @param parentEl - Holds the content and the indicators; positioned, and clips the content
     * @param options - Which edge, and the indicator's icon and labels
     */
    constructor(parentEl: HTMLElement, options: SwipeFeedbackOptions) {
        this.parentEl = parentEl;
        this.options = options;
        this.parentEl.addClass("sr-swipe-host");
        this.indicator = parentEl.createDiv({ cls: ["sr-swipe-indicator", `is-${options.side}`] });
        setIcon(this.indicator.createDiv({ cls: "sr-swipe-indicator-icon" }), options.icon);
        this.label = this.indicator.createDiv({
            cls: "sr-swipe-indicator-label",
            text: options.label,
        });
    }

    /**
     * Follow the finger.
     *
     * @param dx - Offset of the swipe (<= 0 from the right edge, >= 0 from the left)
     * @param armed - Whether releasing now would commit
     */
    move(dx: number, armed: boolean): void {
        this.clearPending();
        this.setState("sr-swipe-dragging");
        this.parentEl.setCssProps({
            "--sr-swipe-dx": `${dx}px`,
            "--sr-swipe-progress": String(Math.min(1, Math.abs(dx) / MIN_DISTANCE)),
        });
        this.indicator.toggleClass("is-armed", armed);
        this.label.setText(armed ? this.options.armedLabel : this.options.label);
    }

    /**
     * The finger was lifted. A committed swipe slides the card out, then calls `onCommit`;
     * otherwise the card springs back.
     *
     * @param committed - Whether the swipe commits
     * @param onCommit - Skips the card, or goes back
     */
    release(committed: boolean, onCommit: () => void): void {
        this.clearPending();
        if (!committed) {
            this.setState("sr-swipe-back");
            this.pendingTimeout = window.setTimeout(() => this.reset(), SPRING_BACK_MS);
            return;
        }
        this.setState("sr-swipe-out");
        this.pendingTimeout = window.setTimeout(() => {
            this.pendingTimeout = null;
            onCommit();
            this.reset();
        }, SLIDE_OUT_MS);
    }

    /**
     * Put the content and the indicator back to rest, without animation.
     */
    reset(): void {
        this.clearPending();
        this.setState(null);
        this.parentEl.setCssProps({ "--sr-swipe-dx": "0px", "--sr-swipe-progress": "0" });
        this.indicator.removeClass("is-armed");
        this.label.setText(this.options.label);
    }

    private setState(state: string | null): void {
        this.parentEl.removeClasses(STATE_CLASSES);
        if (state) this.parentEl.addClasses([state, `sr-swipe-side-${this.options.side}`]);
    }

    private clearPending(): void {
        if (this.pendingTimeout !== null) {
            window.clearTimeout(this.pendingTimeout);
            this.pendingTimeout = null;
        }
    }
}
