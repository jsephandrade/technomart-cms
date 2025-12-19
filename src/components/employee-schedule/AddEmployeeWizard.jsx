import React, { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const defaultScheduleRow = {
  day: 'Monday',
  startTime: '08:00',
  endTime: '16:00',
};

const AddEmployeeWizard = ({ onCreate, loading = false }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    position: '',
    contact: '',
    hourlyRate: '',
    status: 'active',
  });
  const [scheduleRows, setScheduleRows] = useState([defaultScheduleRow]);

  const canNext = useMemo(() => form.name.trim().length > 0, [form.name]);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateScheduleRow = (idx, key, value) => {
    setScheduleRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [key]: value } : row))
    );
  };

  const addRow = () => {
    setScheduleRows((prev) => [...prev, defaultScheduleRow]);
  };

  const removeRow = (idx) => {
    setScheduleRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!canNext) {
      toast.error('Name is required');
      return;
    }
    const filteredSchedule = scheduleRows
      .filter((row) => row.day && row.startTime && row.endTime)
      .map((row) => ({
        day: row.day,
        startTime: row.startTime,
        endTime: row.endTime,
      }));
    try {
      await onCreate({
        ...form,
        hourlyRate: Number(form.hourlyRate || 0),
        schedule: filteredSchedule,
      });
      setForm({
        name: '',
        position: '',
        contact: '',
        hourlyRate: '',
        status: 'active',
      });
      setScheduleRows([defaultScheduleRow]);
      setStep(1);
    } catch (error) {
      // onCreate should surface errors; no-op here
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Employee</CardTitle>
        <CardDescription>Step {step} of 2</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-2">
                <Label>Role/Position</Label>
                <Input
                  value={form.position}
                  onChange={(e) => updateForm('position', e.target.value)}
                  placeholder="Barista"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact (email/phone)</Label>
                <Input
                  value={form.contact}
                  onChange={(e) => updateForm('contact', e.target.value)}
                  placeholder="contact@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Hourly Rate</Label>
                <Input
                  type="number"
                  value={form.hourlyRate}
                  onChange={(e) => updateForm('hourlyRate', e.target.value)}
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  className="border-input bg-transparent text-sm rounded-md px-3 py-2"
                  value={form.status}
                  onChange={(e) => updateForm('status', e.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button disabled={!canNext} onClick={() => setStep(2)}>
                Continue to Schedule
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm">Assign weekly shifts</h4>
                <p className="text-xs text-muted-foreground">
                  Add day/time ranges for this employee
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={addRow}>
                Add shift
              </Button>
            </div>
            <div className="space-y-3">
              {scheduleRows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] items-end rounded-md border p-3"
                >
                  <div className="space-y-2">
                    <Label>Day</Label>
                    <select
                      className="border-input bg-transparent text-sm rounded-md px-3 py-2"
                      value={row.day}
                      onChange={(e) =>
                        updateScheduleRow(idx, 'day', e.target.value)
                      }
                    >
                      {DAYS_OF_WEEK.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Start</Label>
                    <Input
                      type="time"
                      value={row.startTime}
                      onChange={(e) =>
                        updateScheduleRow(idx, 'startTime', e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End</Label>
                    <Input
                      type="time"
                      value={row.endTime}
                      onChange={(e) =>
                        updateScheduleRow(idx, 'endTime', e.target.value)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={scheduleRows.length === 1}
                      onClick={() => removeRow(idx)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                Save employee
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AddEmployeeWizard;
