import { attachPullDown, MAX_OFFSET, PULL_DISTANCE, pullOffset } from "src/utils/pull-down";

function touch(type: string, el: HTMLElement, x: number, y: number): Event {
    const e = new Event(type, { bubbles: true, cancelable: true }) as Event & {
        touches: unknown[];
    };
    Object.defineProperty(e, "touches", {
        value: type === "touchend" || type === "touchcancel" ? [] : [{ clientX: x, clientY: y }],
    });
    el.dispatchEvent(e);
    return e;
}

describe("attachPullDown", () => {
    let el: HTMLElement;
    let active: boolean;
    let onMove: jest.Mock;
    let onRelease: jest.Mock;

    beforeEach(() => {
        el = document.createElement("div");
        active = true;
        onMove = jest.fn();
        onRelease = jest.fn();
        attachPullDown(el, { isActive: () => active, onMove, onRelease });
    });

    test("a pull past the distance commits on release", () => {
        touch("touchstart", el, 100, 100);
        touch("touchmove", el, 102, 140);
        touch("touchmove", el, 103, 100 + PULL_DISTANCE + 5);
        touch("touchend", el, 0, 0);
        expect(onMove).toHaveBeenLastCalledWith(expect.any(Number), true);
        expect(onRelease).toHaveBeenCalledWith(true);
    });

    test("a short pull springs back without committing", () => {
        touch("touchstart", el, 100, 100);
        touch("touchmove", el, 100, 140);
        touch("touchend", el, 0, 0);
        expect(onMove).toHaveBeenLastCalledWith(pullOffset(40), false);
        expect(onRelease).toHaveBeenCalledWith(false);
    });

    test("a drag up is a scroll: left to the browser", () => {
        touch("touchstart", el, 100, 300);
        const move = touch("touchmove", el, 100, 200);
        touch("touchmove", el, 100, 400);
        touch("touchend", el, 0, 0);
        expect(move.defaultPrevented).toBe(false);
        expect(onMove).not.toHaveBeenCalled();
        expect(onRelease).not.toHaveBeenCalled();
    });

    test("a card scrolled down is not pulled: the drag scrolls it", () => {
        active = false;
        touch("touchstart", el, 100, 100);
        const move = touch("touchmove", el, 100, 300);
        touch("touchend", el, 0, 0);
        expect(move.defaultPrevented).toBe(false);
        expect(onMove).not.toHaveBeenCalled();
    });

    test("a sideways drag is not a pull", () => {
        touch("touchstart", el, 100, 100);
        touch("touchmove", el, 160, 120);
        touch("touchmove", el, 160, 300);
        touch("touchend", el, 0, 0);
        expect(onMove).not.toHaveBeenCalled();
        expect(onRelease).not.toHaveBeenCalled();
    });

    test("pulling back up before release cancels", () => {
        touch("touchstart", el, 100, 100);
        touch("touchmove", el, 100, 100 + PULL_DISTANCE + 20);
        touch("touchmove", el, 100, 110);
        touch("touchend", el, 0, 0);
        expect(onRelease).toHaveBeenCalledWith(false);
    });

    test("the content's offset is damped and capped", () => {
        expect(pullOffset(-20)).toBe(0);
        expect(pullOffset(40)).toBe(20);
        expect(pullOffset(1000)).toBe(MAX_OFFSET);
    });
});
