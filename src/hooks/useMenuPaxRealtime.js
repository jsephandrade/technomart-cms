import { useEffect, useRef } from 'react';
import { createRealtime } from '@/lib/realtime';

const MENU_PAX_EVENTS = new Set(['menu.pax.updated', 'menu.pax.restored']);

const notifyMenuRefresh = (detail) => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('menu.items.updated', { detail: detail || null })
      );
    }
  } catch {}
};

export const useMenuPaxRealtime = () => {
  const rtRef = useRef(null);

  useEffect(() => {
    const enableRealtime = Boolean(import.meta?.env?.VITE_WS_URL);
    if (!enableRealtime) return;

    rtRef.current = createRealtime({
      path: '/',
      onMessage: (msg) => {
        if (msg?.type !== 'event') return;
        const eventName = msg?.event;
        if (!MENU_PAX_EVENTS.has(eventName)) return;
        notifyMenuRefresh({ type: eventName, payload: msg?.payload || null });
      },
    });

    return () => {
      rtRef.current?.close?.();
    };
  }, []);
};

export default useMenuPaxRealtime;
