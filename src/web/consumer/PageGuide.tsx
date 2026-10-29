import { useId, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { availableGuideSteps, type GuidePage, type GuideStep } from './onboarding';
import { acquireScrollLock } from './scroll-lock';
import { layoutGuide, type GuideRect } from './guide-layout';

function findTarget(selector: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  });
}

export function PageGuide({ page, onClose }: { page: GuidePage; onClose: () => void }) {
  const [guidePage] = useState<GuidePage>(() => page === 'filters' && document.querySelector('.steam-events') ? 'events' : page);
  const [steps, setSteps] = useState<GuideStep[]>([]);
  const [step, setStep] = useState(0);
  const [geometry, setGeometry] = useState<ReturnType<typeof layoutGuide> | null>(null);
  const root = useRef<HTMLDivElement>(null), note = useRef<HTMLDivElement>(null), footer = useRef<HTMLElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const entered = useRef<{ x: number; y: number; filter: HTMLElement | null; filterTop: number } | null>(null);
  const marker = `coach-${useId().replace(/[^a-z\d-]/gi, '')}`;
  const close = useRef(onClose); close.current = onClose;
  const item = steps[step];

  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const filter = page === 'filters' ? document.querySelector<HTMLElement>('.consumer-filter-content') : null;
    entered.current ??= { x: window.scrollX, y: page === 'recommended' ? 0 : window.scrollY, filter, filterTop: filter?.scrollTop ?? 0 };
    const release = acquireScrollLock(document.body);
    const available = availableGuideSteps(guidePage, selector => !!findTarget(selector));
    setSteps(available);
    if (!available.length) close.current();
    next.current?.focus({ preventScroll: true });
    return () => {
      release();
      const entry = entered.current;
      if (entry) {
        window.scrollTo({ left: entry.x, top: entry.y, behavior: 'instant' });
        if (entry.filter?.isConnected) entry.filter.scrollTop = entry.filterTop;
      }
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
    };
  }, [page, guidePage]);

  useLayoutEffect(() => {
    if (!item) return;
    const target = findTarget(item.target);
    if (!target) {
      if (step + 1 >= steps.length) close.current();
      else setSteps(current => current.filter(candidate => candidate !== item));
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = target.getBoundingClientRect();
      const box: GuideRect = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
      const controls = footer.current?.getBoundingClientRect();
      setGeometry(layoutGuide(box, { w: window.innerWidth, h: window.innerHeight },
        { w: note.current?.offsetWidth ?? 300, h: note.current?.offsetHeight ?? 130 }, controls ? { x: controls.x, y: controls.y, w: controls.width, h: controls.height } : window.innerHeight - 100));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const rect = target.getBoundingClientRect();
    const safeBottom = guidePage === 'filters' || guidePage === 'events' ? window.innerHeight - 20 : footer.current?.getBoundingClientRect().top ?? window.innerHeight - 100;
    if (rect.top < 16 || rect.bottom > safeBottom - 16) target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    measure();
    const observer = new ResizeObserver(schedule);
    const movingScene = target.closest('.game-timeline-scene');
    const motionObserver = new MutationObserver(schedule);
    if (movingScene) motionObserver.observe(movingScene, { attributes: true, attributeFilter: ['style'] });
    observer.observe(target);
    if (note.current) observer.observe(note.current);
    if (footer.current) observer.observe(footer.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      observer.disconnect(); motionObserver.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true);
    };
  }, [item]);

  return <motion.div ref={root} className="page-coach" role="dialog" aria-modal="true" aria-label="操作提示" data-guide-target={item?.target} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const buttons = root.current?.querySelectorAll('button');
      if (!buttons?.length) return;
      event.preventDefault(); event.stopPropagation();
      (document.activeElement === buttons[0] ? buttons[1] : buttons[0])?.focus();
    }
  }}>
    <svg className="page-coach-art" width="100%" height="100%" aria-hidden="true">
      <defs>
        <mask id={`${marker}-mask`}><rect width="100%" height="100%" fill="white" />{geometry && <rect x={geometry.target.x - 6} y={geometry.target.y - 6} width={geometry.target.w + 12} height={geometry.target.h + 12} rx="16" fill="#555" />}</mask>
        <marker id={`${marker}-arrow`} markerWidth="15" markerHeight="15" refX="12" refY="7.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 2 2 L 12 7.5 L 2 13" fill="none" stroke="#e1eacb" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></marker>
      </defs>
      <rect width="100%" height="100%" fill="#03090f" opacity=".74" mask={`url(#${marker}-mask)`} />
      {geometry && <path data-guide-arrow d={geometry.path} markerEnd={`url(#${marker}-arrow)`} fill="none" stroke="#e1eacb" strokeWidth="2.3" strokeLinecap="round" />}
    </svg>
    <div ref={note} className="page-coach-note" style={{ left: geometry?.note.x ?? 20, top: geometry?.note.y ?? 80, visibility: geometry ? 'visible' : 'hidden' }}><p>{item?.text}</p><span>{item?.hint}</span></div>
    <footer ref={footer} style={guidePage === 'filters' || guidePage === 'events' ? { top: 24, bottom: 'auto' } : undefined}><button type="button" onClick={onClose}>略過教學</button><div><span>{Math.min(step + 1, steps.length)} / {steps.length}</span><button ref={next} type="button" onClick={() => step + 1 < steps.length ? setStep(step + 1) : onClose()}>{step + 1 < steps.length ? '下一個' : '開始玩'}<span aria-hidden="true"> ↗</span></button></div></footer>
  </motion.div>;
}
