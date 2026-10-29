import { ArrowUpRight, Coffee, GithubLogo, Heart, Lightning, Sparkle, Star } from '@phosphor-icons/react';
import { CREATOR_URL, githubProjectLink, supportOptions } from '../support-config';
import './support.css';

const options = supportOptions(import.meta.env);
const project = githubProjectLink(import.meta.env.VITE_SUPPORT_REPOSITORY_URL || 'https://github.com/bm1016bm-svg/playcision');

export function SupportPanel({ freeOnly = false }: { freeOnly?: boolean }) {
  const available = options.some(option => option.url);
  if (freeOnly) return <div className="support-panel support-panel--free">
    <section className="support-free" aria-label="免費支持">
      <div className="support-intro"><span className="support-emblem"><Heart weight="duotone" aria-hidden="true" /></span><p>免費支持，也很有力量。</p></div>
      <a href={CREATOR_URL} target="_blank" rel="noopener noreferrer"><span className="support-link-icon"><GithubLogo aria-hidden="true" /></span><span>追蹤作者<small>@bm1016bm-svg</small></span><ArrowUpRight aria-hidden="true" /></a>
      {project && <a href={project} target="_blank" rel="noopener noreferrer"><span className="support-link-icon"><Star aria-hidden="true" /></span><span>幫 Playcision 點星星<small>前往 GitHub 專案</small></span><ArrowUpRight aria-hidden="true" /></a>}
    </section>
  </div>;
  return <div className="support-panel support-panel--coffee">
      <div className="support-intro"><span className="support-emblem"><Coffee weight="duotone" aria-hidden="true" /></span><p>讓下一個好點子，繼續發生。</p></div>
      <div className="support-tiers">{options.map((option, index) => {
        const Icon = [Coffee, Lightning, Sparkle][index] ?? Coffee;
        const content = <><span className="support-tier-icon"><Icon weight="duotone" aria-hidden="true" /></span><span className="support-tier-copy"><strong><span>NT$</span> {option.amount.toLocaleString('en-US')}</strong><span>{option.message}</span></span>{option.url && <ArrowUpRight className="support-tier-arrow" aria-hidden="true" />}</>;
        return option.url
          ? <a key={option.amount} href={option.url} target="_blank" rel="noopener noreferrer" className="support-tier" aria-label={`贊助 NT$ ${option.amount}，前往 PAYUNi（新分頁）`}>{content}</a>
          : <div key={option.amount} className="support-tier support-tier--unavailable" aria-label={`NT$ ${option.amount}，尚未開放付款`}>{content}</div>;
      })}</div>
      <p className="support-payment-note">{available ? '一次性自願贊助，付款由 PAYUNi 處理。' : '贊助尚未開放'}</p>
  </div>;
}
