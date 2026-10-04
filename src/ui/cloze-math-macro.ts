import { finishRenderMath, loadMathJax, renderMath } from "obsidian";

/**
 * Makes `\cloze[seq]{answer}{hint}` render in ordinary Obsidian preview (Reading view + Live Preview).
 *
 * `\cloze` is not a real LaTeX command, so MathJax errors on `$\cloze{g(x)}{h}$` unless we teach
 * it the macro. Obsidian's MathJax keeps TeX macro definitions for the whole session, so defining
 * `\cloze` once here makes it available in every note. It is defined with `\newcommand` and an
 * optional first argument, so both `\cloze{answer}{hint}` and `\cloze[seq]{answer}{hint}` expand to
 * the answer and reading a note shows the full formula; the flashcard review path (see
 * math-cloze.ts) renders the occluded/answer forms itself. MathJax (unlike LaTeX) lets
 * `\newcommand` redefine a macro, so a plugin reload does not error.
 *
 * Caveat: a note that is already open when the plugin loads keeps its earlier (macro-less) render
 * until its view is rebuilt (switch to another note and back, or reopen it). Notes opened
 * afterwards are fine.
 */
export async function registerClozeMathMacro(): Promise<void> {
    await loadMathJax();
    try {
        // Three arguments, the first optional ([seq], default empty); expands to the answer (#2).
        renderMath("\\newcommand{\\cloze}[3][]{#2}", false);
        await finishRenderMath();
    } catch (e) {
        console.warn("SR: failed to register \\cloze MathJax macro", e);
    }
}
