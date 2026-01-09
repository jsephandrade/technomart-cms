const CANTEEN_ROLE_OPTIONS = [
  'Manager',
  'Assistant Manager',
  'Head Chef',
  'Sous Chef',
  'Line Cook',
  'Prep Cook',
  'Pastry Chef',
  'Dishwasher',
  'Barista',
  'Cashier',
  'Server',
  'Host',
  'Food Runner',
  'Catering Coordinator',
  'Inventory Clerk',
];

const normalizeRoleValue = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const resolveRoleLabel = (value, options = CANTEEN_ROLE_OPTIONS) => {
  const normalized = normalizeRoleValue(value);
  if (!normalized) return '';
  const list = Array.isArray(options) ? options : [];
  const match = list.find(
    (option) => normalizeRoleValue(option) === normalized
  );
  return match || String(value).trim();
};

const mergeRoleOptions = (
  baseRoles = CANTEEN_ROLE_OPTIONS,
  extraRoles = []
) => {
  const combined = [];
  const seen = new Set();
  const addRole = (role) => {
    const label = resolveRoleLabel(role, baseRoles);
    if (!label) return;
    const key = normalizeRoleValue(label);
    if (seen.has(key)) return;
    seen.add(key);
    combined.push(label);
  };

  (Array.isArray(baseRoles) ? baseRoles : []).forEach(addRole);
  (Array.isArray(extraRoles) ? extraRoles : []).forEach(addRole);

  return combined;
};

export {
  CANTEEN_ROLE_OPTIONS,
  mergeRoleOptions,
  normalizeRoleValue,
  resolveRoleLabel,
};
