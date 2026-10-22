import { LoadingQuote } from './LoadingQuote';
import { useLocale } from './LocaleProvider';
import { motion, useReducedMotion } from 'motion/react';

/** Vector motion study of the supplied play/shuffle icon, without its square tile. */
export function BrandIntro({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const duration = reduced ? 0 : .85;
  return <div className={`consumer-brand-intro${compact ? ' is-compact' : ''}`}>
    <motion.svg viewBox="65 65 380 390" className="consumer-intro-symbol" aria-hidden="true" initial={false}>
      <defs>
        <linearGradient id="intro-lime" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#b8e879" /><stop offset="1" stopColor="#dcf7aa" /></linearGradient>
        <linearGradient id="intro-silver" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fafcfa" /><stop offset="1" stopColor="#aab5c2" /></linearGradient>
      </defs>
      <motion.path fill="url(#intro-lime)"
        initial={reduced ? false : { d: 'M112 245 Q112 228 131 236 L152 248 Q166 258 152 268 L131 280 Q112 288 112 271 Z', opacity: 0 }}
        animate={{ d: 'M104 213 Q104 184 128 196 L201 244 Q225 259 201 276 L128 322 Q104 335 104 307 Z', opacity: 1 }}
        transition={{ duration, ease: [.2, .8, .2, 1] }} />
      <motion.path d="M126 139 C134 128 145 132 160 144 L292 238 Q330 259 292 286 L150 384 Q133 394 124 380" fill="none" stroke="url(#intro-silver)" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration, delay: reduced ? 0 : .35, ease: 'easeInOut' }} />
      <motion.g initial={reduced ? false : { x: -18, y: 18, opacity: 0 }} animate={{ x: 0, y: 0, opacity: 1 }} transition={{ duration: reduced ? 0 : .6, delay: reduced ? 0 : .9, ease: [.2, .8, .2, 1] }}>
        <path d="M270 174 L343 121 Q321 115 334 98 Q339 92 351 92 L383 92 Q413 92 408 123 L398 164 Q394 183 378 174 Q369 170 369 157 L308 199 Z" fill="url(#intro-lime)" />
      </motion.g>
      <motion.g initial={reduced ? false : { x: -18, y: -18, opacity: 0 }} animate={{ x: 0, y: 0, opacity: 1 }} transition={{ duration: reduced ? 0 : .6, delay: reduced ? 0 : 1.05, ease: [.2, .8, .2, 1] }}>
        <path d="M268 346 L307 320 L369 360 Q366 342 382 341 Q397 339 400 357 L409 396 Q411 426 381 426 L347 426 Q327 426 330 410 Q332 403 343 398 Z" fill="url(#intro-silver)" />
      </motion.g>
    </motion.svg>
    <motion.img className="consumer-intro-wordmark" src="/brand/wordmark.png" alt="Playcision" width="770" height="170" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .5, delay: reduced ? 0 : .8 }} />
    <LoadingQuote compact={compact} />
    <div className="consumer-intro-wait" role="status"><span>{t("正在載入遊戲")}</span><span className="consumer-intro-dots" aria-hidden="true"><i /><i /><i /></span></div>
  </div>;
}
