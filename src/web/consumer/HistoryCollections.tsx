import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Plus, DotsSixVertical, ArrowLeft, PencilSimple, Trash, ShareNetwork } from '@phosphor-icons/react';
import type { Game } from '../types';
import { HISTORY_KEY, parseHistory, saveHistory, addToFolder, type HistoryFolder } from './history-library';
import { SavedShare } from './SavedShare';
import { useArtwork } from './artwork';
import { acquireScrollLock } from './scroll-lock';
import { dragIntent } from './history-drag';
import './history-collections.css';
import GlassFolder, { preloadFolderArt } from '../components/ui/glass-folder-cards';

function Cover({ game }: { game: Game }) {
  const art = useArtwork(game.id, game.imageUrl);
  return art?.src ? <img src={art.src} alt="" draggable={false} /> : <span className="history-cover-placeholder" />;
}

function FolderArtwork({ game }: { game: Game }) {
  const art = useArtwork(game.id, game.imageUrl);
  return art?.src ? <img className="gf-sheet-art" src={art.src} alt="" draggable={false} decoding="async" referrerPolicy="no-referrer" /> : <span className="gf-sheet-art history-folder-photo-placeholder" />;
}

export function useHistoryCollections(onOrganize: () => void) {
  const [folders, setFolders] = useState<HistoryFolder[]>([]);
  const [open, setOpen] = useState(() => location.hash === '#history');
  const [pending, setPending] = useState<Game | null>(null);
  const [status, setStatus] = useState('');
  const [readError, setReadError] = useState(false);
  const [drag, setDrag] = useState<{ game: Game; over: string; landing: boolean } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const folderRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLElement | null>(null);
  const session = useRef<{ active: boolean; cleanup: () => void } | null>(null);
  const suppressClick = useRef(false);
  const point = useRef({ x: 0, y: 0 });
  const landingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openPage = (game: Game | null = null) => {
    setPending(game);
    if (location.hash !== '#history') window.history.pushState({ ...window.history.state, collectionHistory: true }, '', '#history');
    setOpen(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const close = () => {
    setOpen(false); setPending(null);
    if (window.history.state?.collectionHistory) window.history.back();
    else if (location.hash === '#history') window.history.replaceState(window.history.state, '', location.pathname + location.search);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  useEffect(() => {
    const read = () => { try { setFolders(parseHistory(localStorage.getItem(HISTORY_KEY))); setReadError(false); } catch { setReadError(true); setStatus('歷史收藏暫時讀取不了，原資料已保留。請重新整理再試。'); } };
    const route = () => { setOpen(location.hash === '#history'); setPending(null); };
    read();
    const sync = (event: StorageEvent) => { if (event.key === HISTORY_KEY) read(); };
    const artFrame = requestAnimationFrame(() => { void preloadFolderArt('ember', 11, 240); });
    window.addEventListener('storage', sync);
    window.addEventListener('hashchange', route);
    return () => { cancelAnimationFrame(artFrame); window.removeEventListener('storage', sync); window.removeEventListener('hashchange', route); session.current?.cleanup(); clearTimeout(landingTimer.current); };
  }, []);
  useEffect(() => {
    if (!open) return;
    document.getElementById('history-page-title')?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (status !== '已儲存') return;
    const timer = window.setTimeout(() => setStatus(''), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);
  const persist = (next: HistoryFolder[]) => {
    if (readError) return false;
    try { setFolders(saveHistory(localStorage, next)); setStatus('已儲存'); return true; }
    catch { setStatus('儲存失敗，原收藏仍保留。請釋放瀏覽器儲存空間後再試。'); return false; }
  };
  const begin = (event: ReactPointerEvent, game: Game) => {
    if (event.button !== 0 || session.current || drag || (event.target as HTMLElement).closest('[data-no-drag]')) return;
    suppressClick.current = false;
    const target = event.currentTarget as HTMLElement;
    const pointerId = event.pointerId;
    const start = { x: event.clientX, y: event.clientY, time: performance.now() };
    const fromHandle = target.classList.contains('history-drag-handle');
    point.current = { x: start.x, y: start.y };
    let frame = 0;
    let releaseScroll: (() => boolean) | undefined;
    let over = '';
    const inside = (x: number, y: number) => {
      const targets = folderRef.current?.querySelectorAll<HTMLElement>('[data-history-folder-id]') ?? [];
      for (const target of Array.from(targets)) {
        const r = target.getBoundingClientRect();
        if (x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8) return { id: target.dataset.historyFolderId!, rect: r };
      }
      return null;
    };
    const paint = () => {
      frame = 0;
      const p = point.current;
      if (previewRef.current) previewRef.current.style.transform = 'translate3d(' + p.x + 'px,' + p.y + 'px,0) translate(-50%,-42%) rotate(-2deg)';
      const next = inside(p.x, p.y)?.id ?? '';
      if (next !== over) { over = next; setDrag(current => current ? { ...current, over: next } : current); }
    };
    const activate = () => {
      if (!session.current || session.current.active) return;
      session.current.active = true; suppressClick.current = true;
      clearTimeout(timer);
      sourceRef.current = target.closest<HTMLElement>('.consumer-saved-row');
      sourceRef.current?.classList.add('is-dragging');
      releaseScroll = acquireScrollLock(document.body);
      try { target.setPointerCapture(pointerId); } catch { /* A canceled pointer cannot be captured. */ }
      setDrag({ game, over: '', landing: false });
      frame = requestAnimationFrame(paint);
    };
    const cleanup = () => {
      clearTimeout(timer); cancelAnimationFrame(frame);
      releaseScroll?.(); sourceRef.current?.classList.remove('is-dragging'); sourceRef.current = null;
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancelPointer); window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      session.current = null;
    };
    const cancel = () => { cleanup(); setDrag(null); };
    const cancelPointer = (e: PointerEvent) => { if (e.pointerId === pointerId) cancel(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } };
    const move = (e: PointerEvent) => {
      const current = session.current;
      if (!current || e.pointerId !== pointerId) return;
      point.current = { x: e.clientX, y: e.clientY };
      if (!current.active) {
        const intent = dragIntent(e.pointerType, fromHandle, Math.hypot(e.clientX - start.x, e.clientY - start.y), performance.now() - start.time);
        if (intent === 'cancel') { cancel(); return; }
        if (intent === 'activate') activate();
      }
      if (session.current?.active) { e.preventDefault(); if (!frame) frame = requestAnimationFrame(paint); }
    };
    const finish = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const accepted = session.current?.active ? inside(e.clientX, e.clientY) : null;
      cleanup();
      if (!accepted) { setDrag(null); return; }
      if (accepted.id !== 'create') {
        try { if (!persist(addToFolder(folders, accepted.id, game))) { setDrag(null); return; } }
        catch { setStatus('找不到這個資料夾，原收藏仍保留。請重新選擇。'); setDrag(null); return; }
      }
      const rect = accepted.rect;
      point.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height * .58 };
      setDrag({ game, over: accepted.id, landing: true });
      if (previewRef.current) previewRef.current.style.transform = 'translate3d(' + (rect.left + rect.width / 2) + 'px,' + (rect.top + rect.height * .58) + 'px,0) translate(-50%,-50%) scale(.35)';
      landingTimer.current = setTimeout(() => { setDrag(null); if (accepted.id === 'create') openPage(game); }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220);
    };
    const timer = setTimeout(activate, 240);
    session.current = { active: false, cleanup };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancelPointer); window.addEventListener('keydown', key); window.addEventListener('blur', cancel);
  };
  const consumeClick = () => { const result = suppressClick.current; suppressClick.current = false; return result; };
  const toolbar = (editing: boolean, disabled: boolean) => <div className="history-toolbar">
    <button type="button" className={drag ? 'is-drag-target' : ''} onClick={() => openPage()}>歷史收藏</button>
    <button type="button" disabled={disabled} onClick={onOrganize}>{editing ? '完成' : '整理收藏'}</button>
  </div>;
  const overlay = drag && createPortal(<div className="history-drag-layer">
    <div className="history-drag-dim" />
    <div ref={folderRef} className="history-drop-dock">
      {(folders.length ? folders : [{ id: 'create', name: '歷史收藏', games: [] }]).map(item => <div key={item.id} data-history-folder-id={item.id} className={'history-drop-target' + (drag.over === item.id ? ' is-over' : '') + (drag.landing && drag.over === item.id ? ' is-landing' : '')}>
        <GlassFolder label={item.name} meta={drag.over === item.id ? '放開即可保存' : item.id === 'create' ? '新增資料夾保存' : `${item.games.length} 款遊戲`} tone="dark" art="ember" seed={11} labelPlacement="top-right" files={item.games.slice(-4).map(game => ({ name: game.name, imageContent: <FolderArtwork game={game} /> }))} action="none" width={240} appear={false} open={drag.over === item.id} />
      </div>)}
    </div>
    <div ref={previewRef} className={'history-drag-card' + (drag.landing ? ' is-landing' : '')} style={{ transform: 'translate3d(' + point.current.x + 'px,' + point.current.y + 'px,0) ' + (drag.landing ? 'translate(-50%,-50%) scale(.35)' : 'translate(-50%,-42%) rotate(-2deg)') }}><Cover game={drag.game} /><span>{drag.game.name}</span></div>
    <p className="history-drag-caption">放開以保存 · Esc 取消</p>
  </div>, document.body);
  const handle = (game: Game) => <button type="button" className="history-drag-handle" aria-label={'保存 ' + game.name + ' 到歷史收藏；按住可拖曳'} onPointerDown={event => { event.stopPropagation(); begin(event, game); }} onClick={event => { event.stopPropagation(); if (!consumeClick()) openPage(game); }}><DotsSixVertical aria-hidden="true" /></button>;
  return { open, close, begin, consumeClick, toolbar, overlay, handle, status,
    page: <section className="consumer-list-view history-page"><header className="history-page-heading"><button type="button" onClick={close}><ArrowLeft aria-hidden="true" />返回收藏</button><h1 id="history-page-title" tabIndex={-1}>歷史收藏</h1></header><HistoryPanel folders={folders} persist={persist} pending={pending} onStored={() => setPending(null)} disabled={readError} status={status} /></section> };
}

function HistoryPanel({ folders, persist, pending, onStored, disabled, status }: { folders: HistoryFolder[]; persist: (next: HistoryFolder[]) => boolean; pending: Game | null; onStored: () => void; disabled: boolean; status: string }) {
  const [folderWidth, setFolderWidth] = useState(() => window.innerWidth < 600 ? 240 : 300);
  useEffect(() => { const resize = () => setFolderWidth(window.innerWidth < 600 ? 240 : 300); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const deleting = folders.find(item => item.id === deleteId);
  useEffect(() => { if (deleteId) confirmationRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: false }); }, [deleteId]);
  const folder = folders.find(item => item.id === selected);
  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (renaming && folder) { if (persist(folders.map(item => item.id === folder.id ? { ...item, name: trimmed } : item))) { setRenaming(false); setName(''); } }
    else {
      const created = { id: crypto.randomUUID(), name: trimmed, games: pending ? [pending] : [] };
      if (persist([...folders, created])) { setName(''); setSelected(null); if (pending) onStored(); }
    }
  };
  const chooseFolder = (id: string) => {
    if (pending) { if (persist(addToFolder(folders, id, pending))) { onStored(); setSelected(null); } return; }
    setSelected(id); setSharing(false); setDeleteId(null);
  };
  let content: ReactNode;
  if (folder && !pending) content = <>
    <div className="history-folder-heading"><button onClick={() => { setSelected(null); setSharing(false); setRenaming(false); setName(''); setDeleteId(null); }} aria-label="返回資料夾"><ArrowLeft /></button><h3>{folder.name}</h3><button disabled={disabled} aria-label="重新命名資料夾" onClick={() => { setRenaming(!renaming); setName(folder.name); }}><PencilSimple /></button><button disabled={!folder.games.length} aria-label="分享資料夾" onClick={() => setSharing(!sharing)}><ShareNetwork /></button><button disabled={disabled} aria-label="刪除資料夾" onClick={() => setDeleteId(folder.id)}><Trash /></button></div>
    {renaming && <form onSubmit={event => { event.preventDefault(); commitName(); }}><input aria-label="資料夾名稱" maxLength={40} value={name} onChange={event => setName(event.target.value)} autoFocus /><button disabled={!name.trim() || disabled}>儲存名稱</button></form>}
    {sharing ? <SavedShare key={folder.id} games={folder.games} title={folder.name} /> : <div className="history-game-list">{folder.games.map(game => <div key={game.id}><Cover game={game} /><strong>{game.name}</strong><button disabled={disabled} aria-label={`從資料夾移除 ${game.name}`} onClick={() => persist(folders.map(item => item.id === folder.id ? { ...item, games: item.games.filter(g => g.id !== game.id) } : item))}><Trash /></button></div>)}{!folder.games.length && <p>把收藏中的遊戲拖進來。</p>}</div>}
  </>;
  else content = <>
    {pending && <p className="history-pending">將「{pending.name}」保存到…</p>}
    <form onSubmit={event => { event.preventDefault(); commitName(); }}><input aria-label="新資料夾名稱" placeholder="資料夾名稱" maxLength={40} value={name} onChange={event => setName(event.target.value)} /><button disabled={!name.trim() || disabled || folders.length >= 100}><Plus />新增資料夾</button></form>
    <div className="history-folders">{folders.map(item => <GlassFolder key={`${item.id}-${item.games.map(game => game.id).join('-')}`} label={item.name} meta={`${item.games.length} 款遊戲`} tone="dark" art="ember" seed={11} labelPlacement="top-right" width={folderWidth} files={item.games.slice(-4).map(game => ({ name: game.name, imageContent: <FolderArtwork game={game} /> }))} action="more" {...(pending ? { open: false } : {})} menu={disabled ? [] : [{ label: '重新命名', onSelect: () => { setSelected(item.id); setName(item.name); setRenaming(true); setSharing(false); } }, { label: '分享資料夾', onSelect: () => { setSelected(item.id); setSharing(true); setRenaming(false); } }, { label: '刪除資料夾', danger: true, onSelect: () => setDeleteId(item.id) }]} onOpenChange={opened => { if (opened && !disabled) chooseFolder(item.id); }} />)}</div>
    {!folders.length && <p className="history-empty">建個資料夾，留住下次想玩的遊戲。</p>}
  </>;
  return <div className="history-panel">{deleting && <div ref={confirmationRef} className="history-confirm" role="alert"><span>刪除「{deleting.name}」及裡面的收藏？</span><button disabled={disabled} onClick={() => { if (persist(folders.filter(item => item.id !== deleting.id))) { if (selected === deleting.id) setSelected(null); setDeleteId(null); } }}>確認刪除</button><button onClick={() => setDeleteId(null)}>取消</button></div>}{content}<p className="history-status" role="status">{status}</p></div>;
}
