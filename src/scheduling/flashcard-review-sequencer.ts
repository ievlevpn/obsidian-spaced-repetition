import { Notice } from "obsidian";

import { PREFERRED_DATE_FORMAT, TICKS_PER_DAY } from "src/data/constants";
import { DataStore } from "src/data/data-store/base/data-store";
import { Card } from "src/data/data-structures/card/card";
import { Question, QuestionText } from "src/data/data-structures/card/questions/question";
import { IQuestionPostponementList } from "src/data/data-structures/card/questions/question-postponement-list";
import {
    CardFrontBack,
    CardFrontBackUtil,
} from "src/data/data-structures/card/questions/question-type";
import { Deck } from "src/data/data-structures/deck/deck";
import { IDeckTreeIterator } from "src/data/data-structures/deck/deck-tree-iterator";
import { TopicPath } from "src/data/data-structures/deck/topic-path";
import { SRSettings } from "src/data/settings";
import { Note } from "src/note/note";
import { ISRAlgorithm } from "src/scheduling/algorithms/base/isr-algorithm";
import { RepItemScheduleInfo } from "src/scheduling/algorithms/base/rep-item-schedule-info";
import { RepItemState, ReviewResponse } from "src/scheduling/algorithms/base/repetition-item";
import { DueDateHistogram } from "src/scheduling/due-date-histogram";
import { globalDateProvider } from "src/utils/dates";

export interface IFlashcardReviewSequencer {
    get hasCurrentCard(): boolean;
    get hasPendingCards(): boolean;
    get hasDuePendingCards(): boolean;
    get currentCard(): Card | null;
    get currentQuestion(): Question;
    get currentNote(): Note;
    get currentDeck(): Deck | null;
    get nextPendingDueUnix(): number | null;
    get originalDeckTree(): Deck;

    setDeckTree(originalDeckTree: Deck, remainingDeckTree: Deck): void;
    setCurrentDeck(topicPath: TopicPath): void;
    refreshCurrentDeck(): void;
    getDeckStats(topicPath: TopicPath): DeckStats;
    getSubDecksWithCardsInQueue(deck: Deck): Deck[];
    skipCurrentCard(): void;
    get canUndo(): boolean;
    undo(): Promise<boolean>;
    determineCardSchedule(response: ReviewResponse, card: Card): RepItemScheduleInfo;
    processReview(response: ReviewResponse): Promise<void>;
    setPendingCardComment(text: string, editIndex?: number | null): void;
    flushPendingCardComment(): Promise<void>;
    updateCurrentQuestionTextAndCards(text: string): Promise<void>;
    deleteCurrentCardFromNote(): Promise<void>;
}

/**
 * Represents statistics for a deck and its subdecks.
 *
 * @property {number} totalCount - Total number of cards in this deck and all subdecks.
 * @property {number} dueCount - Number of due cards in this deck and all subdecks.
 * @property {number} newCount - Number of new cards in this deck and all subdecks.
 * @property {number} cardsInQueueCount - Number of cards in the queue of this deck and all subdecks.
 * @property {number} dueCardsInQueueOfThisDeckCount - Number of due cards just in this deck.
 * @property {number} newCardsInQueueOfThisDeckCount - Number of new cards just in this deck.
 * @property {number} cardsInQueueOfThisDeckCount - Total number of cards in queue just in this deck.
 * @property {number} subDecksInQueueOfThisDeckCount - Number of subdecks in the queue just in this deck.
 * @property {number} decksInQueueOfThisDeckCount - Total number of decks in the queue including this deck and its subdecks.
 *
 * @constructor
 * @param {number} totalCount - Initializes the total count of cards.
 * @param {number} dueCount - Initializes the due count of cards.
 * @param {number} newCount - Initializes the new count of cards.
 * @param {number} cardsInQueueCount - Initializes the count of cards in the queue.
 * @param {number} dueCardsInQueueOfThisDeckCount - Initializes the count of due cards just in this deck.
 * @param {number} newCardsInQueueOfThisDeckCount - Initializes the count of new cards just in this deck.
 * @param {number} cardsInQueueOfThisDeckCount - Initializes the count of all cards in the queue just in this deck.
 * @param {number} subDecksInQueueOfThisDeckCount - Initializes the count of subdecks in the queue just in this deck.
 * @param {number} decksInQueueOfThisDeckCount - Initializes the count of all decks in the queue including this deck and its subdecks.
 */
