import { MULTI_SCHEDULING_EXTRACTOR, SM2_SCHEDULE_INFO_EXTRACTOR } from "src/data/constants";
import { IDataStore, StorageType } from "src/data/data-store/base/data-store";
import { IFileModifier } from "src/data/data-store/base/file-modifier";
import { RepItemStorageInfo } from "src/data/data-store/base/rep-item-storage-info";
import { Question } from "src/data/data-structures/card/questions/question";
import { SRSettings } from "src/data/settings";
import { RepItemScheduleInfo } from "src/scheduling/algorithms/base/rep-item-schedule-info";
import { CommentParser } from "src/utils/comment-parser";
import { upsertFootnoteDefinition } from "src/utils/note-footnotes";
import { MultiLineTextFinder } from "src/utils/strings";

export class NotesDataStore implements IDataStore {
    public readonly storageType = StorageType.NOTES;
    private settings: SRSettings;
    public readonly fileModifier: IFileModifier;
    public isStructureInitialized: Promise<boolean>;

    constructor(settings: SRSettings, scheduleDeleter: IFileModifier) {
        this.settings = settings;
        this.fileModifier = scheduleDeleter;
        this.isStructureInitialized = Promise.resolve(true);
    }

    /**
     * Creates scheduling information from a question text and its storage info.
     *
     * @param originalQuestionText
     * @param _
     * @returns
     */
    createSchedule(originalQuestionText: string, _: RepItemStorageInfo): RepItemScheduleInfo[] {
        const schedulingComment = originalQuestionText.match(/<!--SR:(.+?)-->/m)?.[1];
        if (schedulingComment) {
            return CommentParser.parseMultiScheduleComment(schedulingComment) ?? [];
        }

        // Handle legacy scheduling comments for backward compatibility, but prefer the multi-scheduling format if both are presentwd
        const sm2MultiScheduling = [...originalQuestionText.matchAll(MULTI_SCHEDULING_EXTRACTOR)];
        if (sm2MultiScheduling.length > 0) {
            return sm2MultiScheduling
                .map((match) =>
                    CommentParser.parseSM2Schedule(
                        match[1],
                        parseInt(match[2]),
                        parseInt(match[3]),
                    ),
                )
                .filter((info): info is RepItemScheduleInfo => info !== null);
        }

        const result: RepItemScheduleInfo[] = [];
        const scheduling = [...originalQuestionText.matchAll(SM2_SCHEDULE_INFO_EXTRACTOR)];
        for (const match of scheduling) {
            const dueDateStr = match[1];
            const interval = parseInt(match[2]);
            const ease = parseInt(match[3]);
            const parsedSchedule = CommentParser.parseSM2Schedule(dueDateStr, interval, ease);
            if (parsedSchedule) {
                result.push(parsedSchedule);
            }
        }
        return result;
    }

    /**
     * Removes scheduling information from a question text.
     *
     * @param questionText
     * @returns
     */
    removeScheduleInfo(questionText: string): string {
        return questionText.replace(/<!--SR:.+-->/gm, "");
    }

    /**
     * Writes scheduling information to the data store.
     *
     * @param question
     * @returns
     */
    async writeSchedule(question: Question): Promise<void> {
        await this.write(question);
    }

    /**
     * Writes a question to the data store.
     *
     * @param question
     * @returns
     */
    async write(question: Question): Promise<void> {
        const fileText: string = await question.note.file.read();

        // Two byte-identical cards in one note cannot be told apart. MultiLineTextFinder takes
        // the first match, so a comment typed on the second one would be planted on the first
        // - visibly, permanently - and the next comment would mint a second label and a
        // surplus definition. There is nothing to disambiguate with: the label IS card
        // identity, but it cannot be used for lookup until it has already been written. So
        // refuse to write the comment at all rather than write it to the wrong card.
        //
        // The schedule write still goes ahead. The two cards are byte-identical, so their
        // schedules are interchangeable, and writing to the first match is the pre-existing
        // upstream behaviour - harmless, and not this feature's to change.
        if (question.isTextAmbiguousWithinNote(fileText)) {
            question.discardPendingCardComment();
            console.warn(
                "spaced-repetition: this card's text appears more than once in its note, so a " +
                    "comment cannot be attributed to the right copy. The comment was discarded. " +
                    `Card: ${question.questionText.original.substring(0, 100)}`,
            );
        }

        // Resolve first: it may allocate the label that the card rewrite then emits. Snapshot
        // the reference we had beforehand, because resolving can mint a new one and we may
        // have to put it back.
        const refBeforeResolve: string | null = question.questionText.cardCommentRef;
        const definition: string | null = question.resolveCardComment(fileText);

        const newText: string = question.updateQuestionWithinNoteText(fileText, this.settings);

        // If the card's text could not be located, the note changed under us. Write nothing:
        // appending a definition would orphan it, and a no-op whole-file write is itself a
        // sync-conflict risk.
        if (!question.lastUpdateFoundOriginal) {
            // Roll the label back. resolveCardComment already allocated it, and leaving it on
            // the question means the NEXT successful write - a short-term requeue, or Edit
            // Card, which writes unconditionally - emits "[^sr-xxxxxx]" into the user's prose
            // with no definition anywhere. A reference must never outlive its definition.
            question.questionText.cardCommentRef = refBeforeResolve;
            return;
        }

        let finalText: string = newText;
        const label: string | null = question.questionText.cardCommentRef;
        if (definition && label) {
            finalText = upsertFootnoteDefinition(newText, label, definition);
            question.cardCommentDefinition = definition;
        }

        await question.note.file.write(finalText);
        question.hasChanged = false;
    }

    /**
     * Deletes a question from the data store.
     *
     * @param question
     * @returns
     */
    async delete(question: Question): Promise<void> {
        const fileText: string = await question.note.file.read();
        const originalText: string = question.questionText.original;
        const newText = MultiLineTextFinder.findAndReplace(fileText, originalText, "");

        // Only write if note hasn't changed
        if (newText) {
            await question.note.file.write(newText);
        }
    }
}
