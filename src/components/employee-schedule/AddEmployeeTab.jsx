import React, { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Archive,
  Check,
  ChevronsUpDown,
  Edit,
  Edit2,
  Search,
  ShieldPlus,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUsers } from '@/hooks/useUsers';
import { useAuth } from '@/components/AuthContext';
import {
  CANTEEN_ROLE_OPTIONS,
  mergeRoleOptions,
  normalizeRoleValue,
  resolveRoleLabel,
} from '@/lib/canteenRoles';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

const STATUS_BADGE_STYLES = {
  active: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  inactive: 'border border-border/60 bg-muted text-muted-foreground',
  pending: 'border border-amber-500/30 bg-amber-500/10 text-amber-700',
};
const HEADER_LAYOUT_CLASSES =
  'flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between';
const ACCENT_CONTAINER_CLASSES =
  'inline-flex max-w-fit items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1 text-[clamp(0.6rem,1vw,0.75rem)] font-semibold uppercase tracking-wide text-primary shadow-sm sm:px-3 sm:py-1.5 sm:text-xs';
const ACCENT_TITLE_CLASSES =
  'text-[clamp(0.7rem,1.2vw,0.85rem)] font-bold uppercase tracking-wider bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent sm:text-sm';
const ACCENT_ICON_CLASSES = 'h-4 w-4 text-primary drop-shadow-sm';
const ACCENT_DESCRIPTION_CLASSES =
  'max-w-prose text-xs leading-relaxed text-muted-foreground sm:text-sm';
const CARD_DECOR_CLASSES =
  'pointer-events-none absolute -right-16 -top-10 h-44 w-44 rounded-full bg-primary/20 blur-3xl';

const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || '??';

const resolveRoleValues = (user) => {
  if (!user) return [];
  const values = new Set();
  const addValue = (value) => {
    if (!value) return;
    const normalized = String(value).trim().toLowerCase();
    if (normalized) values.add(normalized);
  };
  addValue(user.role);
  addValue(user.roleName);
  addValue(user.role_name);
  addValue(user.userRole);
  addValue(user.user_role);
  addValue(user.primaryRole);
  addValue(user.primary_role);
  const listCandidates = [
    user.roles,
    user.roleList,
    user.role_list,
    user.userRoles,
    user.user_roles,
  ];
  listCandidates.forEach((entry) => {
    if (!Array.isArray(entry)) return;
    entry.forEach((roleEntry) => {
      if (!roleEntry) return;
      if (typeof roleEntry === 'string') {
        addValue(roleEntry);
        return;
      }
      addValue(roleEntry.value);
      addValue(roleEntry.role);
      addValue(roleEntry.name);
      addValue(roleEntry.label);
    });
  });
  return Array.from(values);
};

const resolvePrimaryRole = (user) => {
  const values = resolveRoleValues(user);
  if (values.includes('manager')) return 'manager';
  if (values.includes('staff')) return 'staff';
  if (values.includes('admin')) return 'admin';
  return user?.role || user?.roleName || user?.role_name || '';
};

const isStaffEligible = (user) => {
  const values = resolveRoleValues(user);
  return values.some((value) => value === 'staff' || value === 'manager');
};

