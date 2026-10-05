import "src/ui/obsidian-ui-components/content-container/card-container/card-comment/card-comment.css";
import { App, Platform } from "obsidian";

import { t } from "src/lang/helpers";
import type SRPlugin from "src/main";
import {
    createEmbeddedMarkdownEditor,
    EmbeddedMarkdownEditor,
} from "src/ui/obsidian-ui-components/content-container/card-container/card-comment/embedded-markdown-editor";
import { CardCommentEntry, parseCardCommentDefinition } from "src/utils/card-comment";
import EmulatedPlatform from "src/utils/platform-detector";
import { RenderMarkdownWrapper } from "src/utils/renderers";
import { TextDirection } from "src/utils/strings";

/** What the box holds when it is harvested: new text, or a new text for an existing entry. */
export interface CardCommentInput {
    text: string;
    // Index of the entry being edited, or null for a new entry
    editIndex: number | null;
}

// Per-device memory of whether the note box is shown (app.loadLocalStorage)
const BOX_OPEN_KEY = "sr-card-comment-box-open";

export default class CardCommentComponent {
    private app: App;
    private plugin: SRPlugin;
    private container: HTMLDivElement;
    private pastEntries: HTMLDivElement;
    // An embedded Obsidian editor (live preview, editor plugins such as latex-suite), or a plain
    // textarea when Obsidian's editor class cannot be obtained
    private editor: EmbeddedMarkdownEditor | null = null;
    private textarea: HTMLTextAreaElement | null = null;
    // Editing a past entry: which one, and the quiet "Editing note from … · Cancel" line
    private entries: CardCommentEntry[] = [];
    private editIndex: number | null = null;
    private editingLine: HTMLDivElement;
    // The box can be collapsed to a quiet "add note" link; remembered per device
    private toggleLink: HTMLAnchorElement;
    private inputEl: HTMLElement;
    private isOpen: boolean = true;

