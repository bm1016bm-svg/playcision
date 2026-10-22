import { LANGUAGES } from './locales';
import { useLocale } from './LocaleProvider';
import { useEffect, useState } from 'react';
import type { ReviewStats, ReviewSummary, PlayerReview } from '../../provider/reviews';
const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
function request<T>(path: string, id: string, scope: string, language: string): Promise<T> {
  const key = `${path}?appId=${id}&language=${encodeURIComponent(language)}&scope=${scope}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value as Promise<T>;
  const value = fetch(key).then(async response => { if (!response.ok) throw Error('Steam reviews unavailable'); return response.json() as Promise<T>; });
  cache.set(key, { expires: Date.now() + 300000, value });
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  void value.catch(() => { if (cache.get(key)?.value === value) cache.delete(key); });
  return value;
}
export function useReviewData<T>(path: string, id: string, scope = 'localized') {
  const { t } = useLocale();
  const { locale } = useLocale();
  const key = `${path}:${id}:${scope}:${locale}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void request<T>(path, id, scope, locale).then(data => { if (active) setResult({ key, data }); }, () => { if (active) setResult({ key, error: t("暫時無法取得 Steam 評論") }); });
    return () => { active = false; };
  }, [key, retry]);
  return { ...(result?.key === key ? result : {}), retry: () => { setResult(undefined); setRetry(n => n + 1); } };
}
export function reviewLanguageLabel(language: string) {
  return LANGUAGES.find(item => item.steam === language)?.name ?? language;
}
export function ReviewStatsRows({ id }: { id: string }) {
  const { t } = useLocale();
  const { data, error } = useReviewData<ReviewStats>('/api/review-stats', id);
  const language = data ? reviewLanguageLabel(data.language) : '本語言';
  const row = (label: string, value: ReviewSummary | null | undefined, scope: string) => <div title={value ? `${scope} · 好評 ${value.positive.toLocaleString()}／差評 ${value.negative.toLocaleString()} · 全部購買來源` : scope}><span>{label}</span><strong className={value?.percent == null ? '' : value.percent >= 70 ? 'is-positive' : 'is-mixed'}>{value ? value.total ? `${value.percent}% ${t('好評')}` : t("尚無評論") : error ? t("暫無資料") : data ? t("暫無資料") : t("載入中")}</strong><span>{value?.total ? `(${value.total.toLocaleString()})` : ''}</span></div>;
  return <div className="consumer-review-stats" aria-label="Steam 評價">
    {row(t("最近評論"), data?.recent, data?.from && data.to ? `全部語言 · ${new Date(data.from * 1000).toLocaleDateString(undefined, { timeZone: 'UTC' })}–${new Date((data.to - 1) * 1000).toLocaleDateString(undefined, { timeZone: 'UTC' })} UTC · Steam 每日評論加總` : '最近評論 · 全部語言')}
    {row(t("本語言評論"), data?.localized, `${language} · 全期間 · 排除離題評論`)}
  </div>;
}
export type ReviewList = { language: string; reviews: PlayerReview[] };
