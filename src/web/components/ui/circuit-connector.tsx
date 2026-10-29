import { useRef, type RefObject } from 'react';
import { CircuitStroke } from './circuit-stroke';
import { useScrollConnector } from './scroll-connector';

export function CircuitConnector({ className, anchorRef, enabled = true }: {
  className: string;
  anchorRef?: RefObject<HTMLSpanElement | null>;
  enabled?: boolean;
}) {
  const local = useRef<HTMLSpanElement>(null);
  const host = anchorRef ?? local;
  const { height, start, end } = useScrollConnector(host, enabled);
  const extent = Math.max(1, height);
  return <span ref={host} className={`${className} scroll-connector`} aria-hidden="true">
    <svg className="circuit-connector-svg" viewBox={`0 0 96 ${extent}`} preserveAspectRatio="none">
      <CircuitStroke from={{ x: 48, y: start }} to={{ x: 48, y: end }} reveal={1} />
    </svg>
  </span>;
}
