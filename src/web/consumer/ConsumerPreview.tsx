import { createDiscoveryCache } from './discovery-cache';
import { SupportPanel } from './SupportPanel';
import { AI_FILTER_KEY, readAiPreference } from './ai-filter';
import { useAiFilter } from './useAiFilter';
import { LoadingQuote } from './LoadingQuote';
import { useHistoryCollections } from './HistoryCollections';
import { PageGuide } from './PageGuide';
import { acquireScrollLock } from './scroll-lock';
import { readGuides, rememberGuide, type GuidePage } from './onboarding';
import Timeline from '../components/ui/timeline';
import PerspectiveTunnelHero from '../components/ui/perspective-tunnel-hero';
import { PlayRoom } from './PlayRoom';
import { useLocale } from './LocaleProvider';
import { LANGUAGES, isLocale } from './locales';
import { savedPriceSummary, formatTotalPrice } from '../deck';
import { BrandIntro } from './BrandIntro';
import { FilterPanel } from './FilterPanel';
import { SavedShare } from './SavedShare';
import {
  Question,
  Coffee,
  ShareNetwork,
  Globe,
  SquaresFour,
  WindowsLogo,
  AppleLogo,
  LinuxLogo,
  ArrowClockwise,
  ThumbsUp,
  ThumbsDown,
  CaretLeft,
  CaretRight,
  ArrowCounterClockwise,
  ArrowUpRight,
  DiceFive,
  SteamLogo,
  Check,
  Compass,
  FunnelSimple,
  GameController,
  Heart,
  Info,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react';
import {
  AnimatePresence,
  usePresenceData,
  useIsPresent,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildRollPool, uniqueGames, compactLabels, formatGamePrice, safeStoreUrl } from '../deck';
import type { Game, UiPayload } from '../types';
import './consumer-preview.css';
import './consumer-mobile.css';
import './liquid-glass.css';
import { AmbientBackground } from './AmbientBackground';
import { genreLabel } from './genre-labels';
import { Synopsis, usePresentation } from './presentation';
import { ReviewStatsRows, useReviewData, reviewLanguageLabel, type ReviewList } from './reviews';
import { preloadArtwork, useArtwork, warmArtwork } from './artwork';
import { preloadWindow } from './artwork-cache';
import { LIBRARY_KEY, parseLibrary, readHidden, hideGame, restoreHiddenGames } from './browser-library';

type ConsumerTab = 'discover' | 'recommended' | 'saved' | 'library';
type Decision = 'skip' | 'save';
type Source = 'popular' | 'discover' | 'deals' | `event:${string}`;
import { DEFAULT_FILTERS, gameMatchesFilters, pickSavedGame, swipeDecision, type Filters } from './rules';


function Artwork({ game, decorative = false }: { game: Game; decorative?: boolean }) {
  const artwork = useArtwork(game.id, game.imageUrl);
  return artwork?.src
    ? <img src={artwork.src} alt={decorative ? '' : `${game.name} Steam 商店圖片`} draggable={false} referrerPolicy="no-referrer" />
    : <div className={`consumer-cover-fallback${artwork ? '' : ' consumer-artwork-loading'}`} aria-busy={!artwork} aria-label={decorative ? undefined : '遊戲圖片'}>{artwork && <><GameController aria-hidden="true" /><span>{game.name}</span></>}</div>;
}

function ConsumerLoading() {
  return (
    <main className="consumer-stage" id="main-content" tabIndex={-1}>
      <AmbientBackground />
      <section className="consumer-app consumer-loading" aria-label="正在載入遊戲資料">
        <BrandIntro />
      </section>
    </main>
  );
}

function ConsumerError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <main className="consumer-stage" id="main-content" tabIndex={-1}>
      <AmbientBackground />
      <section className="consumer-app consumer-error" aria-labelledby="consumer-error-title">
        <div><Info weight="fill" aria-hidden="true" /><h1 id="consumer-error-title">{t("暫時無法取得遊戲")}</h1><p>{message}</p><button type="button" onClick={onRetry}>{t("重新整理")}</button></div>
      </section>
    </main>
  );
}

