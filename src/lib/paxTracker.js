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

const parseEstimatedPaxValue = (raw) => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
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

export const parseEstimatedPax = (item = {}) => {
  if (!item) return 0;
  const raw =
    item?.estimatedPax ??
    item?.paxPerPreparation ??
    item?.pax_per_preparation ??
    item?.estimated_pax ??
    item?.estimated ??
    item?.paxEstimate ??
    item?.pax ??
    0;
  return parseEstimatedPaxValue(raw);
};