const AddEmployeeTab = ({
  quickAdd,
  setQuickAdd,
  handleQuickAdd,
  employeesLoading,
  scheduleLoading,
  canManage,
  daysOfWeek,
  employees = [],
  archivedEmployees = [],
  onManageEmployee,
  onArchiveEmployee,
  onOpenManageEmployees,
  onOpenArchivedEmployees,
  getRoleCapacityForRole = () => null,
}) => {
  const userQuery = useMemo(
    () => ({
      context: 'employee-schedule',
    }),
    []
  );
  const { users = [] } = useUsers(userQuery, {
    autoFetch: canManage,
  });
  const { user: currentUser } = useAuth();
  const [copyFromOpen, setCopyFromOpen] = useState(false);
  const [copyFromSelection, setCopyFromSelection] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const appUsers = useMemo(() => {
    const map = new Map();
    const addUser = (entry) => {
      if (!entry) return;
      const id =
        entry.id ||
        entry.userId ||
        entry.user_id ||
        entry.email ||
        entry.name ||
        null;
      if (!id) return;
      const key = String(id);
      if (map.has(key)) return;
      map.set(key, { ...entry, id: key });
    };
    (users || []).forEach(addUser);
    if (currentUser) {
      addUser({
        ...currentUser,
        id:
          currentUser.id ||
          currentUser.userId ||
          currentUser.user_id ||
          currentUser.email ||
          currentUser.name,
        name:
          currentUser.name ||
          currentUser.fullName ||
          currentUser.email ||
          currentUser.username,
        email: currentUser.email,
        role:
          currentUser.role ||
          currentUser.roleName ||
          currentUser.role_name ||
          resolvePrimaryRole(currentUser),
      });
    }
    return Array.from(map.values());
  }, [users, currentUser]);
  const staffUsers = useMemo(
    () => appUsers.filter((user) => isStaffEligible(user)),
    [appUsers]
  );
  const roleOptions = useMemo(() => {
    const employeeRoles = employees.map((emp) => emp.position);
    const staffRoles = staffUsers.map(
      (staff) => staff.role || resolvePrimaryRole(staff)
    );
    return mergeRoleOptions(CANTEEN_ROLE_OPTIONS, [
      ...employeeRoles,
      ...staffRoles,
      quickAdd.position,
    ]);
  }, [employees, staffUsers, quickAdd.position]);
  const normalizedRepeatDays = useMemo(() => {
    if (!Array.isArray(quickAdd.repeatDays)) return [];
    return Array.from(
      new Set(quickAdd.repeatDays.filter((day) => Boolean(day)))
    );
  }, [quickAdd.repeatDays]);

  const selectedRoleKey = useMemo(() => {
    const roleLabel =
      resolveRoleLabel(quickAdd.position, roleOptions) || quickAdd.position;
    return normalizeRoleValue(roleLabel || '');
  }, [quickAdd.position, roleOptions]);

  const availableRepeatDays = useMemo(() => {
    if (!selectedRoleKey) return normalizedRepeatDays;
    return normalizedRepeatDays.filter((day) => {
      const status = getRoleCapacityForRole(day, selectedRoleKey)?.status;
      return status !== 'full';
    });
  }, [normalizedRepeatDays, selectedRoleKey, getRoleCapacityForRole]);

  const selectedRepeatDaysSet = useMemo(
    () => new Set(availableRepeatDays),
    [availableRepeatDays]
  );
  const normalizedTeamSearch = teamSearch.trim().toLowerCase();
  const filteredEmployees = normalizedTeamSearch
    ? employees.filter((emp) => {
        const haystack = [
          emp.name,
          emp.position,
          emp.contact,
          emp.status,
          emp.hourlyRate != null ? String(emp.hourlyRate) : '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedTeamSearch);
      })
    : employees;
  const copyFromLabel = useMemo(() => {
    if (!copyFromSelection) {
      return 'Start with blank profile';
    }
    const [type, id] = copyFromSelection.split(':');
    if (type === 'employee') {
      const match = employees.find((emp) => emp.id === id);
      if (match) {
        return `${match.name || 'Unnamed employee'} · ${
          match.position || 'No role'
        }`;
      }
    }
    if (type === 'user') {
      const match = staffUsers.find((user) => user.id === id);
      if (match) {
        const roleLabel = match.role || resolvePrimaryRole(match) || 'Staff';
        return `${match.name || 'Staff member'} · ${roleLabel}`;
      }
    }
    return 'Start with blank profile';
  }, [copyFromSelection, employees, staffUsers]);

  const handleCopyFromChange = (value) => {
    setCopyFromSelection(value);
    if (!value) {
      setQuickAdd((prev) => ({
        ...prev,
        name: '',
        position: '',
      }));
      return;
    }
    const [type, id] = value.split(':');
    if (type === 'employee') {
      const match = employees.find((emp) => emp.id === id);
      if (match) {
        setQuickAdd((prev) => ({
          ...prev,
          name: match.name || prev.name,
          position:
            resolveRoleLabel(match.position, roleOptions) || prev.position,
        }));
      }
    } else if (type === 'user') {
      const match = staffUsers.find((user) => user.id === id);
      if (match) {
        const roleLabel = match.role || resolvePrimaryRole(match);
        setQuickAdd((prev) => ({
          ...prev,
          name: match.name || prev.name,
          position:
            resolveRoleLabel(roleLabel || match.role, roleOptions) ||
            prev.position,
        }));
      }
    }
  };

  if (!canManage) {
    return (
      <div className="text-sm text-muted-foreground">
        Manager access required.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden border-border/60 bg-card/80 shadow-sm">
        <div className={CARD_DECOR_CLASSES} aria-hidden="true" />
        <CardHeader className="pb-3">
          <div className={HEADER_LAYOUT_CLASSES}>
            <div className="space-y-2">
              <div className={ACCENT_CONTAINER_CLASSES}>
                <ShieldPlus
                  className={ACCENT_ICON_CLASSES}
                  aria-hidden="true"
                />
                <span
                  className={ACCENT_TITLE_CLASSES}
                  aria-label="Add Employee and Schedule"
                >
                  Add Employee and Schedule
                </span>
              </div>
              <CardDescription className={ACCENT_DESCRIPTION_CLASSES}>
                Create a teammate and set their first schedule in one flow.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide">
                Copy from
              </Label>
              <Popover open={copyFromOpen} onOpenChange={setCopyFromOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={copyFromOpen}
                    className="w-full justify-between text-sm font-normal"
                  >
                    <span className="truncate">{copyFromLabel}</span>
                    <ChevronsUpDown
                      className="ml-2 h-4 w-4 shrink-0 opacity-50"
                      aria-hidden="true"
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Search employees or staff..." />
                    <CommandList className="max-h-64 overflow-y-auto">
                      <CommandEmpty>No matches found.</CommandEmpty>
                      <CommandGroup heading="Quick start">
                        <CommandItem
                          value="Start with blank profile"
                          onSelect={() => {
                            handleCopyFromChange('');
                            setCopyFromOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              copyFromSelection ? 'opacity-0' : 'opacity-100'
                            )}
                            aria-hidden="true"
                          />
                          Start with blank profile
                        </CommandItem>
                      </CommandGroup>
                      <CommandSeparator />
                      <CommandGroup
                        heading={`Existing employees (${employees.length})`}
                      >
                        {employees.length ? (
                          employees.map((emp) => {
                            const value = `employee:${emp.id}`;
                            const selected = copyFromSelection === value;
                            return (
                              <CommandItem
                                key={emp.id}
                                value={[
                                  emp.name,
                                  emp.position,
                                  emp.contact,
                                  emp.status,
                                  emp.hourlyRate != null
                                    ? String(emp.hourlyRate)
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                onSelect={() => {
                                  handleCopyFromChange(value);
                                  setCopyFromOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selected ? 'opacity-100' : 'opacity-0'
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="truncate">
                                  {emp.name || 'Unnamed employee'}
                                </span>
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {emp.position || 'No role'}
                                </span>
                              </CommandItem>
                            );
                          })
                        ) : (
                          <CommandItem disabled>
                            No employees available
                          </CommandItem>
                        )}
                      </CommandGroup>
                      <CommandSeparator />
                      <CommandGroup
                        heading={`App users (${staffUsers.length})`}
                      >
                        {staffUsers.length ? (
                          staffUsers.map((user) => {
                            const value = `user:${user.id}`;
                            const selected = copyFromSelection === value;
                            const roleLabel =
                              user.role || resolvePrimaryRole(user) || 'Staff';
                            return (
                              <CommandItem
                                key={user.id}
                                value={[user.name, roleLabel, user.email]
                                  .filter(Boolean)
                                  .join(' ')}
                                onSelect={() => {
                                  handleCopyFromChange(value);
                                  setCopyFromOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selected ? 'opacity-100' : 'opacity-0'
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="truncate">
                                  {user.name || 'Staff member'}
                                </span>
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {roleLabel}
                                </span>
                              </CommandItem>
                            );
                          })
                        ) : (
                          <CommandItem disabled>
                            No staff users available
                          </CommandItem>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide">Name *</Label>
              <Input
                value={quickAdd.name}
                onChange={(e) =>
                  setQuickAdd((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide">Role *</Label>
              <Select
                value={resolveRoleLabel(quickAdd.position, roleOptions)}
                onValueChange={(value) =>
                  setQuickAdd((prev) => ({
                    ...prev,
                    position: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
              <Label className="text-xs uppercase tracking-wide">Days</Label>
              <div className="grid grid-cols-3 gap-2">
                {(daysOfWeek || [])
                  .filter((day) => String(day || '').toLowerCase() !== 'sunday')
                  .map((day) => {
                    const capacity = selectedRoleKey
                      ? getRoleCapacityForRole(day, selectedRoleKey)
                      : null;
                    const isDayAtCapacity = capacity?.status === 'full';
                    const buttonTitle = isDayAtCapacity
                      ? `${capacity?.roleLabel || 'Role'} capacity reached on ${day}`
                      : undefined;
                    const isSelected = selectedRepeatDaysSet.has(day);
                    return (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(
                          'h-8 w-full rounded-full px-0 text-[11px] font-semibold uppercase',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'border-border/60 bg-background text-foreground hover:bg-muted/40'
                        )}
                        key={day}
                        title={buttonTitle}
                        disabled={isDayAtCapacity}
                        onClick={() => {
                          if (isDayAtCapacity) return;
                          setQuickAdd((prev) => {
                            const nextDays = new Set(prev.repeatDays || []);
                            if (nextDays.has(day)) {
                              nextDays.delete(day);
                            } else {
                              nextDays.add(day);
                            }
                            return {
                              ...prev,
                              repeatDays: Array.from(nextDays),
                            };
                          });
                        }}
                      >
                        {day.slice(0, 3)}
                      </Button>
                    );
                  })}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide">
                Start time
              </Label>
              <Input
                type="time"
                value={quickAdd.startTime}
                onChange={(e) =>
                  setQuickAdd((prev) => ({
                    ...prev,
                    startTime: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide">
                End time
              </Label>
              <Input
                type="time"
                value={quickAdd.endTime}
                onChange={(e) =>
                  setQuickAdd((prev) => ({
                    ...prev,
                    endTime: e.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-end sm:col-span-2 lg:col-span-1">
              <Button
                size="sm"
                className="w-full whitespace-nowrap lg:w-auto"
                onClick={handleQuickAdd}
                disabled={employeesLoading || scheduleLoading}
              >
                Save & schedule
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border-border/60 bg-card/80 shadow-sm">
        <div className={CARD_DECOR_CLASSES} aria-hidden="true" />
        <CardHeader className="pb-3">
          <div className={HEADER_LAYOUT_CLASSES}>
            <div className="space-y-2">
              <div className={ACCENT_CONTAINER_CLASSES}>
                <Users className={ACCENT_ICON_CLASSES} aria-hidden="true" />
                <span
                  className={ACCENT_TITLE_CLASSES}
                  aria-label="Team Directory"
                >
                  Team Directory
                </span>
              </div>
              <CardDescription className={ACCENT_DESCRIPTION_CLASSES}>
                View, edit, or archive employees in your roster.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <div className="relative w-full sm:w-56">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={teamSearch}
                  onChange={(event) => setTeamSearch(event.target.value)}
                  placeholder="Search team..."
                  className="h-9 w-full pl-9 text-sm"
                  aria-label="Search team directory"
                />
              </div>
              <Badge
                variant="outline"
                className="text-[11px] uppercase tracking-wide"
              >
                {employees.length} team members
              </Badge>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  if (typeof onOpenArchivedEmployees === 'function') {
                    onOpenArchivedEmployees();
                  }
                }}
              >
                <Archive className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">
                  Archived
                  {archivedEmployees.length
                    ? ` (${archivedEmployees.length})`
                    : ''}
                </span>
                <span className="sr-only">Archived employees</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  if (typeof onOpenManageEmployees === 'function') {
                    onOpenManageEmployees();
                  }
                }}
              >
                <Edit2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Manage</span>
                <span className="sr-only">Manage employees</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredEmployees.length ? (
            <div className="space-y-2">
              {filteredEmployees.map((emp) => {
                const statusKey = (emp.status || 'active').toLowerCase();
                const statusLabel = statusKey
                  ? statusKey.charAt(0).toUpperCase() + statusKey.slice(1)
                  : 'Active';
                const initials = getInitials(emp.name || '');
                const roleLabel = String(emp.position || 'No role');
                const hourlyRate = Number(emp.hourlyRate ?? 0);
                const hourlyRateLabel = Number.isFinite(hourlyRate)
                  ? hourlyRate.toFixed(2)
                  : '0.00';
                const contactLabel = emp.contact || 'N/A';
                return (
                  <div
                    key={emp.id}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-gradient-to-br from-muted/30 via-card to-muted/10 px-3 py-3 shadow-sm transition hover:border-primary/30 hover:shadow-md"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">
                            {emp.name || 'Unnamed employee'}
                          </p>
                          <Badge
                            className={cn(
                              'text-[10px] uppercase tracking-wide',
                              STATUS_BADGE_STYLES[statusKey] ||
                                STATUS_BADGE_STYLES.active
                            )}
                          >
                            {statusLabel}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground mt-1">
                          <span className="whitespace-nowrap">
                            Role: {roleLabel}
                          </span>
                          <span className="text-muted-foreground/60">|</span>
                          <span className="whitespace-nowrap">
                            Hourly rate: {hourlyRateLabel}
                          </span>
                          <span className="text-muted-foreground/60">|</span>
                          <span className="whitespace-nowrap">
                            Contact: {contactLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          typeof onManageEmployee === 'function'
                            ? onManageEmployee(emp)
                            : undefined
                        }
                        disabled={employeesLoading}
                      >
                        <Edit className="h-4 w-4" aria-hidden="true" />
                        <span className="hidden sm:inline">Edit</span>
                        <span className="sr-only">Edit employee</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-destructive hover:text-destructive"
                        onClick={() =>
                          typeof onArchiveEmployee === 'function'
                            ? onArchiveEmployee(emp)
                            : undefined
                        }
                        disabled={employeesLoading || scheduleLoading}
                      >
                        <Archive className="h-4 w-4" aria-hidden="true" />
                        <span className="hidden sm:inline">Archive</span>
                        <span className="sr-only">Archive employee</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : employees.length ? (
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Search className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  No matching employees
                </p>
                <p className="text-xs text-muted-foreground">
                  Try a different name, role, or contact detail.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldPlus className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  No employees yet
                </p>
                <p className="text-xs text-muted-foreground">
                  Add your first team member above to start scheduling shifts.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AddEmployeeTab;