function ConsumerSheet({ title, onClose, children, reviews = false, fullscreen = false, guide = false, glass = false, inactive = false, onHelp }: { onHelp?: () => void; title: string; onClose: () => void; children: ReactNode; reviews?: boolean; fullscreen?: boolean; guide?: boolean; glass?: boolean; inactive?: boolean }) {
  const { t } = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const closeAction = useRef(onClose);
  closeAction.current = onClose;
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const releaseScroll = acquireScrollLock(document.body);
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || sheetRef.current?.inert) return;
      if (event.key === 'Escape') closeAction.current();
      if (event.key === 'Tab') {
        const items = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, summary, [tabindex="0"]') ?? []).filter(item => !item.closest('[inert]') && item.getClientRects().length > 0);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !sheetRef.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); if (releaseScroll() && previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  return (
    <motion.div className={`consumer-sheet-scrim${reviews ? " consumer-reviews-scrim" : ""}${fullscreen ? " consumer-filter-scrim" : ""}${guide ? " consumer-guide-scrim" : ""}${glass ? " consumer-support-scrim" : ""}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section ref={sheetRef} inert={inactive} className={`consumer-sheet${reviews ? " consumer-reviews-sheet" : ""}${fullscreen ? " consumer-filter-sheet" : ""}${glass ? " consumer-support-sheet" : ""}`} role="dialog" aria-modal="true" aria-label={title} initial={{ y: reduceMotion ? 0 : reviews || fullscreen || glass ? 16 : '100%' }} animate={{ y: 0 }} exit={{ y: reduceMotion ? 0 : reviews || fullscreen || glass ? 16 : '100%' }} transition={{ duration: reduceMotion ? 0 : .26, ease: [0.22, 1, 0.36, 1] }}>
        <div className="consumer-sheet-handle" aria-hidden="true" />
        <header><h2>{title}</h2>{onHelp && <button type="button" onClick={onHelp} aria-label="重看使用教學" className="consumer-guide-help"><Question aria-hidden="true" /></button>}<button ref={closeRef} type="button" onClick={onClose} aria-label={`${t('關閉')} ${title}`}><X aria-hidden="true" /></button></header>
        {children}
      </motion.section>
    </motion.div>
  );
}

function FilterSheet(props: { filters: Filters; source: Source; genres: string[]; onChange: (filters: Filters, source: Source) => void; onRefresh: () => void; loading: boolean; onClose: () => void }) {
  const { t } = useLocale();
  const [showGuide, setShowGuide] = useState(false);
  return <>
    <ConsumerSheet title={t('篩選遊戲')} onClose={props.onClose} onHelp={() => setShowGuide(true)} inactive={showGuide} fullscreen><FilterPanel {...props} /></ConsumerSheet>
    <AnimatePresence>{showGuide && <PageGuide page="filters" onClose={() => setShowGuide(false)} />}</AnimatePresence>
  </>;
}

function ReviewOverlay({ game, saved, onToggleSaved, onPreference, busy, failure, onClose }: { game: Game; saved: boolean; onToggleSaved: () => void; onPreference: (action: 'skip' | 'exclude') => void; busy: boolean; failure: string; onClose: () => void }) {
  const { t } = useLocale();
  const { locale } = useLocale();
  const [scope, setScope] = useState('localized');
  const [index, setIndex] = useState(0);
  const { data, error, retry } = useReviewData<ReviewList>('/api/reviews', game.id, scope);
  const reviews = data?.reviews ?? [];
  const reduceMotion = useReducedMotion();
  const move = (step: number) => setIndex(current => reviews.length ? (current + step + reviews.length) % reviews.length : 0);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [reviews.length]);
  return (
    <ConsumerSheet title={game.name} onClose={onClose} reviews>
      <div className="consumer-review-tabs"><button aria-pressed={scope === 'localized'} onClick={() => { setScope('localized'); setIndex(0); }}>{data && scope === 'localized' ? reviewLanguageLabel(data.language) : t("使用者語言")}</button><button aria-pressed={scope === 'all'} onClick={() => { setScope('all'); setIndex(0); }}>{t("全部語言")}</button></div>
      <div className="consumer-testimonials" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        {!data && !error && <p className="consumer-review-empty" role="status">{t("正在載入玩家評論…")}</p>}
        {error && <div className="consumer-review-empty" role="alert"><p>{error}</p><button onClick={retry}>{t("重試")}</button></div>}
        {data && !reviews.length && <p className="consumer-review-empty">{scope === "all" ? t("尚無玩家評論") : t("這個語言尚無評論")}</p>}
        {reviews.map((review, i) => {
          let position = (i - index + reviews.length) % reviews.length;
          if (position > reviews.length / 2) position -= reviews.length;
          if (Math.abs(position) > 2) return null;
          const center = position === 0;
          return <motion.article key={review.id} className={`consumer-testimonial${center ? ' is-center' : ''}`} aria-hidden={!center} inert={!center}
            initial={false} animate={{ x: `${position * 76}%`, y: center ? -16 : 12, rotate: reduceMotion ? 0 : center ? 0 : position < 0 ? -3 : 3, scale: center ? 1 : .92, opacity: center ? 1 : .5 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 30 }} style={{ zIndex: 5 - Math.abs(position) }}
            drag={center && reviews.length > 1 ? 'x' : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={.15} dragSnapToOrigin
            onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 60 || (Math.abs(info.offset.x) > 20 && Math.abs(info.velocity.x) > 500)) move(info.offset.x < 0 ? 1 : -1); }}>
            <div className={`consumer-review-verdict${review.positive ? ' is-positive' : ''}`}>{review.positive ? <ThumbsUp weight="light" /> : <ThumbsDown weight="light" />}<span>{review.positive ? t("推薦") : t("不推薦")}</span></div>
            <div className="consumer-review-body" tabIndex={center ? 0 : -1}>{review.text}</div>
            <footer><a href={`https://steamcommunity.com/profiles/${review.steamId}/recommended/${game.id}/`} target="_blank" rel="noreferrer">— {review.name}</a><span>{reviewLanguageLabel(review.language)} · {new Date(review.created * 1000).toLocaleDateString(locale)} · {new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'short' }).format(review.hours)}{review.free ? ' · 免費取得' : ''}</span></footer>
          </motion.article>;
        })}
      </div>
      <p className="consumer-review-selection" title="好評、差評各取最多六則，依 Steam 實用度排序；選讀比例不代表整體好評率。">{t("好評・差評選讀")}</p>
      <div className="consumer-review-navigation"><button aria-label="上一則評論" disabled={reviews.length < 2} onClick={() => move(-1)}><CaretLeft weight="light" /></button><span aria-live="polite">{reviews.length ? `${index + 1} / ${reviews.length}` : '—'}</span><button aria-label="下一則評論" disabled={reviews.length < 2} onClick={() => move(1)}><CaretRight weight="light" /></button></div>
      <div className="consumer-review-tools"><button onClick={onToggleSaved}><Heart weight={saved ? 'fill' : 'light'} />{saved ? t("已收藏") : t("加入收藏")}</button><a href={safeStoreUrl(game)} target="_blank" rel="noreferrer">{t("前往 Steam")}<ArrowUpRight /></a><details><summary>{t("遊戲資訊與操作")}</summary><GameCredits game={game} /><dl>{game.releaseDate && <div><dt>{t("發售")}</dt><dd>{game.releaseDate}</dd></div>}<div><dt>{t("平台")}</dt><dd>{game.platforms.join(" / ")}</dd></div></dl><Synopsis id={game.id} full /><div className="consumer-preferences"><button disabled={busy} onClick={() => onPreference('skip')}>{t("跳過 7 天")}</button><button disabled={busy} onClick={() => onPreference('exclude')}>{t("永久排除")}</button><a href={`steam://run/${game.id}`}>{t("啟動遊戲")}</a></div></details></div>
      {failure && <p className="consumer-warning" role="alert">{failure}</p>}
    </ConsumerSheet>
  );
}

function GameCredits({ game }: { game: Game }) {
  const { t } = useLocale();
  const presentation = usePresentation(game.id);
  const developers = game.developers.length ? game.developers : presentation?.developers ?? [];
  const publishers = game.publishers.length ? game.publishers : presentation?.publishers ?? [];
  const text = [developers.length ? `${t('開發')} ${developers.join('、')}` : '', publishers.length ? `${t('發行')} ${publishers.join('、')}` : ''].filter(Boolean).join(' · ');
  return <p className="consumer-game-credits" title={text}>{text}</p>;
}

