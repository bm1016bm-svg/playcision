export interface GuideRect { x: number; y: number; w: number; h: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
const area = (a: GuideRect, b: GuideRect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Keep the real target coordinates. Only place the note inside the safe viewport. */
export function layoutGuide(target: GuideRect, viewport: { w: number; h: number }, noteSize: { w: number; h: number }, controls: number | GuideRect) {
  const margin = 20, gap = 52;
  const w = Math.min(noteSize.w, Math.max(1, viewport.w - margin * 2));
  const h = noteSize.h;
  const controlsTop = typeof controls === 'number' ? controls : controls.y;
  const atTop = typeof controls !== 'number' && controlsTop < viewport.h / 2;
  const safeTop = atTop ? controlsTop + controls.h + margin : margin;
  const bottom = atTop ? viewport.h - margin : Math.min(viewport.h - margin, controlsTop - 20);
  const cx = target.x + target.w / 2, cy = target.y + target.h / 2;
  const candidates = [
    { x: cx - w / 2, y: target.y + target.h + gap },
    { x: cx - w / 2, y: target.y - h - gap },
    { x: target.x - w - gap, y: cy - h / 2 },
    { x: target.x + target.w + gap, y: cy - h / 2 },
  ].map(position => ({ x: clamp(position.x, margin, viewport.w - w - margin), y: clamp(position.y, safeTop, bottom - h), w, h }));
  const score = (rect: GuideRect) => area(rect, target) * 100 + Math.hypot(rect.x + w / 2 - cx, rect.y + h / 2 - cy);
  const note = candidates.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best);
  const ncx = note.x + w / 2, ncy = note.y + h / 2;
  const dx = cx - ncx, dy = cy - ncy;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / distance, uy = dy / distance;
  const noteEdge = 1 / Math.max(Math.abs(dx) / Math.max(1, w / 2), Math.abs(dy) / Math.max(1, h / 2), .001);
  const targetEdge = 1 / Math.max(Math.abs(dx) / Math.max(1, target.w / 2), Math.abs(dy) / Math.max(1, target.h / 2), .001);
  const start = { x: ncx + dx * noteEdge + ux * 10, y: ncy + dy * noteEdge + uy * 10 };
  const end = { x: cx - dx * targetEdge - ux * 7, y: cy - dy * targetEdge - uy * 7 };
  const bend = Math.min(28, Math.hypot(end.x - start.x, end.y - start.y) * .18);
  const c1 = { x: start.x + (end.x - start.x) * .35 - uy * bend, y: start.y + (end.y - start.y) * .35 + ux * bend };
  const c2 = { x: start.x + (end.x - start.x) * .7 - uy * bend, y: start.y + (end.y - start.y) * .7 + ux * bend };
  return { target, note, start, end, path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}` };
}
