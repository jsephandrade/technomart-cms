const FALLBACK_IMAGE = require('../../assets/menudo.png');

const normalizeMenuImageCandidate = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'object') {
    if (value.uri) return value;
    if (typeof value.url === 'string') {
      const normalizedUrl = value.url.trim();
      if (normalizedUrl) return normalizedUrl;
    }
  }
  return null;
};

export const selectMenuImage = (item) => {
  if (!item) return null;
  const candidates = [
    item.image,
    item.imageUrl,
    item.image_url,
    item.thumbnail,
    item?.image?.url,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeMenuImageCandidate(candidate);
    if (normalized !== null) {
      return normalized;
    }
  }
  return null;
};

export const resolveImageSource = (image) => {
  if (!image) return FALLBACK_IMAGE;
  if (typeof image === 'number') return image;
  if (typeof image === 'string') {
    const lower = image.toLowerCase();
    if (lower.includes('.svg') || lower.startsWith('data:image/svg')) {
      return FALLBACK_IMAGE;
    }
    return { uri: image };
  }
  if (typeof image === 'object' && image.uri) return image;
  return FALLBACK_IMAGE;
};
