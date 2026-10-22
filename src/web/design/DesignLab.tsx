import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  Check,
  Compass,
  CurrencyCircleDollar,
  DiceFive,
  Heart,
  Info,
  X,
} from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { buildRollPool, compactLabels, formatGamePrice, safeStoreUrl } from '../deck';
import type { Game, UiPayload } from '../types';
import './design-lab.css';

type ConceptId = 'editorial' | 'crystal' | 'console';
type Choice = 'pass' | 'play';

interface Concept {
  id: ConceptId;
  number: string;
  title: string;
  subtitle: string;
  note: string;
}

const CONCEPTS: Concept[] = [
  {
    id: 'editorial',
    number: '01',
    title: 'PRECISION EDITORIAL',
    subtitle: '精密編輯',
    note: '強排版、低裝飾、資訊一眼讀完。',
  },
  {
    id: 'crystal',
    number: '02',
    title: 'DARK CRYSTAL',
    subtitle: '暗色水晶',
    note: '深層玻璃、材質光感、沉浸但不霓虹。',
  },
  {
    id: 'console',
    number: '03',
    title: 'CONSOLE INDUSTRIAL',
    subtitle: '主機工業',
    note: '遊戲硬體語彙、實體按鍵感、俐落有力。',
  },
];

function Price({ game, language }: { game: Game; language: string }) {
  return (
    <div className="lab-price">
      <strong>{formatGamePrice(game, language)}</strong>
      {game.price.discountPercent > 0 && <span>−{game.price.discountPercent}%</span>}
    </div>
  );
}

function GameMedia({ game }: { game: Game }) {
  return (
    <div className="lab-game-media">
      {game.imageUrl ? (
        <img src={game.imageUrl} alt={`${game.name} 商店預覽`} referrerPolicy="no-referrer" />
      ) : (
        <div className="lab-game-fallback"><DiceFive weight="fill" aria-hidden="true" /><span>IMAGE UNAVAILABLE</span></div>
      )}
      {game.price.discountPercent > 0 && <span className="lab-discount">SAVE {game.price.discountPercent}</span>}
    </div>
  );
}

function PhoneNav({ concept }: { concept: ConceptId }) {
  return (
    <nav className="lab-phone-nav" aria-label="概念預覽導覽">
      <button type="button" className="is-active"><DiceFive weight="fill" aria-hidden="true" /><span>{concept === 'console' ? 'ROLL' : '擲戲'}</span></button>
      <button type="button"><Compass aria-hidden="true" /><span>{concept === 'console' ? 'NEW' : '新品'}</span></button>
      <button type="button"><CurrencyCircleDollar aria-hidden="true" /><span>{concept === 'console' ? 'DEALS' : '折扣'}</span></button>
      <button type="button"><Heart aria-hidden="true" /><span>{concept === 'console' ? 'QUEUE' : '今晚'}</span></button>
    </nav>
  );
}

function DecisionControls({
  concept,
  canUndo,
  onUndo,
  onChoice,
}: {
  concept: ConceptId;
  canUndo: boolean;
  onUndo: () => void;
  onChoice: (choice: Choice) => void;
}) {
  const labels = concept === 'editorial';
  return (
    <div className="lab-controls" aria-label="卡片操作">
      <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="復原上一張">
        <ArrowCounterClockwise aria-hidden="true" />{labels && <span>UNDO</span>}
      </button>
      <button type="button" className="lab-control-pass" onClick={() => onChoice('pass')} aria-label="略過這款遊戲">
        <X weight="bold" aria-hidden="true" />{labels && <span>PASS</span>}
      </button>
      <button type="button" className="lab-control-info" aria-label="查看遊戲詳情">
        <Info weight="bold" aria-hidden="true" />{labels && <span>INFO</span>}
      </button>
      <button type="button" className="lab-control-play" onClick={() => onChoice('play')} aria-label="加入今晚清單">
        <Check weight="bold" aria-hidden="true" />{labels && <span>PLAY</span>}
      </button>
    </div>
  );
}

