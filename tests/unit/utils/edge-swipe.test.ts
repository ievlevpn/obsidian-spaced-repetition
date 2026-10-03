import {
    attachRightEdgeSwipe,
    EdgeSwipeHandlers,
    isRightEdgeSwipe,
    startsAtRightEdge,
} from "src/utils/edge-swipe";

const W = 390; // iPhone viewport width

describe("startsAtRightEdge", () => {
    test("within the edge band", () => {
        expect(startsAtRightEdge({ x: 385, y: 300 }, W)).toBe(true);
        expect(startsAtRightEdge({ x: 360, y: 300 }, W)).toBe(true);
    });

    test("away from the edge", () => {
        expect(startsAtRightEdge({ x: 300, y: 300 }, W)).toBe(false);
        expect(startsAtRightEdge({ x: 5, y: 300 }, W)).toBe(false);
    });
});

describe("isRightEdgeSwipe", () => {
    const start = { x: 385, y: 400 };

    test("a leftward horizontal swipe from the edge", () => {
        expect(isRightEdgeSwipe(start, { x: 300, y: 410 }, W)).toBe(true);
    });

    test("too short", () => {
        expect(isRightEdgeSwipe(start, { x: 340, y: 400 }, W)).toBe(false);
    });

    test("too vertical (a scroll)", () => {
        expect(isRightEdgeSwipe(start, { x: 300, y: 500 }, W)).toBe(false);
    });

    test("rightward or not from the edge", () => {
        expect(isRightEdgeSwipe({ x: 200, y: 400 }, { x: 100, y: 400 }, W)).toBe(false);
        expect(isRightEdgeSwipe(start, { x: 389, y: 400 }, W)).toBe(false);
    });
});

describe("attachRightEdgeSwipe", () => {
    const touch = (type: string, x: number, y: number, touches = 1) => {
        const e = new Event(type, { bubbles: true, cancelable: true }) as Event & {
            touches: unknown[];
            changedTouches: unknown[];
        };
        const t = { clientX: x, clientY: y };
        e.touches = type === "touchend" ? [] : Array(touches).fill(t);
        e.changedTouches = [t];
        return e;
    };
    const setup = (active: () => boolean = () => true) => {
        const parent = document.createElement("div");
        const el = parent.appendChild(document.createElement("div"));
        const handlers: EdgeSwipeHandlers & { onMove: jest.Mock; onRelease: jest.Mock } = {
            isActive: active,
            onMove: jest.fn(),
            onRelease: jest.fn(),
        };
        const bubbled = jest.fn();
        parent.addEventListener("touchstart", bubbled);
        const detach = attachRightEdgeSwipe(el, handlers);
        return { el, handlers, bubbled, detach };
    };

    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { value: W, configurable: true });
    });

    test("reports progress, arms past the threshold, and commits on release", () => {
        const { el, handlers, bubbled } = setup();
        el.dispatchEvent(touch("touchstart", 385, 400));
        el.dispatchEvent(touch("touchmove", 360, 401));
        el.dispatchEvent(touch("touchmove", 300, 403));
        el.dispatchEvent(touch("touchend", 295, 404));

        expect(handlers.onMove.mock.calls).toEqual([
            [-25, false],
            [-85, true],
        ]);
        expect(handlers.onRelease.mock.calls).toEqual([[true]]);
        expect(bubbled).not.toHaveBeenCalled();
    });

    test("releasing before the threshold, or after dragging back, does not commit", () => {
        const { el, handlers } = setup();
        el.dispatchEvent(touch("touchstart", 385, 400));
        el.dispatchEvent(touch("touchmove", 300, 400));
        el.dispatchEvent(touch("touchmove", 370, 400)); // dragged back
        el.dispatchEvent(touch("touchend", 370, 400));
        expect(handlers.onRelease.mock.calls).toEqual([[false]]);
    });

    test("a vertical scroll starting at the edge is abandoned", () => {
        const { el, handlers } = setup();
        el.dispatchEvent(touch("touchstart", 385, 400));
        el.dispatchEvent(touch("touchmove", 383, 440));
        el.dispatchEvent(touch("touchmove", 300, 445));
        el.dispatchEvent(touch("touchend", 290, 445));
        expect(handlers.onMove).not.toHaveBeenCalled();
        expect(handlers.onRelease).not.toHaveBeenCalled();
    });

    test("a tap at the edge is neither a move nor a release", () => {
        const { el, handlers } = setup();
        el.dispatchEvent(touch("touchstart", 385, 400));
        el.dispatchEvent(touch("touchend", 386, 400));
        expect(handlers.onMove).not.toHaveBeenCalled();
        expect(handlers.onRelease).not.toHaveBeenCalled();
    });

    test("touches away from the edge are ignored and bubble", () => {
        const { el, handlers, bubbled } = setup();
        el.dispatchEvent(touch("touchstart", 200, 400));
        el.dispatchEvent(touch("touchmove", 100, 400));
        el.dispatchEvent(touch("touchend", 100, 400));
        expect(handlers.onMove).not.toHaveBeenCalled();
        expect(bubbled).toHaveBeenCalled();
    });

    test("does nothing while inactive, and stops after detaching", () => {
        let active = false;
        const { el, handlers, detach } = setup(() => active);
        el.dispatchEvent(touch("touchstart", 385, 400));
        el.dispatchEvent(touch("touchmove", 300, 400));
        el.dispatchEvent(touch("touchend", 290, 400));
        expect(handlers.onRelease).not.toHaveBeenCalled();

        active = true;
        detach();
        el.dispatchEvent(touch("touchstart", 385, 400));
        el.dispatchEvent(touch("touchmove", 300, 400));
        el.dispatchEvent(touch("touchend", 290, 400));
        expect(handlers.onRelease).not.toHaveBeenCalled();
    });

    test("a cancelled touch springs back", () => {
        const { el, handlers } = setup();
        el.dispatchEvent(touch("touchstart", 385, 400));
        el.dispatchEvent(touch("touchmove", 300, 400));
        el.dispatchEvent(touch("touchcancel", 300, 400));
        expect(handlers.onRelease.mock.calls).toEqual([[false]]);
    });

    test("a two-finger touch is not a swipe", () => {
        const { el, handlers } = setup();
        el.dispatchEvent(touch("touchstart", 385, 400, 2));
        el.dispatchEvent(touch("touchmove", 300, 400, 2));
        el.dispatchEvent(touch("touchend", 290, 400));
        expect(handlers.onMove).not.toHaveBeenCalled();
    });
});
