const normalizeBaseUrl = (value) => {
  if (!value) return '';
  return String(value).trim().replace(/\/+$/, '');
};

const API_ORIGIN = normalizeBaseUrl(
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'
);
const API_PREFIX = '/api';

/**
 * 🌐 API Configuration
 * Make sure your backend runs using:
 *    python manage.py runserver 0.0.0.0:8000
 * and your phone + PC are on the same Wi-Fi network.
 */

// Base URLs
export const BASE_URL = `${API_ORIGIN}${API_PREFIX}`; // For normal REST API calls
export const BASE_URL_MENU = `${BASE_URL}/menu`; // For menu endpoints
export const BASE_URL_FEEDBACK = API_ORIGIN;
export const BASE_URL_ACCOUNTS = `${BASE_URL}/accounts`;

// Optional: timeout config
export const API_CONFIG = {
  timeout: 15000,
};

console.log('🔗 Using BASE_URL (REST):', BASE_URL);
console.log('🔗 Using BASE_URL_MENU (menu):', BASE_URL_MENU);
