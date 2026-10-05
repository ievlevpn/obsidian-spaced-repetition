// Edge swipes on mobile: from the right edge to skip the current card, from the left edge to go
// back (undo).
//
// A touch that starts within EDGE_WIDTH of the viewport's left or right border is tracked. Once
// it moves clearly away from that edge it is a swipe: every move reports the offset and whether
// releasing now would commit. It commits on release when it travelled at least MIN_DISTANCE, or
// a quick flick of at least FLICK_DISTANCE, without going steeper than 45 degrees. A touch that
// turns out to be a vertical scroll is abandoned.
//
// The listeners go on the window in the capture phase, so a touch that starts on the very edge
// (outside the review view's own element) still counts, and so the touch reaches us before
// Obsidian's own edge gestures (which open the sidebars). While a touch that began at an edge
// is tracked, it is kept from propagating any further.

export type EdgeSide = "left" | "right";

export const EDGE_WIDTH = 44;
export const MIN_DISTANCE = 60;
export const FLICK_DISTANCE = 30;
// px per ms: a release this fast counts from FLICK_DISTANCE on
export const FLICK_SPEED = 0.4;
// The vertical travel may be at most this fraction of the horizontal travel (45 degrees)
export const MAX_VERTICAL_RATIO = 1;
// Movement below this (px) does not yet decide between a swipe and a scroll
const SLOP = 10;

export interface Point {
    x: number;
    y: number;
}

export interface EdgeSwipeHandlers {
    // Checked when a touch begins at the edge; the gesture is ignored while it returns false
    isActive: (start: Point) => boolean;
    // During a swipe: the offset away from the edge (signed: <= 0 for the right edge, >= 0 for
    // the left), and whether releasing now would commit
    onMove: (dx: number, armed: boolean) => void;
    // The touch ended or was abandoned; `committed` is true for a completed swipe
    onRelease: (committed: boolean) => void;
}

/**
 * Whether a touch starting at `start` began at the given edge of a viewport `viewportWidth` wide.
 *
 * @param start - Where the touch began (client coordinates)
 * @param viewportWidth - The viewport width
 * @param side - Which edge
 * @returns True if the touch began within EDGE_WIDTH of that edge
 */
export function startsAtEdge(start: Point, viewportWidth: number, side: EdgeSide): boolean {
    return side === "right" ? viewportWidth - start.x <= EDGE_WIDTH : start.x <= EDGE_WIDTH;
}

/**
 * Whether a touch that moved from `start` to `end` in `elapsedMs` is a completed edge swipe.
 *
 * @param start - Where the touch began
 * @param end - Where it ended (or is now)
 * @param viewportWidth - The viewport width
 * @param side - Which edge it must start at; it must move away from that edge
 * @param elapsedMs - Duration of the touch, for flicks (Infinity: ignore speed)
 * @returns True for a swipe away from the edge, far or fast enough, and not too steep
 */
export function isEdgeSwipe(
    start: Point,
    end: Point,
    viewportWidth: number,
    side: EdgeSide,
    elapsedMs: number = Infinity,
): boolean {
    const away: number = side === "right" ? start.x - end.x : end.x - start.x;
    const dy: number = Math.abs(end.y - start.y);
    const fastEnough: boolean = away >= FLICK_DISTANCE && away / elapsedMs >= FLICK_SPEED;
    return (
        startsAtEdge(start, viewportWidth, side) &&
        (away >= MIN_DISTANCE || fastEnough) &&
        dy <= away * MAX_VERTICAL_RATIO
    );
}

/**
 * Track swipes away from one edge of the screen.
 *
 * @param target - Where to listen (the window, in the capture phase)
 * @param side - Which edge
 * @param handlers - Activity check, progress and release callbacks
 * @param now - Clock in ms (for flick speed; replaceable in tests)
 * @returns A function that removes the listeners
 */
export function attachEdgeSwipe(
    target: Window,
    side: EdgeSide,
    handlers: EdgeSwipeHandlers,
    now: () => number = () => Date.now(),
): () => void {
    let start: Point | null = null;
    let startTime = 0;
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
        if (e.touches.length !== 1) return;
        const p = point(e);
        if (!startsAtEdge(p, target.innerWidth, side) || !handlers.isActive(p)) return;
        start = p;
        startTime = now();
        e.stopPropagation();
    };
    const onMove = (e: TouchEvent) => {
        if (!start) return;
        e.stopPropagation();
        const p = point(e);
        const away: number = side === "right" ? start.x - p.x : p.x - start.x;
        const dy: number = Math.abs(p.y - start.y);
        if (!swiping) {
            // Clearly vertical: a scroll, not a swipe
            if (dy > SLOP && dy > Math.abs(away) * 1.2) {
                finish(false);
                return;
            }
            if (away <= SLOP) return;
            swiping = true;
        }
        if (e.cancelable) e.preventDefault();
        const dx: number = side === "right" ? -Math.max(0, away) : Math.max(0, away);
        handlers.onMove(dx, isEdgeSwipe(start, p, target.innerWidth, side));
    };
    const onEnd = (e: TouchEvent) => {
        if (!start) return;
        e.stopPropagation();
        const end = point(e);
        finish(swiping && isEdgeSwipe(start, end, target.innerWidth, side, now() - startTime));
    };
    const onCancel = () => {
        if (start) finish(false);
    };

    target.addEventListener("touchstart", onStart, { capture: true, passive: true });
    target.addEventListener("touchmove", onMove, { capture: true, passive: false });
    target.addEventListener("touchend", onEnd, { capture: true });
    target.addEventListener("touchcancel", onCancel, { capture: true });
    return () => {
        target.removeEventListener("touchstart", onStart, { capture: true });
        target.removeEventListener("touchmove", onMove, { capture: true });
        target.removeEventListener("touchend", onEnd, { capture: true });
        target.removeEventListener("touchcancel", onCancel, { capture: true });
    };
}
