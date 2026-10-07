import moment from "moment";

import {
    emptyCardMarkers,
    formatCardMarkers,
    parseCardMarkers,
    parseSegmentMarkers,
} from "src/data/card-markers";
import { DataStore } from "src/data/data-store/base/data-store";
import { Card } from "src/data/data-structures/card/card";
import { Deck } from "src/data/data-structures/deck/deck";
import {
    DeckTreeIterator,
    iteratorOrderFromNames,
} from "src/data/data-structures/deck/deck-tree-iterator";
import { TopicPath } from "src/data/data-structures/deck/topic-path";
import { DEFAULT_SETTINGS } from "src/data/settings";
import { Note } from "src/note/note";
import { NoteFileLoader } from "src/note/note-file-loader";
import { ReviewResponse } from "src/scheduling/algorithms/base/repetition-item";
import { SrsAlgorithmFsrs } from "src/scheduling/algorithms/fsrs/sr-algorithm-fsrs";
import { RepItemScheduleInfoOsr } from "src/scheduling/algorithms/osr/rep-item-schedule-info-osr";
import { DueDateHistogram } from "src/scheduling/due-date-histogram";
import { setupStaticDateProvider20230906 } from "src/utils/dates";
import { setupStaticRandomNumberProvider } from "src/utils/numbers";
import { TextDirection } from "src/utils/strings";

import { UnitTestSRFile } from "./helpers/unit-test-file";
import { unitTestSetupStandardDataStoreAlgorithm } from "./helpers/unit-test-setup";
import { SampleItemDecks } from "./sample-items";

const loader: NoteFileLoader = new NoteFileLoader(DEFAULT_SETTINGS);

beforeAll(() => {
    setupStaticDateProvider20230906();
    setupStaticRandomNumberProvider();
    unitTestSetupStandardDataStoreAlgorithm(DEFAULT_SETTINGS);
});

async function loadNote(text: string): Promise<{ note: Note; file: UnitTestSRFile }> {
    const file: UnitTestSRFile = new UnitTestSRFile(text);
    const note: Note = await loader.load(file, TextDirection.Ltr, TopicPath.emptyPath);
    return { note, file };
}

describe("reading markers", () => {
    test.each([
        ["2023-09-02,4,270", false, false, []],
        ["2023-09-02,4,270,imp", false, true, []],
        ["2023-09-02,4,270,susp,imp", true, true, []],
        [
            "fsrs,2026-11-02T10:00:00.000Z,14,9.1,5.2,2,3,0,0,2026-10-19T10:00:00.000Z,susp",
            true,
            false,
            [],
        ],
        ["fsrs,-,0,0,0,0,0,0,0,-,imp", false, true, []],
        ["2023-09-02,4,270,id=k3f9,imp", false, true, ["id=k3f9"]],
    ])("%s", (segment, suspended, important, extras) => {
        expect(parseSegmentMarkers(segment)).toEqual({ suspended, important, extras });
    });

    test("each card of a comment has its own markers", () => {
        const markers = parseCardMarkers(
            "Q1:::A1 <!--SR:!2023-09-02,4,270,imp!2023-09-02,5,270-->",
        );
        expect(markers.map((m) => m.important)).toEqual([true, false]);
    });

    test("no comment, no markers", () => {
        expect(parseCardMarkers("Q1::A1")).toEqual([]);
    });

    test("written in a fixed order, unknown tokens kept", () => {
        expect(formatCardMarkers({ suspended: true, important: true, extras: ["x=1"] })).toBe(
            ",imp,susp,x=1",
        );
        expect(formatCardMarkers(emptyCardMarkers())).toBe("");
    });
});

describe("writing markers to the note", () => {
    test("markers survive a write unchanged", async () => {
        const text = `#flashcards
Q1::A1
<!--SR:!2023-09-02,4,270,imp-->
`;
        const { note, file } = await loadNote(text);
        expect(note.questionList[0].cards[0].markers.important).toBe(true);
        await note.writeNoteFile(DEFAULT_SETTINGS);
        expect(file.content).toEqual(text);
    });

    test("a new card marked important gets a placeholder schedule to carry the marker", async () => {
        const { note, file } = await loadNote(`#flashcards
Q1::A1
`);
        note.questionList[0].cards[0].markers.important = true;
        await DataStore.getInstance().writeSchedule(note.questionList[0]);
        expect(file.content).toContain("<!--SR:!2000-01-01,1,250,imp-->");

        // ... and is still a new card when read back
        const reread = await loadNote(file.content);
        const card: Card = reread.note.questionList[0].cards[0];
        expect(card.hasSchedule).toBe(false);
        expect(card.markers.important).toBe(true);
    });
});

describe("suspended cards", () => {
    test("are left out of the decks and collected separately", async () => {
        const { note } = await loadNote(`#flashcards
Q1::A1
<!--SR:!2023-09-02,4,270,susp-->
Q2::A2
`);
        const deck: Deck = new Deck("root", null);
        const suspended: Card[] = [];
        note.appendCardsToDeck(deck, suspended);
        const flashcards: Deck = deck.getDeck(new TopicPath(["flashcards"]));
        expect(flashcards.newRepItems.map((c) => c.front)).toEqual(["Q2"]);
        expect(flashcards.dueRepItems).toEqual([]);
        expect(suspended.map((c) => c.front)).toEqual(["Q1"]);
    });
});

describe("important cards first", () => {
    const text = `#flashcards
Q1::A1
Q2::A2 <!--SR:!2000-01-01,1,250,imp-->
Q3::A3`;

    test.each([
        [false, "Q1"],
        [true, "Q2"],
    ])("importantFirst=%s starts with %s", async (importantFirst, expected) => {
        const deck: Deck = await SampleItemDecks.createDeckFromText(text, TopicPath.emptyPath);
        const iterator = new DeckTreeIterator(
            iteratorOrderFromNames(
                "NewFirstSequential",
                "PrevDeckComplete_Sequential",
                importantFirst,
            ),
            deck,
        );
        iterator.setIteratorTopicPath(TopicPath.getTopicPathFromTag("#flashcards"));
        expect(iterator.nextRepItem()).toBe(true);
        expect(iterator.currentRepItem.front).toEqual(expected);
    });
});

describe("higher retention for important cards", () => {
    function intervalAfterGood(important: boolean, higherRetention: boolean): number {
        const fsrs = new SrsAlgorithmFsrs({
            ...DEFAULT_SETTINGS,
            importantHigherRetention: higherRetention,
            importantRetention: 0.97,
        });
        const schedule = new RepItemScheduleInfoOsr(moment("2023-09-06"), 20, 250, 0);
        return fsrs.cardCalcUpdatedSchedule(
            ReviewResponse.Good,
            schedule,
            new DueDateHistogram(),
            important,
        ).interval;
    }

    test("an important card comes back sooner when the setting is on", () => {
        expect(intervalAfterGood(true, true)).toBeLessThan(intervalAfterGood(false, true));
    });

    test("with the setting off, important makes no difference", () => {
        expect(intervalAfterGood(true, false)).toEqual(intervalAfterGood(false, false));
    });
});
