import { useEffect, useRef } from 'react';

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

export default function useIdleTimeout(onTimeout) {
  const timer = useRef(null);

  useEffect(() => {
    if (!onTimeout) return;

    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(onTimeout, IDLE_TIMEOUT);
    };

    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer.current);
      EVENTS.forEach(e => window.removeEventListener(e, reset));
    };
  }, [onTimeout]);
}
