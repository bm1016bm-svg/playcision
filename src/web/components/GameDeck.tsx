import { ArrowCounterClockwise, Check, Info, X } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { DeckDecision, Game } from '../types';
import { GameCard } from './GameCard';

interface GameDeckProps {
  games: Game[];
  language: string;
  onDecision: (game: Game, decision: DeckDecision) => void;
  onDetails: (game: Game) => void;
  onUndo: () => void;
  canUndo: boolean;
}

export function GameDeck({ games, language, onDecision, onDetails, onUndo, canUndo }: GameDeckProps) {
  const reduceMotion = useReducedMotion();
  const current = games[0];
  const queued = games.slice(1, 3);

  return (
    <section className="deck-region" aria-label="遊戲卡牌候選池">
      <div className="deck-stage">
        {[...queued].reverse().map((game, reverseIndex) => {
          const depth = queued.length - reverseIndex;
          return (
            <motion.div
              className="deck-ghost"
              key={game.id}
              aria-hidden="true"
              {...(reduceMotion ? {} : { animate: { scale: 1 - depth * 0.025, y: depth * 13 } })}
            >
              {game.imageUrl && <img src={game.imageUrl} alt="" draggable={false} referrerPolicy="no-referrer" />}
            </motion.div>
          );
        })}
        <AnimatePresence mode="popLayout">
          {current ? (
            <GameCard
              key={current.id}
              game={current}
              language={language}
              onDecision={(decision) => onDecision(current, decision)}
              onDetails={() => onDetails(current)}
            />
          ) : (
            <motion.div className="deck-empty" key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Check size={34} weight="bold" aria-hidden="true" />
              <h2>這池看完了</h2>
              <p>換一個分類，或復原上一張卡。</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="deck-controls" aria-label="卡牌操作">
        <button className="round-action round-action--undo" type="button" onClick={onUndo} disabled={!canUndo} aria-label="復原上一個決定">
          <ArrowCounterClockwise weight="bold" aria-hidden="true" />
        </button>
        <button className="round-action round-action--pass" type="button" onClick={() => current && onDecision(current, 'left')} disabled={!current} aria-label="略過這款遊戲">
          <X weight="bold" aria-hidden="true" />
        </button>
        <button className="round-action round-action--info" type="button" onClick={() => current && onDetails(current)} disabled={!current} aria-label="查看遊戲詳情">
          <Info weight="bold" aria-hidden="true" />
        </button>
        <button className="round-action round-action--play" type="button" onClick={() => current && onDecision(current, 'right')} disabled={!current} aria-label="加入今晚遊戲清單">
          <Check weight="bold" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
