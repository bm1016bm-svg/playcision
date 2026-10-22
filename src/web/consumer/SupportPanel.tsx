import { ArrowUpRight, Coffee, GithubLogo, Heart, Star } from '@phosphor-icons/react';
import { CREATOR_URL, githubProjectLink, supportOptions } from '../support-config';
import './support.css';

const options = supportOptions(import.meta.env);
const project = githubProjectLink(import.meta.env.VITE_SUPPORT_REPOSITORY_URL || 'https://github.com/bm1016bm-svg/playcision');

export function SupportPanel({ freeOnly = false }: { freeOnly?: boolean }) {
  const available = options.some(option => option.url);
  return <div className="support-panel">
    {!freeOnly && <>
      <div className="support-intro"><Coffee weight="duotone" aria-hidden="true" /><p>讓下一個好點子，繼續發生。</p></div>
      <div className="support-tiers">{options.map(option => {
        const content = <><span className="support-tier-copy"><strong>NT$ {option.amount.toLocaleString('en-US')}</strong><span>{option.message}</span></span>{option.url ? <ArrowUpRight aria-hidden="true" /> : <small>尚未開放</small>}</>;
        return option.url
          ? <a key={option.amount} href={option.url} target="_blank" rel="noopener noreferrer" className="support-tier" aria-label={`贊助 NT$ ${option.amount}，前往綠界（新分頁）`}>{content}</a>
          : <div key={option.amount} className="support-tier support-tier--unavailable">{content}</div>;
      })}</div>
      <p className="support-payment-note">{available ? '一次性自願贊助，付款由綠界處理。' : '綠界收款尚未啟用，目前可透過 GitHub 免費支持。'}</p>
    </>}
    <section className="support-free" aria-label="免費支持">
      <h3><Heart aria-hidden="true" />免費支持，也很有力量。</h3>
      <a href={CREATOR_URL} target="_blank" rel="noopener noreferrer"><GithubLogo aria-hidden="true" /><span>追蹤作者<small>@bm1016bm-svg</small></span><ArrowUpRight aria-hidden="true" /></a>
      {project && <a href={project} target="_blank" rel="noopener noreferrer"><Star aria-hidden="true" /><span>幫 Playcision 點星星<small>前往 GitHub 專案</small></span><ArrowUpRight aria-hidden="true" /></a>}
    </section>
  </div>;
}
