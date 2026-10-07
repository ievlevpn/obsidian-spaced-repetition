import "src/ui/obsidian-ui-components/content-container/card-container/card-comment/card-note-sheet.css";
import { App, ButtonComponent, Component, Modal } from "obsidian";

import { t } from "src/lang/helpers";
import type SRPlugin from "src/main";
import { createEmbeddedMarkdownEditor } from "src/ui/obsidian-ui-components/embedded-markdown-editor";
import { CardCommentEntry } from "src/utils/card-comment";
import { RenderMarkdownWrapper } from "src/utils/renderers";
import { TextDirection } from "src/utils/strings";

export interface CardNoteSheetOptions {
    // The card's notes so far, shown as a short conversation above the field
    entries: CardCommentEntry[];
    // The note being edited (its index in entries), or null for a new one
    editIndex: number | null;
    // What the field starts with: the note being edited, or an unsent draft
    text: string;
    filePath: string;
    // Called with the text when Send is pressed; the sheet then closes
    onSend: (text: string) => void;
    // Called with the text when the sheet is closed without sending, to keep it as a draft
    onDismiss: (text: string) => void;
}

/**
 * The phone's way to write a card note: a small chat-like sheet just above the keyboard, with the
 * card's notes so far as bubbles and a field with a Send button. The field is an Obsidian editor (live preview), or a plain text box if that is
 * not available.
 */
export class CardNoteSheet extends Modal {
    private plugin: SRPlugin;
    private options: CardNoteSheetOptions;
    private host: Component = new Component();
    private getText: () => string = () => "";
    private sent: boolean = false;

    constructor(app: App, plugin: SRPlugin, options: CardNoteSheetOptions) {
        super(app);
        this.plugin = plugin;
        this.options = options;
        this.modalEl.addClass("sr-note-sheet");
    }

    onOpen(): void {
        const { entries, editIndex } = this.options;
        const editing: CardCommentEntry | null = editIndex === null ? null : entries[editIndex];
        this.setTitle(
            editing === null
                ? t("CARD_NOTE_SHEET_TITLE")
                : editing.date
                  ? `${t("CARD_NOTE_EDITING")} ${editing.date}`
                  : t("CARD_NOTE_EDITING_UNDATED"),
        );

        // The conversation so far, newest at the bottom, next to the field
        if (entries.length > 0) {
            const history: HTMLDivElement = this.contentEl.createDiv("sr-note-sheet-history");
            const wrapper = new RenderMarkdownWrapper(this.app, this.plugin, this.options.filePath);
            entries.forEach((entry, index) => {
                const bubble: HTMLDivElement = history.createDiv("sr-note-sheet-bubble");
                bubble.toggleClass("is-being-edited", index === editIndex);
                if (entry.date) bubble.createDiv({ cls: "sr-note-sheet-date", text: entry.date });
                void wrapper.renderMarkdownWrapper(
                    entry.text,
                    bubble.createDiv("sr-note-sheet-text"),
                    TextDirection.Unspecified,
                );
            });
            // Show the latest notes first, once laid out
            window.requestAnimationFrame(() => (history.scrollTop = history.scrollHeight));
        }

        // The field and the Send button
        const row: HTMLDivElement = this.contentEl.createDiv("sr-note-sheet-input");
        this.host.load();
        const editor = createEmbeddedMarkdownEditor(
            this.app,
            this.host,
            row,
            "sr-note-sheet-editor",
            t("CARD_NOTE_PLACEHOLDER"),
        );
        let focus: () => void;
        let field: HTMLElement;
        if (editor) {
            editor.setFilePath(this.options.filePath);
            editor.setValue(this.options.text);
            this.getText = () => editor.getValue();
            focus = () => editor.focus();
            field = editor.el;
        } else {
            const textarea: HTMLTextAreaElement = row.createEl("textarea", {
                cls: "sr-note-sheet-textarea",
                attr: { placeholder: t("CARD_NOTE_PLACEHOLDER"), rows: "3" },
            });
            textarea.value = this.options.text;
            this.getText = () => textarea.value;
            focus = () => textarea.focus();
            field = textarea;
        }

        // An emptied note being edited is deleted, as on the desktop
        const send = new ButtonComponent(row)
            .setIcon("arrow-up")
            .setCta()
            .setTooltip(t("CARD_NOTE_SEND"))
            .onClick(() => {
                this.sent = true;
                this.options.onSend(this.getText());
                this.close();
            });
        send.buttonEl.addClass("sr-note-sheet-send");
        const update = () => send.setDisabled(editIndex === null && this.getText().trim() === "");
        field.addEventListener("input", update);
        field.addEventListener("keyup", update);
        update();

        // In the same tap that opened the sheet, so the phone raises the keyboard
        focus();
    }

    onClose(): void {
        if (!this.sent) this.options.onDismiss(this.getText());
        this.host.unload();
        this.contentEl.empty();
    }
}
