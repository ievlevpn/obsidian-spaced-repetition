import { ClozeCrafter, IClozeFormatter } from "clozecraft";

import {
    containsMathCloze,
    expandMathClozes,
    stripMathClozes,
} from "src/data/data-structures/card/questions/math-cloze";
import { CardType } from "src/data/data-structures/card/questions/question";
import { SRSettings } from "src/data/settings";
import { findLineIndexOfSearchStringIgnoringWs } from "src/utils/strings";

export class CardFrontBack {
    front: string;
    back: string;

    // The caller is responsible for any required trimming of leading/trailing spaces
    constructor(front: string, back: string) {
        this.front = front;
        this.back = back;
    }
}

export class CardFrontBackUtil {
    static expand(
        questionType: CardType,
        questionText: string,
        settings: SRSettings,
    ): CardFrontBack[] {
        const handler: IQuestionTypeHandler = QuestionTypeFactory.create(questionType);
        return handler.expand(questionText, settings);
    }
}

export interface IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[];
}

class QuestionTypeSingleLineBasic implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        const idx: number = questionText.indexOf(settings.singleLineCardSeparator);
        const item: CardFrontBack = new CardFrontBack(
            questionText.substring(0, idx),
            questionText.substring(idx + settings.singleLineCardSeparator.length),
        );
        const result: CardFrontBack[] = [item];
        return result;
    }
}

class QuestionTypeSingleLineReversed implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        const idx: number = questionText.indexOf(settings.singleLineReversedCardSeparator);
        const side1: string = questionText.substring(0, idx),
            side2: string = questionText.substring(
                idx + settings.singleLineReversedCardSeparator.length,
            );
        const result: CardFrontBack[] = [
            new CardFrontBack(side1, side2),
            new CardFrontBack(side2, side1),
        ];
        return result;
    }
}

class QuestionTypeMultiLineBasic implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        // We don't need to worry about "\r\n", as multi line questions processed by parse() concatenates lines explicitly with "\n"
        const questionLines = questionText.split("\n");
        const lineIdx = findLineIndexOfSearchStringIgnoringWs(
            questionLines,
            settings.multilineCardSeparator,
        );
        const side1: string = questionLines.slice(0, lineIdx).join("\n");
        const side2: string = questionLines.slice(lineIdx + 1).join("\n");

        const result: CardFrontBack[] = [new CardFrontBack(side1, side2)];
        return result;
    }
}

class QuestionTypeMultiLineReversed implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        // We don't need to worry about "\r\n", as multi line questions processed by parse() concatenates lines explicitly with "\n"
        const questionLines = questionText.split("\n");
        const lineIdx = findLineIndexOfSearchStringIgnoringWs(
            questionLines,
            settings.multilineReversedCardSeparator,
        );
        const side1: string = questionLines.slice(0, lineIdx).join("\n");
        const side2: string = questionLines.slice(lineIdx + 1).join("\n");

        const result: CardFrontBack[] = [
            new CardFrontBack(side1, side2),
            new CardFrontBack(side2, side1),
        ];
        return result;
    }
}

class QuestionTypeCloze implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        // Two independent cloze syntaxes can appear in the same block: the `\cloze{answer}{hint}`
        // LaTeX macro and clozecraft's configurable `{{...}}` / `==...==` patterns. Expand both and
        // concatenate, so a block that mixes them yields a card per deletion rather than dropping
        // one syntax. Each pass sees the *other* syntax already collapsed to its plain answer, so
        // every card reads as ordinary prose/formula apart from its own deletion.
        const clozecrafter = new ClozeCrafter(settings.clozePatterns);
        const mathCards: CardFrontBack[] = [];

        if (containsMathCloze(questionText)) {
            mathCards.push(
                ...expandMathClozes(
                    this.flattenClozecraftDeletions(questionText, clozecrafter),
                ).map((c) => new CardFrontBack(c.front, c.back)),
            );
        }

        const clozeNote = clozecrafter.createClozeNote(stripMathClozes(questionText));

        // Determine which question formatter to use based on settings (Cloze patterns as inputs or not).
        const clozeFormatter = settings.convertClozePatternsToInputs
            ? new QuestionTypeClozeInputFormatter()
            : new QuestionTypeClozeFormatter();

        let front: string, back: string;
        const result: CardFrontBack[] = [...mathCards];
        if (clozeNote === null) return result;

        for (let i = 0; i < clozeNote.numCards; i++) {
            front = clozeNote.getCardFront(i, clozeFormatter);
            back = clozeNote.getCardBack(i, clozeFormatter);
            result.push(new CardFrontBack(front, back));
        }

        return result;
    }

    /**
     * Collapse every clozecraft deletion in `text` to its plain answer.
     *
     * `getCardFront` already renders non-target deletions as their bare answer, so asking for
     * card 0 with a formatter that also renders the target plainly yields the fully flattened
     * text. Returns `text` unchanged when it holds no clozecraft deletions.
     *
     * @param text - The card text
     * @param clozecrafter - Crafter configured with the user's cloze patterns
     * @returns `text` with every `{{...}}` / `==...==` deletion replaced by its answer
     */
    private flattenClozecraftDeletions(text: string, clozecrafter: ClozeCrafter): string {
        const note = clozecrafter.createClozeNote(text);
        if (note === null || note.numCards === 0) return text;
        return note.getCardFront(0, new PlainClozeFormatter());
    }
}

/** Renders every cloze deletion as its plain answer, for flattening one syntax while expanding the other. */
class PlainClozeFormatter implements IClozeFormatter {
    asking(answer?: string, _hint?: string): string {
        return answer ?? "";
    }

    showingAnswer(answer: string, _hint?: string): string {
        return answer;
    }

    hiding(answer?: string, _hint?: string): string {
        return answer ?? "";
    }
}

export class QuestionTypeClozeFormatter implements IClozeFormatter {
    asking(_?: string, hint?: string): string {
        return `<span style='color:#2196f3'>${!hint ? "[...]" : `[${hint}]`}</span>`;
    }

    showingAnswer(answer: string, _?: string): string {
        return `<span style='color:#2196f3'>${answer}</span>`;
    }

    hiding(_?: string, hint?: string): string {
        return `<span style='color:var(--code-comment)'>${!hint ? "[...]" : `[${hint}]`}</span>`;
    }
}

export class QuestionTypeClozeInputFormatter implements IClozeFormatter {
    asking(answer?: string, hint?: string): string {
        return `<span style='color:#2196f3'><input class="cloze-input" type="text" size="${!answer ? 1 : answer.length}" />${!hint ? "" : `[${hint}]`}</span>`;
    }

    showingAnswer(answer: string, _?: string): string {
        return `<span class="cloze-answer" style='color:#2196f3'>${answer}</span>`;
    }

    hiding(_?: string, hint?: string): string {
        return `<span style='color:var(--code-comment)'>${!hint ? "[...]" : `[${hint}]`}</span>`;
    }
}

export class QuestionTypeFactory {
    static create(questionType: CardType): IQuestionTypeHandler {
        let handler: IQuestionTypeHandler;
        switch (questionType) {
            case CardType.SingleLineBasic:
                handler = new QuestionTypeSingleLineBasic();
                break;
            case CardType.SingleLineReversed:
                handler = new QuestionTypeSingleLineReversed();
                break;
            case CardType.MultiLineBasic:
                handler = new QuestionTypeMultiLineBasic();
                break;
            case CardType.MultiLineReversed:
                handler = new QuestionTypeMultiLineReversed();
                break;
            case CardType.Cloze:
                handler = new QuestionTypeCloze();
                break;
        }
        return handler;
    }
}
