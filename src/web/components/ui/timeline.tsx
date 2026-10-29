"use client";

// Scroll-driven journey adapted from the supplied Hyperiux Vault timeline.
import { useId, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createRecommendationRoute, routeResumePosition, routeWindow, sampleRoute, ROUTE_SCROLL_STEP } from './recommendation-route';
import './timeline.css';
import { createLatestPreloader } from './latest-preloader';

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger);
export type TimelineItem = { id: string; label: string; content: ReactNode; prepare?: () => Promise<unknown> };
export type TimelineProps = { items: TimelineItem[]; label: string; onNearEnd?: (() => void) | undefined; connectFromAbove?: boolean };
const JOURNEY_QUERY = '(min-width: 601px) and (prefers-reduced-motion: no-preference)';
const subscribe = (callback: () => void) => {
  const query = window.matchMedia(JOURNEY_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};
const snapshot = () => window.matchMedia(JOURNEY_QUERY).matches;

export default function Timeline({ items, label, onNearEnd, connectFromAbove = false }: TimelineProps) {
  const host = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLOutputElement>(null);
  const circuit = useRef<SVGGElement>(null);
  const spectrum = useRef<SVGLinearGradientElement>(null);
  const entryLine = useRef<HTMLSpanElement>(null);
  const glowId = `journey-gloss-${useId().replace(/:/g, "")}`;
  const scrollTrigger = useRef<ScrollTrigger | null>(null);
  const resumePosition = useRef(0);
  const [active, setActive] = useState(0);
  const [frame, setFrame] = useState({ width: 1200, height: 800 });
  const cardWidth = Math.max(240, Math.min(640, frame.width * .76, (frame.height - 180) * 16 / 9));
  useLayoutEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setFrame({ width: entry.contentRect.width, height: entry.contentRect.height }); });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const activeRef = useRef(0);
  const preloadRef = useRef<ReturnType<typeof createLatestPreloader<TimelineItem>> | null>(null);
  const previousPreloadIndex = useRef(0);
  const animated = useSyncExternalStore(subscribe, snapshot, () => false);
  useEffect(() => { if (active >= items.length - 12) onNearEnd?.(); }, [active, items.length, onNearEnd]);
  useEffect(() => {
    if (animated || !onNearEnd) return;
    const node = host.current?.querySelector(`[data-index="${Math.max(0, items.length - 12)}"]`);
    if (!node) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) onNearEnd(); }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [animated, items.length, onNearEnd]);
  const signature = items.map(item => item.id).join('|');
  const points = useMemo(() => createRecommendationRoute(items.length).map(point => ({ x: point.x / 460 * (frame.width + cardWidth + 80), y: point.y / 420 * (frame.height + cardWidth * 9 / 16 + 240) })), [items.length, frame.width, frame.height, cardWidth]);
  const windowRange = routeWindow(items.length, active);
  const visible = animated ? items.slice(windowRange.start, windowRange.end) : items;
  const route = points.slice(Math.max(0, windowRange.start - 1), Math.min(points.length, windowRange.end + 1));
  useEffect(() => {
    const loader = createLatestPreloader<TimelineItem>(item => item.prepare?.() ?? Promise.resolve());
    preloadRef.current = loader;
    return () => { loader.dispose(); preloadRef.current = null; };
  }, []);
  useEffect(() => {
    if (!animated) return;
    const direction = active < previousPreloadIndex.current ? -1 : 1;
    previousPreloadIndex.current = active;
    const offsets = [0, direction, 2 * direction, 3 * direction, 4 * direction, 5 * direction, 6 * direction, 7 * direction, -direction, -2 * direction];
    preloadRef.current?.replace(offsets.map(offset => items[active + offset]).filter((item): item is TimelineItem => !!item));
  }, [active, animated, signature]);
  const bounds = {
    x: Math.min(...route.map(p => p.x)) - 40,
    y: Math.min(...route.map(p => p.y)) - 40,
    right: Math.max(...route.map(p => p.x)) + 40,
    bottom: Math.max(...route.map(p => p.y)) + 40,
  };

  useLayoutEffect(() => {
    const section = host.current, viewport = stage.current, world = scene.current, incoming = entryLine.current;
    if (!animated || !section || !viewport || !world) return;

    const resume = Math.min(resumePosition.current, points.length - 1);
    const cursor = { position: resume };
    let circuitIndex = -1;
    const draw = () => {
      const camera = sampleRoute(points, cursor.position);
      world.style.transform = `translate3d(${viewport.clientWidth / 2 - camera.x}px, ${viewport.clientHeight / 2 - camera.y}px, 0)`;
      if (entryLine.current) {
        // The first card masks the end of this line. Follow that card while it
        // moves upward; do not leave a loose segment or reappear on later turns.
        entryLine.current.style.height = `${camera.index === 0 ? Math.max(0, viewport.clientHeight / 2 - camera.y) : 0}px`;
      }
      if (circuit.current) {
        const a = points[camera.index], b = points[camera.index + 1];
        circuit.current.style.opacity = b ? '1' : '0';
        if (a && b && circuitIndex !== camera.index) {
          circuitIndex = camera.index;
          if (spectrum.current) {
            for (const [key, value] of Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })) spectrum.current.setAttribute(key, String(value));
          }
          const dx = b.x - a.x, dy = b.y - a.y;
          const nx = dy ? 9 : 0, ny = dx ? 9 : 0;
          const d = `M ${a.x} ${a.y} L ${a.x + dx * .44} ${a.y + dy * .44} l ${nx} ${ny} L ${a.x + dx * .56 + nx} ${a.y + dy * .56 + ny} l ${-nx} ${-ny} L ${b.x} ${b.y}`;
          circuit.current.querySelectorAll('path').forEach(path => path.setAttribute('d', d));
        }
        const fraction = cursor.position - camera.index;
        circuit.current.style.setProperty('--circuit-reveal', String(.32 + .68 * fraction));
      }
      if (camera.index !== activeRef.current) { activeRef.current = camera.index; setActive(camera.index); }
      if (counter.current) counter.current.value = `${Math.min(items.length, Math.round(cursor.position) + 1)} / ${items.length}`;
    };
    const context = gsap.context(() => {
      const tween = gsap.fromTo(cursor, { position: 0 }, {
        immediateRender: false,
        position: Math.max(0, points.length - 1), ease: 'none', onUpdate: draw,
        scrollTrigger: {
          trigger: section, start: 'top 20px',
          end: () => `+=${Math.max(1, points.length - 1) * ROUTE_SCROLL_STEP}`,
          pin: true, scrub: .8, invalidateOnRefresh: true,
          onRefresh: draw, anticipatePin: 1,
        },
      });
      scrollTrigger.current = tween.scrollTrigger ?? null;
      if (resume > 0 && tween.scrollTrigger) {
        tween.scrollTrigger.refresh();
        window.scrollTo({ top: tween.scrollTrigger.start + resume * ROUTE_SCROLL_STEP, behavior: 'instant' });
        tween.scrollTrigger.update();
        tween.progress(resume / Math.max(1, points.length - 1));
      }
      draw();
    }, section);
    const observer = new ResizeObserver(draw);
    observer.observe(viewport);
    return () => {
      // Candidate batches and viewport changes rebuild the trigger. Capture the
      // wheel position before removing its spacer; scrub can still be catching up
      // after the user has already scrolled back into the header.
      const trigger = scrollTrigger.current;
      const userScroll = window.scrollY;
      const intendedPosition = trigger ? (userScroll - trigger.start) / ROUTE_SCROLL_STEP : 0;
      const previousEnd = trigger?.end ?? 0;
      observer.disconnect(); context.revert(); scrollTrigger.current = null;
      const flowStart = section.getBoundingClientRect().top + window.scrollY - 20;
      resumePosition.current = routeResumePosition(intendedPosition, userScroll, flowStart, previousEnd, points.length);
      // GSAP owns cursor, but draw() writes these styles itself. Return the
      // scene to CSS when switching to the mobile / reduced-motion list.
      world.style.removeProperty('transform'); incoming?.style.removeProperty('height');
    };
  }, [animated, signature, points]);

  const jump = (index: number) => {
    const trigger = scrollTrigger.current;
    if (trigger) window.scrollTo({ top: trigger.start + index / Math.max(1, items.length - 1) * (trigger.end - trigger.start), behavior: 'instant' });
  };

  // ScrollTrigger reparents the pinned section into its spacer. Keep a stable
  // React-owned root so sibling insertions/removals never target that moved node.
  return <div className="game-timeline-root"><section ref={host} className={`game-timeline ${animated ? 'is-journey' : 'is-static'}`} aria-label={label}>
    {/* Animation owns this output’s contents; React must not reconcile its text nodes. */}
    {animated && <output ref={counter} className="game-journey-count" aria-label={label} />}
    <div ref={stage} className="game-timeline-viewport" tabIndex={animated ? 0 : undefined} aria-label={label} onKeyDown={event => {
      if (!animated || event.target !== event.currentTarget || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault(); jump(Math.max(0, Math.min(items.length - 1, activeRef.current + (event.key === 'ArrowDown' ? 1 : -1))));
    }}>
      {connectFromAbove && <span ref={entryLine} className="game-timeline-entry" aria-hidden="true" />}
      <div ref={scene} className="game-timeline-scene">
        {animated && <svg className="game-journey-line" aria-hidden="true" style={{ left: bounds.x, top: bounds.y, width: bounds.right - bounds.x, height: bounds.bottom - bounds.y }} viewBox={`${bounds.x} ${bounds.y} ${bounds.right - bounds.x} ${bounds.bottom - bounds.y}`}>
          <defs><linearGradient ref={spectrum} id={glowId} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#5756bc" stopOpacity=".35" />
            <stop offset=".22" stopColor="#8970ed" />
            <stop offset=".4" stopColor="#d897ff" />
            <stop offset=".51" stopColor="#f2d8ff" />
            <stop offset=".63" stopColor="#8975eb" />
            <stop offset=".84" stopColor="#62bee5" />
            <stop offset="1" stopColor="#4060b1" stopOpacity=".25" />
          </linearGradient></defs>
          <polyline points={route.map(p => `${p.x},${p.y}`).join(' ')} />
          <g ref={circuit} className="game-circuit">
            <path className="game-circuit-halo" stroke={`url(#${glowId})`} pathLength="1" />
            <path className="game-circuit-glow" stroke={`url(#${glowId})`} pathLength="1" />
            <path className="game-circuit-ribbon" stroke={`url(#${glowId})`} pathLength="1" />
            <path className="game-circuit-core" stroke={`url(#${glowId})`} pathLength="1" />
            <path className="game-circuit-pulse game-circuit-pulse-halo" pathLength="1" />
            <path className="game-circuit-pulse" pathLength="1" />
          </g>
        </svg>}
        {visible.map((item, offset) => {
          const index = animated ? windowRange.start + offset : offset;
          const point = points[index]!;
          return <div key={item.id} className="game-timeline-node" data-index={index}
            style={animated ? { left: point.x, top: point.y, width: cardWidth } : undefined}
            onFocus={() => { if (animated && index !== activeRef.current) jump(index); }}>
            <div className="game-timeline-marker"><span>{String(index + 1).padStart(2, '0')}</span><span>{item.label}</span></div>
            <div className="game-timeline-card">{item.content}</div>
          </div>;
        })}
      </div>
    </div>
  </section></div>;
}

