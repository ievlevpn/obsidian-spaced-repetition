import { attachContextMenu } from "src/ui/obsidian-ui-components/content-container/deck-container/card-order-menu";

function touch(type: string, el: HTMLElement, x = 10, y = 10) {
    const e = new Event(type, { bubbles: true }) as Event & { touches: unknown[] };
    Object.defineProperty(e, "touches", {
        value: type === "touchend" || type === "touchcancel" ? [] : [{ clientX: x, clientY: y }],
    });
    el.dispatchEvent(e);
}

function contextmenu(el: HTMLElement) {
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
}

describe("attachContextMenu", () => {
    let el: HTMLElement;
    let open: jest.Mock;

    beforeEach(() => {
        jest.useFakeTimers();
        el = document.createElement("div");
        open = jest.fn();
        attachContextMenu(el, open);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("a long press opens the menu once", () => {
        touch("touchstart", el);
        jest.advanceTimersByTime(600);
        touch("touchend", el);
        expect(open).toHaveBeenCalledTimes(1);
    });

    test("a long press that the platform also turns into contextmenu opens the menu once", () => {
        // contextmenu after the timer
        touch("touchstart", el);
        jest.advanceTimersByTime(600);
        contextmenu(el);
        touch("touchend", el);
        expect(open).toHaveBeenCalledTimes(1);

        // contextmenu before the timer
        jest.advanceTimersByTime(2000);
        touch("touchstart", el);
        jest.advanceTimersByTime(300);
        contextmenu(el);
        jest.advanceTimersByTime(600);
        touch("touchend", el);
        expect(open).toHaveBeenCalledTimes(2);

        // contextmenu just after the finger lifts
        jest.advanceTimersByTime(2000);
        touch("touchstart", el);
        jest.advanceTimersByTime(600);
        touch("touchend", el);
        contextmenu(el);
        expect(open).toHaveBeenCalledTimes(3);
    });

    test("every right-click opens the menu, also after a touch", () => {
        touch("touchstart", el);
        touch("touchend", el);
        jest.advanceTimersByTime(2000);
        contextmenu(el);
        contextmenu(el);
        expect(open).toHaveBeenCalledTimes(2);
    });

    test("a short tap opens nothing", () => {
        touch("touchstart", el);
        jest.advanceTimersByTime(100);
        touch("touchend", el);
        jest.advanceTimersByTime(1000);
        expect(open).not.toHaveBeenCalled();
    });
});
