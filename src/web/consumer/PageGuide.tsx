import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GuidePage } from './onboarding';
import { acquireScrollLock } from './scroll-lock';

const steps: Record<GuidePage, { target: string; text: string; hint: string }[]> = {
  events: [
    { target: '.steam-event-grid', text: '看看 Steam 活動', hint: '點選活動，再點一次即可取消' },
    { target: '.filter-panel-actions', text: '套用活動與篩選', hint: '下方可搭配類型、價格、平台與 AI 篩選' },
  ],
  discover: [
    { target: '.consumer-card-stage', text: '左滑略過，右滑收藏', hint: '電腦也能用 ← →' },
    { target: '.consumer-filter-trigger', text: '想玩哪種？從這裡選', hint: '選來源、選分類，再套用條件' },
  ],
  recommended: [
    { target: '.consumer-shelf-game', text: '往下捲，發現下一款', hint: '跟著遊戲一路逛下去' },
    { target: '.consumer-shelf-game footer button', text: '心動就收下', hint: '點愛心，留到收藏慢慢挑' },
    { target: '.consumer-filter-trigger', text: 'AI 排除，兩邊共用', hint: '在篩選開啟，探索與推薦都會套用' },
  ],
  saved: [
    { target: '.consumer-list-view', text: '想玩的，都留在這裡', hint: '點遊戲，看看玩家怎麼說' },
    { target: '.consumer-pick-button', text: '選不出來？交給手氣', hint: '從你的收藏抽出今晚的一款' },
  ],
  library: [
    { target: '.consumer-share-platforms', text: '挑平台，勾遊戲，分享', hint: '複製清單，貼給你的朋友' },
    { target: '.consumer-room-switch', text: '也可以，大家一起選', hint: '邀朋友入座，決定今晚玩什麼' },
  ],
  filters: [
    { target: '.filter-source', text: '先選遊戲來源', hint: '熱門暢銷、新品、折扣，選一個' },
    { target: '.filter-category-grid', text: '選分類，再選類型', hint: '分類展開後，全部類型一次顯示' },
    { target: '.filter-ai-row', text: '排除已揭露 AI 內容', hint: '探索、推薦，以及後續載入的遊戲都會套用' },
    { target: '.filter-panel-actions', text: '選好，按套用', hint: '人數、價格、平台也能搭配選擇' },
  ],
};

export function PageGuide({ page, onClose }: { page: GuidePage; onClose: () => void }) {
  const [guidePage] = useState<GuidePage>(() => page === 'filters' && document.querySelector('.steam-events') ? 'events' : page);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState({ x: 20, y: 100, w: 200, h: 80, vw: 390, vh: 844 });
  const root = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const item = steps[guidePage][step]!;
  useLayoutEffect(() => {
    if (page !== 'filters') return;
    const content = document.querySelector<HTMLElement>('.consumer-filter-content');
    const scrollTop = content?.scrollTop ?? 0;
    return () => { if (content?.isConnected) content.scrollTop = scrollTop; };
  }, [page]);
  useLayoutEffect(() => {
    const target = document.querySelector(item.target) ?? document.querySelector('.consumer-list-view h1');
    const measure = () => {
      const r = target?.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const x = Math.max(12, Math.min(r?.left ?? 24, vw - 60));
      const y = Math.max(20, Math.min(r?.top ?? 120, vh - 180));
      setBox({ x, y, w: Math.max(40, Math.min(r?.width ?? 160, vw - x - 12)), h: Math.max(40, Math.min(r?.height ?? 60, vh * .36)), vw, vh });
    };
    const r = target?.getBoundingClientRect();
    if (r && (r.top > window.innerHeight - 160 || r.bottom < 40)) target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [item]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const releaseScroll = acquireScrollLock(document.body);
    next.current?.focus();
    return () => {
      releaseScroll();
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
    };
  }, []);
  const below = box.y + box.h + 230 < box.vh;
  const noteY = below ? box.y + box.h + 82 : Math.max(76, box.y - 180);
  const noteX = Math.max(24, Math.min(box.x + box.w / 2 - 150, box.vw - 324));
  const endX = box.x + Math.min(box.w * .65, box.w - 12);
  const endY = below ? box.y + box.h + 8 : box.y - 8;
  const startX = noteX + 160, startY = below ? noteY - 12 : noteY + 86;
  return <motion.div ref={root} className="page-coach" role="dialog" aria-modal="true" aria-label="操作提示" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const buttons = root.current?.querySelectorAll('button');
      if (!buttons?.length) return;
      event.preventDefault();
      event.stopPropagation();
      (document.activeElement === buttons[0] ? buttons[1] : buttons[0])?.focus();
    }
  }}>
    <svg className="page-coach-art" width="100%" height="100%" aria-hidden="true">
      <defs><mask id={`coach-mask-${page}`}><rect width="100%" height="100%" fill="white" /><rect x={box.x - 5} y={box.y - 5} width={box.w + 10} height={box.h + 10} rx="18" fill="#777" /></mask></defs>
      <rect width="100%" height="100%" fill="#03090f" opacity=".74" mask={`url(#coach-mask-${page})`} />
      <path d={`M ${startX} ${startY} C ${startX + 70} ${startY + (below ? -42 : 42)}, ${endX + 48} ${endY + (below ? 55 : -55)}, ${endX} ${endY} m -12 ${below ? 17 : -17} q 6 ${below ? -8 : 8} 12 ${below ? -17 : 17} q 8 ${below ? 7 : -7} 20 ${below ? 10 : -10}`} fill="none" stroke="#e1eacb" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div className="page-coach-note" style={{ left: noteX, top: noteY }} key={`${page}-${step}`}><p>{item.text}</p><span>{item.hint}</span></div>
    <footer><button type="button" onClick={onClose}>略過教學</button><div><span>{step + 1} / {steps[guidePage].length}</span><button ref={next} type="button" onClick={() => step + 1 < steps[guidePage].length ? setStep(step + 1) : onClose()}>{step + 1 < steps[guidePage].length ? '下一個' : '開始玩'}<span aria-hidden="true"> ↗</span></button></div></footer>
  </motion.div>;
}
