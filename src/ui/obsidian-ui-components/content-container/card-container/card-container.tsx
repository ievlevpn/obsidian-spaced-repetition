import "src/ui/obsidian-ui-components/content-container/card-container/card-container.css";
import moment from "moment";
import { App, Platform } from "obsidian";

import { CardType } from "src/data/data-structures/card/questions/question";
import { CardFrontBackUtil } from "src/data/data-structures/card/questions/question-type";
import { SRSettings } from "src/data/settings";
import { t } from "src/lang/helpers";
import type SRPlugin from "src/main";
import { RepItemScheduleInfo } from "src/scheduling/algorithms/base/rep-item-schedule-info";
import { ReviewResponse } from "src/scheduling/algorithms/base/repetition-item";
import { digitFromKeyCode, responseForDigit } from "src/scheduling/answer-keys";
import { FlashcardReviewMode } from "src/scheduling/flashcard-review-sequencer";
import {
    compareTypedAnswer,
    typedAnswerTarget,
    TypedComparison,
} from "src/scheduling/typed-answer";
import CardCommentComponent, {
    CardCommentInput,
} from "src/ui/obsidian-ui-components/content-container/card-container/card-comment/card-comment";
import ContextSectionComponent from "src/ui/obsidian-ui-components/content-container/card-container/context-section/context-section";
import ResponseSectionComponent from "src/ui/obsidian-ui-components/content-container/card-container/response-section/response-section";
import SwipeFeedbackComponent from "src/ui/obsidian-ui-components/content-container/card-container/swipe-feedback/swipe-feedback";
import CardToolbarComponent from "src/ui/obsidian-ui-components/content-container/card-container/toolbar/toolbar";
import { CardMarkerActions } from "src/ui/obsidian-ui-components/content-container/card-container/toolbar/toolbar-buttons/card-menu-button";
import {
    addDiffParts,
    renderTypedInput,
    renderTypedResult,
} from "src/ui/obsidian-ui-components/content-container/card-container/typed-answer/typed-answer";
import {
    CardState,
    SessionData,
} from "src/ui/obsidian-ui-components/content-container/content-manager";
import { ConfirmationModal } from "src/ui/obsidian-ui-components/modals/confirmation-modal";
import { attachEdgeSwipe, Point } from "src/utils/edge-swipe";
import EmulatedPlatform from "src/utils/platform-detector";
import { RenderMarkdownWrapper } from "src/utils/renderers";
import { removeCommonIndent } from "src/utils/strings";

// TODO: Refactor cloze rendering into the renderers file
export class CardContainer {
    private app: App;
    private plugin: SRPlugin;
    private cardState: CardState;

    private view: HTMLDivElement;
    // Whether the undo button is enabled, which also arms the left-edge swipe
    private undoAvailable: boolean = false;
    // Removes the edge-swipe listeners (they live on the window)
    private detachSwipes: (() => void)[] = [];

    private toolbar: CardToolbarComponent;
    private contextSection: ContextSectionComponent | null = null;

    private scrollWrapper: HTMLDivElement;
    private content: HTMLDivElement;
    private cardComment: CardCommentComponent;
    private pendingClock: HTMLDivElement | null = null;
    private pendingResumeTimeout: number | null = null;

    private response: ResponseSectionComponent;

    private clozeInputs: NodeListOf<HTMLInputElement> | null = null;
    private clozeAnswers: NodeListOf<Element> | null = null;

    // Typing the answer, switched on from the card menu for the current session. Cloze blanks
    // become fields; a card with a short plain-text answer gets a field under its question.
    private typeAnswers: boolean = false;
    private typedInput: HTMLInputElement | null = null;
    private typedTarget: string | null = null;
    // The card menu's "Important" and "Suspend card", also behind the I key
    private markerActions: CardMarkerActions | null = null;
    // The arguments of the last drawCardFront, so switching typing on redraws the card
    private frontArgs: { sessionData: SessionData; settings: SRSettings } | null = null;

