const STORAGE_KEY = 'inventory_last_mutation_at';

const readLastMutation = () => {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

const persistLastMutation = (value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {}
};

let lastMutationAt = readLastMutation();
let pendingCount = 0;
const listeners = new Set();

const notify = () => {
  const snapshot = {
    pendingCount,
    lastMutationAt,
  };
  listeners.forEach((listener) => listener(snapshot));
};

export const getInventoryMutationSnapshot = () => ({
  pendingCount,
  lastMutationAt,
});

export const subscribeInventoryMutations = (listener) => {
  listeners.add(listener);
  listener(getInventoryMutationSnapshot());
  return () => listeners.delete(listener);
};

export const trackInventoryMutation = async (promise) => {
  pendingCount += 1;
  notify();
  try {
    return await promise;
  } finally {
    pendingCount = Math.max(0, pendingCount - 1);
    lastMutationAt = Date.now();
    persistLastMutation(lastMutationAt);
    notify();
  }
};
