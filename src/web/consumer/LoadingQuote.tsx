import { useEffect, useState } from 'react';
import quotes from './loading-quotes.json';
import { useLocale } from './LocaleProvider';

/** User-supplied quotations; attribution is retained, not independently verified. */
export function LoadingQuote({ compact = false }: { compact?: boolean }) {
  const { locale } = useLocale();
  const [index, setIndex] = useState(() => Math.floor(Math.random() * quotes.length));
  useEffect(() => {
    const timer = window.setInterval(() => setIndex(value => (value + 1) % quotes.length), 6500);
    return () => window.clearInterval(timer);
  }, []);
  const quote = quotes[index]!;
  return <figure className={`consumer-loading-quote${compact ? ' is-compact' : ''}`}>
    <div key={quote.id} className="consumer-quote-content">
      <blockquote>
        {locale.startsWith('zh') && <p lang="zh-Hant" className="consumer-quote-chinese">{quote.zh}</p>}
        <p lang="en" className="consumer-quote-english">{quote.en}</p>
      </blockquote>
      <figcaption>— {quote.author}</figcaption>
    </div>
  </figure>;
}
