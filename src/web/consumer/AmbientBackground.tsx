import { useEffect, useState } from 'react';

/** Decorative light lives behind the app, never on game artwork or text. */
export function AmbientBackground() {
  const [paused, setPaused] = useState(() => document.hidden);
  useEffect(() => {
    const update = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return (
    <div className="consumer-ambient" aria-hidden="true" data-paused={paused}>
      <div className="consumer-ambient-ribbon consumer-ambient-ribbon--teal" />
      <div className="consumer-ambient-ribbon consumer-ambient-ribbon--blue" />
      <div className="consumer-ambient-shade" />
    </div>
  );
}
