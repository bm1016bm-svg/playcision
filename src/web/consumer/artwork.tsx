import { useEffect, useState } from 'react';
import { artworkKey, createArtworkCache, preloadInitialArtwork, type ArtworkRequest } from './artwork-cache';
import { presentationLanguage, requestPresentation } from './presentation';

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.decoding = 'async';
    let settled = false;
    const timer = window.setTimeout(() => finish(new Error('Artwork timed out')), 12000);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) { image.src = ''; reject(error); } else resolve(image);
    };
    image.onerror = () => finish(new Error('Artwork unavailable'));
    image.onload = () => { void image.decode().then(() => finish(), () => finish(new Error('Artwork decode failed'))); };
    image.src = src;
  });
}
const cache = createArtworkCache(requestPresentation, decodeImage);
function inputFor(id: string, fallback?: string): ArtworkRequest {
  return { id, fallback: fallback ?? '', language: presentationLanguage() };
}
export function preloadArtwork(id: string, fallback?: string) {
  return cache.load(inputFor(id, fallback));
}
export function useArtwork(id: string, fallback?: string) {
  const input = inputFor(id, fallback);
  const key = artworkKey(input);
  const [state, setState] = useState<{ key: string; src: string | null } | null>(null);
  const ready = cache.peek(input);
  useEffect(() => {
    let active = true;
    void cache.load(input, true).then(result => { if (active) setState({ key, src: result.src }); });
    return () => { active = false; };
  }, [key]);
  return ready ?? (state?.key === key ? state : undefined);
}


/** Give the first covers a bounded head start; the rest continue without blocking. */
export async function warmArtwork(games: readonly { id: string; imageUrl?: string }[], cancelled: () => boolean = () => false) {
  const work = preloadInitialArtwork(games, game => preloadArtwork(game.id, game.imageUrl), cancelled);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise<void>(resolve => { timer = setTimeout(resolve, 1200); })]);
  if (timer !== undefined) clearTimeout(timer);
}
