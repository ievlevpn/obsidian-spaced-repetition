// A real Obsidian markdown editor embedded in a plugin view, so the card comment box gets live
// preview, math rendering, and every editor extension other plugins register (e.g. the snippets
// of obsidian-latex-suite), exactly as in a note.
//
// Obsidian has no public API for this. The editor class is taken from one of Obsidian's own
// embedded markdown views, the same technique the Kanban plugin uses. Everything private stays
// in this file; if any of it is missing, createEmbeddedMarkdownEditor returns null and the
// caller falls back to a plain textarea.

import { App, Component, Platform, TFile } from "obsidian";

// The public Editor API the comment box uses, plus the CodeMirror view behind it
interface EditorLike {
    getValue(): string;
    focus(): void;
    cm: { contentDOM: HTMLElement };
}

interface MarkdownEditorLike extends Component {
    editor: EditorLike;
    set(value: string, clear?: boolean): void;
}

type MarkdownEditorClass = new (
    app: App,
    containerEl: HTMLElement,
    owner: object,
) => MarkdownEditorLike;

interface WorkspaceLike {
    activeEditor: unknown;
}
interface MobileToolbarLike {
    update(): void;
}

let editorClass: MarkdownEditorClass | null | undefined;

// Borrow Obsidian's editor class from a throwaway embedded markdown view (resolved once).
function resolveEditorClass(app: App): MarkdownEditorClass | null {
    if (editorClass !== undefined) return editorClass;
    try {
        const registry = (
            app as unknown as { embedRegistry: { embedByExtension: Record<string, Function> } }
        ).embedRegistry;
        const view = registry.embedByExtension.md(
            { app, containerEl: createDiv(), state: {} },
            null,
            "",
        ) as {
            load(): void;
            unload(): void;
            editable: boolean;
            showEditor(): void;
            editMode: object;
        };
        view.load();
        view.editable = true;
        view.showEditor();
        editorClass = Object.getPrototypeOf(Object.getPrototypeOf(view.editMode))
            .constructor as MarkdownEditorClass;
        view.unload();
    } catch (e) {
        console.warn("SR: could not embed Obsidian's markdown editor; using a plain text box", e);
        editorClass = null;
    }
    return editorClass;
}

// Line numbers and fold markers make no sense in a small comment box: hide them from this
// editor only, by answering for those vault settings through a proxy of the app.
function appWithoutGutters(app: App): App {
    const hidden = new Set(["showLineNumber", "foldHeading", "foldIndent"]);
    return new Proxy(app, {
        get(target, prop, receiver) {
            if (prop !== "vault") return Reflect.get(target, prop, receiver);
            return new Proxy(app.vault, {
                get(vault, vprop, vreceiver) {
                    if (vprop !== "config") return Reflect.get(vault, vprop, vreceiver);
                    const config = Reflect.get(vault, vprop, vreceiver) as object;
                    return new Proxy(config, {
                        get: (c, key, r) =>
                            hidden.has(String(key)) ? false : Reflect.get(c, key, r),
                    });
                },
            });
        },
    });
}

export interface EmbeddedMarkdownEditor {
    readonly el: HTMLElement;
    getValue(): string;
    setValue(value: string): void;
    setFilePath(path: string | null): void;
    destroy(): void;
}

/**
 * Create an Obsidian markdown editor inside `parentEl`.
 *
 * @param app - The app
 * @param parent - The component that owns the editor (unloading it unloads the editor)
 * @param parentEl - Where to put the editor
 * @param placeholder - Shown while the editor is empty
 * @returns The editor, or null if Obsidian's editor class could not be obtained
 */
export function createEmbeddedMarkdownEditor(
    app: App,
    parent: Component,
    parentEl: HTMLElement,
    placeholder: string,
): EmbeddedMarkdownEditor | null {
    const EditorClass = resolveEditorClass(app);
    if (!EditorClass) return null;

    const el = parentEl.createDiv("sr-card-comment-editor");
    el.dataset.placeholder = placeholder;
    let filePath: string | null = null;
    let instance: MarkdownEditorLike;
    // What the editor sees as its view: the file is the note the comment is written to, so
    // links and attachments resolve relative to it. getMode "source" is the editing view;
    // live preview follows the vault's own "Default editing mode".
    const owner = {
        app,
        showSearch: () => {},
        toggleMode: () => {},
        onMarkdownScroll: () => {},
        getMode: () => "source",
        scroll: 0,
        editMode: null as MarkdownEditorLike | null,
        get editor() {
            return instance?.editor;
        },
        get file() {
            const file = filePath ? app.vault.getAbstractFileByPath(filePath) : null;
            return file instanceof TFile ? file : null;
        },
        get path() {
            return filePath ?? "";
        },
    };

    try {
        instance = new EditorClass(appWithoutGutters(app), el, owner);
        parent.addChild(instance);
        owner.editMode = instance;
        instance.set("");
    } catch (e) {
        console.warn(
            "SR: could not create the embedded markdown editor; using a plain text box",
            e,
        );
        el.remove();
        return null;
    }

    const workspace = app.workspace as unknown as WorkspaceLike;
    const mobileToolbar = (app as unknown as { mobileToolbar?: MobileToolbarLike }).mobileToolbar;
    const content: HTMLElement = instance.editor.cm.contentDOM;
    const updateEmpty = () => el.toggleClass("is-empty", instance.editor.getValue().length === 0);
    let previousActiveEditor: unknown = null;

    // While focused, this is the active editor: commands, the iPhone formatting toolbar and
    // editor plugins act on it. On blur the note's editor gets that role back.
    content.addEventListener("focus", () => {
        if (workspace.activeEditor !== owner) previousActiveEditor = workspace.activeEditor;
        workspace.activeEditor = owner;
        if (Platform.isMobile) mobileToolbar?.update();
    });
    content.addEventListener("blur", () => {
        if (workspace.activeEditor === owner) workspace.activeEditor = previousActiveEditor;
        if (Platform.isMobile) mobileToolbar?.update();
    });
    content.addEventListener("input", updateEmpty);
    // Esc leaves the box, handing the review keyboard shortcuts back
    el.addEventListener(
        "keydown",
        (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            content.blur();
        },
        true,
    );
    updateEmpty();

    return {
        el,
        getValue: () => instance.editor.getValue(),
        setValue: (value: string) => {
            instance.set(value);
            updateEmpty();
        },
        setFilePath: (path: string | null) => {
            filePath = path;
        },
        destroy: () => {
            if (workspace.activeEditor === owner) workspace.activeEditor = previousActiveEditor;
            parent.removeChild(instance);
            el.remove();
        },
    };
}
