import type { RoutePoint } from './recommendation-route.js';

/** The same small circuit jog for intro connectors and card-to-card routes. */
export function circuitPath(a: RoutePoint, b: RoutePoint): string {
  const dx = b.x - a.x, dy = b.y - a.y;
  const nx = dy ? 9 : 0, ny = dx ? 9 : 0;
  return `M ${a.x} ${a.y} L ${a.x + dx * .44} ${a.y + dy * .44} l ${nx} ${ny} L ${a.x + dx * .56 + nx} ${a.y + dy * .56 + ny} l ${-nx} ${-ny} L ${b.x} ${b.y}`;
}
