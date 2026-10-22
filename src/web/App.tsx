import { warmArtwork } from './consumer/artwork';
import { LocaleProvider } from './consumer/LocaleProvider';
import {
  ArrowClockwise,
  ArrowSquareOut,
  Clock,
  Compass,
  CurrencyCircleDollar,
  DiceFive,
  Heart,
  Info,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchDigest, updatePreference } from './api';
import { buildRollPool, compactLabels, formatGamePrice, safeStoreUrl } from './deck';
import { GameDeck } from './components/GameDeck';
import { ConsumerPreview } from './consumer/ConsumerPreview';
import { DesignLab } from './design/DesignLab';
import type { DeckDecision, Game, UiPayload, ViewId } from './types';

const NAV_ITEMS: Array<{ id: ViewId; label: string; short: string; icon: typeof DiceFive }> = [
  { id: 'roll', label: '擲戲', short: 'ROLL', icon: DiceFive },
  { id: 'discover', label: '新品', short: 'DISCOVER', icon: Compass },
  { id: 'deals', label: '折扣', short: 'DEALS', icon: CurrencyCircleDollar },
  { id: 'tonight', label: '今晚玩', short: 'TONIGHT', icon: Heart },
];

interface DecisionRecord {
  game: Game;
  decision: DeckDecision;
}