    public constructor(parentEl: HTMLElement, app: App, plugin: SRPlugin) {
        this.app = app;
        this.plugin = plugin;

        this.container = parentEl.createDiv();
        this.container.addClasses(["sr-card-comment", "sr-is-hidden"]);

        this.pastEntries = this.container.createDiv();
        this.pastEntries.addClass("sr-card-comment-past");

        // A quiet line between the past notes and the box: "Editing note from …" on the left,
        // the toggle that hides or shows the box on the right
        const bar = this.container.createDiv();
        bar.addClass("sr-card-comment-bar");
        this.editingLine = bar.createDiv();
        this.editingLine.addClasses(["sr-card-comment-editing", "sr-is-hidden"]);
        this.toggleLink = bar.createEl("a");
        this.toggleLink.addClass("sr-card-comment-toggle");
        this.toggleLink.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            this.setOpen(!this.isOpen, true);
        });

        this.editor = createEmbeddedMarkdownEditor(
            app,
            plugin,
            this.container,
            t("CARD_NOTE_PLACEHOLDER"),
        );
        this.inputEl = this.editor ? this.editor.el : this.createTextarea();
        this.setOpen(this.app.loadLocalStorage(BOX_OPEN_KEY) !== false, false);
    }

    private createTextarea(): HTMLTextAreaElement {
        const textarea = this.container.createEl("textarea");
        this.textarea = textarea;
        textarea.addClass("sr-card-comment-input");
        textarea.placeholder = t("CARD_NOTE_PLACEHOLDER");
        textarea.rows = 1;

        // Grow with content, up to the cap set in CSS, so the rating buttons are never
        // pushed off a phone screen.
        textarea.addEventListener("input", () => this._autoGrow());

        // Esc hands the review keyboard shortcuts back. The review keydown handler in
        // card-container.tsx already ignores events while a text field has focus.
        textarea.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                textarea.blur();
            }
        });
        return textarea;
    }

    /**
     * Shows or collapses the box. Collapsing keeps what was typed (it is still saved); it
     * only abandons an edit of a past note.
     */
    private setOpen(open: boolean, remember: boolean): void {
        this.isOpen = open;
        this.inputEl.toggleClass("sr-is-hidden", !open);
        this.toggleLink.setText(open ? t("CARD_NOTE_HIDE_BOX") : t("CARD_NOTE_ADD"));
        if (!open && this.editIndex !== null) {
            this.stopEditing();
            this.setInput("");
        }
        if (remember) this.app.saveLocalStorage(BOX_OPEN_KEY, open);
    }

    /** Removes the embedded editor from the plugin; call when the review view closes. */
    public destroy(): void {
        this.editor?.destroy();
        this.editor = null;
    }

    private getInput(): string {
        return this.editor ? this.editor.getValue() : (this.textarea?.value ?? "");
    }

    private setInput(value: string): void {
        if (this.editor) this.editor.setValue(value);
        else if (this.textarea) {
            this.textarea.value = value;
            this._autoGrow();
        }
    }

    /**
     * Shows the box for a card, rendering any existing entries above it.
     * Never focuses the input: on desktop that would swallow the rating shortcuts,
     * and on a phone it would raise the keyboard over the rating buttons on every card.
     */
    public async show(cardCommentDefinition: string | null, filePath: string): Promise<void> {
        this.stopEditing();
        this.setInput("");
        this.editor?.setFilePath(filePath);
        this.pastEntries.empty();
        this.entries = cardCommentDefinition
            ? parseCardCommentDefinition(cardCommentDefinition)
            : [];

        const wrapper = new RenderMarkdownWrapper(this.app, this.plugin, filePath);
        for (const [index, entry] of this.entries.entries()) {
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

            // A quiet "edit" link: loads the entry into the box below; saved like a new comment
            const editLink = row.createEl("a", { text: t("CARD_NOTE_EDIT_LINK") });
            editLink.addClass("sr-card-comment-edit");
            editLink.ariaLabel = t("CARD_NOTE_EDIT");
            editLink.addEventListener("click", (e: MouseEvent) => {
                e.preventDefault();
                this.startEditing(index);
            });
        }

        this.container.removeClass("sr-is-hidden");
    }

    public hide(): void {
        this.container.addClass("sr-is-hidden");
        this.stopEditing();
        this.setInput("");
        this.pastEntries.empty();
    }

    /**
     * Returns the box's content and clears it, so it is harvested exactly once: a new comment,
     * or the new text of the entry being edited (blank deletes that entry).
     */
    public takeInput(): CardCommentInput {
        const input: CardCommentInput = { text: this.getInput(), editIndex: this.editIndex };
        this.stopEditing();
        this.setInput("");
        return input;
    }

    private startEditing(index: number): void {
        const entry: CardCommentEntry | undefined = this.entries[index];
        if (!entry) return;
        if (!this.isOpen) this.setOpen(true, false);
        this.editIndex = index;
        this.setInput(entry.text);

        this.editingLine.empty();
        this.editingLine.createSpan({
            text: entry.date
                ? `${t("CARD_NOTE_EDITING")} ${entry.date}`
                : t("CARD_NOTE_EDITING_UNDATED"),
        });
        this.editingLine.createSpan({ text: " · " });
        const cancel = this.editingLine.createEl("a", { text: t("CANCEL") });
        cancel.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            this.stopEditing();
            this.setInput("");
        });
        this.editingLine.removeClass("sr-is-hidden");
        this.pastEntries.children[index]?.addClass("is-being-edited");

        if (this.editor) this.editor.focus();
        else this.textarea?.focus();
    }

    private stopEditing(): void {
        if (this.editIndex !== null)
            this.pastEntries.children[this.editIndex]?.removeClass("is-being-edited");
        this.editIndex = null;
        this.editingLine.addClass("sr-is-hidden");
    }

    private _autoGrow(): void {
        if (!this.textarea) return;
        const isPhone: boolean = Platform.isPhone || EmulatedPlatform().isPhone;
        const maxPx: number = isPhone ? 96 : 160;
        this.textarea.setCssProps({ height: "auto" });
        this.textarea.setCssProps({ height: `${Math.min(this.textarea.scrollHeight, maxPx)}px` });
    }
}
