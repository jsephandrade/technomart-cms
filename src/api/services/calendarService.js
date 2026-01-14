import apiClient from '../client';

const normalizeDate = (value) => {
  if (!value) return '';
  const raw = String(value);
  return raw.includes('T') ? raw.split('T')[0] : raw;
};

const normalizeException = (entry = {}) => ({
  id: entry.id,
  date: normalizeDate(entry.date),
  name: entry.name || '',
  kind: entry.kind || entry.type || 'holiday',
  scope: entry.scope || 'all',
  roles: Array.isArray(entry.roles)
    ? entry.roles
    : String(entry.roles || '')
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean),
  location: entry.location || '',
  isWorkdayOverride: Boolean(
    entry.isWorkdayOverride || entry.is_workday_override
  ),
  notes: entry.notes || '',
  createdAt: entry.createdAt || entry.created_at || null,
  updatedAt: entry.updatedAt || entry.updated_at || null,
});

class CalendarService {
  _buildQueryString(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        qs.append(key, String(value));
      }
    });
    const query = qs.toString();
    return query ? `?${query}` : '';
  }

  async getExceptions(params = {}) {
    const query = this._buildQueryString(params);
    const res = await apiClient.get(`/calendar/exceptions${query}`, {
      retry: { retries: 2 },
    });
    const list = Array.isArray(res)
      ? res
      : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.results)
          ? res.results
          : [];
    return list.map((entry) => normalizeException(entry));
  }

  async createException(payload = {}) {
    const res = await apiClient.post('/calendar/exceptions', payload, {
      retry: { retries: 1 },
    });
    const entry = res?.data || res;
    return normalizeException(entry);
  }

  async deleteException(id) {
    await apiClient.delete(`/calendar/exceptions/${id}`, {
      retry: { retries: 1 },
    });
    return true;
  }
}

export const calendarService = new CalendarService();
export default calendarService;
