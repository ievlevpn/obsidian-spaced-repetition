import { Menu } from "obsidian";

import { t } from "src/lang/helpers";
import MenuButtonComponent from "src/ui/obsidian-ui-components/content-container/menu-button";

/** The card menu's "Type answers" switch: on for the current session only. */
export interface TypeAnswersToggle {
    get(): boolean;
    set(on: boolean): void;
}

/** The card menu's "Important" and "Suspend card" items. */
export interface CardMarkerActions {
    isImportant(): boolean;
    toggleImportant(): void;
    suspend(): void;
}

export default class CardMenuButtonComponent extends MenuButtonComponent {
    private isResetButtonDisabled: boolean;
    public typeAnswersToggle: TypeAnswersToggle | null = null;
    public markerActions: CardMarkerActions | null = null;
    public constructor(
        container: HTMLElement,
        isExtended: boolean,
        showDeleteButton: boolean,
        isModal: boolean,
        isResetButtonDisabled: boolean,
        deleteCurrentCard: () => void,
        editClickHandler: () => void,
        jumpToCurrentCard: () => Promise<void>,
        displayCurrentCardInfoNotice: () => void,
        skipCurrentCard: () => void,
        onOpenResetModalClick: () => void,
        closeModal?: () => void,
        classNames?: string[],
    ) {
        super(
            container,
            (evt: MouseEvent) => {
                const cardMenu = new Menu();

                this.buildMenu(
                    cardMenu,
                    showDeleteButton,
                    isModal,
                    isExtended,
                    editClickHandler,
                    onOpenResetModalClick,
                    skipCurrentCard,
                    jumpToCurrentCard,
                    displayCurrentCardInfoNotice,
                    deleteCurrentCard,
                    closeModal,
                );

                cardMenu.showAtMouseEvent(evt);
            },
            classNames,
        );
        this.isResetButtonDisabled = isResetButtonDisabled;
    }

    public setResetButtonDisabled(disabled: boolean) {
        this.isResetButtonDisabled = disabled;
    }

    private buildMenu(
        cardMenu: Menu,
        showDeleteButton: boolean,
        isModal: boolean,
        isExtended: boolean,
        editClickHandler: () => void,
        onOpenResetModalClick: () => void,
        skipCurrentCard: () => void,
        jumpToCurrentCard: () => Promise<void>,
        displayCurrentCardInfoNotice: () => void,
        deleteCurrentCard: () => void,
        closeModal?: () => void,
    ) {
        if (isExtended) {
            cardMenu.addItem((item) => {
                item.setTitle(t("EDIT_CARD"))
                    .setIcon("pencil")
                    .onClick(() => {
                        editClickHandler();
                    });
            });
            cardMenu.addItem((item) => {
                item.setTitle(t("RESET_CARD_PROGRESS"))
                    .setIcon("reset")
                    .onClick(() => {
                        onOpenResetModalClick();
                    })
                    .setDisabled(this.isResetButtonDisabled);
            });
            cardMenu.addItem((item) => {
                item.setTitle(t("SKIP"))
                    .setIcon("chevrons-right")
                    .onClick(() => {
                        skipCurrentCard();
                    });
            });
        }

        if (isModal) {
            cardMenu.addItem((item) => {
                item.setTitle(t("OPEN_IN_BACKGROUND"))
                    .setIcon("send-to-back")
                    .onClick(async () => {
                        // Doesn't close modal, just opens in background and focuses
                        await jumpToCurrentCard();
                    });
            });
            cardMenu.addItem((item) => {
                item.setTitle(t("JUMP_TO_AND_CLOSE"))
                    .setIcon("arrow-up-right")
                    .onClick(async () => {
                        await jumpToCurrentCard();
                        if (closeModal) {
                            closeModal();
                        }
                    });
            });
        } else {
            cardMenu.addItem((item) => {
                item.setTitle(t("JUMP_TO"))
                    .setIcon("arrow-up-right")
                    .onClick(async () => {
                        await jumpToCurrentCard();
                    });
            });
        }
        const actions = this.markerActions;
        if (actions !== null) {
            cardMenu.addItem((item) => {
                item.setTitle(t("IMPORTANT_CARD"))
                    .setIcon("star")
                    .setChecked(actions.isImportant())
                    .onClick(() => actions.toggleImportant());
            });
            cardMenu.addItem((item) => {
                item.setTitle(t("SUSPEND_CARD"))
                    .setIcon("pause-circle")
                    .onClick(() => actions.suspend());
            });
        }
        const toggle = this.typeAnswersToggle;
        if (toggle !== null) {
            cardMenu.addItem((item) => {
                item.setTitle(t("TYPE_ANSWERS"))
                    .setIcon("keyboard")
                    .setChecked(toggle.get())
                    .onClick(() => toggle.set(!toggle.get()));
            });
        }
        cardMenu.addItem((item) => {
            item.setTitle(t("VIEW_CARD_INFO"))
                .setIcon("info")
                .onClick(() => {
                    displayCurrentCardInfoNotice();
                });
        });
        if (showDeleteButton) {
            cardMenu.addItem((item) => {
                item.setTitle(t("DELETE_CARD"))
                    .setIcon("trash")
                    .onClick(() => {
                        deleteCurrentCard();
                    });
            });
        }
    }
}
