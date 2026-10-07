import { DataStore } from "src/data/data-store/base/data-store";
import { TopicPath } from "src/data/data-structures/deck/topic-path";
import { DEFAULT_SETTINGS, SRSettings } from "src/data/settings";
import { Note } from "src/note/note";
import { NoteFileLoader } from "src/note/note-file-loader";
import { TextDirection } from "src/utils/strings";

import { UnitTestSRFile } from "./helpers/unit-test-file";
import { unitTestSetupStandardDataStoreAlgorithm } from "./helpers/unit-test-setup";

const settings: SRSettings = {
    ...DEFAULT_SETTINGS,
    multilineCardEndMarker: "---",
    clozePatterns: ["{{[123;;]answer[;;hint]}}"],
    singleLineCardSeparator: ":::",
    singleLineReversedCardSeparator: "::::",
    cardCommentOnSameLine: true,
};

beforeAll(() => {
    unitTestSetupStandardDataStoreAlgorithm(settings);
});

test("a card's schedule is written on its last line, not on the heading below it", async () => {
    const text = `#flashcards
---
- En vous remerciant {{de}} votre compréhension.

#### Formules finales
- Yours sincerely ::: Cordialement
---
`;
    const file = new UnitTestSRFile(text);
    const note: Note = await new NoteFileLoader(settings).load(
        file,
        TextDirection.Ltr,
        TopicPath.emptyPath,
    );
    const cloze = note.questionList.find((q) => q.questionText.actualQuestion.includes("{{de}}"));
    cloze.cards[0].markers.important = true;
    await DataStore.getInstance().writeSchedule(cloze);

    const lines = file.content.split("\n");
    expect(lines[2]).toMatch(/compréhension\. <!--SR:!2000-01-01,1,250,imp-->$/);
    expect(lines[4]).toBe("#### Formules finales");

    // ... and read back, the card has its marker and the heading is not part of it
    const reread: Note = await new NoteFileLoader(settings).load(
        new UnitTestSRFile(file.content),
        TextDirection.Ltr,
        TopicPath.emptyPath,
    );
    const again = reread.questionList.find((q) => q.questionText.actualQuestion.includes("{{de}}"));
    expect(again.cards[0].markers.important).toBe(true);
    expect(again.questionText.original).not.toContain("####");
});
