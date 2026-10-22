export type RoutePoint = { x: number; y: number };
export const ROUTE_STEP_X = 460;
export const ROUTE_STEP_Y = 420;
export const ROUTE_WINDOW_RADIUS = 4;

/** A non-intersecting square spiral: right, down, left, up. */
export function createRecommendationRoute(count: number): RoutePoint[] {
  const points: RoutePoint[] = [];
  let x = 0, y = 0, direction = 0, length = 1;
  const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
  if (count > 0) points.push({ x, y });
  while (points.length < count) {
    for (let side = 0; side < 2 && points.length < count; side++) {
      const [dx, dy] = directions[direction % 4]!;
      for (let step = 0; step < length && points.length < count; step++) {
        x += dx * ROUTE_STEP_X; y += dy * ROUTE_STEP_Y;
        points.push({ x, y });
      }
      direction++;
    }
    length++;
  }
  return points;
}

export function routeWindow(count: number, index: number) {
  const center = Math.max(0, Math.min(count - 1, Math.floor(index)));
  return { start: Math.max(0, center - ROUTE_WINDOW_RADIUS), end: Math.min(count, center + ROUTE_WINDOW_RADIUS + 1) };
}

export function sampleRoute(points: RoutePoint[], progress: number) {
  const position = Math.max(0, Math.min(points.length - 1, progress));
  const index = Math.floor(position);
  const a = points[index] ?? { x: 0, y: 0 }, b = points[index + 1] ?? a;
  const fraction = position - index;
  // Ease the corner without rotating the artwork or changing wheel direction.
  const t = fraction * fraction * (3 - 2 * fraction);
  return { index, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
