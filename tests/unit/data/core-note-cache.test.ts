import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { DEFAULT_SETTINGS, SRSettings } from "src/data/settings";
import { Note } from "src/note/note";
import { RepItemState } from "src/scheduling/algorithms/base/repetition-item";
import { setupStaticDateProvider20230906 } from "src/utils/dates";

import { UnitTestOsrCore } from "../helpers/unit-test-core";
import { UnitTestSRFile } from "../helpers/unit-test-file";
import { unitTestSetupStandardDataStoreAlgorithm } from "../helpers/unit-test-setup";

// A sync parses each flashcard note again only when its file changed
describe("notes are reused between syncs while unchanged", () => {
    let dir: string;
    let settings: SRSettings;

    beforeAll(() => {
        setupStaticDateProvider20230906();
    });

    beforeEach(() => {
        settings = { ...DEFAULT_SETTINGS };
        unitTestSetupStandardDataStoreAlgorithm(settings);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "sr-cache-"));
        fs.writeFileSync(path.join(dir, "a.md"), "#flashcards\nQ1::A1\n");
        fs.writeFileSync(path.join(dir, "b.md"), "#flashcards\nQ2::A2\n");
    });

    // One sync over the files; every file gets `version` unless overridden
    async function sync(core: UnitTestOsrCore, versions: Record<string, string | null>) {
        core.loadInitialStateOfCore();
        const files = fs.readdirSync(dir);
        core.initializeFileMap(dir, files);
        for (const name of files) {
            const file: UnitTestSRFile = core.getFileMap().get(path.join(dir, name));
            file.versionKey = versions[name] ?? null;
            await core.processFile(file);
        }
        await core.finalizeLoad();
    }

    function noteOf(core: UnitTestOsrCore, front: string): Note {
        return core.reviewableDeckTree
            .getFlattenedRepItemArray(RepItemState.AnyItem, true)
            .find((card) => card.front === front)?.question.note;
    }

    function allFronts(core: UnitTestOsrCore): string[] {
        const deck = core.reviewableDeckTree;
        return [...deck.getDeck(deck.subdecks[0].getTopicPath()).newRepItems]
            .map((c) => c.front)
            .sort();
    }

    test("an unchanged file gives the same parsed note", async () => {
        const core = new UnitTestOsrCore(settings);
        await sync(core, { "a.md": "v1", "b.md": "v1" });
        const first = noteOf(core, "Q1");
        await sync(core, { "a.md": "v1", "b.md": "v1" });
        expect(noteOf(core, "Q1")).toBe(first);
        expect(allFronts(core)).toEqual(["Q1", "Q2"]);
    });

    test("a changed file is parsed again", async () => {
        const core = new UnitTestOsrCore(settings);
        await sync(core, { "a.md": "v1", "b.md": "v1" });
        const first = noteOf(core, "Q1");
        fs.writeFileSync(path.join(dir, "a.md"), "#flashcards\nQ1 changed::A1\n");
        await sync(core, { "a.md": "v2", "b.md": "v1" });
        expect(noteOf(core, "Q1 changed")).toBeDefined();
        expect(noteOf(core, "Q1 changed")).not.toBe(first);
    });

    test("without a version, nothing is reused", async () => {
        const core = new UnitTestOsrCore(settings);
        await sync(core, {});
        const first = noteOf(core, "Q1");
        await sync(core, {});
        expect(noteOf(core, "Q1")).not.toBe(first);
    });

    test("changed settings parse everything again", async () => {
        const core = new UnitTestOsrCore(settings);
        await sync(core, { "a.md": "v1", "b.md": "v1" });
        const first = noteOf(core, "Q1");
        settings.singleLineCardSeparator = "::";
        settings.flashcardTags = ["#flashcards", "#other"];
        await sync(core, { "a.md": "v1", "b.md": "v1" });
        expect(noteOf(core, "Q1")).not.toBe(first);
    });

    test("a deleted note leaves the decks", async () => {
        const core = new UnitTestOsrCore(settings);
        await sync(core, { "a.md": "v1", "b.md": "v1" });
        fs.unlinkSync(path.join(dir, "b.md"));
        await sync(core, { "a.md": "v1" });
        expect(allFronts(core)).toEqual(["Q1"]);
    });
});
