const FALLBACK_IMAGE = require('../../assets/menudo.png');

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