export class DeckStats {
    totalCount: number;
    dueCount: number;
    newCount: number;
    cardsInQueueCount: number;
    dueCardsInQueueOfThisDeckCount: number;
    newCardsInQueueOfThisDeckCount: number;
    cardsInQueueOfThisDeckCount: number;
    subDecksInQueueOfThisDeckCount: number;
    decksInQueueOfThisDeckCount: number;

    constructor(
        totalCount: number,
        dueCount: number,
        newCount: number,
        cardsInQueueCount: number,
        dueCardsInQueueOfThisDeckCount: number,
        newCardsInQueueOfThisDeckCount: number,
        cardsInQueueOfThisDeckCount: number,
        subDecksInQueueOfThisDeckCount: number,
        decksInQueueOfThisDeckCount: number,
    ) {
        this.dueCount = dueCount;
        this.newCount = newCount;
        this.totalCount = totalCount;
        this.cardsInQueueCount = cardsInQueueCount;
        this.dueCardsInQueueOfThisDeckCount = dueCardsInQueueOfThisDeckCount;
        this.newCardsInQueueOfThisDeckCount = newCardsInQueueOfThisDeckCount;
        this.cardsInQueueOfThisDeckCount = cardsInQueueOfThisDeckCount;
        this.subDecksInQueueOfThisDeckCount = subDecksInQueueOfThisDeckCount;
        this.decksInQueueOfThisDeckCount = decksInQueueOfThisDeckCount;
    }
}

export enum FlashcardReviewMode {
    Cram,
    Review,
}

interface PendingCard {
    card: Card;
    dueUnix: number;
}

// The review state just before a rating or skip, so it can be undone
interface UndoEntry {
    card: Card;
    scheduleInfo: RepItemScheduleInfo | null;
    // Whether the action wrote a new schedule to the note, which undo then writes back
    wroteSchedule: boolean;
    deckItems: { deck: Deck; newRepItems: Deck["newRepItems"]; dueRepItems: Deck["dueRepItems"] }[];
    pendingCards: PendingCard[];
    histogram: Map<number, number>;
    postponementList: string[];
}

// How many actions can be undone in a row
const MAX_UNDO = 50;

/**
 * Whole days until a schedule falls due, matching the key space that
 * CardDueDateHistogram.calculateFromDeckTree builds the histogram with.
 *
 * Note that this is not the same as the scheduled interval: an FSRS short-term step has an
 * interval of 0 but a real sub-day due time.
 */
function dueDateHistogramKey(schedule: RepItemScheduleInfo): number {
    const now: number = globalDateProvider.now.valueOf();
    return Math.ceil((schedule.dueDateAsUnix - now) / TICKS_PER_DAY);
}

export class FlashcardReviewSequencer implements IFlashcardReviewSequencer {
    // We need the original deck tree so that we can still provide the total cards in each deck
    private _originalDeckTree: Deck;

    // This is set by the caller, and must have the same deck hierarchy as originalDeckTree.
    private remainingDeckTree: Deck;

    private reviewMode: FlashcardReviewMode;
    private cardSequencer: IDeckTreeIterator;
    private settings: SRSettings;
    private srsAlgorithm: ISRAlgorithm;
    private questionPostponementList: IQuestionPostponementList;
    private dueDateFlashcardHistogram: DueDateHistogram;
    private pendingCards: PendingCard[] = [];
    private currentTopicPath: TopicPath = TopicPath.emptyPath;
    private pendingCardComment: string | null = null;
    // Set when the pending text replaces an existing entry of the card's comment
    private pendingCardCommentEditIndex: number | null = null;
    private undoStack: UndoEntry[] = [];

    constructor(
        reviewMode: FlashcardReviewMode,
        cardSequencer: IDeckTreeIterator,
        settings: SRSettings,
        srsAlgorithm: ISRAlgorithm,
        questionPostponementList: IQuestionPostponementList,
        dueDateFlashcardHistogram: DueDateHistogram,
    ) {
        this.reviewMode = reviewMode;
        this.cardSequencer = cardSequencer;
        this.settings = settings;
        this.srsAlgorithm = srsAlgorithm;
        this.questionPostponementList = questionPostponementList;
        this.dueDateFlashcardHistogram = dueDateFlashcardHistogram;
    }