    private processReviewHandler: (response: ReviewResponse) => Promise<void>;
    private skipCardHandler: () => void;
    private showAnswerHandler: () => void;
    private jumpToCardHandler: () => Promise<void>;
    private undoHandler: () => Promise<void>;

    constructor(
        app: App,
        plugin: SRPlugin,
        settings: SRSettings,
        parentEl: HTMLElement,
        deleteCurrentCard: () => void,
        backToDeckHandler: () => Promise<void>,
        editCardHandler: () => void,
        processReviewHandler: (response: ReviewResponse) => Promise<void>,
        skipCardHandler: () => void,
        showAnswerHandler: () => void,
        jumpToCurrentCardHandler: () => Promise<void>,
        displayCurrentCardInfoNoticeHandler: () => void,
        undoHandler: () => Promise<void>,
        saveCardCommentHandler: () => Promise<void>,
        closeModal?: () => void,
    ) {
        // Init properties
        this.app = app;
        this.plugin = plugin;
        this.cardState = CardState.Closed;
        this.processReviewHandler = processReviewHandler;
        this.skipCardHandler = skipCardHandler;
        this.showAnswerHandler = showAnswerHandler;
        this.jumpToCardHandler = jumpToCurrentCardHandler;
        this.undoHandler = undoHandler;

        // Build ui
        this.view = parentEl.createDiv();
        this.view.addClasses(["sr-container", "sr-card-container", "sr-is-hidden"]);

        this.setCustomHotKeyState(settings.useCustomHotkeys);

        this.toolbar = new CardToolbarComponent(
            this.view,
            settings.showDeleteButtonInCardView,
            deleteCurrentCard,
            backToDeckHandler,
            editCardHandler,
            jumpToCurrentCardHandler,
            displayCurrentCardInfoNoticeHandler,
            this.skipCardHandler,
            () => {
                new ConfirmationModal(
                    app,
                    t("DELETE_SCHEDULING_DATA_OF_CURRENT_CARD"),
                    t("CONFIRM_SCHEDULING_DATA_DELETION_OF_CURRENT_CARD"),
                    t("SCHEDULING_DATA_DELETION_IN_PROGRESS_OF_CURRENT_CARD"),
                    async () => {
                        await this.processReviewHandler(ReviewResponse.Reset);
                    },
                ).open();
            },
            () => void this.undoHandler(),
            closeModal,
        );
        this.toolbar.setTypeAnswersToggle({
            get: () => this.typeAnswers,
            set: (on: boolean) => void this.setTypeAnswers(on),
        });

        this.scrollWrapper = this.view.createDiv();
        this.scrollWrapper.addClass("sr-scroll-wrapper");

        this.content = this.scrollWrapper.createDiv();
        this.content.addClass("sr-content");

        // Mobile edge swipes: from the right edge to skip (like the Skip button), from the left
        // edge to go back to the previous card (like Undo). The settings are read when a touch
        // begins, so turning one off takes effect immediately.
        if (Platform.isMobile || EmulatedPlatform().isMobile) {
            const win: Window = this.view.win ?? window;
            const skipFeedback = new SwipeFeedbackComponent(this.scrollWrapper, {
                side: "right",
                icon: "skip-forward",
                label: t("SKIP"),
                armedLabel: t("SWIPE_RELEASE_TO_SKIP"),
            });
            const backFeedback = new SwipeFeedbackComponent(this.scrollWrapper, {
                side: "left",
                icon: "undo-2",
                label: t("SWIPE_BACK"),
                armedLabel: t("SWIPE_RELEASE_TO_GO_BACK"),
            });
            this.detachSwipes.push(
                attachEdgeSwipe(win, "right", {
                    isActive: (start) => settings.mobileSwipeToSkip && this.acceptsSwipe(start),
                    onMove: (dx, armed) => skipFeedback.move(dx, armed),
                    onRelease: (committed) =>
                        skipFeedback.release(committed, () => this.skipCardHandler()),
                }),
                attachEdgeSwipe(win, "left", {
                    isActive: (start) =>
                        settings.mobileSwipeToUndo &&
                        this.undoAvailable &&
                        this.acceptsSwipe(start),
                    onMove: (dx, armed) => backFeedback.move(dx, armed),
                    onRelease: (committed) =>
                        backFeedback.release(committed, () => void this.undoHandler()),
                }),
            );
        }

        // Attached to the view, not the scroll wrapper. The wrapper is a `display: flex` with no
        // direction, so it lays its children out in a ROW, which left the box squeezed into a
        // narrow column beside the card content. The view is a column flex, which puts the box
        // under the answer and above the rating buttons. It is still outside this.content, so
        // drawCardFrontContent's content.empty() cannot destroy it.
        this.cardComment = new CardCommentComponent(this.view, app, plugin, saveCardCommentHandler);

        this.response = new ResponseSectionComponent(
            this.view,
            settings,
            this.showAnswerHandler,
            this.processReviewHandler,
        );
    }

