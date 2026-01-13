const listeners = new Set();
let paxState = {};
let comboRequirements = {};

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

export const initPaxState = (state = {}, options = {}) => {
  paxState = typeof state === 'object' && state ? { ...state } : {};
  comboRequirements =
    options &&
    typeof options === 'object' &&
    options.combos &&
    typeof options.combos === 'object'
      ? { ...options.combos }
      : {};
  recalculateComboRemaining(paxState);
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
    const quantity = Number(entry.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    if (key && next[key]) {
      const remaining = Math.max(0, next[key].remaining - quantity);
      next[key] = { ...next[key], remaining };
    }
    const ingredients = extractIngredientRequirements(entry);
    ingredients.forEach(({ id, qty }) => {
      const ingredientKey = String(id || '');
      if (!ingredientKey || !next[ingredientKey]) return;
      const multiplier = Number(qty || 1);
      const total = quantity * (Number.isFinite(multiplier) ? multiplier : 1);
      if (!Number.isFinite(total) || total <= 0) return;
      const remaining = Math.max(0, next[ingredientKey].remaining - total);
      next[ingredientKey] = { ...next[ingredientKey], remaining };
    });
  });
  recalculateComboRemaining(next);
  paxState = next;
  notify();
  return paxState;
};

function normalizeIngredientEntries(entry) {
  if (!entry || typeof entry !== 'object') return [];
  const raw = entry.ingredients ?? entry.ingredientIds ?? entry.ingredient_ids;
  return Array.isArray(raw) ? raw : [];
}

function extractIngredientRequirements(entry) {
  return normalizeIngredientEntries(entry)
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'object') {
        const id =
          item.id ||
          item.menuItemId ||
          item.itemId ||
          item.menu_item_id ||
          null;
        if (!id) return null;
        const qtyRaw = item.quantity || item.qty || item.count || 1;
        const qty = Number.isFinite(Number(qtyRaw))
          ? Math.max(1, Math.floor(Number(qtyRaw)))
          : 1;
        return { id: String(id), qty };
      }
      return { id: String(item), qty: 1 };
    })
    .filter(Boolean);
}

function recalculateComboRemaining(state) {
  if (!comboRequirements || typeof comboRequirements !== 'object') return state;
  Object.entries(comboRequirements).forEach(([comboId, requirements]) => {
    if (!Array.isArray(requirements) || requirements.length === 0) return;
    let nextRemaining = null;
    requirements.forEach((req) => {
      if (!req) return;
      const id =
        req.id || req.menuItemId || req.itemId || req.menu_item_id || null;
      if (!id) {
        nextRemaining = 0;
        return;
      }
      const component = state[String(id)];
      if (!component) {
        nextRemaining = 0;
        return;
      }
      const qtyRaw = req.qty ?? req.quantity ?? req.count ?? 1;
      const qty = Number.isFinite(Number(qtyRaw))
        ? Math.max(1, Math.floor(Number(qtyRaw)))
        : 1;
      const remaining = Number.isFinite(Number(component.remaining))
        ? Math.max(0, Math.floor(Number(component.remaining)))
        : 0;
      const possible = Math.floor(remaining / qty);
      if (nextRemaining === null) {
        nextRemaining = possible;
      } else {
        nextRemaining = Math.min(nextRemaining, possible);
      }
    });
    if (nextRemaining === null) nextRemaining = 0;
    if (state[comboId]) {
      state[comboId] = { ...state[comboId], remaining: nextRemaining };
    }
  });
  return state;
}

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
