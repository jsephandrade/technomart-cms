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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus } from 'lucide-react';

const CAPACITY_STYLES = {
  available: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  full: 'border border-destructive/30 bg-destructive/10 text-destructive',
  missing: 'border border-amber-500/30 bg-amber-500/10 text-amber-700',
};

const AddScheduleDialog = ({
  open,
  onOpenChange,
  newScheduleEntry,
  setNewScheduleEntry,
  employeeList,
  daysOfWeek,
  onAddSchedule,
  capacityStatus,
  showTrigger = true,
}) => {
  const capacityLabel = capacityStatus?.status
    ? capacityStatus.status === 'available'
      ? 'Available'
      : capacityStatus.status === 'full'
        ? 'Full'
        : 'No target'
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button className="flex items-center gap-2">
            <Plus size={16} /> Add Schedule
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Schedule</DialogTitle>
          <DialogDescription>
            Schedule an employee for a shift.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="employee" className="text-right">
              Employee
            </Label>
            <Select
              onValueChange={(value) =>
                setNewScheduleEntry({
                  ...newScheduleEntry,
                  employeeId: value,
                })
              }
              value={newScheduleEntry.employeeId}
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
            <Label htmlFor="day" className="text-right">
              Day
            </Label>
            <Select
              onValueChange={(value) =>
                setNewScheduleEntry({ ...newScheduleEntry, day: value })
              }
              value={newScheduleEntry.day}
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
            <Label htmlFor="startTime" className="text-right">
              Start Time
            </Label>
            <Input
              id="startTime"
              type="time"
              value={newScheduleEntry.startTime}
              onChange={(e) =>
                setNewScheduleEntry({
                  ...newScheduleEntry,
                  startTime: e.target.value,
                })
              }
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="endTime" className="text-right">
              End Time
            </Label>
            <Input
              id="endTime"
              type="time"
              value={newScheduleEntry.endTime}
              onChange={(e) =>
                setNewScheduleEntry({
                  ...newScheduleEntry,
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onAddSchedule}
            disabled={capacityStatus?.status === 'full'}
            title={
              capacityStatus?.status === 'full'
                ? `${capacityStatus.roleLabel} target is full`
                : undefined
            }
          >
            Add Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddScheduleDialog;
