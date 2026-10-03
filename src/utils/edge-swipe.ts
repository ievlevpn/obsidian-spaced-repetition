// Swipe-from-the-right-edge gesture, used on mobile to skip the current card.
//
// A touch that starts within EDGE_WIDTH of the viewport's right border is tracked. Once it moves
// clearly left it is a swipe: every move reports the horizontal offset and whether releasing now
// would commit (at least MIN_DISTANCE left, mostly horizontal). The decision is made on release.
// A touch that turns out to be a vertical scroll is abandoned. While a touch that began at the
// edge is tracked, its events are kept from bubbling, so Obsidian's own right-edge gesture (which
// opens the right sidebar) does not also fire.

export const EDGE_WIDTH = 30;
export const MIN_DISTANCE = 60;
// The vertical travel may be at most this fraction of the horizontal travel
export const MAX_VERTICAL_RATIO = 0.6;
// Movement below this (px) does not yet decide between a swipe and a scroll
const SLOP = 10;

export interface Point {
    x: number;
    y: number;
}

export interface EdgeSwipeHandlers {
    // Checked when a touch begins; the gesture is ignored while it returns false
    isActive: () => boolean;
    // During a swipe: the horizontal offset (<= 0) and whether releasing now would commit
    onMove: (dx: number, armed: boolean) => void;
    // The touch ended or was abandoned; `committed` is true for a completed swipe
    onRelease: (committed: boolean) => void;
}

/**
 * Whether a touch starting at `start` began at the right edge of a viewport `viewportWidth` wide.
 *
 * @param start - Where the touch began (client coordinates)
 * @param viewportWidth - The viewport width
 * @returns True if the touch began within EDGE_WIDTH of the right border
 */
export function startsAtRightEdge(start: Point, viewportWidth: number): boolean {
    return viewportWidth - start.x <= EDGE_WIDTH;
}

/**
 * Whether a touch that moved from `start` to `end` is a completed leftward edge swipe.
 *
 * @param start - Where the touch began
 * @param end - Where it ended (or is now)
 * @param viewportWidth - The viewport width
 * @returns True for a swipe from the right edge, far enough left and mostly horizontal
 */
export function isRightEdgeSwipe(start: Point, end: Point, viewportWidth: number): boolean {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return (
        startsAtRightEdge(start, viewportWidth) &&
        -dx >= MIN_DISTANCE &&
        Math.abs(dy) <= -dx * MAX_VERTICAL_RATIO
    );
}

/**
 * Track left swipes from the right edge over `el`.
 *
 * @param el - The element to listen on
 * @param handlers - Activity check, progress and release callbacks
 * @returns A function that removes the listeners
 */
export function attachRightEdgeSwipe(el: HTMLElement, handlers: EdgeSwipeHandlers): () => void {
    let start: Point | null = null;
    let swiping = false;

    const point = (e: TouchEvent): Point => ({
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
    });
    const finish = (committed: boolean) => {
        const wasSwiping = swiping;
        start = null;
        swiping = false;
        if (wasSwiping || committed) handlers.onRelease(committed);
    };

    const onStart = (e: TouchEvent) => {
        start = null;
        swiping = false;
        if (e.touches.length !== 1 || !handlers.isActive()) return;
        const p = point(e);
        if (!startsAtRightEdge(p, window.innerWidth)) return;
        start = p;
        e.stopPropagation();
    };
    const onMove = (e: TouchEvent) => {
        if (!start) return;
        e.stopPropagation();
        const p = point(e);
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        if (!swiping) {
            if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
                finish(false); // a vertical scroll, not a swipe
                return;
            }
            if (-dx <= SLOP) return;
            swiping = true;
        }
        if (e.cancelable) e.preventDefault();
        handlers.onMove(Math.min(0, dx), isRightEdgeSwipe(start, p, window.innerWidth));
    };
    const onEnd = (e: TouchEvent) => {
        if (!start) return;
        e.stopPropagation();
        finish(swiping && isRightEdgeSwipe(start, point(e), window.innerWidth));
    };
    const onCancel = () => {
        if (start) finish(false);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    return () => {
        el.removeEventListener("touchstart", onStart);
        el.removeEventListener("touchmove", onMove);
        el.removeEventListener("touchend", onEnd);
        el.removeEventListener("touchcancel", onCancel);
    };
}
