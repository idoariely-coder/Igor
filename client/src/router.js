import { useEffect, useState } from 'react';

// ניווט פשוט מבוסס hash: #/practice?topic=slope
export function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { path, parts, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path, query) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
  window.location.hash = path + (qs === '?' ? '' : qs);
}

export function back(fallback = '/') {
  if (window.history.length > 1) window.history.back();
  else go(fallback);
}
