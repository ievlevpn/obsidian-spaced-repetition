import "src/ui/obsidian-ui-components/content-container/deck-container/deck-list.css";
import { Platform, setIcon } from "obsidian";

import { Deck } from "src/data/data-structures/deck/deck";
import { SRSettings } from "src/data/settings";
import { t } from "src/lang/helpers";
import { DeckStats, IFlashcardReviewSequencer } from "src/scheduling/flashcard-review-sequencer";
import {
    attachContextMenu,
    DeckReviewOptions,
    showCardOrderMenu,
} from "src/ui/obsidian-ui-components/content-container/deck-container/card-order-menu";

/** The decks' "type answers" default, read and set from a deck's menu. */
export interface DeckTypingAccess {
    isOn(deck: Deck): boolean;
    set(deck: Deck, on: boolean): Promise<void>;
}

// What the keyboard needs of a deck's row
interface RowControl {
    deck: Deck;
    clickable: boolean;
    hasSubdecks: () => boolean;
    isCollapsed: () => boolean;
    setCollapsed: (collapsed: boolean) => void;
    openMenu: () => void;
}

export default class DeckListComponent {
    private rowControls = new WeakMap<HTMLElement, RowControl>();
    // The deck whose row has the keyboard focus, kept across redraws by its path
    private selectedPath: string | null = null;
    private deckTyping: DeckTypingAccess;

    private scrollWrapper: HTMLDivElement;
    private content: HTMLDivElement;
    private treeContainer: HTMLDivElement;

    private treeHeaderRow: HTMLDivElement;
    private treeHeaderRowSelf: HTMLDivElement;
    private treeHeaderRowInner: HTMLDivElement;
    private treeHeaderRowText: HTMLDivElement;
    private treeHeaderRowTextSpan: HTMLSpanElement;
    private treeHeaderRowNumbersWrapper: HTMLDivElement;

    private dueCardsText: HTMLDivElement;
    private newCardsText: HTMLDivElement;
    private reviewedCardsText: HTMLDivElement;
    private totalCardsText: HTMLDivElement;

    private startReviewOfDeck: (deck: Deck, options?: DeckReviewOptions) => void;
    // The settings' card order, ticked in a deck's menu of orders
    private defaultCardOrder: string = "";

