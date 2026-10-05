import {
    attachEdgeSwipe,
    EdgeSide,
    EdgeSwipeHandlers,
    isEdgeSwipe,
    startsAtEdge,
} from "src/utils/edge-swipe";

const W = 390; // iPhone viewport width

describe("startsAtEdge", () => {
    test("right edge band (44px)", () => {
        expect(startsAtEdge({ x: 385, y: 300 }, W, "right")).toBe(true);
        expect(startsAtEdge({ x: 350, y: 300 }, W, "right")).toBe(true);
        expect(startsAtEdge({ x: 340, y: 300 }, W, "right")).toBe(false);
    });

    test("left edge band (44px)", () => {
        expect(startsAtEdge({ x: 3, y: 300 }, W, "left")).toBe(true);
        expect(startsAtEdge({ x: 44, y: 300 }, W, "left")).toBe(true);
        expect(startsAtEdge({ x: 60, y: 300 }, W, "left")).toBe(false);
    });
});

describe("isEdgeSwipe", () => {
    test("far enough away from the edge, in either direction", () => {
        expect(isEdgeSwipe({ x: 385, y: 400 }, { x: 320, y: 410 }, W, "right")).toBe(true);
        expect(isEdgeSwipe({ x: 5, y: 400 }, { x: 70, y: 410 }, W, "left")).toBe(true);
    });

    test("towards the edge does not count", () => {
        expect(isEdgeSwipe({ x: 5, y: 400 }, { x: 1, y: 400 }, W, "left")).toBe(false);
        expect(isEdgeSwipe({ x: 385, y: 400 }, { x: 389, y: 400 }, W, "right")).toBe(false);
    });

    test("up to 45 degrees is fine, steeper is a scroll", () => {
        expect(isEdgeSwipe({ x: 385, y: 400 }, { x: 315, y: 465 }, W, "right")).toBe(true);
        expect(isEdgeSwipe({ x: 385, y: 400 }, { x: 315, y: 480 }, W, "right")).toBe(false);
    });

    test("a short flick counts when fast, not when slow", () => {
        const start = { x: 385, y: 400 };
        const end = { x: 345, y: 405 }; // 40px
        expect(isEdgeSwipe(start, end, W, "right", 60)).toBe(true); // 0.67 px/ms
        expect(isEdgeSwipe(start, end, W, "right", 400)).toBe(false);
        expect(isEdgeSwipe(start, { x: 365, y: 400 }, W, "right", 20)).toBe(false); // 20px: too short
    });
});

describe("attachEdgeSwipe", () => {
    let clock = 0;
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
    const setup = (side: EdgeSide, active: () => boolean = () => true) => {
        const el = document.body.appendChild(document.createElement("div"));
        const handlers: EdgeSwipeHandlers & { onMove: jest.Mock; onRelease: jest.Mock } = {
            isActive: active,
            onMove: jest.fn(),
            onRelease: jest.fn(),
        };
        // Stands for Obsidian's own handlers further down the tree
        const obsidian = jest.fn();
        el.addEventListener("touchstart", obsidian);
        const detach = attachEdgeSwipe(window, side, handlers, () => clock);
        const fire = (type: string, x: number, y: number, touches = 1) =>
            el.dispatchEvent(touch(type, x, y, touches));
        return { handlers, obsidian, detach, fire };
    };

    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { value: W, configurable: true });
        clock = 0;
    });

    test("right edge: progress, armed past the threshold, commit on release", () => {
        const { handlers, obsidian, detach, fire } = setup("right");
        fire("touchstart", 385, 400);
        fire("touchmove", 360, 401);
        fire("touchmove", 300, 403);
        clock = 500;
        fire("touchend", 295, 404);
        detach();

        expect(handlers.onMove.mock.calls).toEqual([
            [-25, false],
            [-85, true],
        ]);
        expect(handlers.onRelease.mock.calls).toEqual([[true]]);
        expect(obsidian).not.toHaveBeenCalled(); // captured before Obsidian's own listeners
    });

    test("left edge: offsets are positive and it commits", () => {
        const { handlers, detach, fire } = setup("left");
        fire("touchstart", 4, 400);
        fire("touchmove", 40, 402);
        fire("touchmove", 90, 405);
        clock = 500;
        fire("touchend", 92, 405);
        detach();
        expect(handlers.onMove.mock.calls).toEqual([
            [36, false],
            [86, true],
        ]);
        expect(handlers.onRelease.mock.calls).toEqual([[true]]);
    });

    test("a quick short flick commits", () => {
        const { handlers, detach, fire } = setup("right");
        fire("touchstart", 385, 400);
        fire("touchmove", 365, 400);
        clock = 60;
        fire("touchend", 345, 402);
        detach();
        expect(handlers.onRelease.mock.calls).toEqual([[true]]);
    });

    test("releasing short and slow, or after dragging back, springs back", () => {
        const { handlers, detach, fire } = setup("right");
        fire("touchstart", 385, 400);
        fire("touchmove", 300, 400);
        fire("touchmove", 370, 400);
        clock = 800;
        fire("touchend", 370, 400);
        detach();
        expect(handlers.onRelease.mock.calls).toEqual([[false]]);
    });

    test("a vertical scroll starting at the edge is abandoned and not blocked", () => {
        const { handlers, detach, fire } = setup("right");
        fire("touchstart", 385, 400);
        fire("touchmove", 383, 440);
        fire("touchmove", 300, 445);
        fire("touchend", 290, 445);
        detach();
        expect(handlers.onMove).not.toHaveBeenCalled();
        expect(handlers.onRelease).not.toHaveBeenCalled();
    });

    test("touches away from the edge are left alone and reach Obsidian", () => {
        const { handlers, obsidian, detach, fire } = setup("left");
        fire("touchstart", 200, 400);
        fire("touchmove", 300, 400);
        fire("touchend", 300, 400);
        detach();
        expect(handlers.onMove).not.toHaveBeenCalled();
        expect(obsidian).toHaveBeenCalled();
    });

    test("inactive, two-finger, or detached: nothing happens", () => {
        let active = false;
        const { handlers, detach, fire } = setup("right", () => active);
        fire("touchstart", 385, 400);
        fire("touchmove", 300, 400);
        fire("touchend", 290, 400);
        active = true;
        fire("touchstart", 385, 400, 2);
        fire("touchmove", 300, 400, 2);
        fire("touchend", 290, 400);
        detach();
        fire("touchstart", 385, 400);
        fire("touchmove", 300, 400);
        fire("touchend", 290, 400);
        expect(handlers.onMove).not.toHaveBeenCalled();
        expect(handlers.onRelease).not.toHaveBeenCalled();
    });

    test("the activity check gets the starting point", () => {
        const isActive = jest.fn(() => true);
        const { detach, fire } = setup("right", isActive);
        fire("touchstart", 385, 123);
        detach();
        expect(isActive).toHaveBeenCalledWith({ x: 385, y: 123 });
    });

    test("a cancelled touch springs back", () => {
        const { handlers, detach, fire } = setup("left");
        fire("touchstart", 4, 400);
        fire("touchmove", 80, 400);
        fire("touchcancel", 80, 400);
        detach();
        expect(handlers.onRelease.mock.calls).toEqual([[false]]);
    });
});
