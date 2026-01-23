import apiClient from '../client';

const buildQueryString = (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, String(v)));
      return;
    }
    qs.append(key, String(value));
  });
  const query = qs.toString();
  return query ? `?${query}` : '';
};

class CateringService {
  async listEvents(params = {}) {
    const query = buildQueryString(params);
    return apiClient.get(`/catering/events${query}`);
  }

  async listPackages(params = {}) {
    const query = buildQueryString(params);
    return apiClient.get(`/catering/packages${query}`);
  }

  async getPackage(packageId) {
    return apiClient.get(`/catering/packages/${packageId}`);
  }

  async createPackage(payload) {
    return apiClient.post('/catering/packages', payload);
  }

  async updatePackage(packageId, payload) {
    return apiClient.patch(`/catering/packages/${packageId}`, payload);
  }

  async deactivatePackage(packageId) {
    return apiClient.delete(`/catering/packages/${packageId}`);
  }

  async getEvent(eventId, params = {}) {
    const query = buildQueryString(params);
    return apiClient.get(`/catering/events/${eventId}${query}`);
  }

  async createEvent(payload) {
    return apiClient.post('/catering/events', payload);
  }

  async updateEvent(eventId, payload) {
    return apiClient.patch(`/catering/events/${eventId}`, payload);
  }

  async cancelEvent(eventId) {
    return this.updateEvent(eventId, { status: 'cancelled' });
  }

  async setEventMenuItems(eventId, items = []) {
    return apiClient.put(`/catering/events/${eventId}/menu-items`, {
      items,
    });
  }

  async setEventPackage(eventId, payload) {
    return apiClient.put(`/catering/events/${eventId}/package`, payload);
  }

  async submitPayment(eventId, payload) {
    return apiClient.post(`/catering/events/${eventId}/payment`, payload);
  }
}

export const cateringService = new CateringService();
export default cateringService;