    // #region -> public methods

    /** Releases what outlives the view (the comment box's embedded editor, swipe listeners). */
    destroy(): void {
        this.cardComment.destroy();
        this.detachSwipes.forEach((detach) => detach());
        this.detachSwipes = [];
    }

    // An edge swipe applies while a card is shown and the touch is level with the review view
    private acceptsSwipe(start: Point): boolean {
        if (this.cardState !== CardState.Front && this.cardState !== CardState.Back) return false;
        if (!this.view.isShown()) return false;
        const rect: DOMRect = this.view.getBoundingClientRect();
        return start.y >= rect.top && start.y <= rect.bottom;
    }

    /**
     * Enables or greys out the undo button.
     *
     * @param available - Whether there is something to undo
     */
    setUndoAvailable(available: boolean): void {
        this.undoAvailable = available;
        this.toolbar.setUndoButtonDisabled(!available);
    }

    /**
     * Shows the FlashcardView if it is hidden
     */
    async openSession(sessionData: SessionData, settings: SRSettings) {
        // Prevents rest of code, from running if this was executed multiple times after one another
        if (!this.view.hasClass("sr-is-hidden")) {
            return;
        }

        await this.drawCardFront(sessionData, settings);

        this.view.removeClass("sr-is-hidden");
        activeDocument.addEventListener("keydown", this._keydownHandler);
    }

    /**
     * Hides the FlashcardView if it is visible
     */
    closeSession() {
        // Prevents the rest of code, from running if this was executed multiple times after one another

        if (this.view.hasClass("sr-is-hidden")) {
            return;
        }
        if (this.pendingResumeTimeout !== null) {
            window.clearTimeout(this.pendingResumeTimeout);
            this.pendingResumeTimeout = null;
        }
        this.cardState = CardState.Closed;
        activeDocument.removeEventListener("keydown", this._keydownHandler);
        this.view.addClass("sr-is-hidden");
    }

    /**
     * Blocks the key input to the FlashcardView
     *
     * @param block
     */
    blockKeyInput(block: boolean) {
        if (block) {
            activeDocument.addEventListener("keydown", this._keydownHandler);
        } else {
            activeDocument.removeEventListener("keydown", this._keydownHandler);
        }
    }

    /** Switches typing the answer on or off; a card showing its question is redrawn. */
    public async setTypeAnswers(on: boolean): Promise<void> {
        this.typeAnswers = on;
        if (this.cardState === CardState.Front && this.frontArgs !== null) {
            await this.drawCardFront(this.frontArgs.sessionData, this.frontArgs.settings);
        }
    }

    /** Wires the card menu's "Important" and "Suspend card" items, and the I key. */
    public setMarkerActions(actions: CardMarkerActions): void {
        this.markerActions = actions;
        this.toolbar.setMarkerActions(actions);
    }

