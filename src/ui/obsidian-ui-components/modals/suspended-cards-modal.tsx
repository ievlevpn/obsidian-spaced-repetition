import "src/ui/obsidian-ui-components/modals/suspended-cards-modal.css";
import { App, ButtonComponent, MarkdownView, Modal, Notice } from "obsidian";

import { DataStore } from "src/data/data-store/base/data-store";
import { Card } from "src/data/data-structures/card/card";
import { t } from "src/lang/helpers";
import type SRPlugin from "src/main";
import { RenderMarkdownWrapper } from "src/utils/renderers";
import { removeCommonIndent } from "src/utils/strings";

/**
 * Every suspended card in the vault, grouped by note, each with Open and Unsuspend.
 */
export class SuspendedCardsModal extends Modal {
    private plugin: SRPlugin;
    private listEl: HTMLDivElement;
    private countEl: HTMLDivElement;
    private remaining: number = 0;

    constructor(app: App, plugin: SRPlugin) {
        super(app);
        this.plugin = plugin;
        this.modalEl.addClass("sr-suspended-modal");
        this.setTitle(t("SUSPENDED_CARDS"));
        this.countEl = this.contentEl.createDiv("sr-suspended-count");
        this.listEl = this.contentEl.createDiv("sr-suspended-list");
    }

    async onOpen(): Promise<void> {
        // A card suspended during this session is only in the list after a fresh load
        await this.plugin.dataManager.sync();
        const cards: Card[] = [...this.plugin.dataManager.osrCore.suspendedCards].sort(
            (a, b) =>
                a.question.note.filePath.localeCompare(b.question.note.filePath) ||
                a.question.lineNo - b.question.lineNo ||
                a.cardIdx - b.cardIdx,
        );
        this.remaining = cards.length;
        this.updateCount();

        let currentPath: string | null = null;
        for (const card of cards) {
            const path: string = card.question.note.filePath;
            if (path !== currentPath) {
                currentPath = path;
                this.listEl.createDiv({
                    cls: "sr-suspended-note",
                    text: card.question.note.file.tfile.basename,
                    attr: { title: path },
                });
            }
            await this.renderCard(card);
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private updateCount(): void {
        this.countEl.setText(
            this.remaining === 0
                ? t("SUSPENDED_CARDS_NONE")
                : t("SUSPENDED_CARDS_COUNT", { count: this.remaining }),
        );
    }

    private async renderCard(card: Card): Promise<void> {
        const row: HTMLDivElement = this.listEl.createDiv("sr-suspended-card");
        const preview: HTMLDivElement = row.createDiv("sr-suspended-preview");
        await new RenderMarkdownWrapper(
            this.app,
            this.plugin,
            card.question.note.filePath,
        ).renderMarkdownWrapper(
            removeCommonIndent(card.front),
            preview,
            card.question.questionText.textDirection,
        );

        const actions: HTMLDivElement = row.createDiv("sr-suspended-actions");
        new ButtonComponent(actions).setButtonText(t("OPEN")).onClick(async () => {
            this.close();
            await this.openCard(card);
        });
        new ButtonComponent(actions)
            .setButtonText(t("UNSUSPEND"))
            .setCta()
            .onClick(async () => {
                card.markers.suspended = false;
                await DataStore.getInstance().writeSchedule(card.question);
                row.remove();
                this.remaining--;
                this.updateCount();
                new Notice(t("CARD_UNSUSPENDED"));
            });
    }

    // Opens the card's note at the card's line
    private async openCard(card: Card): Promise<void> {
        const line: number = Math.max(0, card.question.lineNo ?? 0);
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.openFile(card.question.note.file.tfile, { eState: { line } });
        const view = leaf.view as MarkdownView;
        if (view?.editor) {
            view.editor.setCursor({ line, ch: 0 });
            view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
        }
    }
}
