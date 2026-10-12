import { App, Component, Platform, Scope } from "obsidian";

import { t } from "src/lang/helpers";
import { createEmbeddedMarkdownEditor } from "src/ui/obsidian-ui-components/embedded-markdown-editor";
import { TextDirection } from "src/utils/strings";

/**
 * The field for typing the answer: an embedded Obsidian editor (live preview, latex-suite), or a
 * plain text box when that is unavailable. Check (or Mod+Enter) shows the answer; Esc leaves the
 * field.
 *
 * Single line, for a short plain-text answer that is compared letter by letter: Enter checks.
 * Otherwise a box for an answer that cannot be checked that way (a long or multi-line answer,
 * math, a cloze card whose blanks are all math): on the back what was typed is shown beside the
 * answer, for judging oneself.
 */
export class FreeAnswerBox {
    private app: App;
    private scope: Scope;
    private scopePushed: boolean = false;
    private getText: () => string;
    private focusInput: () => void;
    private destroyInput: () => void;

    constructor(
        app: App,
        owner: Component,
        parentEl: HTMLElement,
        opts: {
            notePath: string;
            onCheck: () => void;
            textDirection?: TextDirection;
            singleLine?: boolean;
        },
    ) {
        this.app = app;
        const singleLine: boolean = opts.singleLine === true;
        const wrap = parentEl.createDiv("sr-typed-free");
        wrap.toggleClass("is-single-line", singleLine);
        if (opts.textDirection === TextDirection.Rtl) wrap.setAttribute("dir", "rtl");

        const editor = createEmbeddedMarkdownEditor(
            app,
            owner,
            wrap,
            "sr-typed-free-editor",
            t("TYPED_ANSWER_PLACEHOLDER"),
        );
        let inputEl: HTMLElement;
        if (editor) {
            editor.setFilePath(opts.notePath);
            inputEl = editor.el;
            // An answer, not prose: no spelling marks, and no capital forced at its start
            const content: HTMLElement | null = editor.el.querySelector(".cm-content");
            content?.setAttribute("spellcheck", "false");
            content?.setAttribute("autocapitalize", "off");
            content?.setAttribute("autocorrect", "off");
            if (singleLine) content?.setAttribute("enterkeyhint", "go");
            this.getText = () => editor.getValue();
            this.focusInput = () => editor.focus();
            this.destroyInput = () => editor.destroy();
        } else {
            const textarea = wrap.createEl("textarea", {
                cls: "sr-typed-free-textarea",
                attr: {
                    placeholder: t("TYPED_ANSWER_PLACEHOLDER"),
                    rows: singleLine ? 1 : 3,
                    spellcheck: "false",
                    autocapitalize: "off",
                    autocorrect: "off",
                },
            });
            inputEl = textarea;
            this.getText = () => textarea.value;
            this.focusInput = () => textarea.focus();
            this.destroyInput = () => textarea.remove();
        }

        // A quiet link, like the note box's "save"
        const bar = wrap.createDiv("sr-typed-free-bar");
        const check = bar.createEl("a", {
            cls: "sr-typed-free-check",
            text: t("TYPED_FREE_CHECK"),
        });
        check.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            opts.onCheck();
        });
        if (!Platform.isPhone) {
            check.createSpan({
                cls: "sr-typed-free-key",
                text: singleLine ? "↵" : Platform.isMacOS ? "⌘↵" : "Ctrl+↵",
            });
        }

        // On Obsidian's keymap while the box has focus, so these win over the vault's Mod+Enter
        // (toggle checkbox) and the review window's Esc (close)
        this.scope = new Scope(app.scope);
        this.scope.register(["Mod"], "Enter", () => {
            opts.onCheck();
            return false;
        });
        if (singleLine) {
            this.scope.register([], "Enter", (e: KeyboardEvent) => {
                if (e.isComposing) return true;
                opts.onCheck();
                return false;
            });
        }
        this.scope.register([], "Escape", () => {
            const focused = inputEl.doc.activeElement;
            if (focused instanceof HTMLElement && inputEl.contains(focused)) focused.blur();
            return false;
        });
        inputEl.addEventListener("focusin", () => {
            if (this.scopePushed) return;
            this.app.keymap.pushScope(this.scope);
            this.scopePushed = true;
        });
        inputEl.addEventListener("focusout", (e: FocusEvent) => {
            if (!inputEl.contains(e.relatedTarget as Node | null)) this.popScope();
        });
    }

    get text(): string {
        return this.getText();
    }

    focus(): void {
        this.focusInput();
    }

    destroy(): void {
        this.popScope();
        this.destroyInput();
    }

    private popScope(): void {
        if (!this.scopePushed) return;
        this.app.keymap.popScope(this.scope);
        this.scopePushed = false;
    }
}
