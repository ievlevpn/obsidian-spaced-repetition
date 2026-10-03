import { DataStore } from "src/data/data-store/base/data-store";
import { DataStoreAlgorithm } from "src/data/data-store/base/data-store-algorithm";
import { Card } from "src/data/data-structures/card/card";
import { Question, QuestionText } from "src/data/data-structures/card/questions/question";
import { DEFAULT_SETTINGS, SRSettings } from "src/data/settings";
import { RepItemScheduleInfoOsr } from "src/scheduling/algorithms/osr/rep-item-schedule-info-osr";
import { TextDirection } from "src/utils/strings";

import { unitTestSetupStandardDataStoreAlgorithm } from "../helpers/unit-test-setup";

const settingsCardCommentOnSameLine: SRSettings = { ...DEFAULT_SETTINGS };
settingsCardCommentOnSameLine.cardCommentOnSameLine = true;

describe("Question", () => {
    afterEach(() => {
        DataStoreAlgorithm.instance = undefined;
    });

    describe("getHtmlCommentSeparator", () => {
        test("Ends with a code block", () => {
            const text: string =
                "How do you ... Python?\n?\n" +
                "```\nprint('Hello World!')\nprint('Howdy?')\nlambda x: x[0]\n```";

            const question: Question = new Question({
                questionText: new QuestionText(text, null, text, TextDirection.Ltr, null),
            });

            expect(question.getHtmlCommentSeparator(DEFAULT_SETTINGS, false)).toEqual("\n");
            expect(question.getHtmlCommentSeparator(settingsCardCommentOnSameLine, false)).toEqual(
                "\n",
            );
        });

        test("Doesn't end with a code block", () => {
            const text: string = "Q1::A1";

            const question: Question = new Question({
                questionText: new QuestionText(text, null, text, TextDirection.Ltr, null),
            });

            expect(question.getHtmlCommentSeparator(DEFAULT_SETTINGS, false)).toEqual("\n");
            expect(question.getHtmlCommentSeparator(settingsCardCommentOnSameLine, false)).toEqual(
                " ",
            );
        });
    });

    describe("formatForNote", () => {
        test("puts schedule in a metadata callout when enabled", () => {
            const questionText = new QuestionText("Q1::A1", null, "Q1::A1", TextDirection.Ltr, "");
            const question = new Question({
                questionText,
                cards: [
                    new Card({
                        scheduleInfo: RepItemScheduleInfoOsr.fromDueDateStr("2023-09-06", 1, 250),
                    }),
                ],
            });

            DataStoreAlgorithm.instance = {
                questionFormatScheduleAsHtmlComment: jest.fn(() => "<!--SR:!2023-09-06,1,250-->"),
            };

            expect(
                question.formatForNote({
                    ...settingsCardCommentOnSameLine,
                    useCalloutsForSchedulingComments: true,
                }),
            ).toBe("Q1::A1\n> [!sr|card-metadata] \n>  <!--SR:!2023-09-06,1,250-->");
        });

        test("puts schedule and block id on the same line when enabled", () => {
            const questionText = new QuestionText(
                "Q1::A1 ^abc123",
                null,
                "Q1::A1",
                TextDirection.Ltr,
                "^abc123",
            );
            const question = new Question({
                questionText,
                cards: [
                    new Card({
                        scheduleInfo: RepItemScheduleInfoOsr.fromDueDateStr("2023-09-06", 1, 250),
                    }),
                ],
            });

            DataStoreAlgorithm.instance = {
                questionFormatScheduleAsHtmlComment: jest.fn(() => "<!--SR:!2023-09-06,1,250-->"),
            };

            expect(question.formatForNote(settingsCardCommentOnSameLine)).toBe(
                "Q1::A1 <!--SR:!2023-09-06,1,250--> ^abc123",
            );
        });

        test("puts block id before schedule when comments are on next line", () => {
            const questionText = new QuestionText(
                "Q1::A1 ^abc123",
                null,
                "Q1::A1",
                TextDirection.Ltr,
                "^abc123",
            );
            const question = new Question({
                questionText,
                cards: [
                    new Card({
                        scheduleInfo: RepItemScheduleInfoOsr.fromDueDateStr("2023-09-06", 1, 250),
                    }),
                ],
            });

            DataStoreAlgorithm.instance = {
                questionFormatScheduleAsHtmlComment: jest.fn(() => "<!--SR:!2023-09-06,1,250-->"),
            };

            expect(question.formatForNote(DEFAULT_SETTINGS)).toBe(
                "Q1::A1 ^abc123\n<!--SR:!2023-09-06,1,250-->",
            );
        });

        test("keeps only the block id when there is no schedule html", () => {
            const questionText = new QuestionText(
                "Q1::A1 ^abc123",
                null,
                "Q1::A1",
                TextDirection.Ltr,
                "^abc123",
            );
            const question = new Question({
                questionText,
                cards: [
                    new Card({
                        scheduleInfo: RepItemScheduleInfoOsr.fromDueDateStr("2023-09-06", 1, 250),
                    }),
                ],
            });

            DataStoreAlgorithm.instance = {
                questionFormatScheduleAsHtmlComment: jest.fn(() => ""),
            };

            expect(question.formatForNote(DEFAULT_SETTINGS)).toBe("Q1::A1 ^abc123");
        });
    });

    describe("card comment reference", () => {
        beforeEach(() => {
            unitTestSetupStandardDataStoreAlgorithm(settingsCardCommentOnSameLine);
        });

        afterEach(() => {
            DataStore.instance = undefined;
        });

        test("splitText separates the reference from the question", () => {
            const [, actualQuestion, , ref] = QuestionText.splitText(
                "Q1::A1 [^sr-a3f91c] <!--SR:!2023-09-06,1,250-->",
                settingsCardCommentOnSameLine,
            );
            expect(actualQuestion).toBe("Q1::A1");
            expect(ref).toBe("sr-a3f91c");
        });

        test("textHash is unchanged by the presence of a reference", () => {
            const without = QuestionText.create(
                "Q1::A1 <!--SR:!2023-09-06,1,250-->",
                TextDirection.Ltr,
                settingsCardCommentOnSameLine,
            );
            const withRef = QuestionText.create(
                "Q1::A1 [^sr-a3f91c] <!--SR:!2023-09-06,1,250-->",
                TextDirection.Ltr,
                settingsCardCommentOnSameLine,
            );
            expect(withRef.cardCommentRef).toBe("sr-a3f91c");
            expect(withRef.textHash).toBe(without.textHash);
        });

        test("strips a reference and a block id in either order", () => {
            const a = QuestionText.create(
                "Q1::A1 [^sr-a3f91c] ^abc123",
                TextDirection.Ltr,
                settingsCardCommentOnSameLine,
            );
            expect([a.actualQuestion, a.cardCommentRef, a.obsidianBlockId]).toEqual([
                "Q1::A1",
                "sr-a3f91c",
                "^abc123",
            ]);

            const b = QuestionText.create(
                "Q1::A1 ^abc123 [^sr-a3f91c]",
                TextDirection.Ltr,
                settingsCardCommentOnSameLine,
            );
            expect([b.actualQuestion, b.cardCommentRef, b.obsidianBlockId]).toEqual([
                "Q1::A1",
                "sr-a3f91c",
                "^abc123",
            ]);
        });

        test("does not strip a footnote reference of the user's own", () => {
            const q = QuestionText.create(
                "Q1::A1 [^1]",
                TextDirection.Ltr,
                settingsCardCommentOnSameLine,
            );
            expect(q.actualQuestion).toBe("Q1::A1 [^1]");
            expect(q.cardCommentRef).toBe(null);
        });

        function questionWithSchedule(original: string, settings: SRSettings): Question {
            const question = new Question({
                questionText: QuestionText.create(original, TextDirection.Ltr, settings),
                cards: [
                    new Card({
                        scheduleInfo: RepItemScheduleInfoOsr.fromDueDateStr("2023-09-06", 1, 250),
                    }),
                ],
            });
            DataStoreAlgorithm.instance = {
                questionFormatScheduleAsHtmlComment: jest.fn(() => "<!--SR:!2023-09-06,1,250-->"),
            };
            return question;
        }

        test("formatForNote puts the reference immediately before the schedule", () => {
            const original = "Q1::A1 [^sr-a3f91c] <!--SR:!2023-09-06,1,250-->";
            expect(
                questionWithSchedule(original, settingsCardCommentOnSameLine).formatForNote(
                    settingsCardCommentOnSameLine,
                ),
            ).toBe(original);
        });

        test("round-trips with a block id as well", () => {
            const original = "Q1::A1 [^sr-a3f91c] <!--SR:!2023-09-06,1,250--> ^abc123";
            expect(
                questionWithSchedule(original, settingsCardCommentOnSameLine).formatForNote(
                    settingsCardCommentOnSameLine,
                ),
            ).toBe(original);
        });

        test("round-trips when the schedule is on its own line", () => {
            const original = "Q1::A1\n[^sr-a3f91c] <!--SR:!2023-09-06,1,250-->";
            expect(
                questionWithSchedule(original, DEFAULT_SETTINGS).formatForNote(DEFAULT_SETTINGS),
            ).toBe(original);
        });

        test("round-trips a multi line card", () => {
            const original = "Front\n?\nAnswer [^sr-a3f91c] <!--SR:!2023-09-06,1,250-->";
            expect(
                questionWithSchedule(original, settingsCardCommentOnSameLine).formatForNote(
                    settingsCardCommentOnSameLine,
                ),
            ).toBe(original);
        });

        test("puts the reference on its own line for a card ending in a code block", () => {
            const original =
                "How do you ... Python?\n?\n```\nprint('Hello World!')\n```\n[^sr-a3f91c] <!--SR:!2023-09-06,1,250-->";
            expect(
                questionWithSchedule(original, settingsCardCommentOnSameLine).formatForNote(
                    settingsCardCommentOnSameLine,
                ),
            ).toBe(original);
        });

        test("emits a reference on a card with no schedule", () => {
            const questionText = QuestionText.create(
                "Q1::A1 [^sr-a3f91c]",
                TextDirection.Ltr,
                settingsCardCommentOnSameLine,
            );
            const question = new Question({ questionText, cards: [new Card({})] });
            expect(question.formatForNote(settingsCardCommentOnSameLine)).toBe(
                "Q1::A1 [^sr-a3f91c]",
            );
        });

        test("emits nothing extra when there is no reference", () => {
            const original = "Q1::A1 <!--SR:!2023-09-06,1,250-->";
            expect(
                questionWithSchedule(original, settingsCardCommentOnSameLine).formatForNote(
                    settingsCardCommentOnSameLine,
                ),
            ).toBe(original);
        });

        test("a tagged card ending in a code block keeps the schedule off the fence", () => {
            const text =
                "#flashcards How do you ... Python?\n?\n```\nprint('Hello World!')\n```";
            const questionText = QuestionText.create(
                text,
                TextDirection.Ltr,
                settingsCardCommentOnSameLine,
            );
            const question = new Question({ questionText, cards: [] });
            expect(questionText.endsWithCodeBlock()).toBe(true);
            expect(question.isCardCommentsOnSameLine(settingsCardCommentOnSameLine)).toBe(false);
        });

        test("setCardCommentRef records the label and flags the question as changed", () => {
            const questionText = QuestionText.create(
                "Q1::A1",
                TextDirection.Ltr,
                settingsCardCommentOnSameLine,
            );
            const question = new Question({ questionText, cards: [], hasChanged: false });
            question.setCardCommentRef("sr-a3f91c");
            expect(question.questionText.cardCommentRef).toBe("sr-a3f91c");
            expect(question.hasChanged).toBe(true);
        });

        test("emits the reference even if the schedule algorithm returns nothing", () => {
            const original = "Q1::A1 [^sr-a3f91c]";
            const question = new Question({
                questionText: QuestionText.create(
                    original,
                    TextDirection.Ltr,
                    settingsCardCommentOnSameLine,
                ),
                cards: [
                    new Card({
                        scheduleInfo: RepItemScheduleInfoOsr.fromDueDateStr("2023-09-06", 1, 250),
                    }),
                ],
            });
            DataStoreAlgorithm.instance = {
                questionFormatScheduleAsHtmlComment: jest.fn(() => ""),
            };

            expect(question.formatForNote(settingsCardCommentOnSameLine)).toBe(original);
        });

        test("round-trips a reference and a block id on a card with no schedule", () => {
            const original = "Q1::A1 ^abc123 [^sr-a3f91c]";
            const questionText = QuestionText.create(
                original,
                TextDirection.Ltr,
                settingsCardCommentOnSameLine,
            );
            const question = new Question({ questionText, cards: [new Card({})] });

            expect(questionText.actualQuestion).toBe("Q1::A1");
            expect(questionText.obsidianBlockId).toBe("^abc123");
            expect(questionText.cardCommentRef).toBe("sr-a3f91c");
            expect(question.formatForNote(settingsCardCommentOnSameLine)).toBe(original);
        });
    });
});
