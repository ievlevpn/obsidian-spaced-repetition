import "src/ui/obsidian-ui-components/modals/mixed-order-modal.css";
import { App, ButtonComponent, Modal, SliderComponent } from "obsidian";

import { t } from "src/lang/helpers";

/**
 * Asks for the chance of a new card before a "Due and new mixed" review: a slider from due only
 * (0, left) to new only (1, right). Resolves with the chosen chance, or null when closed without
 * starting.
 */
export class MixedOrderModal extends Modal {
    private value: number;
    private resolve: (value: number | null) => void;
    private started: boolean = false;

    private constructor(app: App, initial: number, resolve: (value: number | null) => void) {
        super(app);
        this.value = Math.min(1, Math.max(0, initial));
        this.resolve = resolve;
    }

    /**
     * @param app - The app
     * @param initial - Where the slider starts (0..1)
     * @returns The chosen chance of a new card, or null if cancelled
     */
    static ask(app: App, initial: number): Promise<number | null> {
        return new Promise((resolve) => new MixedOrderModal(app, initial, resolve).open());
    }

    onOpen(): void {
        this.modalEl.addClass("sr-mixed-modal");
        this.titleEl.setText(t("MIXED_TITLE"));
        const { contentEl } = this;
        contentEl.createDiv({ cls: "sr-mixed-desc", text: t("MIXED_DESC") });

        const valueEl = contentEl.createDiv("sr-mixed-value");
        const showValue = () => {
            const newPct = Math.round(this.value * 100);
            valueEl.setText(`P(new) = ${newPct}% · P(due) = ${100 - newPct}%`);
        };

        const row = contentEl.createDiv("sr-mixed-row");
        row.createSpan({ cls: "sr-mixed-end", text: t("MIXED_DUE_ONLY") });
        new SliderComponent(row.createDiv("sr-mixed-slider"))
            .setLimits(0, 100, 5)
            .setValue(Math.round(this.value * 100))
            .onChange((v: number) => {
                this.value = v / 100;
                showValue();
            });
        row.createSpan({ cls: "sr-mixed-end", text: t("MIXED_NEW_ONLY") });
        showValue();

        const buttons = contentEl.createDiv("modal-button-container");
        new ButtonComponent(buttons)
            .setButtonText(t("MIXED_START"))
            .setCta()
            .onClick(() => this.start());
        this.scope.register([], "Enter", () => {
            this.start();
            return false;
        });
    }

    private start(): void {
        this.started = true;
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
        this.resolve(this.started ? this.value : null);
    }
}
