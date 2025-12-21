import React, { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Archive, Edit, Edit2, ShieldPlus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUsers } from '@/hooks/useUsers';

const STATUS_BADGE_STYLES = {
  active: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  inactive: 'border border-border/60 bg-muted text-muted-foreground',
  pending: 'border border-amber-500/30 bg-amber-500/10 text-amber-700',
};

const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || '??';

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
}) => {
  const { users = [] } = useUsers();
  const [copyFromSelection, setCopyFromSelection] = useState('');
  const staffUsers = useMemo(
    () =>
      users.filter((user) =>
        ['staff', 'manager'].includes((user.role || '').toLowerCase())
      ),
    [users]
  );

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
          position: match.position || prev.position,
        }));
      }
    } else if (type === 'user') {
      const match = staffUsers.find((user) => user.id === id);
      if (match) {
        setQuickAdd((prev) => ({
          ...prev,
          name: match.name || prev.name,
          position: match.role || prev.position,
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
      <Card className="border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldPlus className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  Add Employee and Schedule
                </CardTitle>
                <CardDescription className="text-xs">
                  Create a teammate and set their first schedule in one flow.
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="text-[11px] uppercase tracking-wide"
            >
              Quick setup
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide">
                Copy from
              </Label>
              <div className="relative">
                <select
                  className={cn(
                    'w-full appearance-none rounded-md border-input bg-background px-3 py-2 text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-primary/40'
                  )}
                  value={copyFromSelection}
                  onChange={(event) => handleCopyFromChange(event.target.value)}
                >
                  <option value="">Start with blank profile</option>
                  {employees.length ? (
                    <optgroup label="Existing employees">
                      {employees.map((emp) => (
                        <option key={emp.id} value={`employee:${emp.id}`}>
                          {emp.name} - {emp.position || 'No role'}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {staffUsers.length ? (
                    <optgroup label="App users (staff/manager)">
                      {staffUsers.map((user) => (
                        <option key={user.id} value={`user:${user.id}`}>
                          {user.name} - {user.role || 'Staff'}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground/70">
                  v
                </span>
              </div>
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
              <Label className="text-xs uppercase tracking-wide">Role</Label>
              <Input
                value={quickAdd.position}
                onChange={(e) =>
                  setQuickAdd((prev) => ({
                    ...prev,
                    position: e.target.value,
                  }))
                }
                placeholder="Barista"
              />
            </div>
          </div>
          <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
              <Label className="text-xs uppercase tracking-wide">Days</Label>
              <div className="grid grid-cols-3 gap-2">
                {(daysOfWeek || [])
                  .filter((day) => String(day || '').toLowerCase() !== 'sunday')
                  .map((day) => {
                    const selected =
                      Array.isArray(quickAdd.repeatDays) &&
                      quickAdd.repeatDays.includes(day);
                    return (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(
                          'h-8 w-full rounded-full px-0 text-[11px] font-semibold uppercase',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'border-border/60 bg-background text-foreground hover:bg-muted/40'
                        )}
                        key={day}
                        onClick={() => {
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

      <Card className="border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  Team directory
                </CardTitle>
                <CardDescription className="text-xs">
                  View, edit, or archive employees in your roster.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
          {employees.length ? (
            <div className="space-y-2">
              {employees.map((emp) => {
                const statusKey = (emp.status || 'active').toLowerCase();
                const statusLabel = statusKey
                  ? statusKey.charAt(0).toUpperCase() + statusKey.slice(1)
                  : 'Active';
                const initials = getInitials(emp.name || '');
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
                        <p className="truncate text-xs text-muted-foreground">
                          {(emp.position || 'No role').toString()}
                        </p>
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
                        className="gap-2 text-muted-foreground hover:text-foreground"
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