function ConsumerGameCard({ game, language, onDecision, onDetails }: { game: Game; language: string; onDecision: (decision: Decision) => void; onDetails: () => void }) {
  const { t } = useLocale();
  const x = useMotionValue(0);
  const exitDirection = usePresenceData() as Decision;
  const committed = useRef(false);
  const present = useIsPresent();
  const lastDragAt = useRef(0);
  const reduceMotion = useReducedMotion();
  const rotate = useTransform(x, [-220, 0, 220], reduceMotion ? [0, 0, 0] : [-4, 0, 4]);
  const skipOpacity = useTransform(x, [-118, -28, 0], [1, 0, 0]);
  const saveOpacity = useTransform(x, [0, 28, 118], [0, 0, 1]);
  const labels = compactLabels(game).slice(0, 3);
  const { locale } = useLocale();
  const original = game.price.original?.formatted;
  useEffect(() => {
    if (present) { committed.current = false; x.stop(); x.set(0); }
  }, [present, x]);

  const handleDragEnd = (_event: PointerEvent, info: PanInfo) => {
    lastDragAt.current = performance.now();
    const decision = swipeDecision(info.offset, info.velocity.x);
    if (decision && !committed.current) {
      committed.current = true;
      onDecision(decision);
    } else if (!decision) {
      animate(x, 0, reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 });
    }
  };

  return (
    <motion.article
      className="consumer-game-card"
      data-testid="consumer-game-card"
      style={{ x, rotate, zIndex: present ? 2 : 3, pointerEvents: present ? 'auto' : 'none' }}
      tabIndex={present ? 0 : -1}
      aria-hidden={!present}
      role="button"
      aria-label={`${game.name} · ${t('最近評論')}`}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onDetails(); } }}
      drag="x"
      dragTransition={{ bounceStiffness: 420, bounceDamping: 32 }}
      dragMomentum={false}
      onDragStart={() => { lastDragAt.current = performance.now(); }}
      onDragEnd={handleDragEnd}
      onTap={() => { if (performance.now() - lastDragAt.current > 260) onDetails(); }}
      initial={reduceMotion ? false : { opacity: .7, y: 10, scale: .98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: (exitDirection === 'save' ? 1 : -1) * Math.max(460, window.innerWidth * .7), rotate: exitDirection === 'save' ? 3 : -3 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36, mass: .9 }}
    >
      <div className="consumer-game-cover">
        <Artwork game={game} />
        <motion.span aria-hidden="true" className="consumer-drag-label consumer-drag-label--skip" style={{ opacity: skipOpacity }}><X weight="bold" aria-hidden="true" />{t("略過")}</motion.span>
        <motion.span aria-hidden="true" className="consumer-drag-label consumer-drag-label--save" style={{ opacity: saveOpacity }}><Heart weight="fill" aria-hidden="true" />{t("收藏")}</motion.span>
      </div>
      <div className="consumer-game-info">
        <div className="consumer-game-meta"><span><SteamLogo weight="fill" aria-hidden="true" />Steam</span><PlatformIcons platforms={game.platforms} /></div>
        <div className="consumer-title-block"><h2>{game.name}</h2><GameCredits game={game} /></div>
        <div className="consumer-commerce"><div className="consumer-price-row">
          <div><strong>{t(formatGamePrice(game, language))}</strong>{game.price.discountPercent > 0 && original && <s>{original}</s>}</div>
          {game.price.discountPercent > 0 && <span className="consumer-discount">-{game.price.discountPercent}%</span>}
        </div>
        <ReviewStatsRows id={game.id} /></div>
        <div className="consumer-tags">{labels.map((label) => <span key={label}>{locale === 'zh-TW' ? genreLabel(label) : label}</span>)}</div>
        <div className="consumer-summary-slot"><Synopsis id={game.id} /></div>

      </div>
    </motion.article>
  );
}

