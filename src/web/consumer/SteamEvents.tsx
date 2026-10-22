import { useEffect, useState } from 'react';
import { CalendarBlank, Check, ArrowClockwise, ImageSquare } from '@phosphor-icons/react';
import type { SteamEvent } from '../../provider/events';

type Page = { events: SteamEvent[]; partial: boolean; hasMore: boolean; nextOffset: number };
export function SteamEvents({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const [events, setEvents] = useState<SteamEvent[]>([]);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [next, setNext] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [partial, setPartial] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void fetch(`/api/steam-events?offset=${page}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40_000)]) })
      .then(async response => { if (!response.ok) throw new Error(); return await response.json() as Page; })
      .then(data => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(data.events)) throw new Error();
        setEvents(current => [...new Map([...current, ...data.events].map(event => [event.id, event])).values()]);
        setNext(data.nextOffset); setMore(data.hasMore); setPartial(data.partial);
      }).catch(() => { if (!controller.signal.aborted) setError('活動暫時載入不了，已載入的活動仍保留。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, revision]);
  const date = (time: number) => new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Taipei' }).format(new Date(time * 1000));
  return <section className="steam-events" aria-labelledby="steam-events-title">
    <header><div><span className="steam-events-eyebrow">STEAM EVENTS</span><h3 id="steam-events-title">逛逛現在的活動</h3></div></header>
    <div className="steam-event-grid">{events.map(event => <button type="button" key={event.id} aria-pressed={selected === event.id} className={`steam-event-card${selected === event.id ? ' is-selected' : ''}`} onClick={() => onSelect(selected === event.id ? null : event.id)}>
      <span className="steam-event-art">{event.image ? <img src={event.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} /> : null}<ImageSquare aria-hidden="true" /><span className="steam-event-status">{event.start * 1000 > Date.now() ? '即將開始' : '進行中'}</span><span className="steam-event-check"><Check aria-hidden="true" /></span></span>
      <span className="steam-event-copy"><strong>{event.name}</strong><span><CalendarBlank aria-hidden="true" />{date(event.start)}{event.end > 0 ? ` — ${date(event.end)}` : ' 起'}</span></span>
    </button>)}</div>
    {loading && <p className="steam-events-loading" role="status"><ArrowClockwise className="consumer-spinning" aria-hidden="true" />正在載入 Steam 活動…</p>}
    {error && <div className="steam-events-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>重試</button></div>}
    {!loading && !error && !events.length && <p className="steam-events-note">Steam 目前沒有回傳可顯示的活動。</p>}
    {partial && <p className="steam-events-note">部分活動資訊暫時無法取得。</p>}
    {!loading && !error && more && <button className="steam-events-more" type="button" onClick={() => setPage(next)}>載入其他活動</button>}
  </section>;
}
