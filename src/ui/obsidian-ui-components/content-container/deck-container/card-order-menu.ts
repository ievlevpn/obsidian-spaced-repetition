// The menu of card orders on a deck in the deck list: review this deck in another order, for this
// session only. Opened by right-click, or by a long press on a touch screen.

import { Menu } from "obsidian";

import type { IBaseLocale } from "src/lang/base-locale";
import { t } from "src/lang/helpers";

// RepItemOrder names, in the order of the menu, with their labels
const CARD_ORDERS: [string, keyof IBaseLocale][] = [
    ["NewFirstSequential", "ORDER_NEW_FIRST"],
    ["NewFirstRandom", "ORDER_NEW_FIRST_RANDOM"],
    ["DueFirstSequential", "ORDER_DUE_FIRST"],
    ["DueFirstRandom", "ORDER_DUE_FIRST_RANDOM"],
    ["EveryCardRandomDeckAndCard", "ORDER_RANDOM_ALL"],
    ["DueFirstRandomDeckAndCard", "ORDER_DUE_FIRST_RANDOM_ALL"],
];

/**
 * How a deck is reviewed when started from its menu: in another card order, or only its important
 * cards. A plain click passes none.
 */
export interface DeckReviewOptions {
    cardOrder?: string;
    importantOnly?: boolean;
}

// How long a finger rests on a row before the menu opens, and how far it may drift meanwhile
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;

/**
 * Shows the card orders at `position`; the setting's order is ticked.
 *
 * @param position - Where to open the menu
 * @param defaultOrder - The card order of the settings
 * @param onPick - Called with the RepItemOrder name that was chosen
 */
export function showCardOrderMenu(
    position: { x: number; y: number },
    defaultOrder: string,
    onPick: (options: DeckReviewOptions) => void,
): void {
    const menu = new Menu();
    menu.addItem((item) =>
        item
            .setTitle(t("REVIEW_IMPORTANT_CARDS"))
            .setIcon("star")
            .onClick(() => onPick({ importantOnly: true })),
    );
    menu.addSeparator();
    menu.addItem((item) => item.setTitle(t("REVIEW_IN_ORDER")).setIsLabel(true));
    for (const [order, label] of CARD_ORDERS) {
        menu.addItem((item) =>
            item
                .setTitle(t(label))
                .setChecked(order === defaultOrder)
                .onClick(() => onPick({ cardOrder: order })),
        );
    }
    menu.showAtPosition(position);
}

/**
 * Calls `open` on right-click, and on a long press on a touch screen (where no contextmenu event
 * comes). The click that ends a long press is swallowed, so the row's own click does not fire.
 */
export function attachContextMenu(
    el: HTMLElement,
    open: (position: { x: number; y: number }) => void,
): void {
    el.addEventListener("contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        open({ x: e.clientX, y: e.clientY });
    });

    let timer: number | null = null;
    let start: { x: number; y: number } | null = null;
    let fired = false;
    const cancel = () => {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        start = null;
    };
    el.addEventListener(
        "touchstart",
        (e: TouchEvent) => {
            if (e.touches.length !== 1) return cancel();
            fired = false;
            start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            const at = start;
            timer = window.setTimeout(() => {
                timer = null;
                fired = true;
                open(at);
            }, LONG_PRESS_MS);
        },
        { passive: true },
    );
    el.addEventListener(
        "touchmove",
        (e: TouchEvent) => {
            if (start === null) return;
            const dx = e.touches[0].clientX - start.x;
            const dy = e.touches[0].clientY - start.y;
            if (Math.hypot(dx, dy) > LONG_PRESS_SLOP_PX) cancel();
        },
        { passive: true },
    );
    el.addEventListener("touchend", cancel);
    el.addEventListener("touchcancel", cancel);
    el.addEventListener(
        "click",
        (e: MouseEvent) => {
            if (!fired) return;
            fired = false;
            e.preventDefault();
            e.stopImmediatePropagation();
        },
        true,
    );
}