    /** Redraws the "new" / "seen" label, e.g. after the card was marked important. */
    public refreshCardStatus(sessionData: SessionData): void {
        const old: Element | null = this.content.querySelector(".sr-card-status");
        if (old === null) return;
        const fresh: HTMLElement | null = this.buildCardStatus(sessionData);
        if (fresh) old.replaceWith(fresh);
    }

    /** Typing the answer lasts one session: a new review session starts with it off. */
    public resetTypeAnswers(): void {
        this.typeAnswers = false;
    }

    /**
     * The card's front and back. While typing, a cloze card is expanded again with its blanks as
     * fields (math clozes keep their LaTeX blanks), so the switch works without re-parsing notes.
     */
    private cardSides(
        sessionData: SessionData,
        settings: SRSettings,
    ): { front: string; back: string } {
        const card = sessionData.cardData.currentCard;
        const question = sessionData.currentQuestion;
        if (this.typeAnswers && question.questionType === CardType.Cloze) {
            const sides = CardFrontBackUtil.expand(
                CardType.Cloze,
                question.questionText.actualQuestion,
                { ...settings, convertClozePatternsToInputs: true },
            )[card.cardIdx];
            if (sides) return { front: sides.front, back: sides.back };
        }
        return { front: card.front, back: card.back };
    }

    public async drawCardFront(sessionData: SessionData, settings: SRSettings) {
        this.frontArgs = { sessionData, settings };
        this.toolbar.setResetButtonDisabled(true);
        // Update current deck info
        this.cardState = sessionData.cardData.currentCardState;

        this._updateInfoBar(sessionData, sessionData.cardOrder);

        // Update card content
        await this.drawCardFrontContent(sessionData, settings);
        this.drawTypedInput(sessionData, settings);
        this.cardComment.hide();

        // Update response buttons
        this.response.resetResponseButtons();

        // Setup cloze input listeners
        this._setupClozeInputListeners();

        // auto-focus the first cloze input if this card is a cloze card
        if (sessionData.currentQuestion.questionType === CardType.Cloze) {
            const firstInput: HTMLInputElement | null =
                activeDocument.querySelector(".cloze-input");
            if (firstInput) {
                firstInput.focus();
            }
        }
    }

    // A field under the question of a non-cloze card whose answer is short plain text
    private drawTypedInput(sessionData: SessionData, settings: SRSettings): void {
        this.typedInput = null;
        this.typedTarget = null;
        if (!this.typeAnswers || sessionData.currentQuestion.questionType === CardType.Cloze) {
            return;
        }
        this.typedTarget = typedAnswerTarget(this.cardSides(sessionData, settings).back);
        if (this.typedTarget === null) return;
        this.typedInput = renderTypedInput(this.content, {
            onSubmit: () => this.showAnswerHandler(),
            textDirection: sessionData.currentQuestion.questionText.textDirection,
        });
        this.typedInput.focus();
    }

    private drawCardContext(sessionData: SessionData, settings: SRSettings) {
        if (settings.showContextInCards) {
            this.contextSection = new ContextSectionComponent(this.content);
            this.contextSection.updateCardContext(
                settings.showContextInCards,
                sessionData.currentQuestion,
                sessionData.currentNote,
            );
        }
    }

    /**
     * A quiet "new" / "seen" label at the top right of the card (floated, so the card's text
     * flows around it): whether the card has been rated before, i.e. has a schedule.
     */
    private drawCardStatus(sessionData: SessionData): void {
        const label: HTMLElement | null = this.buildCardStatus(sessionData);
        if (label) this.content.appendChild(label);
    }