    get hasCurrentCard(): boolean {
        return (
            this.cardSequencer.currentRepItem !== null &&
            this.cardSequencer.currentRepItem !== undefined
        );
    }

    get hasPendingCards(): boolean {
        return this.pendingCards.length > 0;
    }

    /**
     * This is deliberately a side-effect-free check. Pending cards must only be
     * moved back into the deck while advancing between cards, never while UI
     * code is merely reading queue statistics for the currently displayed card.
     */
    get hasDuePendingCards(): boolean {
        const nowUnix = globalDateProvider.now.valueOf();
        return this.pendingCards.some((pendingCard) => pendingCard.dueUnix <= nowUnix);
    }

    get currentCard(): Card | null {
        if (this.cardSequencer.currentRepItem === null) return null;

        return this.cardSequencer.currentRepItem as Card;
    }

    get currentQuestion(): Question {
        return this.currentCard?.question;
    }

    get currentDeck(): Deck | null {
        return this.cardSequencer.currentDeck;
    }

    get nextPendingDueUnix(): number | null {
        return this.pendingCards.length > 0
            ? Math.min(...this.pendingCards.map((pendingCard) => pendingCard.dueUnix))
            : null;
    }

    get currentNote(): Note {
        return this.currentQuestion.note;
    }

    // originalDeckTree isn't modified by the review process
    // Only remainingDeckTree
    setDeckTree(originalDeckTree: Deck, remainingDeckTree: Deck): void {
        this.cardSequencer.setBaseDeck(remainingDeckTree);
        this._originalDeckTree = originalDeckTree;
        this.remainingDeckTree = remainingDeckTree;
        this.pendingCards = [];
        this.undoStack = [];
        this.setCurrentDeck(TopicPath.emptyPath);
    }

    setCurrentDeck(topicPath: TopicPath): void {
        // A different deck starts a new history: undo only returns to cards of the deck in review
        if (
            !topicPath.isSameOrAncestorOf(this.currentTopicPath) ||
            !this.currentTopicPath.isSameOrAncestorOf(topicPath)
        ) {
            this.undoStack = [];
        }
        this.currentTopicPath = topicPath;
        this.wakeDuePendingCards();
        this.cardSequencer.setIteratorTopicPath(topicPath);
        this.cardSequencer.nextRepItem();
    }

    refreshCurrentDeck(): void {
        this.setCurrentDeck(this.currentTopicPath);
    }

    get originalDeckTree(): Deck {
        return this._originalDeckTree;
    }

    getDeckStats(topicPath: TopicPath): DeckStats {
        const totalCount: number = this._originalDeckTree
            .getDeck(topicPath)
            .getDistinctRepItemCount(RepItemState.AnyItem, true);
        const remainingDeck: Deck = this.remainingDeckTree.getDeck(topicPath);
        const newCount: number = remainingDeck.getDistinctRepItemCount(RepItemState.NewItem, true);
        const dueCount: number = remainingDeck.getDistinctRepItemCount(RepItemState.DueItem, true);

        // Sry for the long variable names, but I needed all these distinct counts in the UI
        const newCardsInQueueOfThisDeckCount = remainingDeck.getDistinctRepItemCount(
            RepItemState.NewItem,
            false,
        );
        const dueCardsInQueueOfThisDeckCount = remainingDeck.getDistinctRepItemCount(
            RepItemState.DueItem,
            false,
        );
        const cardsInQueueOfThisDeckCount =
            newCardsInQueueOfThisDeckCount + dueCardsInQueueOfThisDeckCount;

        const subDecksInQueueOfThisDeckCount =
            this.getSubDecksWithCardsInQueue(remainingDeck).length;
        const decksInQueueOfThisDeckCount =
            cardsInQueueOfThisDeckCount > 0
                ? subDecksInQueueOfThisDeckCount + 1
                : subDecksInQueueOfThisDeckCount;

        return new DeckStats(
            totalCount,
            dueCount,
            newCount,
            dueCount + newCount,
            dueCardsInQueueOfThisDeckCount,
            newCardsInQueueOfThisDeckCount,
            cardsInQueueOfThisDeckCount,
            subDecksInQueueOfThisDeckCount,
            decksInQueueOfThisDeckCount,
        );
    }

