import "src/ui/obsidian-ui-components/content-container/card-container/typed-answer/typed-answer.css";
import { setIcon } from "obsidian";

import { t } from "src/lang/helpers";
import { DiffPart, TypedComparison } from "src/scheduling/typed-answer";
import { TextDirection } from "src/utils/strings";

// The field and the result of typing the answer. Ported from Flashcard Studio
// (github.com/Almalkiid/flashcard-studio, MIT).

/**
 * The text field under the question. Enter (not while composing text with an input method) calls
 * `onSubmit`.
 */
export function renderTypedInput(
    parent: HTMLElement,
    opts: { onSubmit: () => void; textDirection?: TextDirection },
): HTMLInputElement {
    const wrap = parent.createDiv({ cls: "sr-typed" });
    if (opts.textDirection === TextDirection.Rtl) wrap.setAttribute("dir", "rtl");
    const input = wrap.createEl("input", {
        cls: "sr-typed-input",
        type: "text",
        attr: {
            placeholder: t("TYPED_ANSWER_PLACEHOLDER"),
            "aria-label": t("TYPED_ANSWER_PLACEHOLDER"),
            autocomplete: "off",
            autocapitalize: "off",
            autocorrect: "off",
            spellcheck: "false",
            enterkeyhint: "go",
        },
    });
    input.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        input.blur();
        opts.onSubmit();
    });
    return input;
}

/** Appends the parts of a comparison as marked spans. */
export function addDiffParts(line: HTMLElement, parts: DiffPart[]): void {
    for (const part of parts) line.createSpan({ cls: `sr-typed-${part.kind}`, text: part.text });
}

/**
 * What was typed with each letter marked right or wrong, an arrow, and the expected answer with
 * the letters that were left out marked. An exact answer shows just the one line.
 */
export function renderTypedResult(
    parent: HTMLElement,
    comparison: TypedComparison,
    textDirection?: TextDirection,
): HTMLElement {
    const box = parent.createDiv({ cls: "sr-typed-result" });
    if (textDirection === TextDirection.Rtl) box.setAttribute("dir", "rtl");
    box.toggleClass("is-exact", comparison.exact);
    const typedLine = box.createDiv({ cls: "sr-typed-line" });
    addDiffParts(typedLine, comparison.typed);
    if (comparison.exact) {
        setIcon(typedLine.createSpan({ cls: "sr-typed-check" }), "check");
        return box;
    }
    setIcon(box.createDiv({ cls: "sr-typed-arrow" }), "arrow-down");
    addDiffParts(box.createDiv({ cls: "sr-typed-line" }), comparison.expected);
    return box;
}
