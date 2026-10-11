import { App, ButtonComponent, Component, Platform, Scope } from "obsidian";

import { t } from "src/lang/helpers";
import { createEmbeddedMarkdownEditor } from "src/ui/obsidian-ui-components/embedded-markdown-editor";
import { TextDirection } from "src/utils/strings";

/**
 * A box for typing the answer to a card that cannot be checked letter by letter (a long or
 * multi-line answer, math, a cloze card whose blanks are all math). Nothing is compared: on the
 * back what was typed is shown beside the answer, for judging oneself.
 *
 * It is an embedded Obsidian editor (live preview, latex-suite), or a plain text box when that is
 * unavailable. Check (or Mod+Enter) shows the answer; Esc leaves the box.
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
        opts: { notePath: string; onCheck: () => void; textDirection?: TextDirection },
    ) {
        this.app = app;
        const wrap = parentEl.createDiv("sr-typed-free");
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
            this.getText = () => editor.getValue();
            this.focusInput = () => editor.focus();
            this.destroyInput = () => editor.destroy();
        } else {
            const textarea = wrap.createEl("textarea", {
                cls: "sr-typed-free-textarea",
                attr: { placeholder: t("TYPED_ANSWER_PLACEHOLDER"), rows: 3 },
            });
            inputEl = textarea;
            this.getText = () => textarea.value;
            this.focusInput = () => textarea.focus();
            this.destroyInput = () => textarea.remove();
        }

        const bar = wrap.createDiv("sr-typed-free-bar");
        const check = new ButtonComponent(bar)
            .setButtonText(t("TYPED_FREE_CHECK"))
            .setCta()
            .onClick(() => opts.onCheck());
        if (!Platform.isPhone) {
            check.buttonEl.createSpan({
                cls: "sr-typed-free-key",
                text: Platform.isMacOS ? "⌘↵" : "Ctrl+↵",
            });
        }

        // On Obsidian's keymap while the box has focus, so these win over the vault's Mod+Enter
        // (toggle checkbox) and the review window's Esc (close)
        this.scope = new Scope(app.scope);
        this.scope.register(["Mod"], "Enter", () => {
            opts.onCheck();
            return false;
        });
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