function ConsumerBottomNav({ active, savedCount, onChange }: { active: ConsumerTab; savedCount: number; onChange: (tab: ConsumerTab) => void }) {
  const { t } = useLocale();
  const items = [
    { id: 'discover' as const, label: t("探索"), icon: Compass },
    { id: 'recommended' as const, label: t("推薦"), icon: SquaresFour },
    { id: 'saved' as const, label: t("收藏"), icon: Heart },
    { id: 'library' as const, label: t("分享"), icon: ShareNetwork },
  ];
  return (
    <nav className="consumer-bottom-nav" aria-label="主要導覽">
      {items.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" className={active === item.id ? 'is-active' : ''} aria-current={active === item.id ? 'page' : undefined} onClick={() => onChange(item.id)}><span className="consumer-nav-icon"><Icon weight="thin" aria-hidden="true" />{item.id === 'saved' && savedCount > 0 && <b>{savedCount}</b>}</span><em>{item.label}</em></button>; })}
    </nav>
  );
}

function SavedView({ games, language, seed, onOpen, onExplore, onRemove, onClear }: { onRemove: (id: string) => void; onClear: () => void; games: Game[]; language: string; seed: string; onOpen: (game: Game) => void; onExplore: () => void }) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const history = useHistoryCollections(() => { setEditing(value => !value); setConfirmClear(false); });
  const [pickId, setPickId] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [reel, setReel] = useState(0);
  const [celebration, setCelebration] = useState(0);
  const reroll = useRef(0);
  const target = useRef<string | null>(null);
  const rollingRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const summary = savedPriceSummary(games);
  const savedGroups = [{ id: 'free', title: '免費遊玩', games: games.filter(game => game.price.isFree) }, { id: 'paid', title: '收費遊戲', games: games.filter(game => !game.price.isFree) }];
  const picked = games.find(game => game.id === pickId);
  const displayed = rolling ? games[reel % games.length] : picked;
  const choose = () => {
    if (rollingRef.current || !games.length) return;
    const game = pickSavedGame(games, seed, reroll.current++);
    target.current = game?.id ?? null;
    if (reduceMotion) { setPickId(target.current); return; }
    rollingRef.current = true;
    setReel(0); setPickId(null); setRolling(true);
  };
  useEffect(() => {
    if (!rolling) return;
    let tick = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      tick += 1;
      if (tick >= 10 || reduceMotion) {
        setPickId(target.current); setRolling(false); rollingRef.current = false;
        setCelebration(value => value + 1);
        return;
      }
      setReel(tick);
      timer = setTimeout(step, 65 + tick * 24);
    };
    timer = setTimeout(step, 65);
    return () => clearTimeout(timer);
  }, [rolling, reduceMotion]);
  if (history.open) return history.page;
  return (
    <section className="consumer-list-view consumer-saved-view">
      <header className="consumer-saved-heading"><h1>{t("本次收藏")}<span>{games.length}</span></h1>{history.toolbar(editing, rolling)}</header>
      {history.overlay}
      {!history.open && history.status && <p role="status">{history.status}</p>}
      {editing && games.length > 0 && <div className="consumer-saved-tools">{confirmClear ? <><span>清空所有收藏？</span><button type="button" onClick={() => { onClear(); setConfirmClear(false); setEditing(false); }}>確認清空</button><button type="button" onClick={() => setConfirmClear(false)}>取消</button></> : <button type="button" onClick={() => setConfirmClear(true)}>清空收藏</button>}</div>}
      {games.length > 0 && <div className="consumer-saved-picker">
        <button data-guide="saved-picker" className="consumer-pick-button" disabled={rolling} onClick={choose}><motion.span animate={rolling ? { rotate: [-12, 12, -12], y: [0, -3, 0] } : { rotate: 0, y: 0 }} transition={rolling ? { duration: .3, repeat: Infinity } : { duration: 0 }}><DiceFive aria-hidden="true" /></motion.span>{rolling ? t("正在抽選…") : t("從收藏中幫我選一款")}</button>
        <div className="consumer-draw-status" role="status">{rolling ? t('正在抽選…') : picked ? picked.name : ''}</div>
        {displayed && <div className={`consumer-draw ${rolling ? 'is-rolling' : 'is-revealed'}`}>
          {!rolling && !reduceMotion && <div key={celebration} className="consumer-draw-effects" aria-hidden="true">
            <span className="consumer-draw-flash" />
            {Array.from({ length: 24 }, (_, index) => <motion.i key={index} style={{ left: `${15 + (index * 37 % 70)}%`, background: ['#b8e879', '#e5edf2', '#95becb', '#ddca8e'][index % 4] }} initial={{ opacity: 0, y: 20, rotate: 0 }} animate={{ opacity: [0, 1, 1, 0], x: [(index % 2 ? -1 : 1) * 8, (index % 2 ? -1 : 1) * (30 + index * 4)], y: [20, -55 - index % 5 * 12, 150], rotate: [0, index % 2 ? 260 : -260] }} transition={{ duration: 1.3, delay: index % 6 * .04, ease: 'easeOut' }} />)}
          </div>}
          <div className="consumer-picked" aria-hidden={rolling || undefined}>
            <div className="consumer-saved-art"><Artwork game={displayed} decorative /></div>
            <div><h2>{displayed.name}</h2><p>{t(formatGamePrice(displayed, language))}</p>{!rolling && <a href={safeStoreUrl(displayed)} target="_blank" rel="noreferrer">{t("前往 Steam")}<ArrowUpRight aria-hidden="true" /></a>}</div>
          </div>
        </div>}
      </div>}
      {games.length === 0 ? <div className="consumer-empty-view"><Heart aria-hidden="true" /><h2>{t("還沒有收藏")}</h2><button onClick={onExplore}>{t("探索遊戲")}<ArrowUpRight aria-hidden="true" /></button></div> : <div className="consumer-saved-columns">{savedGroups.map(group => <section className="consumer-saved-group" key={group.id} aria-labelledby={`saved-${group.id}`}>
        <h2 id={`saved-${group.id}`}>{t(group.title)}<span>{group.games.length}</span></h2>
        <div className="consumer-saved-list">{group.games.map(game => <div className="consumer-saved-row" key={game.id} onPointerDown={event => { if (!editing && !rolling) history.begin(event, game); }} onDragStart={event => event.preventDefault()} onContextMenu={event => event.preventDefault()}>
          <button className="consumer-saved-open" data-guide="saved-games" type="button" onClick={() => { if (!history.consumeClick()) onOpen(game); }}><div className="consumer-saved-art"><Artwork game={game} decorative /></div><div><strong>{game.name}</strong><small>{t(formatGamePrice(game, language))}</small></div><Info aria-hidden="true" /></button>
          {!editing && !rolling && history.handle(game)}
          {editing && <button data-no-drag className="consumer-saved-remove" type="button" aria-label={`移除收藏 ${game.name}`} onClick={() => onRemove(game.id)}><X aria-hidden="true" /></button>}
        </div>)}</div>
        {!group.games.length && <p className="consumer-saved-group-empty">{t('還沒有收藏')}</p>}
      </section>)}</div>}
      {games.length > 0 && <footer className="consumer-saved-total">
        <span>{summary.unknown ? t("已知售價合計") : t("收藏售價合計")}</span>
        <div>{summary.totals.length ? summary.totals.map(total => <strong key={total.currency}>{formatTotalPrice(total.minor, total.currency, language)}</strong>) : <strong>{summary.unknown ? t('價格未提供') : t("全部免費")}</strong>}</div>
        <small>{summary.unknown > 0 ? `${summary.unknown} ${t('款')} · ${t('未提供價格，未計入合計。')}` : t("依目前取得的商店售價計算。")}</small>
      </footer>}
    </section>
  );
}


function PlatformIcons({ platforms }: { platforms: string[] }) {
  return <span className="consumer-platform-icons">{[...new Set(platforms)].map(platform => {
    const Icon = platform === 'windows' ? WindowsLogo : platform === 'mac' || platform === 'macos' ? AppleLogo : platform === 'linux' ? LinuxLogo : null;
    const label = platform === 'mac' || platform === 'macos' ? 'macOS' : platform === 'windows' ? 'Windows' : platform === 'linux' ? 'Linux' : platform;
    return <span key={platform} title={label} aria-label={label} role="img">{Icon ? <Icon aria-hidden="true" weight="fill" /> : label}</span>;
  })}</span>;
}

function RecommendationArtwork({ game }: { game: Game }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const target = host.current;
    if (!target) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '120px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return <div ref={host} className="consumer-shelf-art">{visible ? <Artwork game={game} decorative /> : <div className="consumer-artwork-loading" />}</div>;
}