function ConceptPhone({
  concept,
  games,
  language,
  generatedAt,
}: {
  concept: Concept;
  games: Game[];
  language: string;
  generatedAt: string;
}) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [direction, setDirection] = useState<Choice>('play');
  const game = games[index % games.length]!;
  const tags = compactLabels(game).slice(0, 3);
  const time = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(generatedAt));

  const choose = (choice: Choice) => {
    setDirection(choice);
    setHistory((current) => [...current, index]);
    setIndex((current) => (current + 1) % games.length);
  };

  const undo = () => {
    const previous = history.at(-1);
    if (previous === undefined) return;
    setDirection('pass');
    setIndex(previous);
    setHistory((current) => current.slice(0, -1));
  };

  return (
    <div className="lab-phone" data-concept={concept.id}>
      <div className="lab-phone-hardware" aria-hidden="true"><span /></div>
      <div className="lab-phone-screen">
        <header className="lab-phone-header">
          <div className="lab-phone-brand">
            <span className="lab-brand-symbol"><DiceFive weight="fill" aria-hidden="true" /></span>
            <div><strong>PLAYCISION</strong><small>{concept.id === 'console' ? 'PCN // ROLL-01' : 'ROLL MODE'}</small></div>
          </div>
          <div className="lab-live"><i />{concept.id === 'console' ? 'LIVE' : time}</div>
        </header>

        <main className="lab-phone-main">
          <div className="lab-context">
            <span>{concept.id === 'console' ? `POOL ${games.length.toString().padStart(2, '0')}` : `候選 ${games.length.toString().padStart(2, '0')}`}</span>
            <strong>{concept.id === 'editorial' ? 'CHOOSE LESS. PLAY MORE.' : concept.id === 'crystal' ? '今晚，就這款。' : 'READY TO ROLL'}</strong>
            <b>WEIGHTED</b>
          </div>

          <div className="lab-deck">
            <div className="lab-deck-shadow lab-deck-shadow--two" aria-hidden="true" />
            <div className="lab-deck-shadow lab-deck-shadow--one" aria-hidden="true" />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.article
                className="lab-game-card"
                key={`${concept.id}-${game.id}`}
                drag={reduceMotion ? false : 'x'}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 72) choose('play');
                  if (info.offset.x < -72) choose('pass');
                }}
                initial={reduceMotion ? false : { opacity: 0, x: direction === 'play' ? 46 : -46, rotate: direction === 'play' ? 1.8 : -1.8 }}
                animate={{ opacity: 1, x: 0, rotate: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction === 'play' ? 120 : -120, rotate: direction === 'play' ? 4 : -4 }}
                transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.82 }}
              >
                <GameMedia game={game} />
                <div className="lab-game-copy">
                  <div className="lab-game-code"><span>STEAM / {game.id}</span><span>{game.releaseDate ?? 'DATE TBA'}</span></div>
                  <h3>{game.name}</h3>
                  <Price game={game} language={language} />
                  <div className="lab-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                  <p>{game.developers[0] || 'INDEPENDENT RELEASE'}</p>
                </div>
                <div className="lab-card-footer">
                  <button type="button"><Info aria-hidden="true" />詳情</button>
                  <a href={safeStoreUrl(game)} target="_blank" rel="noreferrer">Steam <ArrowSquareOut aria-hidden="true" /></a>
                </div>
              </motion.article>
            </AnimatePresence>
          </div>

          <DecisionControls concept={concept.id} canUndo={history.length > 0} onUndo={undo} onChoice={choose} />
          <p className="lab-gesture-note">SWIPE TO DECIDE · SEE WHAT STICKS</p>
        </main>
        <PhoneNav concept={concept.id} />
      </div>
    </div>
  );
}

export function DesignLab({ payload }: { payload: UiPayload }) {
  const games = useMemo(() => buildRollPool(payload), [payload]);
  if (games.length === 0) return <main className="design-lab design-lab--empty"><DiceFive weight="fill" /><h1>目前沒有可供比較的候選遊戲</h1></main>;

  return (
    <main className="design-lab" id="main-content">
      <header className="design-lab-header">
        <div className="design-lab-title">
          <span>PLAYCISION / DESIGN STUDY 01</span>
          <h1>THREE WAYS TO <em>STOP BROWSING.</em></h1>
        </div>
        <div className="design-lab-brief">
          <p>三個方向、同一份即時資料、同一個決策流程。</p>
          <span>IBM PLEX · DARK UI · NO NEON · MOBILE FIRST</span>
        </div>
      </header>

      <section className="design-lab-grid" aria-label="Playcision 三個 UI 設計方向">
        {CONCEPTS.map((concept) => (
          <article className="design-option" key={concept.id}>
            <div className="design-option-heading">
              <span>{concept.number}</span>
              <div><h2>{concept.title}</h2><p>{concept.subtitle} — {concept.note}</p></div>
            </div>
            <ConceptPhone concept={concept} games={games} language={payload.locale.language} generatedAt={payload.digest.generatedAt} />
          </article>
        ))}
      </section>

      <footer className="design-lab-footer"><span>GAME OF THROWS</span><p>拖曳三版的遊戲卡試手感，再告訴我你選 01、02 或 03。</p></footer>
    </main>
  );
}
