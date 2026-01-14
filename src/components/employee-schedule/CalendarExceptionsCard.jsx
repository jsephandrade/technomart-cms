import React, { useMemo, useState } from 'react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';

const KIND_OPTIONS = [
  {
    value: 'holiday',
    label: 'Holiday',
    badgeClass:
      'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  },
  {
    value: 'no_work',
    label: 'No work day',
    badgeClass: 'border border-amber-500/30 bg-amber-500/10 text-amber-700',
  },
];

const formatDateLabel = (dateValue) => {
  if (!dateValue) return 'No date';
  const parts = String(dateValue).split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${year}-${month}-${day}`;
  }
  return String(dateValue);
};

const CalendarExceptionsCard = ({
  exceptions = [],
  loading = false,
  canManage = false,
  onCreateException,
  onDeleteException,
}) => {
  const [formState, setFormState] = useState({
    date: '',
    name: '',
    kind: 'holiday',
    isWorkdayOverride: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const sortedExceptions = useMemo(() => {
    return [...exceptions].sort((a, b) =>
      String(a?.date || '').localeCompare(String(b?.date || ''))
    );
  }, [exceptions]);

  const handleFormChange = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!canManage || typeof onCreateException !== 'function') return;
    if (!formState.date) {
      toast.error('Select a date');
      return;
    }
    if (!formState.name.trim()) {
      toast.error('Add a name for the holiday or no work day');
      return;
    }
    setSubmitting(true);
    try {
      await onCreateException({
        date: formState.date,
        name: formState.name.trim(),
        kind: formState.kind,
        isWorkdayOverride:
          formState.kind === 'holiday' && formState.isWorkdayOverride,
        scope: 'all',
      });
      setFormState({
        date: '',
        name: '',
        kind: 'holiday',
        isWorkdayOverride: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FeaturePanelCard
      badgeText="Calendar Exceptions"
      badgeIcon={CalendarOff}
      description="Flag holidays and no work days so schedules and attendance follow campus policy."
      contentClassName="space-y-4"
    >
      {canManage ? (
        <div className="space-y-3 rounded-lg border border-border/60 bg-background/80 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="exception-date" className="text-xs">
                Date
              </Label>
              <Input
                id="exception-date"
                type="date"
                value={formState.date}
                onChange={(event) =>
                  handleFormChange('date', event.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exception-type" className="text-xs">
                Type
              </Label>
              <Select
                value={formState.kind}
                onValueChange={(value) => handleFormChange('kind', value)}
              >
                <SelectTrigger id="exception-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="exception-name" className="text-xs">
              Name
            </Label>
            <Input
              id="exception-name"
              placeholder="e.g. Founders Day"
              value={formState.name}
              onChange={(event) => handleFormChange('name', event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="exception-override"
              checked={
                formState.kind === 'holiday' && formState.isWorkdayOverride
              }
              disabled={formState.kind !== 'holiday'}
              onCheckedChange={(value) =>
                handleFormChange('isWorkdayOverride', Boolean(value))
              }
            />
            <Label htmlFor="exception-override" className="text-xs">
              Workday override (holiday but still working)
            </Label>
          </div>
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add exception
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Manager access is required to add or remove calendar exceptions.
        </p>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-xs text-muted-foreground">
            Loading calendar exceptions...
          </div>
        ) : sortedExceptions.length ? (
          sortedExceptions.map((entry) => {
            const option =
              KIND_OPTIONS.find((item) => item.value === entry.kind) ||
              KIND_OPTIONS[0];
            return (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/90 p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{entry.name}</p>
                    <Badge className={option.badgeClass}>{option.label}</Badge>
                    {entry.isWorkdayOverride ? (
                      <Badge variant="outline" className="text-[10px]">
                        Workday override
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDateLabel(entry.date)}
                  </p>
                </div>
                {canManage ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() =>
                      typeof onDeleteException === 'function'
                        ? onDeleteException(entry.id)
                        : undefined
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Delete exception</span>
                  </Button>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-xs text-muted-foreground">
            No calendar exceptions added yet.
          </div>
        )}
      </div>
    </FeaturePanelCard>
  );
};

export default CalendarExceptionsCard;
