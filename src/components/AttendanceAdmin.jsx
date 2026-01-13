import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import { useAttendance } from '@/hooks/useAttendance';
import { useEmployees, useSchedule } from '@/hooks/useEmployees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ChevronsUpDown,
  Edit as EditIcon,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
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
} from '@/components/ui/command';

const DEFAULT_ADD_FORM = {
  employeeId: '',
  date: '',
  checkIn: '',
  checkOut: '',
  status: 'present',
  notes: '',
};

const toMinutes = (value) => {
  if (!value) return NaN;
  const match = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return NaN;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
};

export default function AttendanceAdmin() {
  const { hasAnyRole, user } = useAuth();
  const isManager = hasAnyRole(['admin', 'manager']);
  const isAdmin = hasAnyRole(['admin']);
  const {
    records,
    loading,
    setParams,
    updateRecord,
    deleteRecord,
    createRecord,
  } = useAttendance();
  const { employees } = useEmployees();
  const { schedule = [] } = useSchedule({}, { autoFetch: true });
  const [filters, setFilters] = useState({
    employeeId: '_all',
    from: '',
    to: '',
    status: '_any',
  });
  const [editing, setEditing] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(DEFAULT_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [employeeSelectOpen, setEmployeeSelectOpen] = useState(false);

  const selectableEmployees = useMemo(() => {
    const userEmail = (user?.email || '').trim().toLowerCase();
    const userName = (user?.name || '').trim().toLowerCase();
    const userEmployeeId = user?.employeeId || user?.id || '';
    return (employees || [])
      .filter(
        (emp) => emp && emp.status !== 'inactive' && emp.status !== 'pending'
      )
      .filter((emp) => {
        if (!emp?.id) return false;
        if (userEmployeeId && String(emp.id) === String(userEmployeeId)) {
          return false;
        }
        const contact = (emp.contact || '').trim().toLowerCase();
        const name = (emp.name || '').trim().toLowerCase();
        if (userEmail && contact === userEmail) return false;
        if (userName && name === userName) return false;
        return true;
      })
      .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [employees, user?.email, user?.employeeId, user?.id, user?.name]);

  const selectedEmployee = useMemo(
    () => selectableEmployees.find((emp) => emp.id === addForm.employeeId),
    [addForm.employeeId, selectableEmployees]
  );

  const selectedSchedule = useMemo(() => {
    if (!addForm.employeeId || !addForm.date) return null;
    const rawDate = `${addForm.date}T00:00:00`;
    const dayLabel = new Date(rawDate).toLocaleDateString('en-US', {
      weekday: 'long',
    });
    return (
      schedule.find(
        (entry) =>
          entry?.employeeId === addForm.employeeId && entry?.day === dayLabel
      ) || null
    );
  }, [addForm.date, addForm.employeeId, schedule]);

  const canSaveAttendance = Boolean(
    addForm.employeeId && addForm.date && selectedSchedule && !addSaving
  );

  const resolveStatus = (checkIn) => {
    if (!checkIn || !selectedSchedule?.startTime) return 'present';
    const scheduled = toMinutes(selectedSchedule.startTime);
    const actual = toMinutes(checkIn);
    if (!Number.isFinite(scheduled) || !Number.isFinite(actual))
      return 'present';
    return actual > scheduled ? 'late' : 'present';
  };

  useEffect(() => {
    if (!isManager) return;
    const payload = {
      employeeId: filters.employeeId === '_all' ? '' : filters.employeeId,
      from: filters.from || '',
      to: filters.to || '',
      status: filters.status === '_any' ? '' : filters.status,
    };
    setParams(payload);
  }, [filters, isManager, setParams]);

  useEffect(() => {
    if (!addOpen) {
      setAddForm(DEFAULT_ADD_FORM);
      setEmployeeSelectOpen(false);
      return;
    }
    if (selectedSchedule) {
      setAddForm((prev) => {
        const next = { ...prev };
        if (!prev.checkIn) {
          next.checkIn = selectedSchedule.startTime || '';
        }
        if (!prev.checkOut) {
          next.checkOut = selectedSchedule.endTime || '';
        }
        if (prev.status !== 'absent') {
          next.status = resolveStatus(next.checkIn);
        }
        return next;
      });
    }
  }, [addOpen, selectedSchedule]);

  if (!isManager) {
    return null;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <FeaturePanelCard
        badgeText="Attendance Records"
        description="Review and manage employee attendance"
        headerActions={
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Attendance
          </Button>
        }
        contentClassName="space-y-4"
      >
        <div className="grid grid-cols-1 gap-3 items-end md:grid-cols-5">
          <div>
            <Label>Employee</Label>
            <Select
              value={filters.employeeId}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, employeeId: v }))
              }
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>From</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.from}
              onChange={(e) =>
                setFilters((f) => ({ ...f, from: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>To</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.to}
              onChange={(e) =>
                setFilters((f) => ({ ...f, to: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={filters.status}
              onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_any">Any</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="late">Late</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(records || []).length === 0 && !loading && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No attendance records found.
                  </TableCell>
                </TableRow>
              )}
              {(records || []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.employeeName || r.employeeId}</TableCell>
                  <TableCell>{r.checkIn || '-'}</TableCell>
                  <TableCell>{r.checkOut || '-'}</TableCell>
                  <TableCell className="capitalize">
                    <Badge
                      variant="outline"
                      className={
                        r.status === 'present'
                          ? 'border-green-300 text-green-700'
                          : r.status === 'late'
                            ? 'border-amber-300 text-amber-700'
                            : r.status === 'absent'
                              ? 'border-red-300 text-red-700'
                              : ''
                      }
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate">
                    {r.notes || '-'}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing({ ...r })}
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                    </Button>
                    {isAdmin ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          try {
                            await deleteRecord(r.id);
                            toast.success('Deleted');
                          } catch {
                            toast.error('Failed to delete');
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {loading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading...
            </div>
          )}
        </div>
      </FeaturePanelCard>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Attendance</DialogTitle>
            <DialogDescription>
              Log attendance for a scheduled employee shift.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">Employee</Label>
              <Popover
                open={employeeSelectOpen}
                onOpenChange={setEmployeeSelectOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="col-span-3 h-9 justify-between text-xs"
                  >
                    <span className="truncate">
                      {selectedEmployee?.name || 'Select employee'}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search employees..." />
                    <CommandList className="max-h-64 overflow-y-auto">
                      <CommandEmpty>No employees found.</CommandEmpty>
                      <CommandGroup>
                        {selectableEmployees.map((emp) => (
                          <CommandItem
                            key={emp.id}
                            value={`${emp.name} ${emp.position} ${emp.contact}`}
                            onSelect={() => {
                              setAddForm((prev) => ({
                                ...prev,
                                employeeId: emp.id,
                              }));
                              setEmployeeSelectOpen(false);
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">
                                {emp.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {emp.position || 'Unassigned'}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">Date</Label>
              <Input
                type="date"
                className="col-span-3 h-9 text-xs"
                value={addForm.date}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {!addForm.employeeId || !addForm.date ? (
                <span>Select an employee and date to load the schedule.</span>
              ) : selectedSchedule ? (
                <span>
                  Scheduled shift: {selectedSchedule.startTime} -{' '}
                  {selectedSchedule.endTime}
                </span>
              ) : (
                <span className="text-destructive">
                  No scheduled shift found for this date.
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">Check In</Label>
              <Input
                type="time"
                className="col-span-3 h-9 text-xs"
                value={addForm.checkIn}
                onChange={(e) =>
                  setAddForm((prev) => {
                    const next = { ...prev, checkIn: e.target.value };
                    if (next.status !== 'absent') {
                      next.status = resolveStatus(next.checkIn);
                    }
                    return next;
                  })
                }
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">Check Out</Label>
              <Input
                type="time"
                className="col-span-3 h-9 text-xs"
                value={addForm.checkOut}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, checkOut: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">Status</Label>
              <Select
                value={addForm.status}
                onValueChange={(value) =>
                  setAddForm((prev) => ({ ...prev, status: value }))
                }
              >
                <SelectTrigger className="col-span-3 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">Notes</Label>
              <Input
                className="col-span-3 h-9 text-xs"
                value={addForm.notes}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!canSaveAttendance}
              onClick={async () => {
                if (!selectedSchedule) {
                  toast.error(
                    'Assign a schedule entry before adding attendance.'
                  );
                  return;
                }
                setAddSaving(true);
                try {
                  await createRecord({
                    employeeId: addForm.employeeId,
                    date: addForm.date,
                    checkIn: addForm.checkIn || null,
                    checkOut: addForm.checkOut || null,
                    status: addForm.status,
                    notes: addForm.notes || '',
                  });
                  toast.success('Attendance added');
                  setAddOpen(false);
                } catch {
                  toast.error('Failed to add attendance');
                } finally {
                  setAddSaving(false);
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(v) => !v && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Attendance</DialogTitle>
            <DialogDescription>Update status and notes.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">Status</Label>
              <Select
                value={editing?.status || 'present'}
                onValueChange={(v) => setEditing((x) => ({ ...x, status: v }))}
              >
                <SelectTrigger className="col-span-3 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">Notes</Label>
              <Input
                className="col-span-3 h-8 text-xs"
                value={editing?.notes || ''}
                onChange={(e) =>
                  setEditing((x) => ({ ...x, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  if (!editing?.id) {
                    toast.error('Select an attendance record to edit');
                    return;
                  }
                  await updateRecord(editing.id, {
                    status: editing?.status || 'present',
                    notes: editing?.notes || '',
                  });
                  setEditing(null);
                  toast.success('Saved');
                } catch {
                  toast.error('Failed to save');
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
