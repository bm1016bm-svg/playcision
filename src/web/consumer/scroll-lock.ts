type ScrollSurface = { style: { overflow: string } };
const locks = new WeakMap<ScrollSurface, { count: number; overflow: string }>();

// Exiting sheets and entering tutorials can overlap during their animations.
// Restore the original overflow only after every owner has released its lock.
export function acquireScrollLock(surface: ScrollSurface): () => boolean {
  let state = locks.get(surface);
  if (!state) {
    state = { count: 0, overflow: surface.style.overflow };
    locks.set(surface, state);
  }
  state.count++;
  surface.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return false;
    released = true;
    if (--state.count > 0) return false;
    surface.style.overflow = state.overflow;
    locks.delete(surface);
    return true;
  };
}
