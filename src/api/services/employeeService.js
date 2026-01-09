import apiClient from '../client';

class EmployeeService {
  _normalizeEmployee(e = {}) {
    return {
      id: e.id,
      name: e.name || '',
      position: e.position || '',
      hourlyRate: Number(e.hourlyRate ?? e.hourly_rate ?? e.rate ?? 0),
      contact: e.contact || '',
      status: (e.status || 'active').toLowerCase(),
      avatar: e.avatar || '/placeholder.svg',
    };
  }

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

  async _fetchEmployeesPage(params = {}) {
    const query = this._buildQueryString(params);
    const res = await apiClient.get(`/employees${query}`, {
      retry: { retries: 2 },
    });
    const container = Array.isArray(res)
      ? res
      : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.results)
          ? res.results
          : Array.isArray(res?.items)
            ? res.items
            : [];
    const employees = container.map((item) => this._normalizeEmployee(item));
    const paginationRaw =
      res?.pagination || res?.meta?.pagination || res?.data?.pagination || null;
    const pagination = paginationRaw
      ? {
          page: Number(
            paginationRaw.page ?? paginationRaw.current ?? params.page ?? 1
          ),
          limit: Number(
            paginationRaw.limit ?? paginationRaw.pageSize ?? params.limit ?? 0
          ),
          total: Number(
            paginationRaw.total ?? paginationRaw.totalItems ?? employees.length
          ),
          totalPages: Number(
            paginationRaw.totalPages ??
              paginationRaw.total_pages ??
              paginationRaw.pages ??
              1
          ),
        }
      : null;
    return { employees, pagination };
  }

  async getEmployees(params = {}) {
    const queryParams = { ...params };
    if (queryParams.limit === undefined || queryParams.limit === null) {
      queryParams.limit = 500;
    }
    const { employees } = await this._fetchEmployeesPage(queryParams);
    return employees;
  }

  async getAllEmployees(params = {}) {
    const limitValue = Number(
      params.limit === undefined || params.limit === null ? 0 : params.limit
    );
    const limit =
      Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 200;
    const merged = { ...params, limit };
    let page = Number(merged.page ?? 1);
    const aggregated = [];

    while (true) {
      const { employees, pagination } = await this._fetchEmployeesPage({
        ...merged,
        page,
      });
      aggregated.push(...employees);
      const totalPages = pagination?.totalPages || pagination?.total_pages || 0;
      if (!totalPages || page >= totalPages || employees.length < limit) {
        break;
      }
      page += 1;
    }

    return aggregated;
  }

  async createEmployee(employee) {
    const payload = {
      name: employee?.name || '',
      position: employee?.position || '',
      hourlyRate: Number(employee?.hourlyRate ?? 0),
      contact: employee?.contact || '',
      status: (employee?.status || 'active').toLowerCase(),
    };
    const res = await apiClient.post('/employees', payload, {
      retry: { retries: 1 },
    });
    const e = res?.data || res;
    return this._normalizeEmployee(e);
  }

  async createEmployeeWithSchedule(employee) {
    const payload = {
      name: employee?.name || '',
      position: employee?.position || '',
      hourlyRate: Number(employee?.hourlyRate ?? 0),
      contact: employee?.contact || '',
      status: (employee?.status || 'active').toLowerCase(),
      schedule: Array.isArray(employee?.schedule) ? employee.schedule : [],
    };
    const res = await apiClient.post('/employees/with-schedule', payload, {
      retry: { retries: 1 },
    });
    return res?.data || res;
  }

  async updateEmployee(id, updates) {
    const payload = { ...updates };
    const res = await apiClient.put(`/employees/${id}`, payload, {
      retry: { retries: 1 },
    });
    const e = res?.data || res;
    return this._normalizeEmployee(e);
  }

  async deleteEmployee(id) {
    await apiClient.delete(`/employees/${id}`, { retry: { retries: 1 } });
    return true;
  }

  async getSchedule(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    });
    const query = qs.toString();
    const res = await apiClient.get(`/schedule${query ? `?${query}` : ''}`, {
      retry: { retries: 2 },
    });
    const list = Array.isArray(res) ? res : res?.data || [];
    return list.map((s) => ({
      id: s.id,
      employeeId: s.employeeId,
      employeeName: s.employeeName || '',
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
    }));
  }

  async getRoleTargets(params = {}) {
    const query = this._buildQueryString(params);
    return await apiClient.get(`/schedule/role-targets${query}`);
  }

  async updateRoleTargets(payload = {}) {
    return await apiClient.put('/schedule/role-targets', payload);
  }

  async getRoleExceptions(params = {}) {
    const query = this._buildQueryString(params);
    return await apiClient.get(`/schedule/role-exceptions${query}`);
  }

  async createRoleException(payload = {}) {
    return await apiClient.post('/schedule/role-exceptions', payload);
  }

  async deleteRoleException(id) {
    return await apiClient.delete(
      `/schedule/role-exceptions/${encodeURIComponent(id)}`
    );
  }

  async clearRoleExceptions() {
    return await apiClient.delete('/schedule/role-exceptions?clear=all');
  }

  async getScheduleAnalytics(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    });
    const query = qs.toString();
    const res = await apiClient.get(
      `/schedule/analytics${query ? `?${query}` : ''}`,
      {
        retry: { retries: 2 },
      }
    );
    const list = Array.isArray(res) ? res : res?.data || [];
    return list.map((s) => ({
      id: s.id,
      employeeId: s.employeeId,
      employeeName: s.employeeName || '',
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
      employeePosition:
        s.employeePosition || s.employee?.position || s.position || '',
    }));
  }

  async createSchedule(entry) {
    const payload = {
      employeeId: entry?.employeeId,
      day: entry?.day,
      startTime: entry?.startTime,
      endTime: entry?.endTime,
    };
    const res = await apiClient.post('/schedule', payload, {
      retry: { retries: 1 },
    });
    const s = res?.data || res;
    return {
      id: s.id,
      employeeId: s.employeeId,
      employeeName: s.employeeName || '',
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
    };
  }

  async updateSchedule(id, updates) {
    const res = await apiClient.put(`/schedule/${id}`, updates, {
      retry: { retries: 1 },
    });
    const s = res?.data || res;
    return {
      id: s.id,
      employeeId: s.employeeId,
      employeeName: s.employeeName || '',
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
    };
  }

  async deleteSchedule(id) {
    await apiClient.delete(`/schedule/${id}`, { retry: { retries: 1 } });
    return true;
  }
}

export const employeeService = new EmployeeService();
export default employeeService;
