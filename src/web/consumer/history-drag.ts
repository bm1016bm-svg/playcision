/** Mouse drag starts on movement; touch rows preserve scrolling until held. */
export function dragIntent(pointerType: string, fromHandle: boolean, distance: number, elapsed: number): 'activate' | 'cancel' | 'wait' {
  if (pointerType === 'touch' && !fromHandle && distance > 10 && elapsed < 240) return 'cancel';
  if (elapsed >= 240 || ((pointerType !== 'touch' || fromHandle) && distance >= 6)) return 'activate';
  return 'wait';
}
