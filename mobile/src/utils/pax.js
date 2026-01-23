export const getPaxRemaining = (item) => {
  if (!item || typeof item !== 'object') return null;
  const raw =
    item.pax_per_preparation ??
    item.paxPerPreparation ??
    item.pax_remaining ??
    item.paxRemaining ??
    item.pax;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
};

export const isPaxAvailable = (item) => {
  if (!item || typeof item !== 'object') return false;
  const remaining = getPaxRemaining(item);
  const explicitUnavailable =
    item.available === false ||
    item.is_available === false ||
    item.isAvailable === false ||
    item.sold_out === true ||
    item.soldOut === true;
  if (explicitUnavailable) return false;
  if (remaining === null) return true;
  return remaining > 0;
};
