import { attachRightEdgeSwipe, isRightEdgeSwipe, startsAtRightEdge } from "src/utils/edge-swipe";

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

    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { value: W, configurable: true });
    });

    test("fires once for a swipe from the edge and keeps it from bubbling", () => {
        const parent = document.createElement("div");
        const el = parent.appendChild(document.createElement("div"));
        const onSwipe = jest.fn();
        const bubbled = jest.fn();
        parent.addEventListener("touchstart", bubbled);
        attachRightEdgeSwipe(el, onSwipe);

        el.dispatchEvent(touch("touchstart", 385, 400));
        el.dispatchEvent(touch("touchmove", 340, 402));
        el.dispatchEvent(touch("touchend", 290, 405));

        expect(onSwipe).toHaveBeenCalledTimes(1);
        expect(bubbled).not.toHaveBeenCalled();
    });

    test("ignores touches away from the edge and lets them bubble", () => {
        const parent = document.createElement("div");
        const el = parent.appendChild(document.createElement("div"));
        const onSwipe = jest.fn();
        const bubbled = jest.fn();
        parent.addEventListener("touchstart", bubbled);
        attachRightEdgeSwipe(el, onSwipe);

        el.dispatchEvent(touch("touchstart", 200, 400));
        el.dispatchEvent(touch("touchend", 100, 400));

        expect(onSwipe).not.toHaveBeenCalled();
        expect(bubbled).toHaveBeenCalled();
    });

    test("does nothing while inactive, and stops after detaching", () => {
        const el = document.createElement("div");
        const onSwipe = jest.fn();
        let active = false;
        const detach = attachRightEdgeSwipe(el, onSwipe, () => active);

        el.dispatchEvent(touch("touchstart", 385, 400));
        el.dispatchEvent(touch("touchend", 290, 400));
        expect(onSwipe).not.toHaveBeenCalled();

        active = true;
        detach();
        el.dispatchEvent(touch("touchstart", 385, 400));
        el.dispatchEvent(touch("touchend", 290, 400));
        expect(onSwipe).not.toHaveBeenCalled();
    });

    test("a two-finger touch is not a swipe", () => {
        const el = document.createElement("div");
        const onSwipe = jest.fn();
        attachRightEdgeSwipe(el, onSwipe);
        el.dispatchEvent(touch("touchstart", 385, 400, 2));
        el.dispatchEvent(touch("touchend", 290, 400));
        expect(onSwipe).not.toHaveBeenCalled();
    });
});
