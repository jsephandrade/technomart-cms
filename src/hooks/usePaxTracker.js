import { useEffect, useState } from 'react';
import { getPaxInfo, subscribePax } from '@/lib/paxTracker';

export const usePaxForItem = (itemId) => {
  const [info, setInfo] = useState(() => getPaxInfo(itemId));

  useEffect(() => {
    const unsubscribe = subscribePax((state) => {
      setInfo(state[String(itemId)] || null);
    });
    return unsubscribe;
  }, [itemId]);

  return info;
};
