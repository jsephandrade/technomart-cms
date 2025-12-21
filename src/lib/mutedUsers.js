const MUTED_USERS_STORAGE_KEY = 'ui.mutedUsers';
const MUTE_DURATION_MS = 24 * 60 * 60 * 1000;

const normalizeEmail = (email) => {
  if (!email) return '';
  return String(email).trim().toLowerCase();
};

const readMutedUsers = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MUTED_USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeMutedUsers = (entries) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      MUTED_USERS_STORAGE_KEY,
      JSON.stringify(entries)
    );
  } catch {}
};

const pruneMutedUsers = (entries) => {
  const now = Date.now();
  return entries.filter(
    (entry) =>
      entry && normalizeEmail(entry.email) && Number(entry.mutedUntil) > now
  );
};

export const muteUserFor24Hours = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const mutedUntil = Date.now() + MUTE_DURATION_MS;
  const current = pruneMutedUsers(readMutedUsers());
  const next = current.filter(
    (entry) => normalizeEmail(entry.email) !== normalized
  );
  next.push({ email: normalized, mutedUntil });
  writeMutedUsers(next);
  return mutedUntil;
};

export const getMutedUser = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const current = pruneMutedUsers(readMutedUsers());
  const match = current.find(
    (entry) => normalizeEmail(entry.email) === normalized
  );
  writeMutedUsers(current);
  return match || null;
};
