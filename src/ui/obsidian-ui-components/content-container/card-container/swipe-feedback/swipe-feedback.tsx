import "src/ui/obsidian-ui-components/content-container/card-container/swipe-feedback/swipe-feedback.css";
import { setIcon } from "obsidian";

import { t } from "src/lang/helpers";
import { MIN_DISTANCE } from "src/utils/edge-swipe";

// How long the card takes to slide out after a committed swipe, and to spring back otherwise.
// Keep in sync with the transitions in swipe-feedback.css.
const SLIDE_OUT_MS = 150;
const SPRING_BACK_MS = 200;

const STATE_CLASSES = ["sr-swipe-dragging", "sr-swipe-out", "sr-swipe-back"];

/**
 * Visual feedback for the swipe-to-skip gesture: the card content follows the finger, and a Skip
 * indicator slides in from the right edge, turning to its "release to skip" state once the swipe
 * would commit. Positions are CSS variables (--sr-swipe-dx, --sr-swipe-progress) on the parent;
 * the phases are classes on it.
 */
export default class SwipeFeedbackComponent {
    private parentEl: HTMLElement;
    private indicator: HTMLDivElement;
    private label: HTMLDivElement;
    private pendingTimeout: number | null = null;

    /**
     * @param parentEl - Holds the content and the indicator; positioned, and clips the content
     */
    constructor(parentEl: HTMLElement) {
        this.parentEl = parentEl;
        this.parentEl.addClass("sr-swipe-host");
        this.indicator = parentEl.createDiv({ cls: "sr-swipe-indicator" });
        setIcon(this.indicator.createDiv({ cls: "sr-swipe-indicator-icon" }), "skip-forward");
        this.label = this.indicator.createDiv({ cls: "sr-swipe-indicator-label", text: t("SKIP") });
    }

    /**
     * Follow the finger.
     *
     * @param dx - Horizontal offset of the swipe (<= 0)
     * @param armed - Whether releasing now would skip
     */
    move(dx: number, armed: boolean): void {
        this.clearPending();
        this.setState("sr-swipe-dragging");
        this.parentEl.setCssProps({
            "--sr-swipe-dx": `${dx}px`,
            "--sr-swipe-progress": String(Math.min(1, -dx / MIN_DISTANCE)),
        });
        this.indicator.toggleClass("is-armed", armed);
        this.label.setText(armed ? t("SWIPE_RELEASE_TO_SKIP") : t("SKIP"));
    }

    /**
     * The finger was lifted. A committed swipe slides the card out, then calls `onSkip`; otherwise
     * the card springs back.
     *
     * @param committed - Whether the swipe skips
     * @param onSkip - Skips the card
     */
    release(committed: boolean, onSkip: () => void): void {
        this.clearPending();
        if (!committed) {
            this.setState("sr-swipe-back");
            this.pendingTimeout = window.setTimeout(() => this.reset(), SPRING_BACK_MS);
            return;
        }
        this.setState("sr-swipe-out");
        this.pendingTimeout = window.setTimeout(() => {
            this.pendingTimeout = null;
            onSkip();
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
        this.label.setText(t("SKIP"));
    }

    private setState(state: string | null): void {
        this.parentEl.removeClasses(STATE_CLASSES);
        if (state) this.parentEl.addClass(state);
    }

    private clearPending(): void {
        if (this.pendingTimeout !== null) {
            window.clearTimeout(this.pendingTimeout);
            this.pendingTimeout = null;
        }
    }
}
