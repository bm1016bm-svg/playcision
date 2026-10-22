import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Plus, X, GameController } from '@phosphor-icons/react';
import type { Game } from '../types';
import type { RoomAction, RoomView } from '../../rooms/engine';
import './play-room.css';
import { useArtwork } from './artwork';

function RoomArtwork({ id }: { id: string }) {
  const artwork = useArtwork(id);
  return artwork?.src ? <img src={artwork.src} alt="" referrerPolicy="no-referrer" /> : <div className="room-art-placeholder" aria-label="遊戲封面載入中">PLAYCISION</div>;
}

const api = (import.meta.env.VITE_ROOM_API as string | undefined)?.replace(/\/$/, '') ?? '';
function credential() {
  try {
    const existing = sessionStorage.getItem('playcision.room-token');
    if (existing) return existing;
    const value = crypto.randomUUID(); sessionStorage.setItem('playcision.room-token', value); return value;
  } catch { return crypto.randomUUID(); }
}
export function PlayRoom({ games, suggestions, active = true }: { games: Game[]; suggestions: Game[]; active?: boolean }) {
  const [token] = useState(credential);
  const [roomId, setRoomId] = useState(() => new URL(location.href).searchParams.get('room') ?? '');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [copied, setCopied] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const offset = useRef(0);
  const latest = useRef(0);
  const accept = (next: RoomView) => {
    if (next.serverNow < latest.current) return;
    latest.current = next.serverNow; offset.current = next.serverNow - Date.now(); setRoom(next); setClock(Date.now());
  };
  async function request(path: string, action?: unknown, signal?: AbortSignal) {
    const response = await fetch(`${api}/api/rooms${path}`, { method: action ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(action ? { body: JSON.stringify(action) } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? '房間暫時無法連線');
    return value as RoomView;
  }
  useEffect(() => {
    if (!active || !roomId || !room) return;
    let stopped = false; let failures = 0; let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;
    const connect = () => {
      if (stopped || finished || document.hidden) return;
      const url = new URL(`${api}/api/rooms/${roomId}/live`, location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const current = new WebSocket(url); socket = current;
      current.onopen = () => current.send(JSON.stringify({ token }));
      current.onmessage = event => {
        try {
          const value = JSON.parse(String(event.data)) as RoomView;
          if (!stopped && socket === current) {
            failures = 0; accept(value); setSyncError('');
            finished = value.phase === 'finished';
          }
        } catch { current.close(1008); }
      };
      current.onerror = () => current.close();
      current.onclose = event => {
        if (stopped || finished || document.hidden || socket !== current) return;
        setSyncError(event.code === 1008 ? '房間已到期或連線無效，請重新加入。' : '同步中斷，正在重新連線');
        if (event.code === 1008) return;
        timer = setTimeout(connect, Math.min(15000, 1000 * 2 ** Math.min(failures++, 4)));
      };
    };
    const visibility = () => {
      if (timer) clearTimeout(timer);
      if (document.hidden) socket?.close();
      else { socket?.close(); connect(); }
    };
    document.addEventListener('visibilitychange', visibility);
    connect();
    return () => { stopped = true; if (timer) clearTimeout(timer); socket?.close(); document.removeEventListener('visibilitychange', visibility); };
  }, [roomId, token, Boolean(room), active]);
  useEffect(() => {
    if (!active || room?.startedAt == null || room.phase === 'finished') return;
    const timer = setInterval(() => { if (!document.hidden) setClock(Date.now()); }, 200);
    return () => clearInterval(timer);
  }, [active, room?.startedAt, room?.phase]);
  async function act(action: RoomAction | { type: 'create'; name: string }) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const next = await request(action.type === 'create' ? '' : `/${roomId}`, action);
      if (action.type === 'leave') { exit(); return; }
      accept(next); setRoomId(next.id);
      const url = new URL(location.href); url.searchParams.set('room', next.id); history.replaceState(null, '', url);
    } catch (e) { setError(e instanceof Error ? e.message : '操作失敗，請再試一次'); }
    finally { setBusy(false); }
  }
  function exit() { setError(''); setSyncError(''); setRoom(null); setRoomId(''); latest.current = 0; const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url); }
  const elapsed = room?.startedAt == null ? 0 : clock + offset.current - room.startedAt;
  const stage = !room || room.startedAt === null ? 'waiting' : elapsed < 40000 ? 'proposing' : elapsed < 60000 ? 'voting' : 'finished';
  const seconds = Math.max(0, Math.ceil(((stage === 'proposing' ? 40000 : 60000) - elapsed) / 1000));
  const me = room?.players.find(p => p.id === room.me);
  const hand = games.length ? games : suggestions.slice(0, 12);
  const myCardCount = room?.cards.filter(card => card.owners.includes(room.me)).length ?? 0;
  const mySeat = room?.players.findIndex(p => p.id === room.me) ?? 0;
  const seats = Array.from({ length: 4 }, (_, i) => room?.players[(Math.max(0, mySeat) + i) % 4]);
  return <section className="play-room" aria-labelledby="play-room-title">
    <header className="room-heading"><div><h2 id="play-room-title">今晚一起玩</h2></div><span className="room-capacity">{room ? `${room.players.length} / 4 人` : '2–4 人'}</span></header>
    {!room && <p className="room-intro">邀朋友一起出牌，選出今晚都想玩的遊戲。</p>}
    {!room ? <div className="room-entry"><form onSubmit={e => { e.preventDefault(); void act(roomId ? { type: 'join', name } : { type: 'create', name }); }}><label htmlFor="room-name">你的暱稱</label><div><input id="room-name" value={name} onChange={e => setName(e.target.value)} maxLength={24} placeholder="朋友怎麼稱呼你？" required /><button disabled={busy || !name.trim()}>{roomId ? '加入牌桌' : '開一桌'}<ArrowUpRight /></button></div></form>{roomId && <button className="room-text-button" onClick={exit}>改開新房間</button>}</div> : <>
      <div className="room-toolbar"><span>{stage === 'waiting' ? '等朋友入座' : stage === 'proposing' ? '01 / 把想玩的放上桌' : stage === 'voting' ? '02 / 選出你願意一起玩的遊戲' : '03 / 今晚的選擇'}</span>{stage === 'proposing' || stage === 'voting' ? <strong className="room-clock" role="timer">{seconds.toString().padStart(2, '0')}<small>秒</small></strong> : <button className="room-text-button" onClick={async () => { try { await navigator.clipboard.writeText(location.href); setCopied(true); } catch { setError('無法複製，請複製瀏覽器網址邀請朋友'); } }}>{copied ? <Check /> : <Copy />}{copied ? '已複製邀請' : '邀請朋友'}</button>}</div>
      <div className="room-arena">
      <div className="room-seats">{seats.map((p, i) => <div className={`room-seat room-seat--${i} ${p ? 'occupied' : ''} ${p?.id === room.me ? 'is-me' : ''}`} key={i}><span className="room-seat-avatar" aria-hidden="true">{p ? Array.from(p.name)[0] : <Plus />}{p?.ready && <Check className="room-ready-mark" />}</span><div><strong>{p?.name ?? '空位'}</strong><small>{p ? `${p.id === room.me ? '你 · ' : p.id === room.host ? '房主 · ' : ''}${p.ready ? '已準備' : '準備中'}` : '等待朋友'}</small></div></div>)}</div>
      <div className={`room-table room-table--${stage}`}><div className="room-felt">
        {!room.cards.length && <div className="room-table-empty"><div className="room-stage-mark" aria-hidden="true"><GameController weight="light" /></div><p>{stage === 'waiting' ? '入座後，按下準備' : stage === 'proposing' ? '從下方手牌選一款，打到桌上' : '這輪沒有遊戲上桌'}</p></div>}
        {room.cards.map(card => { const selected = card.votes.includes(room.me); const own = card.owners.includes(room.me); return <article key={card.id} data-seat={Math.max(0, seats.findIndex(player => player?.id === card.owners[0]))} className={`room-game ${selected ? 'selected' : ''} ${stage === 'finished' && room.winners.includes(card.id) ? 'winner' : ''}`}><RoomArtwork id={card.id} /><div><h3>{card.name}</h3><p>{card.owners.map(id => room.players.find(p => p.id === id)?.name).join('、')} 出牌</p>{stage === 'proposing' && own && <button className="room-text-button" disabled={busy} onClick={() => void act({ type: 'withdraw', id: card.id })}><X />收回</button>}{stage === 'voting' && <button className="room-vote" aria-pressed={selected} disabled={busy} onClick={() => void act({ type: 'vote', id: card.id, selected: !selected })}>{selected && <Check />}{selected ? '我也想玩' : '一起玩這款'}</button>}{stage === 'finished' && <><strong>{card.votes.length} / {room.players.length} 人願意玩</strong><a href={`https://store.steampowered.com/app/${card.id}/`} target="_blank" rel="noreferrer">前往 Steam<ArrowUpRight /></a></>}</div></article>; })}
      </div></div></div>
      {stage === 'waiting' && <div className="room-controls"><button className="room-primary" disabled={busy} onClick={() => void act({ type: 'ready', ready: !me?.ready })}>{me?.ready ? '取消準備' : '我準備好了'}</button>{room.host === room.me && <button disabled={busy || room.players.length < 2 || room.players.some(p => !p.ready)} onClick={() => void act({ type: 'start' })}>開始 60 秒</button>}<button className="room-text-button" disabled={busy} onClick={() => void act({ type: 'leave' })}>離開牌桌</button></div>}
      {stage === 'proposing' && <div className="room-hand"><header><h3>{games.length ? '你的收藏手牌' : '先從這些遊戲出牌'}</h3><span>每人最多兩款</span></header><div>{hand.map(g => <button className="room-hand-card" key={g.id} aria-label={`出牌：${g.name}`} disabled={busy || myCardCount >= 2 || room.cards.some(c => c.id === g.id && c.owners.includes(room.me))} onClick={() => void act({ type: 'propose', id: g.id, name: g.name })}><RoomArtwork id={g.id} /><span className="room-hand-caption">{g.name}</span><span className="room-hand-add" aria-hidden="true">{room.cards.some(c => c.id === g.id && c.owners.includes(room.me)) ? <Check /> : <Plus />}</span></button>)}</div></div>}
      {stage === 'voting' && <p className="room-footnote">可以選多款，時間結束前都能改選。票數將在結束後揭曉。</p>}
      {stage === 'finished' && <div className="room-result" role="status"><h3>{room.phase !== 'finished' ? '正在確認結果…' : !room.winners.length ? '這輪還沒選出來' : room.winners.some(id => room.cards.find(c => c.id === id)?.votes.length === room.players.length) ? '找到大家都想玩的遊戲' : room.winners.length > 1 ? '這幾款並列最高票' : '這款獲得最多支持'}</h3><p>保留大家的選擇，再一起決定。</p><button onClick={exit}>離開結果，開新一桌</button></div>}
    </>}
    {(error || syncError) && <p className="room-error" role="alert">{error || syncError}</p>}
  </section>;
}
