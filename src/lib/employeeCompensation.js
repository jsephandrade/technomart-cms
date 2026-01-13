import { normalizeRoleValue } from './canteenRoles';

const WORK_DAYS_PER_MONTH = 26;
const DEFAULT_MONTHLY_SALARY = 15000;

const ROLE_MONTHLY_SALARY = {
  [normalizeRoleValue('Manager')]: 30000,
  [normalizeRoleValue('Assistant Manager')]: 24000,
  [normalizeRoleValue('Head Chef')]: 26000,
  [normalizeRoleValue('Sous Chef')]: 22000,
  [normalizeRoleValue('Line Cook')]: 18000,
  [normalizeRoleValue('Prep Cook')]: 16000,
  [normalizeRoleValue('Pastry Chef')]: 20000,
  [normalizeRoleValue('Dishwasher')]: 14000,
  [normalizeRoleValue('Barista')]: 16000,
  [normalizeRoleValue('Cashier')]: 16000,
  [normalizeRoleValue('Server')]: 15000,
  [normalizeRoleValue('Host')]: 15000,
  [normalizeRoleValue('Food Runner')]: 14000,
  [normalizeRoleValue('Catering Coordinator')]: 23000,
  [normalizeRoleValue('Inventory Clerk')]: 17000,
};

const resolveMonthlySalary = (role) => {
  const key = normalizeRoleValue(role);
  if (!key) return 0;
  const match = ROLE_MONTHLY_SALARY[key];
  return Number.isFinite(match) ? match : DEFAULT_MONTHLY_SALARY;
};

const calculateDailyRate = (monthlySalary) => {
  const monthly = Number(monthlySalary);
  if (!Number.isFinite(monthly) || monthly <= 0) return 0;
  return monthly / WORK_DAYS_PER_MONTH;
};

const resolveEmployeeCompensation = (employee = {}) => {
  const rawMonthly =
    employee.monthlySalary ??
    employee.monthly_salary ??
    employee.salary ??
    resolveMonthlySalary(employee.position);
  const monthlySalary = Number.isFinite(Number(rawMonthly))
    ? Number(rawMonthly)
    : 0;
  const rawDaily =
    employee.dailyRate ??
    employee.daily_rate ??
    calculateDailyRate(monthlySalary);
  const dailyRate = Number.isFinite(Number(rawDaily)) ? Number(rawDaily) : 0;
  return { monthlySalary, dailyRate };
};

const formatPhp = (value, options = {}) => {
  const amount = Number(value || 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const maximumFractionDigits =
    options.maximumFractionDigits ?? options.maxFractionDigits ?? 0;
  const minimumFractionDigits =
    options.minimumFractionDigits ?? options.minFractionDigits ?? 0;
  return `PHP ${safeAmount.toLocaleString('en-PH', {
    minimumFractionDigits,
    maximumFractionDigits,
  })}`;
};

export {
  WORK_DAYS_PER_MONTH,
  DEFAULT_MONTHLY_SALARY,
  ROLE_MONTHLY_SALARY,
  resolveMonthlySalary,
  calculateDailyRate,
  resolveEmployeeCompensation,
  formatPhp,
};
