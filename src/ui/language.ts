/** Supported presentation languages; unknown values retain configured Steam language. */
export function steamPresentationLanguage(language: string | null, fallback: string): string {
  const value = language?.toLowerCase() ?? '';
  if (/^zh-(hant|tw|hk|mo)(-|$)/.test(value) || value === 'tchinese') return 'tchinese';
  if (/^zh(-hans|-cn|-sg)?$/.test(value) || value === 'schinese') return 'schinese';
  if (value === 'pt-br' || value === 'brazilian') return 'brazilian';
  const names: Record<string, string> = { en: 'english', ja: 'japanese', ko: 'koreana', de: 'german', fr: 'french', es: 'spanish', it: 'italian', pt: 'portuguese', ru: 'russian', th: 'thai', vi: 'vietnamese' };
  return names[value.split('-')[0] ?? ''] ?? fallback;
}
