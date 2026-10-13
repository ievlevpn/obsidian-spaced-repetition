import "src/ui/obsidian-ui-components/modals/review-keys-modal.css";
import { App, Modal, Platform } from "obsidian";

import { t } from "src/lang/helpers";

const MOD: string = Platform.isMacOS ? "⌘" : "Ctrl+";

/** The keyboard shortcuts of the review, opened with "?". */
export class ReviewKeysModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass("sr-keys-modal");
        this.titleEl.setText(t("KEYS_TITLE"));
        const sections: [string, [string, string][]][] = [
            [
                t("KEYS_REVIEW"),
                [
                    ["Space / Enter", t("KEYS_SHOW_OR_GOOD")],
                    ["0–4", t("KEYS_RATE")],
                    ["Tab", t("KEYS_FOCUS_ANSWER")],
                    ["E", t("KEYS_EDIT")],
                    ["T", t("KEYS_TYPE")],
                    ["N", t("KEYS_NOTE")],
                    ["M", t("KEYS_MENU")],
                    ["S", t("KEYS_SKIP")],
                    ["U", t("KEYS_UNDO")],
                    ["I", t("KEYS_IMPORTANT")],
                    ["B", t("KEYS_BURY")],
                    ["Shift+S", t("KEYS_SUSPEND")],
                    ["R", t("KEYS_RESET")],
                    ["C", t("KEYS_INFO")],
                    ["J", t("KEYS_JUMP")],
                    [Platform.isMacOS ? "⌫" : "Backspace", t("KEYS_BACK")],
                    ["?", t("KEYS_THIS")],
                ],
            ],
            [
                t("KEYS_TEXT_BOXES"),
                [
                    [`${MOD}↵`, t("KEYS_BOX_SAVE")],
                    ["Tab / Shift+Tab", t("KEYS_BOX_FIELDS")],
                    ["Esc", t("KEYS_BOX_ESC")],
                ],
            ],
            [
                t("KEYS_DECKS"),
                [
                    ["↑ ↓", t("KEYS_DECK_MOVE")],
                    ["→ ←", t("KEYS_DECK_FOLD")],
                    ["Enter", t("KEYS_DECK_REVIEW")],
                    ["M", t("KEYS_DECK_MENU")],
                ],
            ],
        ];
        for (const [title, rows] of sections) {
            this.contentEl.createDiv({ cls: "sr-keys-section", text: title });
            const table = this.contentEl.createDiv("sr-keys-table");
            for (const [key, what] of rows) {
                table.createEl("kbd", { text: key });
                table.createSpan({ text: what });
            }
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
