// Default role permissions map mirrored from backend (views_common.DEFAULT_ROLE_PERMISSIONS)
// Keep minimal and focused to gate UI controls only.

export const DEFAULT_ROLE_PERMISSIONS = {
  admin: ['all'],
  manager: [
    'account.login',
    'account.logout',
    'account.password.edit',
    'account.info.edit',
    'account.biometric',
    'inventory.view',
    'inventory.update',
    'inventory.expiry.track',
    'inventory.menu.manage',
    'inventory.lowstock.alerts',
    'inventory.restock.manage',
    'order.queue.handle',
    'order.status.update',
    'order.bulk.track',
    'payment.process',
    'payment.records.view',
    'order.history.view',
    'payment.refund',
    'profile.view_roles',
    'schedule.view_edit',
    'schedule.manage',
    'attendance.manage',
    'leave.manage',
    'reports.dashboard.view',
    'reports.sales.view',
    'reports.inventory.view',
    'reports.orders.view',
    'reports.staff.view',
    'reports.customer.view',
    'notification.send',
    'notification.receive',
    'notification.view',
    'menu.manage',
    'catering.view',
    'catering.manage',
    'employees.manage',
    'verify.review',
  ],
  staff: [
    'account.login',
    'account.logout',
    'account.password.edit',
    'account.info.edit',
    'account.biometric',
    'inventory.view',
    'inventory.update',
    'inventory.expiry.track',
    'order.place',
    'order.status.view',
    'order.queue.handle',
    'order.status.update',
    'order.bulk.track',
    'payment.process',
    'payment.records.view',
    'order.history.view',
    'profile.view_roles',
    'schedule.view_edit',
    'notification.send',
    'notification.receive',
    'notification.view',
    'catering.view',
    'reports.dashboard.view',
  ],
};

const titleCase = (value) =>
  value
    .split(' ')
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(' ');

export const PERMISSION_CODES = (() => {
  const set = new Set();
  Object.values(DEFAULT_ROLE_PERMISSIONS).forEach((perms) => {
    perms.forEach((perm) => set.add(perm));
  });
  const list = Array.from(set)
    .filter((perm) => perm !== 'all')
    .sort();
  return ['all', ...list];
})();

export const permissionLabel = (code) => {
  if (!code) return '';
  if (code === 'all') return 'All Permissions';
  const parts = code.split('.');
  const group = titleCase(parts[0].replace(/_/g, ' '));
  const action = parts
    .slice(1)
    .map((part) => titleCase(part.replace(/_/g, ' ')))
    .join(' ');
  return action ? `${group}: ${action}` : group;
};

export function effectivePermissions(user) {
  if (
    Array.isArray(user?.effectivePermissions) &&
    user.effectivePermissions.length
  ) {
    return user.effectivePermissions;
  }
  const role = (user?.role || 'staff').toLowerCase();
  const base = Array.isArray(user?.rolePermissions)
    ? user.rolePermissions
    : DEFAULT_ROLE_PERMISSIONS[role] || [];
  const explicit = Array.isArray(user?.permissions) ? user.permissions : [];
  if (role === 'admin' || base.includes('all') || explicit.includes('all'))
    return ['all'];
  // union
  const set = new Set([...base, ...explicit]);
  return Array.from(set);
}
