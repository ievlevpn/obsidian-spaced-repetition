import "src/ui/obsidian-ui-components/modals/edit-modal.css";
import { App, ButtonComponent, Component, Modal, Platform, Scope } from "obsidian";

import { Card } from "src/data/data-structures/card/card";
import { CardType } from "src/data/data-structures/card/questions/question";
import { SRSettings } from "src/data/settings";
import { t } from "src/lang/helpers";
import { createEmbeddedMarkdownEditor } from "src/ui/obsidian-ui-components/embedded-markdown-editor";
import { ConfirmationModal } from "src/ui/obsidian-ui-components/modals/confirmation-modal";
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

    // Created in onOpen: an editor filled while the modal is still off-screen stays blank until
    // it is focused, so the back field showed nothing
    private fieldFront: EditField | null = null;
    private fieldBack: EditField | null = null;
    private responseEl: HTMLDivElement;
    // Owns the embedded editors; unloaded when the modal closes
    private editorHost = new Component();
    private saveButton: ButtonComponent;

    private resolvePromise: ((input: string) => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private rejectPromise: ((reason?: any) => void) | null = null;
    private didSaveChanges = false;
    private didClose = false;
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
            this.cancel();
            return false;
        });
        this.scope.register(["Mod"], "Enter", () => {
            this.save();
            return false;
        });

        const response: HTMLDivElement = this.contentEl.createDiv();
        response.addClass("sr-response");
        this.responseEl = response;

        const saveButton = new ButtonComponent(response);
        saveButton.setClass("sr-response-button");
        saveButton.setClass("sr-save-button");
        saveButton.setClass("sr-bg-green");
        saveButton.setButtonText(t("SAVE"));
        saveButton.onClick((evt) => {
            this.saveClickCallback(evt);
        });

        this.saveButton = saveButton;
        // Their keys, in the corner like the rating buttons' (not on a phone)
        saveButton.buttonEl.setAttribute("data-key", Platform.isMacOS ? "⌘↵" : "Ctrl+↵");

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
        cancelButton.buttonEl.setAttribute("data-key", "Esc");

        this.open();
    }

    /**
     * Opens the EditModal
     */
    async onOpen() {
        await super.onOpen();
        this.editorHost.load();
        const filePath = this.currentCard.question.note.filePath;
        this.fieldFront = this.createField(this.textFront, filePath);
        if (this.separator !== null) {
            this.fieldBack = this.createField(this.textBack, filePath);
        }
        this.fieldFront.focus();
        // Ahead of the editors (capture, on their ancestor): Esc cancels instead of only leaving
        // the field, and Tab moves between the front and back fields
        this.contentEl.addEventListener("keydown", this.fieldKeys, true);
    }

    private fieldKeys = (e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
        if (e.key === "Escape" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            this.cancel();
        } else if (e.key === "Tab" && this.fieldBack !== null && !editorWantsTab()) {
            e.preventDefault();
            e.stopPropagation();
            const inFront: boolean =
                this.fieldFront?.el.contains(activeDocument.activeElement) ?? false;
            (inFront ? this.fieldBack : this.fieldFront)?.focus();
        }
    };

    // Whether a field differs from what the modal opened with
    private isChanged(): boolean {
        return (
            (this.fieldFront?.getValue() ?? this.textFront) !== this.textFront ||
            (this.fieldBack?.getValue() ?? this.textBack) !== this.textBack
        );
    }

    // Esc or Cancel: closes, asking first when something was changed (Enter discards)
    private cancel(): void {
        if (!this.isChanged()) {
            this.close();
            return;
        }
        const field: HTMLElement | null = activeDocument.activeElement as HTMLElement | null;
        new ConfirmationModal(
            this.app,
            t("EDIT_DISCARD_TITLE"),
            t("EDIT_DISCARD_DESC"),
            undefined,
            () => this.close(),
        )
            .confirmWithEnter()
            .onClosed(() => {
                if (this.didClose) return;
                field?.focus();
            })
            .open();
    }

    /**
     * Closes the EditModal
     */
    onClose() {
        this.didClose = true;
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
        // Above the Save / Cancel buttons
        this.contentEl.insertBefore(field.el, this.responseEl);
        return field;
    }

    private saveClickCallback = (_: MouseEvent) => this.save();

    private cancelClickCallback = (_: MouseEvent) => this.cancel();

    private isAnyFieldEmpty(): boolean {
        const isBackEmpty = this.fieldBack !== null && this.fieldBack.getValue().length === 0;
        return isBackEmpty || (this.fieldFront?.getValue() ?? "").length === 0;
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
        const front = this.fieldFront?.getValue() ?? "";
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

/**
 * Whether Tab belongs to the editor where the cursor is: on a list line (indent) or inside
 * math (Latex Suite's tabstops). Anywhere else it moves to the other field.
 */
function editorWantsTab(): boolean {
    const selection: Selection | null = activeDocument.getSelection();
    const node: Node | null = selection?.anchorNode ?? null;
    const element: HTMLElement | null | undefined =
        node instanceof HTMLElement ? node : node?.parentElement;
    const line: HTMLElement | null | undefined = element?.closest(".cm-line");
    const content: HTMLElement | null | undefined = element?.closest(".cm-content");
    if (!line || !content || !selection || selection.rangeCount === 0) return false;
    if (/^\s*([-*+]|\d+[.)])\s/.test(line.textContent ?? "")) return true;
    // Math shown as source is the math being edited (the rest is rendered, without its
    // dollars): an odd count of $$, or of $ on this line, before the cursor means inside it
    const upTo = (from: Node): string => {
        const range: Range = activeDocument.createRange();
        range.setStart(from, 0);
        range.setEnd(selection.anchorNode, selection.anchorOffset);
        return range.toString().replace(/\\\$/g, "");
    };
    const blocks: number = (upTo(content).match(/\$\$/g) ?? []).length;
    if (blocks % 2 === 1) return true;
    const inline: number = (upTo(line).replace(/\$\$/g, "").match(/\$/g) ?? []).length;
    return inline % 2 === 1;
}
