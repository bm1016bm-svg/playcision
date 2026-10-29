import { useId, type CSSProperties, type Ref } from 'react';
import type { RoutePoint } from './recommendation-route';
import { circuitPath } from './circuit-path';
import './circuit-stroke.css';

interface CircuitStrokeProps {
  from: RoutePoint;
  to: RoutePoint;
  colorFrom?: RoutePoint;
  colorTo?: RoutePoint;
  groupRef?: Ref<SVGGElement>;
  gradientRef?: Ref<SVGLinearGradientElement>;
  reveal?: number;
}

/** One renderer owns the palette, glow layers, core and travelling highlight. */
export function CircuitStroke({ from, to, colorFrom = from, colorTo = to, groupRef, gradientRef, reveal }: CircuitStrokeProps) {
  const id = `circuit-gloss-${useId().replace(/:/g, '')}`;
  const d = circuitPath(from, to);
  const stroke = `url(#${id})`;
  return <>
    <defs><linearGradient ref={gradientRef} id={id} gradientUnits="userSpaceOnUse" x1={colorFrom.x} y1={colorFrom.y} x2={colorTo.x} y2={colorTo.y}>
      <stop offset="0" stopColor="#5756bc" stopOpacity=".35" />
      <stop offset=".22" stopColor="#8970ed" />
      <stop offset=".4" stopColor="#d897ff" />
      <stop offset=".51" stopColor="#f2d8ff" />
      <stop offset=".63" stopColor="#8975eb" />
      <stop offset=".84" stopColor="#62bee5" />
      <stop offset="1" stopColor="#4060b1" stopOpacity=".25" />
    </linearGradient></defs>
    <g ref={groupRef} className="game-circuit" style={reveal === undefined ? undefined : { '--circuit-reveal': reveal } as CSSProperties}>
      <path d={d} className="game-circuit-halo" stroke={stroke} pathLength="1" />
      <path d={d} className="game-circuit-glow" stroke={stroke} pathLength="1" />
      <path d={d} className="game-circuit-ribbon" stroke={stroke} pathLength="1" />
      <path d={d} className="game-circuit-core" stroke={stroke} pathLength="1" />
      <path d={d} className="game-circuit-pulse game-circuit-pulse-halo" pathLength="1" />
      <path d={d} className="game-circuit-pulse" pathLength="1" />
    </g>
  </>;
}
