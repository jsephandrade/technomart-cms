import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const CAPACITY_STYLES = {
  available: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  full: 'border border-destructive/30 bg-destructive/10 text-destructive',
  missing: 'border border-amber-500/30 bg-amber-500/10 text-amber-700',
};

const EditScheduleDialog = ({
  editingSchedule,
  setEditingSchedule,
  daysOfWeek,
  employeeList,
  capacityStatus,
  onSave,
}) => {
  if (!editingSchedule) return null;

  const capacityLabel = capacityStatus?.status
    ? capacityStatus.status === 'available'
      ? 'Available'
      : capacityStatus.status === 'full'
        ? 'Full'
        : 'No target'
    : null;

  return (
    <Dialog
      open={!!editingSchedule}
      onOpenChange={(open) => !open && setEditingSchedule(null)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Schedule</DialogTitle>
          <DialogDescription>Update the employee's schedule.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-employee" className="text-right">
              Employee
            </Label>
            <Select
              onValueChange={(value) => {
                const employee = employeeList.find((emp) => emp.id === value);
                setEditingSchedule({
                  ...editingSchedule,
                  employeeId: value,
                  employeeName: employee?.name || '',
                });
              }}
              value={editingSchedule.employeeId}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select an employee" />
              </SelectTrigger>
              <SelectContent>
                {employeeList.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name} ({employee.position})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-day" className="text-right">
              Day
            </Label>
            <Select
              onValueChange={(value) =>
                setEditingSchedule({ ...editingSchedule, day: value })
              }
              value={editingSchedule.day}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a day" />
              </SelectTrigger>
              <SelectContent>
                {daysOfWeek.map((day) => (
                  <SelectItem key={day} value={day}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-startTime" className="text-right">
              Start Time
            </Label>
            <Input
              id="edit-startTime"
              type="time"
              value={editingSchedule.startTime}
              onChange={(e) =>
                setEditingSchedule({
                  ...editingSchedule,
                  startTime: e.target.value,
                })
              }
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-endTime" className="text-right">
              End Time
            </Label>
            <Input
              id="edit-endTime"
              type="time"
              value={editingSchedule.endTime}
              onChange={(e) =>
                setEditingSchedule({
                  ...editingSchedule,
                  endTime: e.target.value,
                })
              }
              className="col-span-3"
            />
          </div>
          {capacityStatus ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={
                    CAPACITY_STYLES[capacityStatus.status] ||
                    CAPACITY_STYLES.missing
                  }
                >
                  {capacityLabel}
                </Badge>
                <span>
                  {capacityStatus.roleLabel}: {capacityStatus.currentCount}/
                  {capacityStatus.target || 0}
                </span>
              </div>
              <p className="mt-1">
                Targets are set in Team Composition. Requests that exceed the
                limit will require an exception.
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingSchedule(null)}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditScheduleDialog;
