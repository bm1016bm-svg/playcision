"use client";

// Adapted from the supplied perspective tunnel. Native page scrolling also
// supports touch and keyboard, and releases directly into the existing feed.
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tunnelFrame } from './tunnel-path';
import './perspective-tunnel-hero.css';

export interface TunnelItem { id: string; title: string; src?: string | undefined; artwork?: ReactNode }
interface Stage { width: number; height: number }

function TunnelCard({ item, index, total, progress, pointer, stage }: {
  item: TunnelItem; index: number; total: number; progress: MotionValue<number>;
  pointer: { x: MotionValue<number>; y: MotionValue<number> }; stage: Stage;
}) {
  const [failed, setFailed] = useState(false);
  const start = index / Math.max(1, total) * .5 - .2;
  const local = useTransform(progress, [start, start + .72], [0, 1]);
  const mobile = stage.width <= 600;
  const opacity = useTransform(local, [0, .12, .8, 1], [0, 1, 1, 0]);
  const transform = useTransform(() => {
    const frame = tunnelFrame(index, local.get(), stage.width, stage.height, progress.get());
    const pan = mobile ? 12 : 24;
    return `translate3d(calc(-50% + ${frame.x - pointer.x.get() * pan}px), calc(-50% + ${frame.y - pointer.y.get() * pan}px), ${frame.z}px) rotateY(${frame.tilt}deg) rotateZ(${frame.roll}deg)`;
  });
  return <motion.div className="discovery-tunnel-card" style={{ transform, opacity, width: mobile ? Math.min(250, stage.width * .64) : Math.min(520, stage.width * .34) }}>
    {item.artwork ?? (item.src && !failed && <img src={item.src} alt="" draggable={false} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />)}
    <span>{item.title}</span>
  </motion.div>;
}

export default function PerspectiveTunnelHero({ items, onContinue }: { items: TunnelItem[]; onContinue: () => void }) {
  const host = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<Stage>({ width: 1000, height: 680 });
  const raw = useMotionValue(0);
  const progress = useSpring(raw, { stiffness: 80, damping: 30, restDelta: .0001 });
  const rawX = useMotionValue(0), rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 60, damping: 25 });
  const y = useSpring(rawY, { stiffness: 60, damping: 25 });
  const titleScale = useTransform(progress, [0, .4], [1, 1.14]);
  const titleOpacity = useTransform(progress, [0, .08, .36], [1, 1, 0]);
  const promptOpacity = useTransform(progress, [0, .16], [1, 0]);
  const guideOpacity = useTransform(progress, [0, .16, .36], [.3, .6, 1]);
  const guideLength = useTransform(progress, [0, .65, 1], [0, 1, 1]);

  useEffect(() => {
    const element = host.current, view = viewport.current;
    if (!element || !view) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // Finish while the stage leaves the screen, keeping the feed handoff
      // visible instead of leaving an empty viewport after the last card fades.
      const travel = element.offsetHeight - view.offsetHeight * .35;
      const next = reduced || travel <= 0 ? 0 : Math.max(0, Math.min(1, -element.getBoundingClientRect().top / travel));
      raw.set(next);
      // Tutorial cleanup returns to the intro. Restore its headline immediately
      // instead of springing backward through a frame full of overlapping covers.
      if (next === 0) progress.jump(0);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(() => {
      setStage({ width: view.clientWidth, height: view.clientHeight });
      schedule();
    });
    observer.observe(view);
    window.addEventListener('scroll', schedule, { passive: true });
    measure();
    return () => { observer.disconnect(); window.removeEventListener('scroll', schedule); cancelAnimationFrame(frame); };
  }, [raw, progress, reduced]);

  return <section ref={host} className={`discovery-tunnel${reduced ? ' is-reduced' : ''}`} aria-label="推薦開場">
    <div ref={viewport} className="discovery-tunnel-stage" onPointerMove={event => {
      if (reduced || event.pointerType !== 'mouse') return;
      const box = event.currentTarget.getBoundingClientRect();
      rawX.set((event.clientX - box.left) / box.width * 2 - 1);
      rawY.set((event.clientY - box.top) / box.height * 2 - 1);
    }} onPointerLeave={() => { rawX.set(0); rawY.set(0); }}>
      <div className="discovery-tunnel-grid" aria-hidden="true" />
      <div className="discovery-tunnel-rings" aria-hidden="true" />
      {!reduced && <div className="discovery-tunnel-world" style={{ perspective: stage.width <= 600 ? 900 : 1200 }} aria-hidden="true">
        {items.slice(0, 9).map((item, index) => <TunnelCard key={`${item.id}-${item.src ?? ''}`} item={item} index={index} total={Math.min(9, items.length)} progress={progress} pointer={{ x, y }} stage={stage} />)}
      </div>}
      <motion.div className="discovery-tunnel-title" style={reduced ? {} : { scale: titleScale, opacity: titleOpacity }}>
        <p>PLAYCISION DISCOVERY PROTOCOL</p>
        <h1><span>FIND YOUR</span><span>NEXT <span>ADDICTION.</span></span></h1>
      </motion.div>
      <motion.div className="discovery-tunnel-prompt" style={reduced ? {} : { opacity: promptOpacity }}>
        <p>Scroll your wheel to accelerate through the gaming universe.</p>
        <span data-guide="recommendation-scroll" aria-hidden="true" />
      </motion.div>
      <button type="button" className="discovery-tunnel-skip" onClick={onContinue}>{reduced ? '查看推薦' : '跳過動畫'} <span aria-hidden="true">↘</span></button>
      {!reduced && <motion.div className="discovery-tunnel-progress" style={{ scaleY: guideLength, opacity: guideOpacity }} aria-hidden="true" />}
    </div>
  </section>;
}
