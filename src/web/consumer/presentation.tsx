import { useLocale } from './LocaleProvider';
import { useEffect, useState } from 'react';
interface Presentation { description: string; images: string[]; developers?: string[]; publishers?: string[] }
const requests = new Map<string, Promise<Presentation>>();
export function presentationLanguage() { return document.documentElement.lang || navigator.language; }
export function requestPresentation(id: string, language = presentationLanguage()) {
  const key = `${language}:${id}`;
  let pending = requests.get(key);
  if (!pending) {
    pending = fetch(`/api/presentation?appId=${encodeURIComponent(id)}&language=${encodeURIComponent(language)}`).then(async response => {
      if (!response.ok) throw new Error('Steam presentation unavailable');
      return await response.json() as Presentation;
    });
    requests.set(key, pending);
    if (requests.size > 128) requests.delete(requests.keys().next().value!);
    void pending.catch(() => requests.delete(key));
  }
  return pending;
}
export function usePresentation(id: string) {
  const { locale } = useLocale();
  const key = `${locale}:${id}`;
  const [result, setResult] = useState<{ key: string; value: Presentation } | null>(null);
  useEffect(() => {
    let active = true;
    void requestPresentation(id, locale).then(data => { if (active) setResult({ key, value: data }); }).catch(() => {});
    return () => { active = false; };
  }, [id, locale]);
  return result?.key === key ? result.value : null;
}
export function Synopsis({ id, full = false }: { id: string; full?: boolean }) {
  const value = usePresentation(id);
  return value?.description ? <p className={full ? 'consumer-synopsis consumer-synopsis--full' : 'consumer-synopsis'}>{value.description}</p> : null;
}
