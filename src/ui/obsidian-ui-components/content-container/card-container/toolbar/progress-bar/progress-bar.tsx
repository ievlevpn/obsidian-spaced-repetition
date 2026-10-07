import "src/ui/obsidian-ui-components/content-container/card-container/toolbar/progress-bar/progress-bar.css";

/**
 * A thin line along the bottom of the card toolbar, filling as the session's cards are done.
 * Progress uses the same numbers as the toolbar's "12/40" counter.
 */
export default class ProgressBarComponent {
    private el: HTMLDivElement;
    private fill: HTMLDivElement;

    constructor(parentEl: HTMLElement) {
        this.el = parentEl.createDiv("sr-progress-bar");
        this.fill = this.el.createDiv("sr-progress-fill");
    }

    public update(done: number, total: number, show: boolean): void {
        this.el.toggleClass("sr-is-hidden", !show || total <= 0);
        this.el.parentElement?.toggleClass("sr-has-progress-bar", show && total > 0);
        if (!show || total <= 0) return;

        this.el.setAttr("title", `${done} / ${total}`);
        this.el.setAttr("aria-label", `${done} / ${total}`);
        this.fill.setCssProps({ width: `${(100 * Math.min(done, total)) / total}%` });
    }
}