function DeviceFrame({ children }: { children: ReactNode }) {
  return (
    <div className="device-stage">
      <div className="device-frame">
        <div className="device-speaker" aria-hidden="true" />
        <div className="app-shell">{children}</div>
      </div>
      <p className="device-caption">STOP BROWSING · START PLAYING</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen" id="main-content">
      <div className="loading-mark"><DiceFive weight="fill" aria-hidden="true" /></div>
      <p className="kicker">LIVE DATA PIPELINE</p>
      <h1>正在整理你今晚的候選池</h1>
      <div className="loading-track" aria-label="載入中"><span /></div>
      <p>Steam 即時資料 → 規則 → 卡牌</p>
    </main>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const uninitialized = /not initialized|init/i.test(message);
  return (
    <main className="error-screen" id="main-content">
      <WarningCircle weight="duotone" aria-hidden="true" />
      <p className="kicker">LOCAL PIPELINE INTERRUPTED</p>
      <h1>{uninitialized ? '先初始化 Playcision' : '即時資料暫時無法取得'}</h1>
      <p>{message}</p>
      {uninitialized && <code>npx playcision init</code>}
      <button type="button" className="primary-button" onClick={onRetry}><ArrowClockwise aria-hidden="true" /> 重試</button>
    </main>
  );
}

function DetailsDialog({
  game,
  language,
  busy,
  onClose,
  onPreference,
}: {
  game: Game;
  language: string;
  busy: boolean;
  onClose: () => void;
  onPreference: (action: 'skip' | 'exclude') => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <motion.div className="dialog-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className="details-dialog" role="dialog" aria-modal="true" aria-labelledby="details-title" initial={{ opacity: 0, y: 28, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18 }}>
        <button className="dialog-close" type="button" onClick={onClose} aria-label="關閉詳情"><X weight="bold" aria-hidden="true" /></button>
        {game.imageUrl && <img className="details-image" src={game.imageUrl} alt={`${game.name} 商店圖片`} referrerPolicy="no-referrer" />}
        <div className="details-content">
          <p className="kicker">STEAM · APP {game.id}</p>
          <h2 id="details-title">{game.name}</h2>
          <p className="details-price">{formatGamePrice(game, language)} {game.price.discountPercent > 0 && <span>省 {game.price.discountPercent}%</span>}</p>
          <div className="tag-row">{compactLabels(game).map((tag) => <span key={tag}>{tag}</span>)}</div>
          <dl className="details-facts">
            <div><dt>開發</dt><dd>{game.developers.join('、') || '未提供'}</dd></div>
            <div><dt>平台</dt><dd>{game.platforms.join(' / ') || '未提供'}</dd></div>
            <div><dt>發售</dt><dd>{game.releaseDate ?? '尚未公布'}</dd></div>
          </dl>
          <div className="details-actions">
            <a className="primary-button" href={safeStoreUrl(game)} target="_blank" rel="noreferrer">開啟 Steam <ArrowSquareOut aria-hidden="true" /></a>
            <button type="button" className="secondary-button" onClick={() => onPreference('skip')} disabled={busy}><Clock aria-hidden="true" /> 跳過 7 天</button>
            <button type="button" className="danger-button" onClick={() => onPreference('exclude')} disabled={busy}><X aria-hidden="true" /> 永久排除</button>
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}

function TonightView({ games, language, onRemove }: { games: Game[]; language: string; onRemove: (id: string) => void }) {
  return (
    <section className="tonight-view">
      <div className="section-heading">
        <div><p className="kicker">SESSION SHORTLIST</p><h1>今晚就玩這些</h1></div>
        <span className="count-chip">{games.length.toString().padStart(2, '0')} PICKS</span>
      </div>
      {games.length === 0 ? (
        <div className="list-empty"><Heart weight="duotone" aria-hidden="true" /><h2>還沒有入選遊戲</h2><p>回到擲戲，右滑一張讓你有感的卡。</p></div>
      ) : (
        <div className="shortlist-grid">
          {games.map((game, index) => (
            <article className="shortlist-card" key={game.id}>
              {game.imageUrl ? <img src={game.imageUrl} alt={`${game.name} 商店圖片`} referrerPolicy="no-referrer" /> : <div className="shortlist-fallback">{game.name.slice(0, 2)}</div>}
              <div><span className="shortlist-index">PICK {(index + 1).toString().padStart(2, '0')}</span><h2>{game.name}</h2><p>{formatGamePrice(game, language)}</p></div>
              <div className="shortlist-actions"><a href={safeStoreUrl(game)} target="_blank" rel="noreferrer" aria-label={`在 Steam 開啟 ${game.name}`}><ArrowSquareOut aria-hidden="true" /></a><button type="button" onClick={() => onRemove(game.id)} aria-label={`從今晚清單移除 ${game.name}`}><X aria-hidden="true" /></button></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const route = new URLSearchParams(window.location.search);
  const designLab = route.get('lab') === '1';
  const consumerPreview = !designLab && route.get('legacy') !== '1';
  const [payload, setPayload] = useState<UiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewId>('roll');
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [shortlist, setShortlist] = useState<Game[]>([]);
  const [history, setHistory] = useState<DecisionRecord[]>([]);
  const [details, setDetails] = useState<Game | null>(null);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const reduceMotion = useReducedMotion();

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchDigest(controller.signal);
      await warmArtwork(next.popular ?? next.digest.discover, () => controller.signal.aborted);
      if (controller.signal.aborted) return;
      setPayload(next);
      setDismissed(new Set());
      setHistory([]);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const pool = useMemo(() => {
    if (!payload) return [];
    if (view === 'discover') return payload.digest.discover;
    if (view === 'deals') return payload.digest.deals;
    return buildRollPool(payload);
  }, [payload, view]);
  const available = useMemo(() => pool.filter((game) => !dismissed.has(game.id)), [dismissed, pool]);

  const decide = useCallback((game: Game, decision: DeckDecision) => {
    setDismissed((current) => new Set(current).add(game.id));
    setHistory((current) => [...current, { game, decision }]);
    if (decision === 'right') {
      setShortlist((current) => current.some((item) => item.id === game.id) ? current : [...current, game]);
      setToast(`已把《${game.name}》加入今晚清單`);
    } else {
      setToast(`已略過《${game.name}》`);
    }
  }, []);

  const undo = useCallback(() => {
    const last = history.at(-1);
    if (!last) return;
    setHistory((current) => current.slice(0, -1));
    setDismissed((current) => {
      const next = new Set(current);
      next.delete(last.game.id);
      return next;
    });
    if (last.decision === 'right') setShortlist((current) => current.filter((game) => game.id !== last.game.id));
    setToast(`已復原《${last.game.name}》`);
  }, [history]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (consumerPreview || designLab) return;
      if (details || view === 'tonight' || !available[0]) return;
      if (event.key === 'ArrowLeft') decide(available[0], 'left');
      if (event.key === 'ArrowRight') decide(available[0], 'right');
      if (event.key === 'Backspace' && history.length > 0) {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [available, decide, details, history.length, undo, view, consumerPreview, designLab]);

  const persistPreference = async (action: 'skip' | 'exclude'): Promise<void> => {
    if (!details) return;
    if (action === 'exclude' && !window.confirm(`確定永久排除《${details.name}》？之後可用 CLI 恢復。`)) return;
    setPreferenceBusy(true);
    try {
      const message = await updatePreference(action, details.id);
      setDismissed((current) => new Set(current).add(details.id));
      setShortlist((current) => current.filter((game) => game.id !== details.id));
      setToast(message);
      setDetails(null);
    } catch (caught) {
      setToast(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPreferenceBusy(false);
    }
  };

  if (consumerPreview) return <LocaleProvider><ConsumerPreview payload={payload} loading={loading} error={error} onRetry={() => void load()} /></LocaleProvider>;
  if (loading && !payload) return <DeviceFrame><LoadingScreen /></DeviceFrame>;
  if (error && !payload) return <DeviceFrame><ErrorScreen message={error} onRetry={() => void load()} /></DeviceFrame>;
  if (!payload) return null;
  if (designLab) return <DesignLab payload={payload} />;

  const activeNav = NAV_ITEMS.find((item) => item.id === view) ?? NAV_ITEMS[0]!;
  const generatedAt = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(payload.digest.generatedAt));
  const poolLabel = view === 'roll' ? '綜合候選' : view === 'discover' ? '近期新品' : '有效折扣';

  return (
    <DeviceFrame>
      <header className="app-header">
        <div className="app-brand">
          <span className="brand-mark"><DiceFive weight="fill" aria-hidden="true" /></span>
          <div><strong>PLAYCISION</strong><small>{activeNav.short} MODE</small></div>
        </div>
        <div className="app-status">
          <span><i className="status-dot" /> {generatedAt}</span>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="重新取得即時資料"><ArrowClockwise className={loading && !reduceMotion ? 'spin' : ''} aria-hidden="true" /></button>
        </div>
      </header>

      <main className="main-content" id="main-content">
        {error && <div className="inline-alert" role="alert"><WarningCircle aria-hidden="true" /><span>{error}</span><button type="button" onClick={() => void load()}>重試</button></div>}
        {view === 'tonight' ? (
          <TonightView games={shortlist} language={payload.locale.language} onRemove={(id) => setShortlist((current) => current.filter((game) => game.id !== id))} />
        ) : (
          <section className="workspace">
            <div className="deck-meta" aria-label="候選池狀態">
              <span>{poolLabel.toUpperCase()} · {available.length.toString().padStart(2, '0')} REMAIN</span>
              <span className="mode-badge">{payload.filters.rollMode === 'weighted' ? 'WEIGHTED' : 'UNIFORM'}</span>
            </div>
            <GameDeck games={available} language={payload.locale.language} onDecision={decide} onDetails={setDetails} onUndo={undo} canUndo={history.length > 0} />
          </section>
        )}
      </main>

      <nav className="mobile-nav" aria-label="主要導覽">{NAV_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}><Icon aria-hidden="true" /><span>{item.label}</span>{item.id === 'tonight' && shortlist.length > 0 && <b>{shortlist.length}</b>}</button>; })}</nav>

      <AnimatePresence>{details && <DetailsDialog game={details} language={payload.locale.language} busy={preferenceBusy} onClose={() => setDetails(null)} onPreference={(action) => void persistPreference(action)} />}</AnimatePresence>
      <AnimatePresence>{toast && <motion.div className="toast" role="status" aria-live="polite" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><Info weight="fill" aria-hidden="true" />{toast}</motion.div>}</AnimatePresence>
    </DeviceFrame>
  );
}
