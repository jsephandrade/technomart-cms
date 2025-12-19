import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ShieldPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

const AddEmployeeTab = ({
  quickAdd,
  setQuickAdd,
  handleQuickAdd,
  employeesLoading,
  scheduleLoading,
  canManage,
  daysOfWeek,
}) => {
  if (!canManage) {
    return (
      <div className="text-sm text-muted-foreground">
        Manager access required.
      </div>
    );
  }

  return (
    <Card className="border-dashed border-primary/30 bg-muted/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldPlus className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">
              Add Employee and Shift
            </CardTitle>
          </div>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Inline with Weekly Shift Planner styling
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_auto] items-end">
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
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide">Day</Label>
            <div className="relative">
              <select
                className={cn(
                  'w-full appearance-none rounded-md border-input bg-background text-sm px-3 py-2',
                  'focus:outline-none focus:ring-2 focus:ring-primary/40'
                )}
                value={quickAdd.day}
                onChange={(e) =>
                  setQuickAdd((prev) => ({
                    ...prev,
                    day: e.target.value,
                  }))
                }
              >
                {daysOfWeek.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground/70 text-xs">
                v
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide">Start</Label>
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
            <Label className="text-xs uppercase tracking-wide">End</Label>
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
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              className="whitespace-nowrap"
              onClick={handleQuickAdd}
              disabled={employeesLoading || scheduleLoading}
            >
              Save & schedule
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AddEmployeeTab;
