const listeners = new Set();
let paxState = {};

const notify = () => {
  for (const callback of Array.from(listeners)) {
    try {
      callback(paxState);
    } catch (error) {
      console.error('paxTracker listener failed', error);
    }
  }
};

export const initPaxState = (state = {}) => {
  paxState = typeof state === 'object' && state ? { ...state } : {};
  notify();
};

export const getPaxInfo = (id) => {
  if (id === undefined || id === null) return null;
  return paxState[String(id)] || null;
};

export const deductPax = (orderItems = []) => {
  if (!Array.isArray(orderItems) || orderItems.length === 0) return paxState;
  const next = { ...paxState };
  orderItems.forEach((entry) => {
    if (!entry) return;
    const key = String(entry.menuItemId || entry.id || '');
    if (!key || !next[key]) return;
    const quantity = Number(entry.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const remaining = Math.max(0, next[key].remaining - quantity);
    next[key] = { ...next[key], remaining };
  });
  paxState = next;
  notify();
  return paxState;
};

export const subscribePax = (callback) => {
  if (typeof callback !== 'function') return () => {};
  listeners.add(callback);
  try {
    callback(paxState);
  } catch (error) {
    console.error('paxTracker listener failed', error);
  }
  return () => {
    listeners.delete(callback);
  };
};