    // The label, with a star in front for an important card
    private buildCardStatus(sessionData: SessionData): HTMLElement | null {
        const card = sessionData.cardData.currentCard;
        if (!card) return null;
        const seen: boolean = card.hasSchedule;
        const label: HTMLElement = createDiv({
            cls: ["sr-card-status", seen ? "is-seen" : "is-new"],
        });
        if (card.markers.important) {
            label.createSpan({ cls: "sr-card-important", text: "★ " });
        }
        label.appendText(seen ? t("CARD_STATUS_SEEN") : t("CARD_STATUS_NEW"));
        label.ariaLabel =
            (card.markers.important ? t("CARD_STATUS_IMPORTANT_HINT") + " " : "") +
            (seen ? t("CARD_STATUS_SEEN_HINT") : t("CARD_STATUS_NEW_HINT"));
        return label;
    }

    private async drawCardFrontContent(sessionData: SessionData, settings: SRSettings) {
        // Update card content
        this.content.empty();

        this.drawCardStatus(sessionData);

        // Create context section
        this.drawCardContext(sessionData, settings);

        // Build card content
        const wrapper: RenderMarkdownWrapper = new RenderMarkdownWrapper(
            this.app,
            this.plugin,
            sessionData.currentNote.filePath,
        );

        await wrapper.renderMarkdownWrapper(
            removeCommonIndent(this.cardSides(sessionData, settings).front),
            this.content,
            sessionData.currentQuestion.questionText.textDirection,
            // sessionData.cardData.currentCardState
        );
        // Set scroll position back to top
        this.content.scrollTop = 0;
    }

