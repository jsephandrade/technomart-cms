import apiClient from '../client';
import { mockUsers } from '../mockData';
import {
  usersApiToModel,
  userApiToModel,
  userModelToCreatePayload,
  userModelToUpdatePayload,
} from '@/api/mappers';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions';

// Mock delay for realistic API simulation
const mockDelay = (ms = 800) =>
  new Promise((resolve) => setTimeout(resolve, ms));
const USE_MOCKS =
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  (import.meta.env.VITE_ENABLE_MOCKS === 'true' ||
    import.meta.env.VITE_ENABLE_MOCKS === '1');

function applyListParams(list, params = {}) {
  const {
    search = '',
    role = '',
    status = '',
    sortBy = 'name',
    sortDir = 'asc',
    page = 1,
    limit = 20,
  } = params;
  let data = [...list];
  const q = (search || '').toLowerCase();
  if (q) {
    data = data.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }
  if (role) {
    data = data.filter(
      (u) => (u.role || '').toLowerCase() === role.toLowerCase()
    );
  }
  if (status) {
    data = data.filter(
      (u) => (u.status || '').toLowerCase() === status.toLowerCase()
    );
  }
  const dir = (sortDir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
  data.sort((a, b) => {
    const av = (a[sortBy] ?? '').toString().toLowerCase();
    const bv = (b[sortBy] ?? '').toString().toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  const total = data.length;
  const start = (Math.max(1, page) - 1) * Math.max(1, limit);
  const end = start + Math.max(1, limit);
  const paged = data.slice(start, end);
  return {
    data: paged,
    pagination: {
      page: Math.max(1, page),
      limit: Math.max(1, limit),
      total,
      totalPages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
      sortBy,
      sortDir,
      search,
      role,
      status,
    },
  };
}

class UserService {
  async getUsers(params = {}) {
    // Attempt real API if mocks disabled
    if (!USE_MOCKS) {
      try {
        const qs = new URLSearchParams();
        Object.entries(params || {}).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '')
            qs.append(k, String(v));
        });
        const res = await apiClient.get(`/users?${qs.toString()}`, {
          retry: { retries: 2 },
        });
        // Expect { data, pagination } or array
        if (Array.isArray(res)) {
          return {
            success: true,
            data: usersApiToModel(res),
            pagination: {
              page: 1,
              limit: res.length,
              total: res.length,
              totalPages: 1,
            },
          };
        }
        const data = usersApiToModel(res?.data || []);
        return {
          success: true,
          data,
          pagination: res?.pagination || {
            page: 1,
            limit: data.length,
            total: data.length,
            totalPages: 1,
          },
        };
      } catch (e) {
        // fall back to mocks
        console.warn('getUsers API failed, falling back to mocks:', e?.message);
      }
    }

    await mockDelay();
    const { data, pagination } = applyListParams(
      usersApiToModel(mockUsers),
      params
    );
    return { success: true, data, pagination };
  }

  async getUserById(userId) {
    if (!USE_MOCKS) {
      try {
        const res = await apiClient.get(`/users/${userId}`, {
          retry: { retries: 1 },
        });
        const data = userApiToModel(res?.data || res);
        return { success: true, data };
      } catch (e) {
        console.warn(
          'getUserById API failed, falling back to mocks:',
          e?.message
        );
      }
    }
    await mockDelay(600);
    const user = mockUsers.find((u) => u.id === userId);
    if (!user) throw new Error('User not found');
    return { success: true, data: userApiToModel(user) };
  }

  async createUser(userData) {
    const payload = userModelToCreatePayload(userData);
    if (!USE_MOCKS) {
      try {
        const res = await apiClient.post('/users', payload, {
          retry: { retries: 1 },
        });
        const data = userApiToModel(res?.data || res);
        return { success: true, data };
      } catch (e) {
        console.warn(
          'createUser API failed, falling back to mocks:',
          e?.message
        );
      }
    }
    // Mock implementation (fallback when mocks are enabled or API unavailable)
    await mockDelay(400);
    const newUser = {
      id: Date.now().toString(),
      ...payload,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLogin: null,
      permissions: [],
    };
    return { success: true, data: userApiToModel(newUser) };
  }

  async updateUser(userId, updates) {
    const updatePayload = userModelToUpdatePayload(updates);
    if (!USE_MOCKS) {
      try {
        const res = await apiClient.put(`/users/${userId}`, updatePayload, {
          retry: { retries: 1 },
        });
        const data = userApiToModel(res?.data || res);
        return { success: true, data };
      } catch (e) {
        console.warn(
          'updateUser API failed, falling back to mocks:',
          e?.message
        );
      }
    }
    await mockDelay(300);
    const userIndex = mockUsers.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      throw new Error('User not found');
    }
    const updatedUser = {
      ...mockUsers[userIndex],
      ...updatePayload,
      updatedAt: new Date().toISOString(),
    };
    return { success: true, data: userApiToModel(updatedUser) };
  }

  async deleteUser(userId) {
    if (!USE_MOCKS) {
      try {
        const res = await apiClient.delete(`/users/${userId}`, {
          retry: { retries: 1 },
        });
        return { success: true, data: res?.data || true };
      } catch (e) {
        console.warn(
          'deleteUser API failed, falling back to mocks:',
          e?.message
        );
      }
    }
    await mockDelay(200);
    const user = mockUsers.find((u) => u.id === userId);
    if (!user) throw new Error('User not found');
    return { success: true, message: 'User deleted successfully' };
  }

  async updateUserStatus(userId, status) {
    if (!USE_MOCKS) {
      try {
        const res = await apiClient.patch(
          `/users/${userId}/status`,
          { status },
          { retry: { retries: 1 } }
        );
        const data = userApiToModel(res?.data || res);
        return { success: true, data };
      } catch (e) {
        console.warn(
          'updateUserStatus API failed, falling back to mocks:',
          e?.message
        );
      }
    }
    return this.updateUser(userId, { status });
  }

  async getRoles() {
    if (!USE_MOCKS) {
      try {
        const res = await apiClient.get('/users/roles', {
          retry: { retries: 1 },
        });
        const data = res?.data || res;
        return { success: true, data };
      } catch (e) {
        console.warn('getRoles API failed, falling back to mocks:', e?.message);
      }
    }
    await mockDelay(200);
    return {
      success: true,
      data: [
        {
          label: 'Admin',
          value: 'admin',
          description: 'Full access to all settings and functions',
          permissions: [...DEFAULT_ROLE_PERMISSIONS.admin],
        },
        {
          label: 'Manager',
          value: 'manager',
          description: 'Can manage most settings and view reports',
          permissions: [...DEFAULT_ROLE_PERMISSIONS.manager],
        },
        {
          label: 'Staff',
          value: 'staff',
          description: 'Kitchen and service staff access',
          permissions: [...DEFAULT_ROLE_PERMISSIONS.staff],
        },
      ],
    };
  }

  async updateUserRole(userId, role) {
    if (!USE_MOCKS) {
      try {
        const res = await apiClient.patch(
          `/users/${userId}/role`,
          { role },
          { retry: { retries: 1 } }
        );
        const data = userApiToModel(res?.data || res);
        return { success: true, data };
      } catch (e) {
        console.warn(
          'updateUserRole API failed, falling back to mocks:',
          e?.message
        );
      }
    }
    return this.updateUser(userId, { role });
  }

  async updateRoleConfig(roleConfig) {
    // roleConfig: { label, value, description, permissions[] }
    if (!USE_MOCKS) {
      try {
        const res = await apiClient.put(
          `/users/roles/${roleConfig.value}`,
          roleConfig,
          { retry: { retries: 1 } }
        );
        return { success: true, data: res?.data || roleConfig };
      } catch (e) {
        console.warn(
          'updateRoleConfig API failed, falling back to mocks:',
          e?.message
        );
      }
    }
    await mockDelay(200);
    return { success: true, data: roleConfig };
  }
}

export const userService = new UserService();
export default userService;
