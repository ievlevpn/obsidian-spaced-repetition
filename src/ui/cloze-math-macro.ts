import { finishRenderMath, loadMathJax, renderMath } from "obsidian";

/**
 * Makes `\cloze{answer}{hint}` render in ordinary Obsidian preview (Reading view + Live Preview).
 *
 * `\cloze` is not a real LaTeX command, so MathJax errors on `$\cloze{g(x)}{h}$` unless we teach
 * it the macro. Obsidian's MathJax keeps TeX macro definitions for the whole session, so defining
 * `\cloze` once here makes it available in every note. We use `\def` (not `\newcommand`) so a
 * plugin reload doesn't error on redefinition. It expands to its first argument (the answer), so
 * reading a note shows the full formula; the flashcard review path (see math-cloze.ts) renders the
 * occluded/answer forms itself.
 *
 * Caveat: a note that is already open when the plugin loads keeps its earlier (macro-less) render
 * until its view is rebuilt (switch to another note and back, or reopen it). Notes opened
 * afterwards are fine.
 */
export async function registerClozeMathMacro(): Promise<void> {
    await loadMathJax();
    try {
        // \def\cloze#1#2{#1} defines a 2-arg macro that expands to the first arg (the answer).
        renderMath("\\def\\cloze#1#2{#1}", false);
        await finishRenderMath();
    } catch (e) {
        console.warn("SR: failed to register \\cloze MathJax macro", e);
    }
}
