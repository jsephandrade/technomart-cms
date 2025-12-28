const STORAGE_KEY = 'pos_order_queue_checked_items';
const LEGACY_STORAGE_KEYS = ['pos_customer_display_completed_items'];

const loadChecklist = () => {
  if (typeof window === 'undefined') return new Set();
  const next = new Set();
  const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];

  keys.forEach((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach((value) => {
        if (typeof value === 'string') next.add(value);
      });
    } catch {}
  });

  return next;
};

const persistChecklist = (items) => {
  if (typeof window === 'undefined') return;
  try {
    if (!items.size) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(items))
      );
    }
    LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {}
};

let cachedChecklist = loadChecklist();
const listeners = new Set();

const notify = () => {
  const snapshot = new Set(cachedChecklist);
  listeners.forEach((listener) => listener(snapshot));
};

export const subscribeOrderChecklist = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getOrderChecklist = () => new Set(cachedChecklist);

export const setOrderChecklist = (next) => {
  cachedChecklist = new Set(next);
  persistChecklist(cachedChecklist);
  notify();
};

export const toggleOrderChecklistItem = (keys) => {
  if (!keys?.stable) return;
  const next = new Set(cachedChecklist);
  const currentlyChecked =
    next.has(keys.stable) || (keys.legacy && next.has(keys.legacy));
  if (currentlyChecked) {
    next.delete(keys.stable);
    if (keys.legacy) next.delete(keys.legacy);
  } else {
    next.add(keys.stable);
  }
  cachedChecklist = next;
  persistChecklist(cachedChecklist);
  notify();
};

export const getOrderChecklistOrderId = (order) => {
  if (!order || typeof order !== 'object') return 'unknown';
  const candidates = [
    order.id,
    order.orderId,
    order.order_id,
    order.orderNumber,
    order.order_number,
    order.displayNumber,
    order.display_number,
    order.externalOrderId,
    order.external_order_id,
  ];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    const value = String(candidate).trim();
    if (value) return value;
  }
  return 'unknown';
};

export const buildOrderChecklistItemKeys = (order, item, idx) => {
  const orderId = getOrderChecklistOrderId(order);
  const stablePart = item?.id ? String(item.id) : String(idx);
  return {
    stable: `${orderId}-item-${stablePart}`,
    legacy: `${orderId}-item-${idx}`,
  };
};

export const isOrderChecklistItemChecked = (items, keys) => {
  if (!keys?.stable) return false;
  return items.has(keys.stable) || (keys.legacy && items.has(keys.legacy));
};
