import "src/ui/obsidian-ui-components/modals/confirmation-modal.css";
import { App, Modal, Notice, Setting } from "obsidian";

import { t } from "src/lang/helpers";

/**
 * A reusable confirmation modal.
 */
export class ConfirmationModal extends Modal {
    private confirm: () => Promise<void>;
    private closedCallback: (() => void) | null = null;

    /**
     * Creates a confirmation modal.
     * @param app - The Obsidian app instance.
     * @param title - Title of the modal.
     * @param description - Description text in the modal body.
     * @param confirmationMessage - Notice message to display upon confirmation.
     * @param onConfirm - Callback function to execute upon confirmation.
     */
    constructor(
        app: App,
        title: string,
        description: string,
        confirmationMessage?: string,
        onConfirm?: () => unknown,
    ) {
        super(app);

        this.setTitle(title);
        this.titleEl.addClass("sr-confirmation-modal-header");

        this.setContent(description);
        this.contentEl.addClass("sr-confirmation-modal-content");

        const confirm = async () => {
            if (confirmationMessage) {
                new Notice(confirmationMessage);
            }
            if (onConfirm) {
                await onConfirm();
            }
            this.close();
        };
        this.confirm = confirm;

        new Setting(this.contentEl)
            .setClass("sr-confirmation-modal-button-container")
            .addButton((button) =>
                button.setButtonText(t("CONFIRM")).setClass("mod-warning").onClick(confirm),
            )
            .addButton((button) =>
                button.setButtonText(t("CANCEL")).onClick(() => {
                    this.close();
                }),
            );
    }

    /**
     * Lets Enter confirm (Esc cancels, as in every modal). Only for dialogs whose action is
     * small and undoable: not the settings' bulk deletions.
     */
    public confirmWithEnter(): this {
        this.scope.register([], "Enter", () => {
            void this.confirm();
            return false;
        });
        return this;
    }

    /** Runs `callback` once the modal has closed, however it was closed. */
    public onClosed(callback: () => void): this {
        this.closedCallback = callback;
        return this;
    }

    onClose(): void {
        super.onClose();
        this.closedCallback?.();
    }
}