    getSubDecksWithCardsInQueue(deck: Deck): Deck[] {
        let subDecksWithCardsInQueue: Deck[] = [];

        deck.subdecks.forEach((subDeck) => {
            subDecksWithCardsInQueue = subDecksWithCardsInQueue.concat(
                this.getSubDecksWithCardsInQueue(subDeck),
            );

            const newCount: number = subDeck.getDistinctRepItemCount(RepItemState.NewItem, false);
            const dueCount: number = subDeck.getDistinctRepItemCount(RepItemState.DueItem, false);
            if (newCount + dueCount > 0) subDecksWithCardsInQueue.push(subDeck);
        });

        return subDecksWithCardsInQueue;
    }

    skipCurrentCard(): void {
        this.pushUndo();
        this.cardSequencer.deleteCurrentQuestionFromAllDecks();
    }

    get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    /**
     * Undoes the most recent rating or skip: the card's previous schedule is restored (and
     * written back to the note if the rating had written one), the queues are put back as they
     * were, and the card becomes the current card again.
     *
     * @returns True if something was undone
     */
    async undo(): Promise<boolean> {
        const entry: UndoEntry | undefined = this.undoStack.pop();
        if (!entry) return false;

        if (entry.wroteSchedule) {
            entry.card.scheduleInfo = entry.scheduleInfo;
            await DataStore.getInstance().writeSchedule(entry.card.question);
        }
        const postponementChanged: boolean =
            entry.postponementList.join("\n") !==
            this.questionPostponementList.snapshot().join("\n");
        if (postponementChanged) {
            this.questionPostponementList.restore(entry.postponementList);
            await this.questionPostponementList.write();
        }
        for (const { deck, newRepItems, dueRepItems } of entry.deckItems) {
            deck.newRepItems = [...newRepItems];
            deck.dueRepItems = [...dueRepItems];
        }
        this.pendingCards = [...entry.pendingCards];
        this.dueDateFlashcardHistogram.dueDatesMap = new Map(entry.histogram);

        this.cardSequencer.setIteratorTopicPath(this.currentTopicPath);
        if (!this.cardSequencer.jumpToRepItem(entry.card)) this.cardSequencer.nextRepItem();
        return true;
    }

    // Records the state before an action on the current card
    private pushUndo(): UndoEntry | null {
        const card: Card | null = this.currentCard;
        if (!card || !this.remainingDeckTree) return null;
        const deckItems: UndoEntry["deckItems"] = [];
        const collect = (deck: Deck) => {
            deckItems.push({
                deck,
                newRepItems: [...deck.newRepItems],
                dueRepItems: [...deck.dueRepItems],
            });
            deck.subdecks.forEach(collect);
        };
        collect(this.remainingDeckTree);
        const entry: UndoEntry = {
            card,
            scheduleInfo: card.scheduleInfo,
            wroteSchedule: false,
            deckItems,
            pendingCards: [...this.pendingCards],
            histogram: new Map(this.dueDateFlashcardHistogram.dueDatesMap),
            postponementList: this.questionPostponementList.snapshot(),
        };
        this.undoStack.push(entry);
        if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
        return entry;
    }

    private deleteCurrentCard(): void {
        this.cardSequencer.deleteCurrentRepItemFromAllDecks();
    }

    /**
     * Stages comment text typed during review of the current card. It is applied just before
     * the next schedule write, so a comment costs no extra file write.
     */
    setPendingCardComment(text: string, editIndex: number | null = null): void {
        if (this.reviewMode === FlashcardReviewMode.Cram) return;
        this.pendingCardComment = text;
        this.pendingCardCommentEditIndex = editIndex;
    }

