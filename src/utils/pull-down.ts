// Pull down on mobile: dragging the card down from its top runs the action chosen in the settings
// (open the card menu, mark the card important, bury it).
//
// It never competes with scrolling. A touch counts only if the card's content is already at its
// top when the touch begins (isActive checks that), so a drag down on a card scrolled further
// along scrolls it back up as usual, and a drag up always scrolls. Of a touch that does count,
// a move that goes up, or more sideways than down, abandons it; a move down is ours from the
// first pixel, so iOS does not start its rubber-band bounce and take the gesture over. It
// commits on release once the finger travelled PULL_DISTANCE down.

export const PULL_DISTANCE = 70;
// The content follows the finger at this fraction of its travel, up to MAX_OFFSET
export const PULL_RESISTANCE = 0.5;
export const MAX_OFFSET = 60;
// Movement below this (px) does not yet decide between a pull and anything else
const SLOP = 10;

export interface PullDownHandlers {
    // Checked when a touch begins; the gesture is ignored while it returns false
    isActive: (target: EventTarget | null) => boolean;
    // During a pull: how far the content follows (px, >= 0), and whether releasing commits
    onMove: (offset: number, armed: boolean) => void;
    // The pull ended or was abandoned; `committed` is true for a completed pull
    onRelease: (committed: boolean) => void;
}

/**
 * How far the content follows a finger that travelled `dy` px down.
 *
 * @param dy - Finger travel down (negative: up)
 * @returns The content's offset, damped and capped
 */
export function pullOffset(dy: number): number {
    return Math.min(MAX_OFFSET, Math.max(0, dy) * PULL_RESISTANCE);
}

/**
 * Track pulls down on `el`.
 *
 * @param el - The element holding the card's content
 * @param handlers - Activity check, progress and release callbacks
 * @returns A function that removes the listeners
 */
export function attachPullDown(el: HTMLElement, handlers: PullDownHandlers): () => void {
    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let lastDy = 0;

    const finish = (committed: boolean) => {
        const wasPulling = pulling;
        start = null;
        pulling = false;
        if (wasPulling) handlers.onRelease(committed);
    };

    const onStart = (e: TouchEvent) => {
        start = null;
        pulling = false;
        if (e.touches.length !== 1 || !handlers.isActive(e.target)) return;
        start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastDy = 0;
    };
    const onMove = (e: TouchEvent) => {
        if (!start) return;
        if (e.touches.length !== 1) {
            finish(false);
            return;
        }
        const dx: number = e.touches[0].clientX - start.x;
        const dy: number = e.touches[0].clientY - start.y;
        if (!pulling) {
            // Up is a scroll; more sideways than down is someone else's (edge swipes, panning)
            if (dy < 0 || (Math.abs(dx) > SLOP && Math.abs(dx) >= dy)) {
                start = null;
                return;
            }
            // Down so far: keep iOS from starting its own bounce, which would end ours
            if (e.cancelable) e.preventDefault();
            if (dy <= SLOP) return;
            pulling = true;
        }
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        lastDy = dy;
        handlers.onMove(pullOffset(dy), dy >= PULL_DISTANCE);
    };
    const onEnd = () => {
        if (start) finish(pulling && lastDy >= PULL_DISTANCE);
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
