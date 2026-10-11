import "src/ui/obsidian-ui-components/content-container/card-container/pull-feedback/pull-feedback.css";
import { setIcon } from "obsidian";

// How long the card takes to spring back once released. Keep in sync with pull-feedback.css.
const SPRING_BACK_MS = 200;

const STATE_CLASSES = ["sr-pull-dragging", "sr-pull-back"];

/**
 * Visual feedback for a pull down: the card content follows the finger down, and an indicator
 * above it shows what releasing will do, turning to its accent colour once it would. The offset
 * is a CSS variable (--sr-pull-dy) on the host, the phase a class on it.
 */
export default class PullFeedbackComponent {
    private parentEl: HTMLElement;
    private indicator: HTMLDivElement;
    private iconEl: HTMLDivElement;
    private label: HTMLDivElement;
    private pendingTimeout: number | null = null;

    /**
     * @param parentEl - Holds the content and the indicator; positioned, and clips the content
     */
    constructor(parentEl: HTMLElement) {
        this.parentEl = parentEl;
        this.parentEl.addClass("sr-pull-host");
        this.indicator = parentEl.createDiv("sr-pull-indicator");
        this.iconEl = this.indicator.createDiv("sr-pull-indicator-icon");
        this.label = this.indicator.createDiv("sr-pull-indicator-label");
    }

    /**
     * Follow the finger.
     *
     * @param offset - How far the content follows (px)
     * @param armed - Whether releasing now would run the action
     * @param icon - The action's icon
     * @param label - The action's name
     */
    move(offset: number, armed: boolean, icon: string, label: string): void {
        this.clearPending();
        this.setState("sr-pull-dragging");
        this.parentEl.setCssProps({ "--sr-pull-dy": `${offset}px` });
        if (this.iconEl.dataset.icon !== icon) {
            this.iconEl.empty();
            setIcon(this.iconEl, icon);
            this.iconEl.dataset.icon = icon;
        }
        this.label.setText(label);
        this.indicator.toggleClass("is-armed", armed);
    }

    /**
     * The finger was lifted: the card springs back, and a committed pull runs `onCommit`.
     *
     * @param committed - Whether the pull commits
     * @param onCommit - The action
     */
    release(committed: boolean, onCommit: () => void): void {
        this.clearPending();
        this.setState("sr-pull-back");
        this.parentEl.setCssProps({ "--sr-pull-dy": "0px" });
        if (committed) onCommit();
        this.pendingTimeout = window.setTimeout(() => this.reset(), SPRING_BACK_MS);
    }

    /**
     * Put the content and the indicator back to rest, without animation.
     */
    reset(): void {
        this.clearPending();
        this.setState(null);
        this.parentEl.setCssProps({ "--sr-pull-dy": "0px" });
        this.indicator.removeClass("is-armed");
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