    /** Applies any staged comment to the current question. Returns true if it changed. */
    private applyPendingCardComment(): boolean {
        const text: string | null = this.pendingCardComment;
        const editIndex: number | null = this.pendingCardCommentEditIndex;
        this.pendingCardComment = null;
        this.pendingCardCommentEditIndex = null;
        if (this.reviewMode === FlashcardReviewMode.Cram) return false;

        const question = this.currentQuestion;
        if (!question || text === null) return false;

        // An edit of an existing entry is written even when blank: that deletes the entry
        if (editIndex !== null) {
            question.stageCardCommentEdit(editIndex, text);
            return true;
        }
        if (text.trim().length === 0) return false;

        question.stageCardComment(text, globalDateProvider.today.format(PREFERRED_DATE_FORMAT));
        return true;
    }

    /**
     * Writes a staged comment immediately, for exits that never rate the card
     * (skip, back to the deck list, closing the view, editing or deleting the card).
     */
    async flushPendingCardComment(): Promise<void> {
        const question = this.currentQuestion;
        if (!this.applyPendingCardComment() || !question) return;
        // Routed through the data store so the label allocation and the definition write
        // go through the same single composed read-modify-write as a rated card.
        await DataStore.getInstance().write(question);
    }

    async processReview(response: ReviewResponse): Promise<void> {
        this.pushUndo();
        switch (this.reviewMode) {
            case FlashcardReviewMode.Review:
                await this.processReviewReviewMode(response);
                break;

            case FlashcardReviewMode.Cram:
                this.processReviewCramMode(response);
                break;
        }
    }

    async processReviewReviewMode(response: ReviewResponse): Promise<void> {
        // Resetting a new card performs no schedule write, so flush any staged comment now
        // or it would otherwise sit unwritten until some later write occurs.
        if (response === ReviewResponse.Reset && !this.currentCard.hasSchedule) {
            await this.flushPendingCardComment();
        }

        let shortTermRequeue: "none" | "immediate" | "pending" = "none";
        if (response !== ReviewResponse.Reset || this.currentCard.hasSchedule) {
            const oldSchedule = this.currentCard.scheduleInfo;

            // We need to update the schedule if:
            //  (1) the user reviewed with easy/good/hard (either a new or due card),
            //  (2) or reset a due card
            // Nothing to do if a user resets a new card
            this.currentCard.scheduleInfo = this.determineCardSchedule(response, this.currentCard);
            shortTermRequeue = this.getShortTermRequeueMode(this.currentCard.scheduleInfo);

            // Fold any comment typed during this card into the same write
            this.applyPendingCardComment();

            // Update the source file with the updated schedule
            await DataStore.getInstance().writeSchedule(this.currentQuestion);
            const undoEntry: UndoEntry | undefined = this.undoStack[this.undoStack.length - 1];
            if (undoEntry?.card === this.currentCard) undoEntry.wroteSchedule = true;

            if (oldSchedule) {
                this.dueDateFlashcardHistogram.decrement(dueDateHistogramKey(oldSchedule));
            }
            this.dueDateFlashcardHistogram.increment(
                dueDateHistogramKey(this.currentCard.scheduleInfo),
            );
        } else if (response === ReviewResponse.Reset) {
            shortTermRequeue = "immediate";
        }

        if (shortTermRequeue === "pending") {
            await this.handlePendingRequeue();
        } else if (shortTermRequeue === "immediate" || response === ReviewResponse.Reset) {
            if (this.settings.burySiblingCards) {
                await this.burySiblingCards();
                this.deleteSiblingCardsFromAllDecks();
            }
            this.cardSequencer.moveCurrentRepItemToEndOfList();
            this.cardSequencer.nextRepItem();
        } else {
            if (this.settings.burySiblingCards) {
                await this.burySiblingCards();
                this.cardSequencer.deleteCurrentQuestionFromAllDecks();
            } else {
                this.deleteCurrentCard();
            }
        }
    }

    private async burySiblingCards(): Promise<void> {
        // We check if there are any sibling cards still in the deck,
        // We do this because otherwise we would be adding every reviewed card to the postponement list, even for a
        // question with a single card. That isn't consistent with the 1.10.1 behavior
        const remaining = this.currentDeck.getQuestionRepItemCount(this.currentQuestion);
        if (remaining > 1) {
            this.questionPostponementList.add(this.currentQuestion);
            await this.questionPostponementList.write();
        }
    }

    private deleteSiblingCardsFromAllDecks(): void {
        for (const siblingCard of this.currentQuestion.cards) {
            if (Object.is(siblingCard, this.currentCard)) {
                continue;
            }

            this.remainingDeckTree.deleteCardFromAllDecks(siblingCard, false);
        }
    }