function RecommendedView({ sections, saved, language, onToggle, excluded, excludeAi, header }: { excludeAi: boolean; excluded: Set<string>; sections: { title: string; games: Game[] }[]; saved: Game[]; language: string; onToggle: (game: Game) => void; header: ReactNode }) {
  const { t } = useLocale();
  const feed = useRef<HTMLDivElement>(null);
  const [extra, setExtra] = useState<Game[]>([]);
  const [nextOffset, setNextOffset] = useState(50);
  const [more, setMore] = useState(true);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const inflight = useRef(false);
  const pageRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pageRequest.current?.abort(); };
  }, []);
  const ai = useAiFilter(uniqueGames([...sections.flatMap(section => section.games), ...extra]).filter(game => !excluded.has(game.id)), excludeAi);
  const permitted = new Set(ai.games.map(game => game.id));
  const loadMore = async () => {
    if (inflight.current || !more || ai.pending) return;
    inflight.current = true; setPending(true); setLoadError(false);
    const controller = new AbortController(); pageRequest.current = controller;
    try {
      const page = await discoveryPages(`/api/recommendations?offset=${nextOffset}`, language, AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]));
      if (controller.signal.aborted) return;
      setExtra(current => uniqueGames([...current, ...page.games]));
      setNextOffset(page.nextOffset); setMore(page.hasMore);
    } catch { if (!controller.signal.aborted) setLoadError(true); }
    finally {
      if (pageRequest.current === controller) {
        inflight.current = false;
        // StrictMode replays effect setup after cleanup. Clear its canceled
        // request too, so automatic continuation can start again after remount.
        if (mounted.current) setPending(false);
      }
    }
  };
  const seen = new Set<string>();
  const items = [...sections, { title: '熱門暢銷', games: extra.filter(game => !excluded.has(game.id)) }].flatMap(section => section.games.filter(game => {
    if (seen.has(game.id) || !permitted.has(game.id)) return false;
    seen.add(game.id); return true;
  }).map(game => {
    const selected = saved.some(item => item.id === game.id);
    return { id: game.id, label: t(section.title), prepare: () => preloadArtwork(game.id, game.imageUrl), content: <article className="consumer-shelf-game">
      <RecommendationArtwork game={game} />
      <h3 title={game.name}>{game.name}</h3>
      <div className="consumer-shelf-platforms"><PlatformIcons platforms={game.platforms} /></div>
      <footer><span>{game.price.discountPercent > 0 && <small>-{game.price.discountPercent}%</small>}<strong>{t(formatGamePrice(game, language))}</strong></span><button data-guide="recommendation-favorite" type="button" className={selected ? 'is-saved' : ''} aria-label={`${selected ? t('已收藏') : t('加入收藏')} ${game.name}`} aria-pressed={selected} onClick={() => onToggle(game)}><Heart weight={selected ? 'fill' : 'regular'} aria-hidden="true" /></button></footer>
    </article> };
  }));
  useEffect(() => {
    if (excludeAi && !items.length && !ai.pending && !pending && !loadError && more) void loadMore();
  }, [excludeAi, items.length, ai.pending, pending, loadError, more, nextOffset]);
  return <section className="consumer-list-view consumer-recommended-view">
    <PerspectiveTunnelHero items={ai.games.slice(0, 9).map(game => ({ id: game.id, title: game.name, artwork: <Artwork game={game} decorative /> }))} onContinue={() => {
      feed.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
      feed.current?.focus({ preventScroll: true });
    }} />
    <div ref={feed} className="recommendation-feed" tabIndex={-1} aria-label={t('推薦')}>
    <div className={`recommendation-feed-heading${items.length ? ' is-connected' : ''}`}>
    {header}
    <header><h2>{t('推薦')}</h2></header>
    </div>
    {!items.length ? ai.pending || pending ? <div role="status"><LoadingQuote compact /><p>{t('正在檢查 AI 聲明…')}</p></div> : <p>{t('沒有符合條件的遊戲')}</p> : <Timeline items={items} label={t('探索遊戲')} connectFromAbove onNearEnd={!ai.pending && !pending && !loadError && more ? loadMore : undefined} />}
    <div className="recommendation-continuation" role="status">{pending || ai.pending ? <LoadingQuote compact /> : loadError ? <button onClick={() => void loadMore()}>暫時載入不了，點此重試</button> : !more ? '這輪看完了，喜歡的遊戲都在收藏裡。' : <button onClick={() => void loadMore()}>看更多遊戲</button>}</div>
    </div>
  </section>;
}

const discoveryPages = createDiscoveryCache(async (url: string, signal: AbortSignal) => {
  const response = await fetch(url, { signal });
  const result = await response.json() as { games: Game[]; nextOffset: number; hasMore: boolean; error?: string };
  if (!response.ok || !Array.isArray(result.games) || !Number.isInteger(result.nextOffset) || typeof result.hasMore !== 'boolean') throw new Error(result.error || '無法取得遊戲');
  return result;
});

function LibraryView({ games, suggestions, onExplore, onRestore, initialRoom = false }: { games: Game[]; suggestions: Game[]; onExplore: () => void; onRestore: (hidden: Record<string, number | null>, ids: string[]) => void; initialRoom?: boolean }) {
  const { t } = useLocale();
  const [roomMode, setRoomMode] = useState(initialRoom);
  const [showRoomGuide, setShowRoomGuide] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [hidden, setHidden] = useState<Record<string, number | null>>({});
  const [hiddenError, setHiddenError] = useState('');
  const openHidden = () => {
    setHiddenError('');
    try { setHidden(readHidden(localStorage)); } catch { setHiddenError('無法讀取排除清單，原資料已保留。'); }
    setShowHidden(true);
  };
  const restore = (ids: string[]) => {
    try {
      const next = restoreHiddenGames(localStorage, ids);
      setHidden(next); setHiddenError(''); onRestore(next, ids);
    } catch { setHiddenError('無法儲存變更，排除清單已保留，請重試。'); }
  };
  const names = new Map([...suggestions, ...games].map(game => [game.id, game.name]));
  return (
    <section className="consumer-list-view consumer-share-view">
      <header className="consumer-share-heading"><h1>{t("分享")}</h1><div className="consumer-share-tools"><button type="button" className="consumer-room-switch" aria-haspopup="dialog" onClick={openHidden}>管理排除</button><button type="button" data-guide="room-entry" className="consumer-room-switch" aria-expanded={roomMode || showRoomGuide} aria-controls="share-room-panel" aria-haspopup={roomMode ? undefined : 'dialog'} onClick={() => { if (roomMode) setRoomMode(false); else setShowRoomGuide(true); }}>{roomMode ? '返回分享清單' : '或者，今晚一起玩'}<ArrowUpRight aria-hidden="true" /></button></div></header>
      <section hidden={roomMode} className="consumer-steam-share"><SavedShare games={games} />{!games.length && <button className="room-share-explore" onClick={onExplore}>{t("探索遊戲")}<ArrowUpRight aria-hidden="true" /></button>}</section>
      <div id="share-room-panel" hidden={!roomMode}><PlayRoom games={games} suggestions={suggestions} active={roomMode} /></div>
      <AnimatePresence>{showRoomGuide && <ConsumerSheet title="今晚一起玩" onClose={() => setShowRoomGuide(false)}>
        <div className="room-guide">
          <p className="room-guide-lead">朋友都在，卻不知道要玩什麼？<br />把想玩的遊戲放上桌，一起選。</p>
          <ol>
            <li><strong>揪朋友入座</strong><p>開一桌，把邀請連結傳給朋友。兩個人就能開始，最多四個人一起玩。</p></li>
            <li><strong>放上你想玩的遊戲</strong><p>大家準備好後，先用 40 秒各挑最多兩款遊戲放上桌。</p></li>
            <li><strong>選出今晚的共識</strong><p>接著用 20 秒，勾選你願意一起玩的遊戲，可以選不只一款。時間到，就看看哪款最多人想玩。</p></li>
          </ol>
          <div className="room-guide-actions"><button type="button" onClick={() => setShowRoomGuide(false)}>先分享清單</button><button type="button" className="room-guide-enter" onClick={() => { setShowRoomGuide(false); setRoomMode(true); }}>好，進去看看<ArrowUpRight aria-hidden="true" /></button></div>
        </div>
      </ConsumerSheet>}</AnimatePresence>
      <AnimatePresence>{showHidden && <ConsumerSheet glass title="管理排除" onClose={() => setShowHidden(false)}>
        <div className="consumer-hidden-manager">
          <p>恢復後，遊戲會重新參與探索與推薦。</p>
          {hiddenError && <p role="alert" className="consumer-warning">{hiddenError}</p>}
          {!hiddenError && !Object.keys(hidden).length && <p role="status">目前沒有排除的遊戲。</p>}
          {!!Object.keys(hidden).length && <button type="button" className="consumer-hidden-restore-all" onClick={() => { if (window.confirm('恢復所有排除與七天略過的遊戲？')) restore(Object.keys(hidden)); }}>全部恢復</button>}
          <ul>{Object.entries(hidden).map(([id, until]) => <li key={id}><div><a href={`https://store.steampowered.com/app/${id}/`} target="_blank" rel="noopener noreferrer">{names.get(id) ?? `Steam 遊戲 #${id}`}</a><span>{until === null ? '永久排除' : `略過至 ${new Date(until).toLocaleDateString()}`}</span></div><button type="button" onClick={() => restore([id])} aria-label={`恢復 ${names.get(id) ?? id}`}>恢復</button></li>)}</ul>
        </div>
      </ConsumerSheet>}</AnimatePresence>
    </section>
  );
}

