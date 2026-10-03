import "src/ui/obsidian-ui-components/content-container/card-container/card-comment/card-comment.css";
import { App, Platform } from "obsidian";

import { t } from "src/lang/helpers";
import type SRPlugin from "src/main";
import { parseCardCommentDefinition } from "src/utils/card-comment";
import EmulatedPlatform from "src/utils/platform-detector";
import { RenderMarkdownWrapper } from "src/utils/renderers";
import { TextDirection } from "src/utils/strings";

export default class CardCommentComponent {
    private app: App;
    private plugin: SRPlugin;
    private container: HTMLDivElement;
    private pastEntries: HTMLDivElement;
    private textarea: HTMLTextAreaElement;

    public constructor(parentEl: HTMLElement, app: App, plugin: SRPlugin) {
        this.app = app;
        this.plugin = plugin;

        this.container = parentEl.createDiv();
        this.container.addClasses(["sr-card-comment", "sr-is-hidden"]);

        this.pastEntries = this.container.createDiv();
        this.pastEntries.addClass("sr-card-comment-past");

        this.textarea = this.container.createEl("textarea");
        this.textarea.addClass("sr-card-comment-input");
        this.textarea.placeholder = t("CARD_NOTE_PLACEHOLDER");
        this.textarea.rows = 1;

        // Grow with content, up to the cap set in CSS, so the rating buttons are never
        // pushed off a phone screen.
        this.textarea.addEventListener("input", () => this._autoGrow());

        // Esc hands the review keyboard shortcuts back. The review keydown handler in
        // card-container.tsx already ignores events while a TEXTAREA has focus.
        this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                this.textarea.blur();
            }
        });
    }

    /**
     * Shows the box for a card, rendering any existing entries above it.
     * Never focuses the textarea: on desktop that would swallow the rating shortcuts,
     * and on a phone it would raise the keyboard over the rating buttons on every card.
     */
    public async show(cardCommentDefinition: string | null, filePath: string): Promise<void> {
        this.textarea.value = "";
        this._autoGrow();
        this.pastEntries.empty();

        if (cardCommentDefinition) {
            const entries = parseCardCommentDefinition(cardCommentDefinition);
            const wrapper = new RenderMarkdownWrapper(this.app, this.plugin, filePath);
            for (const entry of entries) {
                const row = this.pastEntries.createDiv();
                row.addClass("sr-card-comment-entry");
                if (entry.date) {
                    const dateEl = row.createSpan();
                    dateEl.addClass("sr-card-comment-date");
                    dateEl.setText(entry.date);
                }
                const body = row.createDiv();
                body.addClass("sr-card-comment-text");
                await wrapper.renderMarkdownWrapper(entry.text, body, TextDirection.Unspecified);
            }
        }

        this.container.removeClass("sr-is-hidden");
    }

    public hide(): void {
        this.container.addClass("sr-is-hidden");
        this.textarea.value = "";
        this.pastEntries.empty();
    }

    /** Returns the typed text and clears the box, so it is harvested exactly once. */
    public takeText(): string {
        const text: string = this.textarea.value;
        this.textarea.value = "";
        this._autoGrow();
        return text;
    }

    private _autoGrow(): void {
        const isPhone: boolean = Platform.isPhone || EmulatedPlatform().isPhone;
        const maxPx: number = isPhone ? 96 : 160;
        this.textarea.setCssProps({ height: "auto" });
        this.textarea.setCssProps({ height: `${Math.min(this.textarea.scrollHeight, maxPx)}px` });
    }
}