    public drawPendingState(nextPendingDueUnix: number): void {
        this.toolbar.setResetButtonDisabled(true);
        this.cardState = CardState.Front;
        this.content.empty();
        this.cardComment.hide();
        this.response.hideAllButtons();
        this.pendingClock = this.content.createDiv({
            cls: "sr-centered",
        });

        const updatePendingClock = () => {
            const startTime = moment();
            const endTime = moment(nextPendingDueUnix);

            // Calculate the difference in milliseconds
            const duration = moment.duration(endTime.diff(startTime));

            const hours = Math.floor(duration.asHours());
            const minutes = duration.minutes();
            const seconds = duration.seconds();

            const formatted = `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

            this.pendingClock?.setText(
                `Waiting for the next FSRS review step. Next card due in ${formatted} (HH:mm:ss).`,
            );
            this.pendingResumeTimeout = window.setTimeout(() => {
                updatePendingClock();
            }, 1000);
        };

        updatePendingClock();
    }

    /** Returns text typed into the comment box and clears it. */
    /**
     * Re-draws the comment box after a note was saved without rating, keeping the earlier
     * notes expanded if they were, and puts the cursor back for the next note.
     */
    public async refreshCardComment(sessionData: SessionData): Promise<void> {
        await this.cardComment.show(
            sessionData.currentQuestion.cardCommentDefinition,
            sessionData.currentNote.filePath,
            true,
        );
        this.cardComment.focus();
    }

    public takeCardCommentInput(): CardCommentInput {
        return this.cardComment.takeInput();
    }

    // #region -> Deck Info

    private setCustomHotKeyState(state: boolean) {
        if (state) {
            if (!this.view.hasClass("sr-custom-hotkeys")) {
                this.view.addClass("sr-custom-hotkeys");
            }
        } else {
            if (this.view.hasClass("sr-custom-hotkeys")) {
                this.view.removeClass("sr-custom-hotkeys");
            }
        }
    }

    private _updateInfoBar(sessionData: SessionData, flashcardCardOrder: string) {
        if (sessionData.deckData.chosenDeck === null || sessionData.deckData.currentDeck === null)
            return;

        this.toolbar.updateInfo(
            sessionData.deckData.chosenDeck,
            sessionData.deckData.currentDeck,
            sessionData.deckData.chosenDeckStats,
            sessionData.deckData.currentDeckStats,
            sessionData.totalCardsInSession,
            sessionData.totalDecksInSession,
            sessionData.deckData.currentDeckTotalCardsInQueue,
            flashcardCardOrder,
        );
    }

    private _setupClozeInputListeners(): void {
        this.clozeInputs = activeDocument.querySelectorAll(".cloze-input");

        this.clozeInputs.forEach((input) => {
            input.addEventListener("keydown", (e: KeyboardEvent) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    (input as HTMLElement).blur();
                    this.showAnswerHandler();
                }
            });
        });
    }
    /**
     * Marks each typed cloze blank on the back: what was typed, letter by letter, and the expected
     * answer when they differ.
     *
     * @returns Whether every blank was typed exactly, or null when nothing was typed
     */
    private _evaluateClozeAnswers(): boolean | null {
        this.clozeAnswers = activeDocument.querySelectorAll(".cloze-answer");
        if (this.clozeInputs === null || this.clozeAnswers.length !== this.clozeInputs.length) {
            return null;
        }
        const typed: string[] = Array.from(this.clozeInputs).map((input) => input.value);
        if (typed.every((text) => text.trim() === "")) return null;

        let allExact = true;
        for (let i = 0; i < this.clozeAnswers.length; i++) {
            const clozeAnswer = this.clozeAnswers[i] as HTMLElement;
            const comparison: TypedComparison = compareTypedAnswer(
                typed[i],
                clozeAnswer.innerText.trim(),
                false,
            );
            allExact &&= comparison.exact;

            clozeAnswer.empty();
            clozeAnswer.addClass("sr-typed-cloze");
            addDiffParts(clozeAnswer.createSpan(), comparison.typed);
            if (!comparison.exact) {
                addDiffParts(clozeAnswer.createSpan("sr-typed-expected"), comparison.expected);
            }
        }
        return allExact;
    }

    public async drawBack(
        sessionData: SessionData,
        reviewMode: FlashcardReviewMode,
        settings: SRSettings,
        determineButtonSchedule: (response: ReviewResponse) => RepItemScheduleInfo | null,
    ) {
        this.setCustomHotKeyState(settings.useCustomHotkeys);
        this.cardState = sessionData.cardData.currentCardState;

        this.toolbar.setResetButtonDisabled(false);

        // Read the typed answer before the front, and with it the field, is redrawn
        const typedText: string = this.typedInput?.value ?? "";
        const typedTarget: string | null = this.typedTarget;
        this.typedInput = null;
        this.typedTarget = null;
        let typedExact: boolean | null = null;

        // Show answer text
        if (sessionData.currentQuestion.questionType !== CardType.Cloze) {
            await this.drawCardFrontContent(sessionData, settings);
            const hr: HTMLElement = activeDocument.createElement("hr");
            this.content.appendChild(hr);
            if (typedTarget !== null && typedText.trim() !== "") {
                const comparison = compareTypedAnswer(typedText, typedTarget, false);
                typedExact = comparison.exact;
                renderTypedResult(
                    this.content,
                    comparison,
                    sessionData.currentQuestion.questionText.textDirection,
                );
            }
        } else {
            this.content.empty();
            this.drawCardStatus(sessionData);
            this.drawCardContext(sessionData, settings);
        }

        const wrapper: RenderMarkdownWrapper = new RenderMarkdownWrapper(
            this.app,
            this.plugin,
            sessionData.currentNote.filePath,
        );
        await wrapper.renderMarkdownWrapper(
            removeCommonIndent(this.cardSides(sessionData, settings).back),
            this.content,
            sessionData.currentQuestion.questionText.textDirection,
            // sessionData.cardData.currentCardState,
        );

        // Evaluate cloze answers
        if (sessionData.currentQuestion.questionType === CardType.Cloze) {
            typedExact = this._evaluateClozeAnswers();
        }

        // The comment box is suppressed for any card that contains a ">" line anywhere.
        //
        // This is DELIBERATELY wider than "the card is hosted inside a blockquote": it also
        // catches a card whose answer merely quotes something, or contains a "> [!note]"
        // callout. Measured on a 4263-card vault, that is 17 cards (0.4%), silently. The wide
        // test is the ruling, not an oversight: an earlier attempt checked only the first
        // line and missed the common case of a card whose quote starts further down, which is
        // the shape that actually occurs. A reference emitted inside a quoted region renders,
        // but the definition it points at necessarily lands at the end of the note, outside
        // the quote, so the pair reads as part of a quote the user did not write. Refusing the
        // box is the conservative choice. Recorded in the design doc's limitations.
        const cardText: string = sessionData.currentQuestion.questionText.original;
        const hostedInBlockquote: boolean = cardText
            .split("\n")
            .some((line) => line.trimStart().startsWith(">"));
        if (reviewMode !== FlashcardReviewMode.Cram && !hostedInBlockquote) {
            await this.cardComment.show(
                sessionData.currentQuestion.cardCommentDefinition,
                sessionData.currentNote.filePath,
            );
        }

        // Show response buttons
        this.response.showRatingButtons(
            reviewMode,
            settings.flashcardAgainText,
            settings.flashcardHardText,
            settings.flashcardGoodText,
            settings.flashcardEasyText,
            settings.showIntervalInReviewButtons,
            determineButtonSchedule,
        );
        this.response.setKeyHints(settings.answerKeys);
        if (typedExact !== null && reviewMode !== FlashcardReviewMode.Cram) {
            this.response.setSuggested(typedExact ? ReviewResponse.Good : ReviewResponse.Again);
        }
        // NEW: restore keyboard focus after cloze confirmation
        if (this.plugin.uiManager === null) throw new Error("UI manager not initialized!!!");
        this.plugin.uiManager.setSRViewInFocus(true);
        this.response.againButton.buttonEl.focus();
    }

    private _keydownHandler = (e: KeyboardEvent) => {
        if (!this.plugin.isInitialized) throw new Error("SR plugin or data not initialized!!!");
        if (this.plugin.uiManager === null) throw new Error("UI manager not initialized!!!");
        // Prevents any input, if the edit modal is open or if the view is not in focus
        if (
            this.plugin.dataManager.data.settings.useCustomHotkeys ||
            (activeDocument.activeElement !== null &&
                (activeDocument.activeElement.nodeName === "TEXTAREA" ||
                    activeDocument.activeElement.nodeName === "INPUT" ||
                    // the embedded markdown editor of the card comment box
                    (activeDocument.activeElement as HTMLElement).isContentEditable)) ||
            this.cardState === CardState.Closed ||
            !this.plugin.uiManager.getSRInFocusState() ||
            Platform.isMobile || // No keyboard events on mobile
            EmulatedPlatform().isMobile
        ) {
            return;
        }

        const consumeKeyEvent = () => {
            e.preventDefault();
            e.stopPropagation();
        };

        switch (e.code) {
            case "KeyS":
                this.skipCardHandler();
                consumeKeyEvent();
                break;
            case "KeyJ":
                void this.jumpToCardHandler();
                consumeKeyEvent();
                break;
            case "KeyU":
                void this.undoHandler();
                consumeKeyEvent();
                break;
            case "KeyI":
                if (this.markerActions === null) break;
                this.markerActions.toggleImportant();
                consumeKeyEvent();
                break;
            case "Enter":
            case "NumpadEnter":
            case "Space":
                if (this.cardState === CardState.Front) {
                    this.showAnswerHandler();
                    consumeKeyEvent();
                } else if (this.cardState === CardState.Back) {
                    void this.processReviewHandler(ReviewResponse.Good);
                    consumeKeyEvent();
                }
                break;
            default: {
                // Number keys answer the card, in the layout chosen in the settings
                const digit: number | null = digitFromKeyCode(e.code);
                if (digit === null || this.cardState !== CardState.Back) break;
                const response: ReviewResponse | null = responseForDigit(
                    this.plugin.dataManager.data.settings.answerKeys,
                    digit,
                );
                if (response === null) break;
                void this.processReviewHandler(response);
                consumeKeyEvent();
                break;
            }
        }
    };
}
