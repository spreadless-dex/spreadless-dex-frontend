// Wraps a discrete state change in a View Transition so named elements
// (the pool builder's preview) dissolve between scenes instead of
// snapping. The old frame blurs and fades, the new one sharpens in; the
// CSS lives in global.css under ::view-transition-*(pool-preview).
//
// Continuous input (a slider drag) must not go through here: each call
// snapshots the document and holds the frame for the animation's length.
// Only the discrete choices call it: a chip, a preset, a mode switch.

type VTDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { ready: Promise<void>; finished: Promise<void> };
};

export function supportsSceneTransition(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as VTDocument;
  if (typeof doc.startViewTransition !== "function") return false;
  // A hidden document (background tab) aborts every transition with an
  // InvalidStateError; the update still lands, so just skip the animation.
  if (doc.visibilityState === "hidden") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Run `commit` (which must flush its React state synchronously) inside a scene transition. */
export function sceneTransition(commit: () => void): void {
  if (!supportsSceneTransition()) {
    commit();
    return;
  }
  const t = (document as VTDocument).startViewTransition!(commit);
  // An aborted animation is not an error worth surfacing: the state is set.
  t.ready.catch(() => {});
  t.finished.catch(() => {});
}