    public constructor(
        parentEl: HTMLElement,
        startReviewOfDeck: (deck: Deck, options?: DeckReviewOptions) => void,
        deckTyping: DeckTypingAccess,
    ) {
        this.startReviewOfDeck = startReviewOfDeck;
        this.deckTyping = deckTyping;
        // Prep main container
        this.scrollWrapper = parentEl.createDiv();
        this.scrollWrapper.addClass("sr-scroll-wrapper");

        this.content = this.scrollWrapper.createDiv();
        this.content.addClass("sr-content");

        // Prep header row
        this.treeHeaderRow = this.content.createDiv();
        this.treeHeaderRow.addClass("sr-tree-row");
        this.treeHeaderRow.addClass("sr-header-row");
        this.treeHeaderRow.addClass("tree-item");
        this.treeHeaderRow.addClass("sr-tree-item-container");

        this.treeHeaderRowSelf = this.treeHeaderRow.createDiv();
        this.treeHeaderRowSelf.addClass("tree-item-self");
        this.treeHeaderRowSelf.addClass("sr-tree-item-row");

        this.treeHeaderRowInner = this.treeHeaderRowSelf.createDiv("tree-item-inner");
        this.treeHeaderRowText = this.treeHeaderRowInner.createDiv("tag-pane-tag-text");
        this.treeHeaderRowTextSpan = this.treeHeaderRowText.createSpan("tag-pane-tag-self");
        this.treeHeaderRowTextSpan.addClass("sr-tree-row-text");
        this.treeHeaderRowTextSpan.setText("Title"); // TODO: i18n

        this.treeHeaderRowNumbersWrapper = this.treeHeaderRowSelf.createDiv();
        this.treeHeaderRowNumbersWrapper.addClasses([
            "tree-item-flair-outer",
            "sr-tree-stats-container",
        ]);
        this.treeHeaderRowNumbersWrapper.addClass("sr-tree-row-numbers-wrapper");
        this.treeHeaderRowNumbersWrapper.addClass("sr-tree-stats-container");

        this.dueCardsText = this.treeHeaderRowNumbersWrapper.createDiv();
        this.dueCardsText.addClass("sr-tree-numbers-text");
        this.dueCardsText.addClasses([
            "tag-pane-tag-count",
            "tree-item-flair",
            "sr-tree-stats-count",
            "sr-fg-green",
        ]);
        this.dueCardsText.setText(t("DUE"));

        this.newCardsText = this.treeHeaderRowNumbersWrapper.createDiv();
        this.newCardsText.addClass("sr-tree-numbers-text");
        this.newCardsText.addClasses([
            "tag-pane-tag-count",
            "tree-item-flair",
            "sr-tree-stats-count",
            "sr-fg-blue",
        ]);
        this.newCardsText.setText(t("NEW"));

        this.reviewedCardsText = this.treeHeaderRowNumbersWrapper.createDiv();
        this.reviewedCardsText.addClass("sr-tree-numbers-text");
        this.reviewedCardsText.addClasses([
            "tag-pane-tag-count",
            "tree-item-flair",
            "sr-tree-stats-count",
            "sr-fg-yellow",
        ]);
        this.reviewedCardsText.setText(t("SEEN"));

        this.totalCardsText = this.treeHeaderRowNumbersWrapper.createDiv();
        this.totalCardsText.addClass("sr-tree-numbers-text");
        this.totalCardsText.addClasses([
            "tag-pane-tag-count",
            "tree-item-flair",
            "sr-tree-stats-count",
            "sr-fg-red",
        ]);
        this.totalCardsText.setText(t("TOTAL"));

        // Prep tree container
        this.treeContainer = this.content.createDiv("sr-tree-container");
        this.treeContainer.addEventListener("keydown", this.keydown);
        this.treeContainer.addEventListener("focusin", (e: FocusEvent) => {
            const control: RowControl | undefined = this.rowControls.get(e.target as HTMLElement);
            if (control) this.selectedPath = control.deck.getTopicPath().path.join("/");
        });
    }

    // The rows that can be reached: decks not inside a collapsed deck
    private visibleRows(): HTMLElement[] {
        return Array.from(
            this.treeContainer.querySelectorAll<HTMLElement>(".sr-tree-item-row"),
        ).filter((row) => row.offsetParent !== null && this.rowControls.has(row));
    }

    /**
     * Puts the keyboard focus on the deck that had it (or the first), so the list can be used
     * from the keyboard. Not on a touch screen, where it would only draw a focus ring.
     */
    public focusSelectedRow(): void {
        if (Platform.isMobile) return;
        const rows: HTMLElement[] = this.visibleRows();
        const row: HTMLElement | undefined =
            rows.find(
                (r) =>
                    this.rowControls.get(r)?.deck.getTopicPath().path.join("/") ===
                    this.selectedPath,
            ) ?? rows[0];
        row?.focus({ preventScroll: false });
    }

