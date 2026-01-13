import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import userService from '@/api/services/userService';
import { Search, UserRound, Briefcase, Coins, PhoneCall } from 'lucide-react';
import {
  formatPhp,
  resolveEmployeeCompensation,
} from '@/lib/employeeCompensation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, Pencil, Archive, RotateCcw } from 'lucide-react';
const DEFAULT_FORM = {
  userId: '',
  name: '',
  position: '',
  contact: '',
  status: 'active',
};
const statusBadgeMap = {
  active: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
  inactive: 'bg-muted text-muted-foreground border border-border/60',
};
const EmployeeDirectoryPanel = ({
  employees = [],
  loading = false,
  onCreateEmployee,
  onUpdateEmployee,
  onToggleEmployeeStatus,
  canManage = false,
}) => {
  const [filters, setFilters] = useState({
    search: '',
    status: '_all',
    position: '_all',
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formState, setFormState] = useState({ ...DEFAULT_FORM });
  const [userOptions, setUserOptions] = useState([]);
  const [userOptionsLoading, setUserOptionsLoading] = useState(false);
  const [userOptionsError, setUserOptionsError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const positionOptions = useMemo(() => {
    const unique = new Set();
    employees.forEach((emp) => {
      if (emp?.position) unique.add(emp.position);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const sortedEmployees = useMemo(() => {
    let data = [...employees];

    // Status filter
    if (filters.status !== '_all') {
      const target = filters.status;
      data = data.filter(
        (emp) => (emp.status || 'active').toLowerCase() === target
      );
    }

    // Position filter
    if (filters.position !== '_all') {
      const target = filters.position.toLowerCase();
      data = data.filter(
        (emp) => (emp.position || '').toLowerCase() === target
      );
    }

    // Text search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      data = data.filter(
        (emp) =>
          (emp.name || '').toLowerCase().includes(q) ||
          (emp.position || '').toLowerCase().includes(q) ||
          (emp.contact || '').toLowerCase().includes(q) ||
          String(emp.monthlySalary ?? '')
            .toLowerCase()
            .includes(q)
      );
    }

    return data.sort((a, b) => {
      const statusPriority = {
        active: 0,
        pending: 1,
        inactive: 2,
      };
      const statusDiff =
        (statusPriority[a?.status] ?? 3) - (statusPriority[b?.status] ?? 3);
      if (statusDiff !== 0) return statusDiff;
      return (a?.name || '').localeCompare(b?.name || '');
    });
  }, [employees, filters]);
  const handleDialogOpenChange = (open) => {
    if (!open) {
      setEditingId(null);
      setFormState({ ...DEFAULT_FORM });
      setUserSearch('');
      setUserOptions([]);
      setUserOptionsError('');
    }
    setDialogOpen(open);
  };
  const handleStartCreate = () => {
    if (!canManage) return;
    setEditingId(null);
    setFormState({ ...DEFAULT_FORM });
    setDialogOpen(true);
  };
  const handleStartEdit = (employee) => {
    if (!canManage || !employee) return;
    setEditingId(employee.id);
    setFormState({
      userId: employee.userId || '',
      name: employee.name || '',
      position: employee.position || '',
      contact: employee.contact || '',
      status: employee.status || 'active',
    });
    setDialogOpen(true);
  };
  const handleFormChange = (field, value) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };
  const handleUserSelect = (value) => {
    const selected = userOptions.find((u) => String(u.id) === String(value));
    setFormState((prev) => ({
      ...prev,
      userId: value,
      name: selected?.name || prev.name,
      contact: selected?.email || prev.contact || '',
    }));
  };
  const handleSubmit = async () => {
    if (!canManage) return;
    if (
      typeof onCreateEmployee !== 'function' ||
      typeof onUpdateEmployee !== 'function'
    ) {
      return;
    }
    if (!formState.userId) {
      toast.error('Select an active user account to link');
      return;
    }
    setSubmitting(true);
    const selectedUser =
      userOptions.find((u) => String(u.id) === String(formState.userId)) ||
      null;
    const payload = {
      ...formState,
      name: formState.name || selectedUser?.name || '',
      userId: formState.userId,
      contact: selectedUser?.email || formState.contact || '',
    };
    const success = editingId
      ? await onUpdateEmployee(editingId, payload)
      : await onCreateEmployee(payload);
    setSubmitting(false);
    if (success) {
      handleDialogOpenChange(false);
    }
  };
  useEffect(() => {
    if (!dialogOpen) return undefined;
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        setUserOptionsLoading(true);
        setUserOptionsError('');
        const res = await userService.getActiveUserOptions({
          search: userSearch,
          limit: 100,
        });
        if (cancelled) return;
        setUserOptions(res?.data || []);
      } catch (error) {
        if (cancelled) return;
        setUserOptionsError('Failed to load active users');
      } finally {
        if (!cancelled) setUserOptionsLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [dialogOpen, userSearch]);
  useEffect(() => {
    if (!dialogOpen || !editingId || !formState.userId) return;
    const hasOption = userOptions.some(
      (u) => String(u.id) === String(formState.userId)
    );
    if (!hasOption) {
      const fallback = employees.find(
        (e) => String(e.id) === String(editingId)
      );
      if (fallback && fallback.userId) {
        setUserOptions((prev) => [
          ...prev,
          {
            id: fallback.userId,
            name: fallback.userName || fallback.name || fallback.contact || '',
            email: fallback.userEmail || fallback.contact || '',
            role: fallback.userRole || '',
            status: fallback.userStatus || 'active',
            label:
              fallback.userName || fallback.userEmail || fallback.contact || '',
          },
        ]);
      }
    }
  }, [dialogOpen, editingId, formState.userId, employees, userOptions]);
  const handleToggleStatus = async (employee) => {
    if (!canManage || typeof onToggleEmployeeStatus !== 'function') return;
    const nextStatus = employee?.status === 'inactive' ? 'active' : 'inactive';
    await onToggleEmployeeStatus(employee, nextStatus);
  };
  const { monthlySalary, dailyRate } = resolveEmployeeCompensation({
    position: formState.position,
  });
  const renderRows = () => {
    if (loading) {
      return Array.from({ length: 4 }).map((_, index) => (
        <TableRow key={`employee-skeleton-${index}`}>
          <TableCell colSpan={5}>
            <Skeleton className="h-10 w-full rounded-md" />
          </TableCell>
        </TableRow>
      ));
    }
    if (sortedEmployees.length === 0) {
      return (
        <TableRow>
          <TableCell
            colSpan={5}
            className="py-10 text-center text-sm text-muted-foreground"
          >
            No employees found. {canManage ? 'Add your first teammate.' : ''}
          </TableCell>
        </TableRow>
      );
    }
    return sortedEmployees.map((employee) => {
      const { monthlySalary, dailyRate } =
        resolveEmployeeCompensation(employee);
      return (
        <TableRow key={employee.id}>
          <TableCell className="font-semibold">{employee.name}</TableCell>
          <TableCell className="text-muted-foreground">
            {employee.position || 'N/A'}
          </TableCell>
          <TableCell>
            <div className="font-semibold">{formatPhp(monthlySalary)}</div>
            <div className="text-xs text-muted-foreground">
              Daily: {formatPhp(dailyRate, { maximumFractionDigits: 2 })}
            </div>
          </TableCell>
          <TableCell>
            <Badge
              className={
                statusBadgeMap[employee.status] ||
                'bg-muted text-muted-foreground'
              }
            >
              {employee.status
                ? employee.status.charAt(0).toUpperCase() +
                  employee.status.slice(1)
                : 'Unknown'}
            </Badge>
          </TableCell>
          <TableCell className="flex items-center gap-2">
            {canManage ? (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => handleStartEdit(employee)}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Edit employee</span>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => handleToggleStatus(employee)}
                >
                  {employee.status === 'inactive' ? (
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Archive className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {employee.status === 'inactive'
                      ? 'Restore employee'
                      : 'Archive employee'}
                  </span>
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Read only</span>
            )}
          </TableCell>
        </TableRow>
      );
    });
  };
  return (
    <div className="space-y-4 rounded-3xl border border-border/70 bg-card/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Employee List</h2>
          <p className="text-sm text-muted-foreground">
            Keep your roster up to date before assigning shifts.
          </p>
        </div>
        {canManage ? (
          <Button className="gap-2" size="sm" onClick={handleStartCreate}>
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Add Employee
          </Button>
        ) : null}
      </div>
      <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="employee-filter-search" className="text-xs">
              Search by name, role, or contact
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="employee-filter-search"
                placeholder="Type to filter employees..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, search: e.target.value }))
                }
                className="h-9 pl-9"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="employee-filter-status" className="text-xs">
              Status
            </Label>
            <Select
              value={filters.status}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, status: value }))
              }
            >
              <SelectTrigger id="employee-filter-status" className="h-9">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="employee-filter-position" className="text-xs">
              Role / Position
            </Label>
            <Select
              value={filters.position}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, position: value }))
              }
            >
              <SelectTrigger id="employee-filter-position" className="h-9">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All roles</SelectItem>
                {positionOptions.map((pos) => (
                  <SelectItem key={pos} value={pos}>
                    {pos}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Monthly Salary</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderRows()}</TableBody>
        </Table>
      </div>
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Update Employee' : 'Add Employee'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Edit the selected employee details.'
                : 'Create a new employee entry for scheduling.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="employee-user">User account</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="employee-user-search"
                  placeholder="Search active users by name or email"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  disabled={userOptionsLoading}
                  className="pl-9"
                />
              </div>
              <Select
                value={formState.userId}
                onValueChange={handleUserSelect}
                disabled={userOptionsLoading}
              >
                <SelectTrigger
                  id="employee-user"
                  className="relative pl-10 pr-9"
                >
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <SelectValue
                    placeholder={
                      userOptionsLoading ? 'Loading users...' : 'Select user'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {userOptionsLoading ? (
                    <SelectItem value="__loading" disabled>
                      Loading users...
                    </SelectItem>
                  ) : null}
                  {!userOptionsLoading && userOptions.length === 0 ? (
                    <SelectItem value="__empty" disabled>
                      No active users found
                    </SelectItem>
                  ) : null}
                  {userOptions.map((user) => (
                    <SelectItem
                      key={user.id}
                      value={user.id}
                      textValue={user.name || user.email}
                    >
                      {user.name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only active staff and manager accounts can be linked.
              </p>
              {userOptionsError ? (
                <p className="text-xs text-destructive">{userOptionsError}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-position">Role / Position</Label>
              <div className="relative">
                <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="employee-position"
                  value={formState.position}
                  onChange={(event) =>
                    handleFormChange('position', event.target.value)
                  }
                  placeholder="e.g. Barista"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Compensation (role-based)</Label>
                <div className="relative rounded-md border border-border/60 bg-muted/40 px-3 py-2 pl-9">
                  <Coins className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <div className="text-sm font-semibold">
                    {formatPhp(monthlySalary)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Daily: {formatPhp(dailyRate, { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-status">Status</Label>
                <Select
                  value={formState.status}
                  onValueChange={(value) => handleFormChange('status', value)}
                >
                  <SelectTrigger id="employee-status" className="pl-9">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-contact">Contact details</Label>
              <div className="relative">
                <PhoneCall className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="employee-contact"
                  value={formState.contact}
                  onChange={(event) =>
                    handleFormChange('contact', event.target.value)
                  }
                  placeholder="Email or phone"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {editingId ? 'Save changes' : 'Add employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default EmployeeDirectoryPanel;
