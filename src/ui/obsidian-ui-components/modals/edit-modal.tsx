import "src/ui/obsidian-ui-components/modals/edit-modal.css";
import { App, ButtonComponent, Component, Modal, Scope } from "obsidian";

import { Card } from "src/data/data-structures/card/card";
import { CardType } from "src/data/data-structures/card/questions/question";
import { SRSettings } from "src/data/settings";
import { t } from "src/lang/helpers";
import { createEmbeddedMarkdownEditor } from "src/ui/obsidian-ui-components/embedded-markdown-editor";
import { TextDirection } from "src/utils/strings";

// One text field of the modal: an embedded Obsidian editor (live preview, latex-suite), or a
// plain textarea if Obsidian's editor class cannot be obtained
interface EditField {
    el: HTMLElement;
    getValue(): string;
    focus(): void;
}

// from https://github.com/chhoumann/quickadd/blob/bce0b4cdac44b867854d6233796e3406dfd163c6/src/gui/GenericInputPrompt/GenericInputPrompt.ts#L5
export class FlashcardEditModal extends Modal {
    public changedText: string;
    public waitForClose: Promise<string>;

    private fieldFront: EditField;
    private fieldBack: EditField | null = null;
    // Owns the embedded editors; unloaded when the modal closes
    private editorHost = new Component();
    private saveButton: ButtonComponent;