export function ConsumerPreview({ payload, loading, error, onRetry }: { payload: UiPayload | null; loading: boolean; error: string | null; onRetry: () => void }) {
  const { t } = useLocale();
  const { locale, setLocale } = useLocale();
  const [showLanguages, setShowLanguages] = useState(false);
  const [supportView, setSupportView] = useState<'coffee' | 'free' | null>(null);
  const [initialRoom, setInitialRoom] = useState(() => location.hash !== '#history' && Boolean(new URL(location.href).searchParams.get('room')?.trim()));
  const [activeTab, updateActiveTab] = useState<ConsumerTab>(initialRoom ? 'library' : location.hash === '#history' ? 'saved' : 'discover');
  const setActiveTab = (tab: ConsumerTab) => { if (location.hash === '#history') { window.history.replaceState(null, '', location.pathname + location.search); window.dispatchEvent(new HashChangeEvent('hashchange')); } setInitialRoom(false); window.scrollTo({ top: 0, behavior: 'instant' }); updateActiveTab(tab); };
  useEffect(() => { const route = () => { if (location.hash === '#history') { setInitialRoom(false); updateActiveTab('saved'); } }; window.addEventListener('hashchange', route); return () => window.removeEventListener('hashchange', route); }, []);
  const [seenGuides, setSeenGuides] = useState<GuidePage[]>(() => { try { return readGuides(localStorage); } catch { return []; } });
  const showGuide = !initialRoom && !seenGuides.includes(activeTab);
  const dismissGuide = () => {
    try { rememberGuide(localStorage, activeTab); } catch { /* Storage may be disabled. */ }
    setSeenGuides(current => [...new Set([...current, activeTab])]);
  };
  useEffect(() => { if (!showGuide) window.scrollTo({ top: 0, behavior: 'instant' }); }, [activeTab]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [initialLibrary] = useState(() => { try { return { games: parseLibrary(localStorage.getItem(LIBRARY_KEY)), error: '' }; } catch { return { games: [] as Game[], error: '無法讀取這個瀏覽器的收藏。原資料未刪除，請先匯出備份。' }; } });
  const [saved, setSaved] = useState<Game[]>(initialLibrary.games);
  const [storageError, setStorageError] = useState(initialLibrary.error);
  const lastSaved = useRef(initialLibrary.games);
  useEffect(() => {
    if (saved === lastSaved.current) return;
    try {
      if (initialLibrary.error) throw new Error('existing data unreadable');
      if (saved.length > 500) throw new Error('library limit');
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(parseLibrary(JSON.stringify(saved))));
      lastSaved.current = saved; setStorageError('');
    } catch { setStorageError('收藏目前只保留在這一頁，無法寫入瀏覽器。請先複製分享清單備份，再離開。'); }
  }, [saved, initialLibrary.error]);
  const [details, setDetails] = useState<Game | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(() => ({ ...DEFAULT_FILTERS, ai: readAiPreference() }));
  useEffect(() => { try { localStorage.setItem(AI_FILTER_KEY, filters.ai === 'exclude' ? '1' : '0'); } catch { /* Session preference remains usable. */ } }, [filters.ai]);
  const [exitDirection, setExitDirection] = useState<Decision>('save');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const lastDecision = useRef<string | null>(null);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4500); return () => window.clearTimeout(timer); }, [notice]);
  const [blocked, setBlocked] = useState<Set<string>>(() => { try { return new Set(Object.keys(readHidden(localStorage))); } catch { return new Set(); } });
  const [source, setSource] = useState<Source>('popular');
  const [searchGames, setSearchGames] = useState<Game[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchOffset, setSearchOffset] = useState(0);
  const [searchMore, setSearchMore] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  const queryKey = JSON.stringify([source, filters.platform, filters.price, filters.genre, filters.players, filters.earlyAccess]);
  useEffect(() => { setSearchOffset(0); setSearchGames(null); }, [queryKey]);
  useEffect(() => {
    if (!payload) return;
    const controller = new AbortController();
    let cancelled = false;
    setSearchLoading(true); setSearchError(''); setSearchMore(false);
    const params = new URLSearchParams({ source, platform: filters.platform, price: filters.price, genre: filters.genre, players: filters.players, earlyAccess: filters.earlyAccess, offset: String(searchOffset) });
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    void discoveryPages(`/api/discovery?${params}`, locale, controller.signal).then(async result => {
      if (cancelled) return;
      await warmArtwork(result.games!, () => cancelled);
      if (cancelled) return;
      setSearchGames(current => searchOffset === 0 ? result.games! : uniqueGames([...(current ?? []), ...result.games!]).slice(-150));
      setSearchMore(!!result.hasMore);
    }).catch(() => { if (!cancelled) setSearchError('遊戲查詢失敗，請再試一次。'); }).finally(() => {
      window.clearTimeout(timeout); if (!cancelled) setSearchLoading(false);
    });
    return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
  }, [queryKey, searchOffset, searchRevision, !!payload, locale]);
  const [history, setHistory] = useState<{ game: Game; savedBefore: boolean; decision: Decision }[]>([]);
  const busyRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const persistPreference = async (action: 'skip' | 'exclude') => {
    if (!details || busyRef.current) return;
    if (action === 'exclude' && !window.confirm(`在這個瀏覽器排除《${details.name}》？可在分享頁恢復。`)) return;
    busyRef.current = true; setBusy(true); setFailure('');
    try {
      hideGame(localStorage, details.id, action === 'skip');
      setBlocked((current) => new Set(current).add(details.id));
      setSaved((current) => current.filter((game) => game.id !== details.id));
      setHistory((current) => current.filter((item) => item.game.id !== details.id));
      setNotice(action === 'skip' ? '已跳過 7 天' : '已永久排除');
      setDetails((current) => current?.id === details.id ? null : current);
    } catch (caught) {
      setFailure(`儲存失敗：${caught instanceof Error ? caught.message : String(caught)}。遊戲仍保留，請重試。`);
    } finally { busyRef.current = false; setBusy(false); }
  };
  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    setDismissed((current) => { const next = new Set(current); next.delete(last.game.id); return next; });
    if (last.decision === 'save' && !last.savedBefore) setSaved((current) => current.filter((game) => game.id !== last.game.id));
    lastDecision.current = null;
    setHistory((current) => current.slice(0, -1)); setNotice(t("已復原"));
  };

  const fullPool = useMemo(() => payload ? uniqueGames([...(payload.popular ?? []), ...buildRollPool(payload)]) : [], [payload]);
  const genres = useMemo(() => [...new Set(fullPool.flatMap((game) => [...game.genres, ...game.tags]))], [fullPool]);
  const remoteSelected = true;
  const filteredPool = useMemo(() => (remoteSelected ? searchGames ?? [] : payload?.popular ?? []).filter((game) => !blocked.has(game.id) && !payload?.blockedAppIds?.includes(game.id) && gameMatchesFilters(game, remoteSelected && !source.startsWith('event:') ? { ...filters, genre: 'all', players: 'all', earlyAccess: filters.earlyAccess === 'only' ? 'all' : filters.earlyAccess } : filters)), [filters, blocked, source, payload, searchGames, remoteSelected]);
  const ai = useAiFilter(filteredPool.filter(game => !dismissed.has(game.id)), filters.ai === 'exclude', activeTab === 'discover');
  const available = ai.games;
  const progressTotal = filters.ai === 'exclude' ? available.length + filteredPool.filter(game => dismissed.has(game.id)).length : filteredPool.length;
  const activeGame = available[0];
  const nextGame = available[1];
  useEffect(() => {
    if (activeTab === 'discover' && !ai.pending && searchGames !== null && available.length <= 18 && searchMore && !searchLoading && !searchError) {
      setSearchMore(false);
      setSearchOffset(value => value + 50);
    }
  }, [activeTab, ai.pending, available.length, searchGames, searchMore, searchLoading, searchError]);
  const upcoming = available.slice(0, 24);
  const upcomingKey = JSON.stringify(upcoming.map(game => [game.id, game.imageUrl]));
  useEffect(() => {
    if (activeTab !== 'discover') return;
    let cancelled = false;
    void preloadWindow(upcoming, game => preloadArtwork(game.id, game.imageUrl), () => cancelled, 4);
    return () => { cancelled = true; };
  }, [upcomingKey, activeTab]);
  const hasFilters = source !== 'popular' || Object.values(filters).some((value) => value !== 'all');

  const decide = (decision: Decision) => {
    if (!activeGame || lastDecision.current === activeGame.id) return;
    lastDecision.current = activeGame.id;
    setHistory((current) => [...current, { game: activeGame, decision, savedBefore: saved.some((game) => game.id === activeGame.id) }].slice(-50));
    setExitDirection(decision);
    if (decision === 'save') setSaved((current) => current.some((game) => game.id === activeGame.id) ? current : [...current, activeGame]);
    setDismissed((current) => new Set(current).add(activeGame.id));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.defaultPrevented || showGuide || details || showFilters || showLanguages || supportView || activeTab !== 'discover' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); decide(event.key === 'ArrowLeft' ? 'skip' : 'save');
      }
      if (event.key === 'Backspace' && history.length) { event.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loading && !payload) return <ConsumerLoading />;
  if (error && !payload) return <ConsumerError message={error} onRetry={onRetry} />;
  if (!payload) return null;

  const toggleSaved = (game: Game) => setSaved((current) => current.some((item) => item.id === game.id) ? current.filter((item) => item.id !== game.id) : [...current, game]);
  const topbar = <div className="consumer-topbar"><div className="consumer-brand-lockup"><a href="/" className="consumer-brand" aria-label="Playcision 首頁"><img className="consumer-wordmark" src="/brand/wordmark.png" alt="Playcision" width="770" height="170" draggable={false} /></a><div className="consumer-creator-actions"><a className="consumer-creator" href="https://github.com/bm1016bm-svg" target="_blank" rel="noopener noreferrer" aria-label="作者 bm1016bm-svg 的 GitHub">by @bm1016bm-svg</a><button className="consumer-support-trigger" type="button" onClick={() => setSupportView('coffee')}><Coffee aria-hidden="true" />請我喝咖啡</button><button className="consumer-support-trigger" type="button" onClick={() => setSupportView('free')}><Heart aria-hidden="true" />免費支持</button></div></div><div className="consumer-topbar-tools"><button className="consumer-language-trigger" type="button" onClick={() => setShowLanguages(true)} aria-label={t("語言")}><Globe aria-hidden="true" /><span>{LANGUAGES.find(item => item.code === locale)?.name}</span></button><button data-guide="filter-entry" className={`consumer-icon-button consumer-filter-trigger${hasFilters ? ' has-filters' : ''}`} onClick={() => setShowFilters(true)} aria-label={t("篩選遊戲")}><FunnelSimple aria-hidden="true" />{hasFilters && <i />}</button></div></div>;

  return (
    <main className="consumer-stage" id="main-content" tabIndex={-1}>
      <AmbientBackground />
      <section className={`consumer-app${activeTab === "discover" ? " consumer-app--discover" : ""}${activeTab === "saved" ? " consumer-app--saved" : ""}${activeTab === "recommended" ? " consumer-app--recommended" : ""}`} aria-label="Playcision 遊戲探索">
        <div className="consumer-content" inert={showGuide || showFilters || showLanguages || !!supportView || !!details}>
        {storageError && <p role="alert" className="consumer-warning">{storageError}</p>}
        {activeTab !== 'recommended' && topbar}
        {activeTab === 'discover' && <>
          <div className="consumer-discover-main">
            <div className="consumer-deck-progress">
              <div className="consumer-deck-caption" role="status"><span>{t("該輪次品類剩餘")}</span><strong>{available.length}</strong><span>{t("款")}</span></div>
              <div className="consumer-progress-track" role="progressbar" aria-label="本輪瀏覽進度" aria-valuemin={0} aria-valuemax={progressTotal || 1} aria-valuenow={progressTotal - available.length} aria-valuetext={`已瀏覽 ${progressTotal - available.length} / ${progressTotal} 款`}>
                <span style={{ width: `${progressTotal ? (progressTotal - available.length) / progressTotal * 100 : 0}%` }} />
              </div>
            </div>
            {source === 'popular' && payload.popularError && <p className="consumer-warning" role="alert">熱門暢銷載入失敗，請在篩選中重新整理，或切換新品／折扣。</p>}
            {error && <p className="consumer-warning" role="alert">更新失敗，保留目前資料：{error}</p>}
            <div className="consumer-card-stage">
              {nextGame && <motion.div key={`under-${activeGame?.id}`} className="consumer-next-card" aria-hidden="true" initial={reduceMotion ? false : { y: 5, scale: .98 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}><div className="consumer-game-cover"><Artwork game={nextGame} decorative /></div><div className="consumer-game-info"><div className="consumer-game-meta"><span><SteamLogo weight="fill" />Steam</span></div><h2>{nextGame.name}</h2><div className="consumer-price-row"><strong>{t(formatGamePrice(nextGame, locale))}</strong></div><div className="consumer-tags">{compactLabels(nextGame).slice(0, 3).map(label => <span key={label}>{locale === 'zh-TW' ? genreLabel(label) : label}</span>)}</div></div></motion.div>}
              <AnimatePresence mode="sync" custom={exitDirection}>
                {activeGame && <ConsumerGameCard key={activeGame.id} game={activeGame} language={locale} onDecision={decide} onDetails={() => { setFailure(''); setDetails(activeGame); }} />}
              </AnimatePresence>
              {!activeGame && (searchLoading || ai.pending) && <div className="consumer-pool-loading"><BrandIntro compact /></div>}
              {!activeGame && !searchLoading && !ai.pending && <div className="consumer-empty-view consumer-empty-view--pool" role="status"><SlidersHorizontal aria-hidden="true" /><h2>{searchLoading ? '正在尋找遊戲…' : searchError || (searchMore ? '繼續看看下一批遊戲' : t("沒有符合條件的遊戲"))}</h2>{!searchLoading && (searchError ? <button type="button" onClick={() => setSearchRevision(value => value + 1)}>重新查詢</button> : searchMore ? <button type="button" onClick={() => setSearchOffset(value => value + 50)}>載入更多遊戲</button> : <button type="button" onClick={() => { setSource('popular'); setFilters(DEFAULT_FILTERS); setDismissed(new Set()); setHistory([]); lastDecision.current = null; }}>{t("清除篩選並重設")}</button>)}</div>}
            </div>
          </div>
          <div className="consumer-actions" data-guide="discover-actions" aria-label="遊戲操作"><button className="consumer-undo" aria-label={t("復原上一個決定")} onClick={undo} disabled={!history.length}><ArrowCounterClockwise aria-hidden="true" /></button>
            <button type="button" className="consumer-action-skip" aria-keyshortcuts="ArrowLeft" title={`${t('略過')} (←)`} onClick={() => decide('skip')} disabled={!activeGame}><X weight="bold" aria-hidden="true" /><span>{t("略過")}</span></button>
            <button type="button" className="consumer-action-save" aria-keyshortcuts="ArrowRight" title={`${t('收藏')} (→)`} onClick={() => decide('save')} disabled={!activeGame}><Heart weight="fill" aria-hidden="true" /><span>{t("加入收藏")}</span></button>

          </div>
        </>}
        {activeTab === 'recommended' && <RecommendedView header={topbar} excludeAi={filters.ai === 'exclude'} excluded={new Set([...blocked, ...(payload.blockedAppIds ?? [])])} sections={[{ title: "熱門暢銷", games: payload.popular ?? [] }, { title: "新品", games: payload.digest.discover }, { title: "折扣", games: payload.digest.deals }].map(section => ({ ...section, games: uniqueGames(section.games).filter(game => !blocked.has(game.id) && !payload.blockedAppIds?.includes(game.id)) }))} saved={saved} language={locale} onToggle={toggleSaved} />}
        {activeTab === 'saved' && <SavedView onRemove={id => setSaved(current => current.filter(game => game.id !== id))} onClear={() => setSaved([])} games={saved} language={locale} seed={payload.digest.roll?.seed ?? payload.digest.generatedAt} onOpen={(game) => { setFailure(''); setDetails(game); }} onExplore={() => setActiveTab('discover')} />}
        {activeTab === 'library' && <LibraryView initialRoom={initialRoom} games={saved} suggestions={uniqueGames([...(payload.popular ?? []), ...payload.digest.discover, ...payload.digest.deals, ...(searchGames ?? [])])} onExplore={() => setActiveTab('discover')} onRestore={(next, ids) => { setBlocked(new Set(Object.keys(next))); setDismissed(current => new Set([...current].filter(id => !ids.includes(id)))); }} />}
        <ConsumerBottomNav active={activeTab} savedCount={saved.length} onChange={setActiveTab} />
        </div>
        {notice && <div className="consumer-toast" role="status"><Check aria-hidden="true" />{notice}</div>}
        <AnimatePresence>{showGuide && <PageGuide key={activeTab} page={activeTab} onClose={dismissGuide} />}</AnimatePresence>
        <AnimatePresence>{supportView && <ConsumerSheet glass title={supportView === 'coffee' ? '請我喝咖啡' : '免費支持'} onClose={() => setSupportView(null)}><SupportPanel freeOnly={supportView === 'free'} /></ConsumerSheet>}</AnimatePresence>
        <AnimatePresence>{showLanguages && <ConsumerSheet title={t("語言")} onClose={() => setShowLanguages(false)}><div className="consumer-language-options">{LANGUAGES.map(item => <button type="button" lang={item.code} key={item.code} aria-pressed={locale === item.code} onClick={() => { if (isLocale(item.code)) setLocale(item.code); setNotice(''); setShowLanguages(false); }}><span>{item.name}</span>{locale === item.code && <Check aria-hidden="true" />}</button>)}</div></ConsumerSheet>}</AnimatePresence>
        <AnimatePresence>{showFilters && <FilterSheet filters={filters} source={source} genres={genres} loading={loading} onRefresh={onRetry} onChange={(next, nextSource) => { setFilters(next); setSource(nextSource); setSearchOffset(0); setSearchGames(null); setSearchRevision(value => value + 1); setDismissed(new Set()); setHistory([]); lastDecision.current = null; setActiveTab('discover'); }} onClose={() => setShowFilters(false)} />}</AnimatePresence>
        <AnimatePresence>{details && <ReviewOverlay key={details.id} game={details} saved={saved.some((game) => game.id === details.id)} onToggleSaved={() => toggleSaved(details)} busy={busy} failure={failure} onPreference={(action) => void persistPreference(action)} onClose={() => setDetails(null)} />}</AnimatePresence>
      </section>
    </main>
  );
}


