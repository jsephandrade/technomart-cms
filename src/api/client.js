// Central API client configuration
// Uses Vite env var when available; falls back to '/api' for dev proxy
const API_BASE_URL =
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : '/api';

// Normalized API error type
class ApiError extends Error {
  constructor(message, { status, code, details, url, method, body, response }) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? null;
    this.code = code ?? null;
    this.details = details ?? null;
    this.url = url ?? null;
    this.method = method ?? null;
    this.body = body ?? null;
    this.response = response ?? null;
  }
}

class ApiClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
    this._getAuthToken = null; // optional dynamic token provider
    this.onUnauthorized = null; // optional 401 handler
    this.retryConfig = {
      retries: 0,
      delayMs: 300,
      backoffFactor: 2,
      retryOnStatuses: [408, 429, 500, 502, 503, 504],
      retryMethods: ['GET', 'HEAD', 'OPTIONS'],
    };
    const cookieAuthEnabled =
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      (import.meta.env.VITE_AUTH_USE_COOKIES === 'true' ||
        import.meta.env.VITE_AUTH_USE_COOKIES === '1');
    this.sendCredentials = Boolean(
      typeof import.meta !== 'undefined' &&
        import.meta.env &&
        (import.meta.env.VITE_SEND_CREDENTIALS === 'true' ||
          import.meta.env.VITE_SEND_CREDENTIALS === '1' ||
          cookieAuthEnabled)
    );
    this.csrf = {
      // Right-size default: enable CSRF only when using cookie-based auth
      enabled: this.sendCredentials,
      cookieName:
        (typeof import.meta !== 'undefined' &&
          import.meta.env &&
          import.meta.env.VITE_CSRF_COOKIE_NAME) ||
        'csrftoken',
      headerName:
        (typeof import.meta !== 'undefined' &&
          import.meta.env &&
          import.meta.env.VITE_CSRF_HEADER_NAME) ||
        'X-CSRFToken',
    };
  }

  // Static helpers
  static ApiError = ApiError;

  // Allow dynamic token resolution per-request
  setAuthTokenProvider(getter) {
    this._getAuthToken = typeof getter === 'function' ? getter : null;
  }

  setAuthToken(token) {
    if (token) {
      this.defaultHeaders['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.defaultHeaders['Authorization'];
    }
  }

  setRetryConfig(config = {}) {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  setCSRFConfig({ enabled, cookieName, headerName } = {}) {
    this.csrf = {
      ...this.csrf,
      ...(enabled === undefined ? {} : { enabled }),
      ...(cookieName ? { cookieName } : {}),
      ...(headerName ? { headerName } : {}),
    };
  }

  _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async _parseResponse(response) {
    // 204/205 No Content
    if (response.status === 204 || response.status === 205) return null;

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    // If JSON, parse; otherwise return text
    if (isJson) {
      try {
        return await response.json();
      } catch {
        return null; // empty body
      }
    }

    // Fallback: try JSON parse even without a header
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async _extractError(response, url, method, body) {
    let payload = null;
    try {
      payload = await this._parseResponse(response);
    } catch {
      payload = null;
    }
    const status = response?.status ?? null;
    const code = payload?.code || payload?.error?.code || null;
    const message =
      payload?.message || payload?.error?.message || `HTTP error ${status}`;
    return new ApiError(message, {
      status,
      code,
      details: payload,
      url,
      method,
      body,
      response,
    });
  }

  _shouldRetry({ attempt, error, response, method, retryConfig }) {
    if (attempt >= retryConfig.retries) return false;
    const upper = (method || 'GET').toUpperCase();
    if (!retryConfig.retryMethods.includes(upper)) return false;

    // Network errors (no response)
    if (error && (error.name === 'AbortError' || error.name === 'TypeError')) {
      return true;
    }

    // Retry on selected statuses
    const status = response?.status;
    return status ? retryConfig.retryOnStatuses.includes(status) : false;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const method = (options.method || 'GET').toUpperCase();

    // Merge headers and attach auth token
    const headers = {
      ...this.defaultHeaders,
      ...(options.headers || {}),
    };

    const dynamicToken = this._getAuthToken ? this._getAuthToken() : null;
    if (dynamicToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${dynamicToken}`;
    }

    // Handle body and content type (FormData must not set Content-Type)
    let body = options.body;
    const isFormData =
      typeof FormData !== 'undefined' && body instanceof FormData;
    if (isFormData) {
      // Browser sets boundary automatically
      if (headers['Content-Type']) delete headers['Content-Type'];
    }

    // CSRF for cookie-based auth flows
    const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (this.csrf.enabled && unsafeMethod) {
      const token = this._readCookie(this.csrf.cookieName);
      if (token && !headers[this.csrf.headerName]) {
        headers[this.csrf.headerName] = token;
      }
    }

    const retryConfig = { ...this.retryConfig, ...(options.retry || {}) };
    const timeoutMs = options.timeoutMs || 0;

    // Support cancellation via AbortSignal and optional timeout
    const userSignal = options.signal;
    const controller = !userSignal ? new AbortController() : null;
    const signal = userSignal || controller?.signal;

    const exec = async () => {
      // Build fetch config
      const config = {
        method,
        headers,
        body,
        signal,
        credentials:
          options.credentials ??
          (this.sendCredentials ? 'include' : 'same-origin'),
        // Ensure no unexpected keys leak into fetch
      };

      // Execute fetch
      const response = await fetch(url, config);

      // Fast path success
      if (response.ok) {
        return this._parseResponse(response);
      }

      // Unauthorized hook
      if (
        response.status === 401 &&
        typeof this.onUnauthorized === 'function'
      ) {
        try {
          this.onUnauthorized();
        } catch {}
      }

      // Throw normalized error
      throw await this._extractError(response, url, method, body);
    };

    let attempt = 0;

    const runWithRetry = async () => {
      while (true) {
        try {
          // Optional timeout
          if (controller && timeoutMs > 0) {
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
              const result = await exec();
              clearTimeout(timeoutId);
              return result;
            } catch (err) {
              clearTimeout(timeoutId);
              throw err;
            }
          }
          return await exec();
        } catch (err) {
          const canRetry = this._shouldRetry({
            attempt,
            error: err instanceof ApiError ? null : err,
            response: err instanceof ApiError ? err.response : null,
            method,
            retryConfig,
          });
          if (!canRetry) throw err;
          attempt += 1;
          const delay =
            retryConfig.delayMs *
            Math.pow(retryConfig.backoffFactor, attempt - 1);
          await this._sleep(delay);
        }
      }
    };

    try {
      return await runWithRetry();
    } catch (error) {
      // Surface normalized errors
      if (error instanceof ApiError) throw error;
      // Wrap other errors (e.g., AbortError, network failure)
      const message =
        error?.name === 'AbortError'
          ? 'Request aborted'
          : error?.message || 'Network error';
      throw new ApiError(message, { url, method, body });
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { method: 'GET', ...options });
  }

  post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: options.body !== undefined ? options.body : JSON.stringify(data),
      ...options,
    });
  }

  put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: options.body !== undefined ? options.body : JSON.stringify(data),
      ...options,
    });
  }

  patch(endpoint, data, options = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: options.body !== undefined ? options.body : JSON.stringify(data),
      ...options,
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { method: 'DELETE', ...options });
  }
}

export const apiClient = new ApiClient();
export default apiClient;

// Private helpers
ApiClient.prototype._readCookie = function (name) {
  try {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  } catch {}
  return '';
};