    // Up/Down move, Right/Left open or close subdecks (or go into/out of them), Enter or Space
    // reviews, M or the menu key opens the deck's menu
    private keydown = (e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const row: HTMLElement | null = (e.target as HTMLElement).closest(".sr-tree-item-row");
        const control: RowControl | undefined = row ? this.rowControls.get(row) : undefined;
        // A row keeps the focus while the list is hidden for a review: the review's keys then
        // are not the list's
        if (!row || !control || row.offsetParent === null) return;
        const rows: HTMLElement[] = this.visibleRows();
        const at: number = rows.indexOf(row);
        const move = (to: HTMLElement | undefined) => to?.focus();
        let handled = true;
        switch (e.key) {
            case "ArrowDown":
                move(rows[at + 1]);
                break;
            case "ArrowUp":
                move(rows[at - 1]);
                break;
            case "Home":
                move(rows[0]);
                break;
            case "End":
                move(rows[rows.length - 1]);
                break;
            case "ArrowRight":
                if (!control.hasSubdecks()) break;
                if (control.isCollapsed()) control.setCollapsed(false);
                else move(this.visibleRows()[at + 1]);
                break;
            case "ArrowLeft":
                if (control.hasSubdecks() && !control.isCollapsed()) control.setCollapsed(true);
                else
                    move(
                        row.parentElement
                            ?.closest(".tree-item-children")
                            ?.parentElement?.querySelector<HTMLElement>(
                                ":scope > .sr-tree-item-row",
                            ) ?? undefined,
                    );
                break;
            case "Enter":
            case " ":
                if (control.clickable) this.startReviewOfDeck(control.deck);
                break;
            case "m":
            case "M":
            case "ContextMenu":
                control.openMenu();
                break;
            case "F10":
                if (e.shiftKey) control.openMenu();
                else handled = false;
                break;
            default:
                handled = false;
        }
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    /**
     * Redraws the deck list.
     * @param startReviewOfDeck - Callback for starting the review of a deck.
     * @param settings - The settings object.
     * @param reviewSequencer - The review sequencer object.
     */
    redraw(reviewSequencer: IFlashcardReviewSequencer, settings: SRSettings) {
        this.defaultCardOrder = settings.flashcardCardOrder;
        this.treeContainer.empty();

        const originDeckStats = reviewSequencer.getDeckStats(
            reviewSequencer.originalDeckTree.getTopicPath(),
        );

        if (originDeckStats.totalCount === 0) {
            const noDecksToReviewEl = this.treeContainer.createDiv();
            noDecksToReviewEl.addClass("sr-no-decks-to-review");
            noDecksToReviewEl.setText(t("NO_DECKS_TO_REVIEW"));
            return;
        }

        // Creates the "All Decks" row
        this._crateTreeRow(
            "All Decks",
            originDeckStats,
            0,
            this.treeContainer,
            false,
            reviewSequencer.originalDeckTree,
            this.startReviewOfDeck,
        );

        for (const subdeck of reviewSequencer.originalDeckTree.subdecks) {
            // Create the tree row for each deck
            this._createTree(
                subdeck,
                this.treeContainer,
                reviewSequencer,
                settings,
                this.startReviewOfDeck,
            );
        }
    }

    private _createTree(
        deck: Deck,
        parentEl: HTMLDivElement,
        reviewSequencer: IFlashcardReviewSequencer,
        settings: SRSettings,
        startReviewOfDeck: (deck: Deck, options?: DeckReviewOptions) => void,
    ) {
        const deckStats = reviewSequencer.getDeckStats(deck.getTopicPath());

        // Create the tree row for the deck
        const treeRowChildren = this._crateTreeRow(
            deck.deckName,
            deckStats,
            deck.subdecks.length,
            parentEl,
            settings.initiallyExpandAllSubdecksInTree,
            deck,
            startReviewOfDeck,
        );

        for (const subdeck of deck.subdecks) {
            // Create the tree row for each subdeck
            this._createTree(
                subdeck,
                treeRowChildren,
                reviewSequencer,
                settings,
                startReviewOfDeck,
            );
        }
    }

    private _crateTreeRow(
        deckName: string,
        deckStats: DeckStats,
        numOfSubdecks: number,
        parentEl: HTMLDivElement,
        initiallyExpanded: boolean = false,
        deck: Deck | null = null,
        startReviewOfDeck: (deck: Deck, options?: DeckReviewOptions) => void = () => {},
    ): HTMLDivElement {
        const disableInteraction = deck === null;
        const treeRow = parentEl.createDiv();
        treeRow.addClass("sr-tree-row");
        treeRow.addClass("tree-item");
        treeRow.addClass("sr-tree-item-container");

        const treeRowSelf = treeRow.createDiv();
        treeRowSelf.addClass("tree-item-self");
        if (!disableInteraction) {
            treeRowSelf.addClass("tag-pane-tag");
        }
        treeRowSelf.addClass("sr-tree-item-row");

        let collapsed = !initiallyExpanded;
        const collapseIconEl = treeRowSelf.createDiv("tree-item-icon collapse-icon");
        setIcon(collapseIconEl, "chevron-down");
        if (collapsed) collapseIconEl.addClass("is-collapsed");
        if (numOfSubdecks === 0) collapseIconEl.setCssProps({ display: "none" });

        const treeRowInner: HTMLElement = treeRowSelf.createDiv("tree-item-inner");
        const treeRowInnerText: HTMLElement = treeRowInner.createDiv("tag-pane-tag-text");
        const treeRowInnerTextSpan: HTMLElement = treeRowInnerText.createSpan("tag-pane-tag-self");
        treeRowInnerTextSpan.setText(deckName);

        const treeRowOuter: HTMLDivElement = treeRowSelf.createDiv();
        treeRowOuter.addClasses(["tree-item-flair-outer", "sr-tree-stats-container"]);

        const treeRowChildren: HTMLDivElement = treeRow.createDiv("tree-item-children");
        treeRowChildren.setCssProps({ display: collapsed ? "none" : "block" });

        if (disableInteraction || (deckStats.dueCount === 0 && deckStats.newCount === 0)) {
            if (!disableInteraction) {
                treeRowSelf.addClass("is-disabled");
            }
        } else {
            treeRowSelf.addClass("is-clickable");
            collapseIconEl.addEventListener("click", (e) => {
                if (collapsed) {
                    collapseIconEl.removeClass("is-collapsed");
                    treeRowChildren.setCssProps({ display: "block" });
                } else {
                    collapseIconEl.addClass("is-collapsed");
                    treeRowChildren.setCssProps({ display: "none" });
                }

                // We stop the propagation of the event so that the click event for treeRowSelf doesn't get called
                // if the user clicks on the collapse icon
                e.stopPropagation();
                collapsed = !collapsed;
            });
        }

        // Add the click handler to treeRowSelf instead of treeRowInner so that it activates
        // over the entire rectangle of the tree item, not just the text of the topic name
        // https://github.com/st3v3nmw/obsidian-spaced-repetition/issues/709

        if (!disableInteraction) {
            treeRowSelf.addEventListener("click", () => {
                startReviewOfDeck(deck);
            });
            // Right-click (long-press on a phone): review this deck in another order, or only its
            // important cards, this time only. Also on decks with nothing due: important cards can
            // be reviewed whenever. And whether its reviews start with typing answers on.
            const openMenu = (position: { x: number; y: number }) =>
                showCardOrderMenu(
                    position,
                    this.defaultCardOrder,
                    (options) => startReviewOfDeck(deck, options),
                    {
                        on: this.deckTyping.isOn(deck),
                        set: (on: boolean) => void this.deckTyping.set(deck, on),
                    },
                );
            attachContextMenu(treeRowSelf, openMenu);

            // The keyboard: the row takes focus (from the arrow keys, not Tab)
            treeRowSelf.tabIndex = -1;
            this.rowControls.set(treeRowSelf, {
                deck,
                clickable: treeRowSelf.hasClass("is-clickable"),
                hasSubdecks: () => numOfSubdecks > 0,
                isCollapsed: () => collapsed,
                setCollapsed: (value: boolean) => {
                    collapsed = value;
                    collapseIconEl.toggleClass("is-collapsed", value);
                    treeRowChildren.setCssProps({ display: value ? "none" : "block" });
                },
                openMenu: () => {
                    const rect: DOMRect = treeRowSelf.getBoundingClientRect();
                    openMenu({ x: rect.left + 24, y: rect.bottom });
                },
            });
        }

        this._createStatsInRow(treeRowOuter, deckStats);
        return treeRowChildren;
    }

    private _createStatsInRow(parentEl: HTMLDivElement, deckStats: DeckStats) {
        parentEl.empty();

        this._createStatsContainer(t("DUE_CARDS"), deckStats.dueCount, "sr-bg-green", parentEl);
        this._createStatsContainer(t("NEW_CARDS"), deckStats.newCount, "sr-bg-blue", parentEl);
        const reviewedCards: number =
            deckStats.totalCount - deckStats.newCount - deckStats.dueCount;
        this._createStatsContainer(t("SEEN_CARDS"), reviewedCards, "sr-bg-yellow", parentEl);
        this._createStatsContainer(t("TOTAL_CARDS"), deckStats.totalCount, "sr-bg-red", parentEl);
    }

    private _createStatsContainer(
        statsLable: string,
        statsNumber: number,
        statsClass: string,
        statsWrapper: HTMLDivElement,
    ): void {
        const statsContainer = statsWrapper.createDiv();

        statsContainer.ariaLabel = statsLable;

        statsContainer.addClasses([
            "tag-pane-tag-count",
            "tree-item-flair",
            "sr-tree-stats-count",
            statsClass,
        ]);

        statsContainer.setText(statsNumber.toString());
    }
}
