import { useLocale } from './LocaleProvider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, FacebookLogo, InstagramLogo, TiktokLogo, DiscordLogo, Code } from '@phosphor-icons/react';
import { shareList, type ShareFormat } from './share';

import type { Game } from '../types';
import { useArtwork } from './artwork';

function LineIcon({ 'aria-hidden': hidden }: { weight?: string; 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden={hidden}>
    <path d="M28 14.5C28 8.7 22.6 4 16 4S4 8.7 4 14.5c0 5.2 4.2 9.4 9.9 10.3.4.1.7.4.6.9l-.4 2c-.1.6.3.8.8.5C21.3 24.9 28 20 28 14.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M8 11.7v5.1h2.6m2-5.1v5.1m2.4 0v-5.1l3.2 5.1v-5.1m5 0h-2.6v5.1h2.6m-2.6-2.6h2.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function ShareArtwork({ game }: { game: Game }) {
  const artwork = useArtwork(game.id, game.imageUrl);
  return <span className="consumer-share-art">{artwork?.src && <img src={artwork.src} alt="" loading="lazy" />}</span>;
}

export function SavedShare({ games, title }: { games: Game[]; title?: string }) {
  const { t } = useLocale();
  const platforms = [
    { id: 'discord', label: 'Discord', icon: DiscordLogo, format: 'discord' },
    { id: 'facebook', label: 'Facebook', icon: FacebookLogo, format: 'text' },
    { id: 'instagram', label: 'Instagram', icon: InstagramLogo, format: 'text' },
    { id: 'tiktok', label: 'TikTok', icon: TiktokLogo, format: 'text' },
    { id: 'line', label: 'LINE', icon: LineIcon, format: 'text' },
    { id: 'markdown', label: 'Markdown', icon: Code, format: 'markdown' },
  ] as const;
  const [platform, setPlatform] = useState('discord');
  const format: ShareFormat = platforms.find(item => item.id === platform)!.format;
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const selected = useMemo(() => games.filter(game => !excluded.has(game.id)), [games, excluded]);
  const [part, setPart] = useState(0);
  const [status, setStatus] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const chunks = useMemo(() => shareList(selected, format, title ?? t("本次收藏")), [selected, format, title, t]);
  const index = Math.min(part, Math.max(0, chunks.length - 1));
  const text = chunks[index] ?? '';
  useEffect(() => { setStatus(''); setManualCopy(false); }, [text]);
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(''), 5000);
    return () => window.clearTimeout(timer);
  }, [status]);
  const copy = async () => {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(text);
      setManualCopy(false);
      setStatus(chunks.length > 1 ? `${t('已複製，貼上即可分享')} (${index + 1}/${chunks.length})` : t("已複製，貼上即可分享"));
    } catch {
      setManualCopy(true);
      setStatus('無法存取剪貼簿，請選取下方清單手動複製');
      window.requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.select(); });
    } finally { setBusy(false); }
  };
  return <section className="consumer-share" aria-label="分享收藏清單">
    <div className="consumer-share-platforms" aria-label="選擇分享平台">
      {platforms.map(item => { const Icon = item.icon; return <button type="button" key={item.id} aria-pressed={platform === item.id} className={platform === item.id ? 'is-selected' : ''} onClick={() => { setPlatform(item.id); setPart(0); setStatus(''); }}><Icon weight="regular" aria-hidden="true" /><span>{item.label}</span></button>; })}
    </div>
    <div className="consumer-share-selection-heading"><h2>{t("選擇分享的遊戲")}<span>{selected.length} / {games.length}</span></h2><button type="button" onClick={() => { setExcluded(selected.length === games.length ? new Set(games.map(game => game.id)) : new Set()); setPart(0); }}>{selected.length === games.length ? t("取消全選") : t("全選")}</button></div>
    <div className="consumer-share-games consumer-share-visual-list">{games.map(game => <div className={`consumer-share-game-row${excluded.has(game.id) ? ' is-excluded' : ''}`} key={game.id}>
      <label><input className="consumer-share-checkbox" type="checkbox" aria-label={`${t('分享')} ${game.name}`} checked={!excluded.has(game.id)} onChange={() => { setExcluded(current => { const next = new Set(current); if (next.has(game.id)) next.delete(game.id); else next.add(game.id); return next; }); setPart(0); }} /><span className="consumer-share-check" aria-hidden="true"><Check weight="bold" /></span><ShareArtwork game={game} /><span className="consumer-share-game-name">{game.name}</span></label>
    </div>)}</div>
    <div className="consumer-share-controls">
      <button type="button" className="consumer-share-copy" disabled={!selected.length || !text || busy} onClick={() => void copy()}>
        {!!status && !manualCopy ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {chunks.length > 1 ? `${t('複製清單與連結')} (${index + 1}/${chunks.length})` : t("複製清單與連結")}
      </button>
    </div>
    {(platform === 'instagram' || platform === 'tiktok') && <p className="consumer-share-hint">複製文字與 Steam 網址；能否直接點開連結取決於平台與貼文位置。</p>}
    {chunks.length > 1 && <div className="consumer-share-parts">
      <button type="button" disabled={index === 0} onClick={() => setPart(index - 1)}>←</button>
      <span>{index + 1} / {chunks.length}</span>
      <button type="button" disabled={index === chunks.length - 1} onClick={() => setPart(index + 1)}>→</button>
    </div>}
    {manualCopy && <textarea ref={textarea} aria-label="分享清單內容" readOnly value={text} onFocus={event => event.currentTarget.select()} />}
    <div className="consumer-share-status" role="status">{status}</div>
  </section>;
}
