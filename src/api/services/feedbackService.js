import apiClient from '../client';

// Normalize backend/static mock data to the shape expected by UI components
function normalize(item) {
  return {
    id: String(item.id),
    customerName:
      item.customerName ||
      item.name ||
      item.user_name ||
      item.user?.name ||
      item.customer_name ||
      'Anonymous',
    rating: Number(item.rating || 0),
    comment: item.comment || item.message || '',
    // UI expects `date`; mock has `createdAt`
    date:
      item.date ||
      item.createdAt ||
      item.created_at ||
      new Date().toISOString(),
    // UI expects boolean `resolved`; mock has `status`
    resolved:
      typeof item.resolved === 'boolean'
        ? item.resolved
        : String(item.status || '').toLowerCase() === 'resolved',
    // Keep passthrough fields if present
    orderNumber: item.orderNumber || null,
    category: item.category || null,
    email:
      item.email ||
      item.customer_email ||
      item.user_email ||
      item.user?.email ||
      null,
  };
}

const unwrapList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
};

class FeedbackService {
  async getFeedback() {
    const res = await apiClient.get('/feedback/');
    return unwrapList(res).map((item) => normalize(item));
  }

  async markFeedbackResolved(id) {
    const res = await apiClient.patch(`/feedback/${id}/`, {});
    return normalize(res?.data || res);
  }

  async createFeedback(feedbackData) {
    const payload = {
      category: feedbackData.category || '',
      message: feedbackData.comment || feedbackData.message || '',
      rating:
        typeof feedbackData.rating === 'number'
          ? feedbackData.rating
          : undefined,
    };
    const res = await apiClient.post('/feedback/', payload);
    return normalize(res?.data || res);
  }

  async getSummary() {
    const list = await this.getFeedback();
    const count = list.length;
    const avg =
      count > 0
        ? list.reduce((s, f) => s + (Number(f.rating) || 0), 0) / count
        : 0;
    return { success: true, data: { average: Number(avg.toFixed(2)), count } };
  }
}

export const feedbackService = new FeedbackService();
export default feedbackService;
