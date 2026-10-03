// Swipe-from-the-right-edge gesture, used on mobile to skip the current card.
//
// A swipe counts when the touch starts within EDGE_WIDTH of the viewport's right border, travels
// left at least MIN_DISTANCE, and stays mostly horizontal. While a touch that began at the edge is
// being tracked, the events are kept from bubbling up, so Obsidian's own right-edge gesture (which
// opens the right sidebar) does not also fire.

export const EDGE_WIDTH = 30;
export const MIN_DISTANCE = 60;
// The vertical travel may be at most this fraction of the horizontal travel
export const MAX_VERTICAL_RATIO = 0.6;

export interface Point {
    x: number;
    y: number;
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
 * @param end - Where it ended
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
 * Call `onSwipe` when the user swipes left from the right edge over `el`.
 *
 * @param el - The element to listen on
 * @param onSwipe - Called once per completed swipe
 * @param isActive - Checked when a touch begins; the gesture is ignored while it returns false
 * @returns A function that removes the listeners
 */
export function attachRightEdgeSwipe(
    el: HTMLElement,
    onSwipe: () => void,
    isActive: () => boolean = () => true,
): () => void {
    let start: Point | null = null;

    const point = (e: TouchEvent): Point => ({
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
    });

    const onStart = (e: TouchEvent) => {
        start = null;
        if (e.touches.length !== 1 || !isActive()) return;
        const p = point(e);
        if (!startsAtRightEdge(p, window.innerWidth)) return;
        start = p;
        e.stopPropagation();
    };
    const onMove = (e: TouchEvent) => {
        if (!start) return;
        e.stopPropagation();
        // Once the movement is clearly a leftward swipe, keep the page from scrolling sideways
        if (start.x - point(e).x > 10 && e.cancelable) e.preventDefault();
    };
    const onEnd = (e: TouchEvent) => {
        if (!start) return;
        const begin = start;
        start = null;
        e.stopPropagation();
        if (isRightEdgeSwipe(begin, point(e), window.innerWidth)) onSwipe();
    };
    const onCancel = () => {
        start = null;
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
