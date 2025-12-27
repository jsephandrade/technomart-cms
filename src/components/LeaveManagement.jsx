import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthContext';
import { useLeaves } from '@/hooks/useAttendance';
import { useEmployees } from '@/hooks/useEmployees';
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
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
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
  CheckCircle2,
  Edit as EditIcon,
  Loader2,
  Plane,
  Trash2,
  XCircle,
} from 'lucide-react';

export default function LeaveManagement() {
  const { user, hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['admin']);
  const isRequester = !isAdmin;
  const {
    records,
    loading,
    setParams,
    createRecord,
    updateRecord,
    deleteRecord,
  } = useLeaves({}, { autoFetch: isAdmin, suppressErrorToast: !isAdmin });
  const { employees } = useEmployees();

  const [filters, setFilters] = useState({
    employeeId: '_all',
    status: '_any',
    type: '_any',
  });
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  // Auto-apply filters when inputs change
  useEffect(() => {
    const payload = {
      employeeId: filters.employeeId === '_all' ? '' : filters.employeeId,
      status: filters.status === '_any' ? '' : filters.status,
      type: filters.type === '_any' ? '' : filters.type,
    };
    setParams(payload);
  }, [filters, setParams]);

  const onAdd = () => {
    setEditing({
      id: null,
      employeeId: '',
      startDate: '',
      endDate: '',
      type: 'other',
      status: 'pending',
      reason: '',
    });
    setOpen(true);
  };
  const onEdit = (rec) => {
    setEditing({ ...rec });
    setOpen(true);
  };
  const onDelete = async (id) => {
    try {
      await deleteRecord(id);
      toast.success('Leave deleted');
    } catch (e) {
      toast.error('Failed to delete');
    }
  };
  const onApprove = async (rec) => {
    try {
      await updateRecord(rec.id, { status: 'approved' });
      toast.success('Leave approved');
    } catch (e) {
      toast.error('Failed to approve');
    }
  };
  const onReject = async (rec) => {
    try {
      await updateRecord(rec.id, { status: 'rejected' });
      toast.success('Leave rejected');
    } catch (e) {
      toast.error('Failed to reject');
    }
  };

  const onSave = async () => {
    try {
      if (!editing.employeeId || !editing.startDate || !editing.endDate) {
        toast.error('Employee, start and end dates are required');
        return;
      }
      const payload = { ...editing };
      if (!isAdmin) {
        payload.status = 'pending';
        if (selfEmployee?.id) {
          payload.employeeId = selfEmployee.id;
        } else {
          toast.error(
            'No employee profile found. Please contact your manager.'
          );
          return;
        }
      }
      if (!editing.id) await createRecord(payload);
      else await updateRecord(editing.id, editing);
      setOpen(false);
      toast.success('Saved');
    } catch (e) {
      toast.error('Failed to save');
    }
  };

  const employeeMap = useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e.name])),
    [employees]
  );
  const selfEmployee = useMemo(() => {
    if (user?.employeeId) {
      return {
        id: String(user.employeeId),
        name: user?.name || 'Me',
        position: '',
      };
    }
    const email = (user?.email || '').trim().toLowerCase();
    const name = (user?.name || '').trim().toLowerCase();
    let found = null;
    if (email)
      found =
        employees.find(
          (e) => (e.contact || '').trim().toLowerCase() === email
        ) || null;
    if (!found && name)
      found =
        employees.find((e) => (e.name || '').trim().toLowerCase() === name) ||
        null;
    return found;
  }, [user?.employeeId, user?.name, employees, user?.email]);

  useEffect(() => {
    if (!isAdmin && selfEmployee?.id) {
      setEditing((prev) => {
        const base = prev || {
          id: null,
          employeeId: '',
          startDate: '',
          endDate: '',
          type: 'other',
          status: 'pending',
          reason: '',
        };
        if (base.employeeId === selfEmployee.id) return base;
        return { ...base, employeeId: selfEmployee.id };
      });
    }
  }, [isAdmin, selfEmployee?.id]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Leave request form */}
      {isRequester && (
        <FeaturePanelCard
          badgeText="Leave Request"
          badgeIcon={Plane}
          description="Submit a leave request for review"
          className="w-full"
          contentClassName="space-y-3"
        >
          {/* Compact, left-aligned form */}
          <div className="grid gap-2 py-1">
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">Type</Label>
              <Select
                value={editing?.type || 'other'}
                onValueChange={(v) =>
                  setEditing((x) => ({
                    ...(x || {
                      id: null,
                      employeeId: '',
                      startDate: '',
                      endDate: '',
                      type: 'other',
                      status: 'pending',
                      reason: '',
                    }),
                    type: v,
                  }))
                }
              >
                <SelectTrigger className="col-span-3 max-w-[14rem] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="vacation">Vacation</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="bereavement">Bereavement</SelectItem>
                  <SelectItem value="maternity">Maternity</SelectItem>
                  <SelectItem value="paternity">Paternity</SelectItem>
                  <SelectItem value="training">Training</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">Start</Label>
              <Input
                type="date"
                className="col-span-3 max-w-[14rem] h-8 text-xs"
                value={editing?.startDate || ''}
                onChange={(e) =>
                  setEditing((x) => ({
                    ...(x || {
                      id: null,
                      employeeId: '',
                      startDate: '',
                      endDate: '',
                      type: 'other',
                      status: 'pending',
                      reason: '',
                    }),
                    startDate: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">End</Label>
              <Input
                type="date"
                className="col-span-3 max-w-[14rem] h-8 text-xs"
                value={editing?.endDate || ''}
                onChange={(e) =>
                  setEditing((x) => ({
                    ...(x || {
                      id: null,
                      employeeId: '',
                      startDate: '',
                      endDate: '',
                      type: 'other',
                      status: 'pending',
                      reason: '',
                    }),
                    endDate: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">Reason</Label>
              <Input
                className="col-span-3 max-w-[14rem] h-8 text-xs"
                value={editing?.reason || ''}
                onChange={(e) =>
                  setEditing((x) => ({
                    ...(x || {
                      id: null,
                      employeeId: '',
                      startDate: '',
                      endDate: '',
                      type: 'other',
                      status: 'pending',
                      reason: '',
                    }),
                    reason: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(null)}
            >
              Clear
            </Button>
            <Button size="sm" onClick={onSave}>
              Submit
            </Button>
          </div>
        </FeaturePanelCard>
      )}

      {isAdmin && (
        <FeaturePanelCard
          badgeText="Leave Requests"
          badgeIcon={Plane}
          description="Request and manage leave"
          headerActions={
            <Button onClick={onAdd} className="shrink-0">
              Add Leave
            </Button>
          }
          contentClassName="space-y-4"
        >
          <div className="grid grid-cols-1 gap-3 items-end md:grid-cols-4">
            <div>
              <Label>Employee</Label>
              <Select
                value={filters.employeeId}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, employeeId: v }))
                }
              >
                <SelectTrigger className="w-full">
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
              <Label>Type</Label>
              <Select
                value={filters.type}
                onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any</SelectItem>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="vacation">Vacation</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="bereavement">Bereavement</SelectItem>
                  <SelectItem value="maternity">Maternity</SelectItem>
                  <SelectItem value="paternity">Paternity</SelectItem>
                  <SelectItem value="training">Training</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Any</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  {isAdmin && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(records || []).length === 0 && !loading && (
                  <TableRow>
                    <TableCell
                      colSpan={isAdmin ? 7 : 6}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No leave records found.
                    </TableCell>
                  </TableRow>
                )}
                {(records || []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.employeeName || employeeMap[r.employeeId] || '—'}
                    </TableCell>
                    <TableCell className="capitalize">{r.type}</TableCell>
                    <TableCell>{r.startDate}</TableCell>
                    <TableCell>{r.endDate}</TableCell>
                    <TableCell className="capitalize">
                      <Badge
                        variant="outline"
                        className={
                          r.status === 'approved'
                            ? 'border-green-300 text-green-700'
                            : r.status === 'pending'
                              ? 'border-amber-300 text-amber-700'
                              : r.status === 'rejected'
                                ? 'border-red-300 text-red-700'
                                : ''
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate">
                      {r.reason || '—'}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right space-x-2">
                        {r.status !== 'pending' ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onEdit(r)}
                            >
                              <EditIcon className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => onDelete(r.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                        {r.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => onApprove(r)}
                              className="gap-2 border border-emerald-600 bg-white text-emerald-700 hover:bg-emerald-50"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => onReject(r)}
                              className="gap-2 border border-red-600 bg-white text-red-700 hover:bg-red-50"
                            >
                              <XCircle className="h-4 w-4" />
                              Reject
                            </Button>
                          </>
                        )}
                      </TableCell>
                    )}
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
      )}

      {isAdmin && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing?.id ? 'Edit Leave' : 'Add Leave'}
              </DialogTitle>
              <DialogDescription>Manage employee leave.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-4 items-center gap-3">
                <Label className="text-right">Employee</Label>
                <Select
                  value={editing?.employeeId || ''}
                  onValueChange={(v) =>
                    setEditing((x) => ({ ...x, employeeId: v }))
                  }
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-3">
                <Label className="text-right">Type</Label>
                <Select
                  value={editing?.type || 'other'}
                  onValueChange={(v) => setEditing((x) => ({ ...x, type: v }))}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sick">Sick</SelectItem>
                    <SelectItem value="vacation">Vacation</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="bereavement">Bereavement</SelectItem>
                    <SelectItem value="maternity">Maternity</SelectItem>
                    <SelectItem value="paternity">Paternity</SelectItem>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-3">
                <Label className="text-right">Start</Label>
                <Input
                  type="date"
                  className="col-span-3"
                  value={editing?.startDate || ''}
                  onChange={(e) =>
                    setEditing((x) => ({ ...x, startDate: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-3">
                <Label className="text-right">End</Label>
                <Input
                  type="date"
                  className="col-span-3"
                  value={editing?.endDate || ''}
                  onChange={(e) =>
                    setEditing((x) => ({ ...x, endDate: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-3">
                <Label className="text-right">Status</Label>
                <Select
                  value={editing?.status || 'pending'}
                  onValueChange={(v) =>
                    setEditing((x) => ({ ...x, status: v }))
                  }
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-3">
                <Label className="text-right">Reason</Label>
                <Input
                  className="col-span-3"
                  value={editing?.reason || ''}
                  onChange={(e) =>
                    setEditing((x) => ({ ...x, reason: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onSave}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
