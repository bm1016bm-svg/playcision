import { useEffect, type RefObject } from 'react';
import './scroll-connector.css';

/** A shared viewport-space tip keeps adjacent segments joined as they draw. */
export function scrollConnectorMask(top: number, height: number, viewportHeight: number) {
  if (![top, height, viewportHeight].every(Number.isFinite) || height <= 0 || viewportHeight <= 0) {
    return { tip: 0, tail: 0, body: 0, visible: false };
  }
  const tip = viewportHeight * .74 - top;
  const tail = tip - viewportHeight * .44;
  return { tip, tail, body: tail + viewportHeight * .12, visible: tip > 0 && tail < height };
}

export function useScrollConnector(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const mask = scrollConnectorMask(rect.top, rect.height, window.innerHeight);
      element.style.setProperty('--connector-tip', `${mask.tip}px`);
      element.style.setProperty('--connector-tail', `${mask.tail}px`);
      element.style.setProperty('--connector-body', `${mask.body}px`);
      element.style.setProperty('--connector-visible', mask.visible ? '1' : '0');
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    draw();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
      for (const key of ['tip', 'tail', 'body', 'visible']) element.style.removeProperty(`--connector-${key}`);
    };
  }, [ref, enabled]);
}
