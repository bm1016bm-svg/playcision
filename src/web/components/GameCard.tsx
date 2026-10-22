import {
  ArrowSquareOut,
  Check,
  Info,
  X,
} from '@phosphor-icons/react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'motion/react';
import { compactLabels, formatGamePrice, safeStoreUrl } from '../deck';
import type { DeckDecision, Game } from '../types';

interface GameCardProps {
  game: Game;
  language: string;
  onDecision: (decision: DeckDecision) => void;
  onDetails: () => void;
}

const SWIPE_DISTANCE = 108;
const SWIPE_VELOCITY = 760;

export function GameCard({ game, language, onDecision, onDetails }: GameCardProps) {
  const x = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const rotate = useTransform(x, [-260, 0, 260], reduceMotion ? [0, 0, 0] : [-7, 0, 7]);
  const passOpacity = useTransform(x, [-130, -32, 0], [1, 0, 0]);
  const playOpacity = useTransform(x, [0, 32, 130], [0, 0, 1]);
  const labels = compactLabels(game);

  const handleDragEnd = (_event: PointerEvent, info: PanInfo): void => {
    const horizontalIntent = Math.abs(info.offset.x) > Math.abs(info.offset.y);
    if (
      horizontalIntent &&
      (Math.abs(info.offset.x) >= SWIPE_DISTANCE || Math.abs(info.velocity.x) >= SWIPE_VELOCITY)
    ) {
      onDecision(info.offset.x > 0 ? 'right' : 'left');
      return;
    }
    void animate(x, 0, reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 34 });
  };

  return (
    <motion.article
      className="game-card"
      data-testid="active-game-card"
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      {...(reduceMotion ? {} : { whileDrag: { scale: 1.012 } })}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 18, scale: 0.975 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
    >
      <div className="game-card__media">
        {game.imageUrl ? (
          <img
            src={game.imageUrl}
            alt={`${game.name} Steam 商店圖片`}
            draggable={false}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="game-card__fallback" aria-label="遊戲圖片未提供">
            <span>PLAYCISION</span>
            <strong>{game.name.slice(0, 2).toUpperCase()}</strong>
          </div>
        )}
        <motion.div className="decision-stamp decision-stamp--pass" style={{ opacity: passOpacity }}>
          <X aria-hidden="true" weight="bold" /> PASS
        </motion.div>
        <motion.div className="decision-stamp decision-stamp--play" style={{ opacity: playOpacity }}>
          <Check aria-hidden="true" weight="bold" /> TONIGHT
        </motion.div>
        {game.price.discountPercent > 0 && (
          <span className="discount-flag">-{game.price.discountPercent}%</span>
        )}
      </div>

      <div className="game-card__body">
        <div className="eyebrow-row">
          <span>STEAM · APP {game.id}</span>
          <span>{game.releaseDate ?? 'DATE TBA'}</span>
        </div>
        <h2>{game.name}</h2>
        <div className="price-row">
          <strong>{formatGamePrice(game, language)}</strong>
          {game.price.discountPercent > 0 && game.price.original?.formatted && (
            <s>{game.price.original.formatted}</s>
          )}
        </div>
        <div className="tag-row" aria-label="遊戲標籤">
          {labels.length > 0 ? labels.map((label) => <span key={label}>{label}</span>) : <span>未分類</span>}
          {game.earlyAccess && <span>搶先體驗</span>}
          {game.mature && <span>成人內容</span>}
        </div>
        <p className="developer-line">
          {game.developers[0] ?? game.publishers[0] ?? '開發商未提供'}
        </p>
      </div>

      <div className="card-utility-row">
        <button type="button" className="text-button" onClick={onDetails}>
          <Info aria-hidden="true" /> 詳情
        </button>
        <a className="text-button" href={safeStoreUrl(game)} target="_blank" rel="noreferrer">
          Steam <ArrowSquareOut aria-hidden="true" />
        </a>
      </div>
    </motion.article>
  );
}
