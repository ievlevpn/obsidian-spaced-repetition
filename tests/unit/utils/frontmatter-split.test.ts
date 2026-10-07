import { splitNoteIntoFrontmatterAndContent, splitTextIntoLineArray } from "src/utils/strings";

// The implementation before the fast path, kept as the reference
function reference(str: string): [string, string] {
    const lines = splitTextIntoLineArray(str);
    let lineIndex = 0;
    let hasFrontmatter = false;
    do {
        if (lineIndex === 0 && lines[lineIndex] === "---") {
            hasFrontmatter = true;
        } else if (hasFrontmatter && lines[lineIndex] === "---") {
            hasFrontmatter = false;
            lineIndex++;
        }
        if (hasFrontmatter) {
            lineIndex++;
        }
    } while (hasFrontmatter && lineIndex < lines.length);
    if (hasFrontmatter) {
        lineIndex = 0;
    }
    const frontmatter: string = lines.slice(0, lineIndex).join("\n");
    const emptyLines: string[] = lineIndex > 0 ? Array(lineIndex).join(".").split(".") : [];
    const content: string = emptyLines.concat(lines.slice(lineIndex)).join("\n");
    return [frontmatter, content];
}

describe("splitNoteIntoFrontmatterAndContent gives the same result as before", () => {
    test.each([
        "",
        "---",
        "---\n",
        "---\n---",
        "---\n---\n",
        "---\ntags: a\n---\nbody",
        "---\ntags: a\n---\nbody\n",
        "---\ntags: a\n---",
        "---\ntags: a\nno closing",
        "----\na\n---\nb",
        "---\na\n----\nb\n---\nc",
        "---\na\n--- \nb",
        " ---\na\n---\nb",
        "body only\n---\nnot frontmatter\n---",
        "---\n\n---\n\n\nbody",
        "---\r\ntags: a\r\n---\r\nbody",
    ])("%j", (text) => {
        expect(splitNoteIntoFrontmatterAndContent(text)).toEqual(reference(text));
    });

    test("random texts made of dashes, letters and line breaks", () => {
        const pieces = ["---", "--", "-", "\n", "a", " ", "---\n", "\n---"];
        let seed = 7;
        const random = (n: number) => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed % n;
        };
        for (let i = 0; i < 5000; i++) {
            let text = random(2) === 0 ? "---\n" : "";
            const length = random(12);
            for (let j = 0; j < length; j++) text += pieces[random(pieces.length)];
            expect(splitNoteIntoFrontmatterAndContent(text)).toEqual(reference(text));
        }
    });
});