    private resolvePromise: ((input: string) => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private rejectPromise: ((reason?: any) => void) | null = null;
    private didSaveChanges = false;
    private readonly modalText: string;
    private textDirection: TextDirection;
    private textFront: string = "";
    private textBack: string = "";
    private separator: string | null;
    private currentCard: Card;
    private cardType: CardType;

    public static Prompt(
        app: App,
        settings: SRSettings,
        currentCard: Card,
        placeholder: string,
        textDirection: TextDirection,
    ): Promise<string> {
        const newPromptModal = new FlashcardEditModal(
            app,
            settings,
            currentCard,
            placeholder,
            textDirection,
        );
        return newPromptModal.waitForClose;
    }

    constructor(
        app: App,
        settings: SRSettings,
        currentCard: Card,
        existingText: string,
        textDirection: TextDirection,
    ) {
        super(app);

        this.modalText = existingText;
        this.changedText = existingText;
        this.textDirection = textDirection;
        this.currentCard = currentCard;

        // Select the separator used
        this.cardType = this.currentCard.question.questionType;
        this.separator = this.getSeparatorFromCardType(this.cardType, settings);

        if (this.separator !== null) {
            this.textFront = this.currentCard.question.questionText.actualQuestion.split(
                this.separator,
            )[0];
            this.textBack = this.currentCard.question.questionText.actualQuestion.split(
                this.separator,
            )[1];

            if (
                this.cardType === CardType.MultiLineBasic ||
                this.cardType === CardType.MultiLineReversed
            ) {
                this.textBack = this.textBack.trimStart();
                this.textFront = this.textFront.trimEnd();
            }
        } else {
            this.textFront = this.modalText;
            this.textBack = "";
        }

        this.waitForClose = new Promise<string>((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });

        // Init static elements in ui
        this.modalEl.addClasses(["sr-modal", "sr-edit-modal"]);

        this.contentEl.empty();
        this.contentEl.addClass("sr-edit-view");

        const title = this.contentEl.createDiv();
        title.setText(t("EDIT_CARD"));
        title.addClass("sr-title");

        // Mod+Enter saves. On the modal's scope so it wins over the vault's own Mod+Enter hotkey
        // (toggle checkbox); app hotkeys (bold, italic, ...) reach the editors through the parent.
        this.scope = new Scope(this.app.scope);
        this.scope.register([], "Escape", () => {
            this.close();
            return false;
        });
        this.scope.register(["Mod"], "Enter", () => {
            this.save();
            return false;
        });

        this.editorHost.load();
        const filePath = currentCard.question.note.filePath;
        this.fieldFront = this.createField(this.textFront, filePath);
        if (this.separator !== null) {
            this.fieldBack = this.createField(this.textBack, filePath);
        }

        const response: HTMLDivElement = this.contentEl.createDiv();
        response.addClass("sr-response");

        const saveButton = new ButtonComponent(response);
        saveButton.setClass("sr-response-button");
        saveButton.setClass("sr-save-button");
        saveButton.setClass("sr-bg-green");
        saveButton.setButtonText(t("SAVE"));
        saveButton.onClick((evt) => {
            this.saveClickCallback(evt);
        });

        this.saveButton = saveButton;

        const button = response.createEl("button");
        button.addClasses(["sr-response-button", "sr-dummy-button"]);
        button.setText("");

        const cancelButton = new ButtonComponent(response);
        cancelButton.setClass("sr-response-button");
        cancelButton.setClass("sr-cancel-button");
        cancelButton.setClass("sr-bg-red");
        cancelButton.setButtonText(t("CANCEL"));
        cancelButton.onClick((evt) => {
            this.cancelClickCallback(evt);
        });

        this.open();
    }

    /**
     * Opens the EditModal
     */
    async onOpen() {
        await super.onOpen();
        this.fieldFront.focus();
    }

    /**
     * Closes the EditModal
     */
    onClose() {
        super.onClose();
        this.resolveInput();
        this.editorHost.unload();
    }

    // -> Functions & helpers

    private createField(text: string, filePath: string): EditField {
        const editor = createEmbeddedMarkdownEditor(
            this.app,
            this.editorHost,
            this.contentEl,
            "sr-edit-editor",
            "",
        );
        let field: EditField;
        if (editor) {
            editor.setFilePath(filePath);
            editor.setValue(text);
            // Mod+Enter saves (capture: ahead of the editor's own Enter handling)
            editor.el.addEventListener(
                "keydown",
                (e: KeyboardEvent) => {
                    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    this.save();
                },
                true,
            );
            // A click on the empty part of the frame puts the cursor in the editor
            editor.el.addEventListener("click", (e: MouseEvent) => {
                if (!(e.target as HTMLElement).closest(".cm-content")) editor.focus();
            });
            // Typing fires input events (below); keyup catches edits by keys that fire none
            // (e.g. snippet expansion), and paste and cut land a tick later
            editor.el.addEventListener("keyup", this.emptyListenerCallback);
            for (const type of ["paste", "cut"]) {
                editor.el.addEventListener(type, () => setTimeout(this.emptyListenerCallback));
            }
            field = editor;
        } else {
            const textArea = this.contentEl.createEl("textarea");
            textArea.addClass("sr-input");
            textArea.value = text;
            textArea.addEventListener("keydown", this.keyListenerCallback);
            field = {
                el: textArea,
                getValue: () => textArea.value,
                focus: () => textArea.focus(),
            };
        }
        field.el.addEventListener("input", this.emptyListenerCallback);
        if (this.textDirection === TextDirection.Rtl) {
            field.el.setAttribute("dir", "rtl");
        }
        return field;
    }

    private saveClickCallback = (_: MouseEvent) => this.save();

    private cancelClickCallback = (_: MouseEvent) => this.close();

    private isAnyFieldEmpty(): boolean {
        const isBackEmpty = this.fieldBack !== null && this.fieldBack.getValue().length === 0;
        return isBackEmpty || this.fieldFront.getValue().length === 0;
    }

    private emptyListenerCallback = () => {
        this.saveButton.setDisabled(this.isAnyFieldEmpty());
    };

    // Plain-textarea fallback only: the embedded editor handles Tab itself
    private keyListenerCallback = (evt: KeyboardEvent) => {
        if (evt.key === "Tab") {
            evt.preventDefault();

            const textarea = evt.target as HTMLTextAreaElement;
            const currentCaretStartPosition = textarea.selectionStart;
            const currentCaretEndPosition = textarea.selectionEnd;
            const newEndPosition = currentCaretStartPosition + 1;

            textarea.setRangeText("\t", currentCaretStartPosition, currentCaretEndPosition);
            textarea.setSelectionRange(newEndPosition, newEndPosition);
        }

    };

    private save() {
        if (this.didSaveChanges || this.isAnyFieldEmpty()) return;
        this.didSaveChanges = true;
        const front = this.fieldFront.getValue();
        const back = this.fieldBack?.getValue() ?? "";
        this.changedText = front;
        if (this.separator) {
            // New line at end of Front
            if (
                (this.cardType === CardType.MultiLineBasic ||
                    this.cardType === CardType.MultiLineReversed) &&
                !front.endsWith("\n")
            ) {
                this.changedText += "\n";
            }
            this.changedText += this.separator;
            // New line at start of Back
            if (
                (this.cardType === CardType.MultiLineBasic ||
                    this.cardType === CardType.MultiLineReversed) &&
                !back.startsWith("\n")
            ) {
                this.changedText += "\n";
            }
            this.changedText += back;
        }
        this.close();
    }

    private resolveInput() {
        if (this.rejectPromise === null || this.resolvePromise === null) return;

        if (!this.didSaveChanges) this.rejectPromise(t("NO_INPUT"));
        else this.resolvePromise(this.changedText);
    }

    private getSeparatorFromCardType(cardType: CardType, settings: SRSettings): string | null {
        switch (cardType) {
            case CardType.SingleLineBasic:
                return settings.singleLineCardSeparator;
            case CardType.SingleLineReversed:
                return settings.singleLineReversedCardSeparator;
            case CardType.MultiLineBasic:
                return settings.multilineCardSeparator;
            case CardType.MultiLineReversed:
                return settings.multilineReversedCardSeparator;
            case CardType.Cloze:
                return null;
        }
    }
}
