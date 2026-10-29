/** Covers frame the headline, then fill the corridor as it fades. */
const LANES = [
  [-.29, -.24], [.29, .24], [.24, -.31], [-.24, .31],
  [.35, -.10], [-.35, .10], [-.18, -.36], [.18, .36], [0, -.38],
] as const;

export function tunnelFrame(index: number, progress: number, width: number, height: number, travelProgress = progress) {
  const p = Math.max(0, Math.min(1, progress));
  const mobile = width <= 600;
  const perspective = mobile ? 900 : 1200;
  const [laneX, laneY] = LANES[index % LANES.length]!;
  const z = perspective * (-.82 + p * 1.43);
  const scale = perspective / (perspective - z);
  const gathering = Math.max(0, Math.min(1, (travelProgress - .24) / .34));
  const eased = gathering * gathering * (3 - 2 * gathering);
  // Near covers pass beside the viewer before fading, so they do not dissolve
  // over the next layer as a translucent wall in the middle of the corridor.
  const exit = Math.max(0, (p - .6) / .4);
  const radius = (1 - .42 * eased) * (1 + 5 * exit * exit);
  // Undo projection for the lane anchor, not the cover size. Covers grow as
  // they approach while their centres stay around the viewer, not under text.
  const x = laneX * width * radius / scale;
  const y = laneY * height * radius / scale;
  const direction = index % 2 ? -1 : 1;
  return { x, y, z, scale, roll: direction * (5 - p * 8), tilt: -laneX * (9 - p * 6) };
}