    private async handlePendingRequeue(): Promise<void> {
        const pendingCard = this.currentCard;
        const dueUnix = pendingCard.scheduleInfo?.dueDateAsUnix;

        if (this.settings.burySiblingCards) {
            await this.burySiblingCards();
            this.cardSequencer.deleteCurrentQuestionFromAllDecks();
        } else {
            this.cardSequencer.deleteCurrentRepItemFromAllDecks();
        }

        this.pendingCards.push({ card: pendingCard, dueUnix });
    }

    processReviewCramMode(response: ReviewResponse): void {
        if (response === ReviewResponse.Easy) this.deleteCurrentCard();
        else {
            this.cardSequencer.moveCurrentRepItemToEndOfList();
            this.cardSequencer.nextRepItem();
        }
    }

    private getShortTermRequeueMode(
        scheduleInfo: RepItemScheduleInfo | null,
    ): "none" | "immediate" | "pending" {
        if (!scheduleInfo || scheduleInfo.interval >= 1) {
            return "none";
        }

        return scheduleInfo.isDue() ? "immediate" : "pending";
    }

    private wakeDuePendingCards(): void {
        if (this.pendingCards.length === 0) {
            return;
        }

        const nowUnix = globalDateProvider.now.valueOf();
        const duePendingCards: PendingCard[] = [];
        const remainingPendingCards: PendingCard[] = [];
        for (const pendingCard of this.pendingCards) {
            if (pendingCard.dueUnix <= nowUnix) {
                duePendingCards.push(pendingCard);
            } else {
                remainingPendingCards.push(pendingCard);
            }
        }

        // Prepend the latest due cards first so the earliest due card remains
        // at the front of the sequential queue.
        duePendingCards.sort((a, b) => b.dueUnix - a.dueUnix);
        for (const pendingCard of duePendingCards) {
            this.remainingDeckTree.prependRepItem(
                pendingCard.card.question.topicPathList,
                pendingCard.card,
            );
        }

        this.pendingCards = remainingPendingCards;
    }

    determineCardSchedule(response: ReviewResponse, card: Card): RepItemScheduleInfo {
        let result: RepItemScheduleInfo;

        if (response === ReviewResponse.Reset) {
            // Resetting the card schedule
            result = this.srsAlgorithm.cardGetResetSchedule();
        } else {
            // scheduled card
            if (card.hasSchedule) {
                result = this.srsAlgorithm.cardCalcUpdatedSchedule(
                    response,
                    card.scheduleInfo,
                    this.dueDateFlashcardHistogram,
                );
            } else {
                const currentNote: Note = card.question.note;
                result = this.srsAlgorithm.cardGetNewSchedule(
                    response,
                    currentNote.filePath,
                    this.dueDateFlashcardHistogram,
                );
            }
        }
        return result;
    }

    async updateCurrentQuestionTextAndCards(text: string): Promise<void> {
        // The card objects are replaced, so earlier undo entries would point at stale cards
        this.undoStack = [];
        const question = this.currentQuestion;
        const q: QuestionText = question.questionText;

        // Update front/back properties of all cards which question is linked to
        const cardFrontBackList: CardFrontBack[] = CardFrontBackUtil.expand(
            question.questionType,
            text,
            this.settings,
        );

        q.actualQuestion = text;

        await this.currentQuestion.writeQuestion(this.settings);

        if (cardFrontBackList.length !== question.cards.length) {
            console.warn("SR: Cards count does not match question text. Skipping redraw.");
            new Notice("Cards count does not match cards from question text. Skipping redraw.");
            return;
        }
        question.cards.forEach((card, i) => {
            const { front, back } = cardFrontBackList[i];
            card.front = front;
            card.back = back;
        });
    }

    async deleteCurrentCardFromNote(): Promise<void> {
        // The card objects are replaced, so earlier undo entries would point at stale cards
        this.undoStack = [];
        const question = this.currentQuestion;
        await DataStore.getInstance().delete(question);
        this._originalDeckTree.deleteQuestionFromAllDecks(question, false);
        this.cardSequencer.deleteCurrentQuestionFromAllDecks();
    }
}
