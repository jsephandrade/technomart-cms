import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertCircle,
  CalendarIcon,
  ClipboardList,
  Clock,
  FileText,
  Users,
  User,
  MapPin,
  Phone,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const SHORT_DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MIN_EVENT_LEAD_DAYS = 5;

const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const startOfMonth = (date) => {
  const next = startOfDay(date);
  next.setDate(1);
  return next;
};

const shiftDateByMonths = (date, months) => {
  const base = date ? new Date(date) : startOfDay(new Date());
  const desiredDay = base.getDate();
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  target.setDate(Math.min(desiredDay, lastDayOfTargetMonth));
  return startOfDay(target);
};

export const NewEventModal = ({ open, onOpenChange, onCreateEvent }) => {
  const [formData, setFormData] = useState({
    name: '',
    client: '',
    date: undefined,
    startTime: '',
    endTime: '',
    location: '',
    attendees: '',
    contactName: '',
    contactPhone: '',
    notes: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()));
  const [dateError, setDateError] = useState('');
  const nameInputRef = useRef(null);

  const today = useMemo(() => startOfDay(new Date()), []);

  useEffect(() => {
    if (!open) {
      setSubmitted(false);
      return;
    }

    setSubmitted(false);
    setTimeout(() => {
      nameInputRef.current?.focus?.();
    }, 100);
  }, [open]);

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }),
    []
  );

  const dayLabelFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  const currentMonthStart = viewDate
    ? startOfMonth(viewDate)
    : startOfMonth(new Date());
  const currentMonthLabel = monthFormatter.format(currentMonthStart);

  const calendarDays = useMemo(() => {
    const monthStart = currentMonthStart;
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const dateValue = new Date(gridStart);
      dateValue.setDate(gridStart.getDate() + index);
      const normalized = startOfDay(dateValue);
      const isCurrentMonth = normalized.getMonth() === monthStart.getMonth();
      const selectedDate = formData.date ? startOfDay(formData.date) : null;
      const isSelected =
        selectedDate && normalized.getTime() === selectedDate.getTime();
      const isToday = normalized.getTime() === today.getTime();

      return {
        date: normalized,
        key: normalized.toISOString(),
        isCurrentMonth,
        isSelected,
        isToday,
      };
    });
  }, [currentMonthStart, formData.date, today]);

  const goToPreviousMonth = () => {
    const base = formData.date ? startOfDay(formData.date) : viewDate;
    const newDate = shiftDateByMonths(base, -1);
    setViewDate(startOfMonth(newDate));
  };

  const goToNextMonth = () => {
    const base = formData.date ? startOfDay(formData.date) : viewDate;
    const newDate = shiftDateByMonths(base, 1);
    setViewDate(startOfMonth(newDate));
  };

  const updateFormData = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      client: '',
      date: undefined,
      startTime: '',
      endTime: '',
      location: '',
      attendees: '',
      contactName: '',
      contactPhone: '',
      notes: '',
    });
    setDateError('');
  };

  const getDaysUntilEvent = (date) => {
    if (!date) return null;
    const eventDate = startOfDay(date);
    const diffMs = eventDate.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  const handleDateSelect = (date) => {
    updateFormData('date', date);
    setViewDate(startOfMonth(date));
    const daysUntilEvent = getDaysUntilEvent(date);
    if (
      typeof daysUntilEvent === 'number' &&
      daysUntilEvent <= MIN_EVENT_LEAD_DAYS - 1
    ) {
      setDateError(
        `Events must be scheduled at least ${MIN_EVENT_LEAD_DAYS} days in advance.`
      );
    } else {
      setDateError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setSubmitted(true);

    const trimmedName = String(formData.name || '').trim();
    const trimmedClient = String(formData.client || '').trim();

    if (
      !trimmedName ||
      !trimmedClient ||
      !formData.date ||
      !formData.startTime ||
      !formData.endTime
    ) {
      if (!trimmedName) {
        nameInputRef.current?.focus?.();
      }
      return;
    }

    const daysUntilEvent = getDaysUntilEvent(formData.date);
    if (
      typeof daysUntilEvent === 'number' &&
      daysUntilEvent <= MIN_EVENT_LEAD_DAYS - 1
    ) {
      setDateError(
        `Events must be scheduled at least ${MIN_EVENT_LEAD_DAYS} days in advance.`
      );
      return;
    }

    setDateError('');
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        date: format(formData.date, 'yyyy-MM-dd'),
      };
      const success = await onCreateEvent(payload);
      if (success) {
        resetForm();
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const nameValue = useMemo(
    () => String(formData.name || '').trim(),
    [formData.name]
  );
  const clientValue = useMemo(
    () => String(formData.client || '').trim(),
    [formData.client]
  );
  const nameError = submitted && !nameValue;
  const clientError = submitted && !clientValue;
  const dateMissing = submitted && !formData.date;
  const startTimeError = submitted && !String(formData.startTime || '').trim();
  const endTimeError = submitted && !String(formData.endTime || '').trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Create New Catering Event
          </DialogTitle>
          <DialogDescription>
            Fill out the event details below. Required fields are marked with an
            asterisk (*). Events must be scheduled at least{' '}
            {MIN_EVENT_LEAD_DAYS} days in advance.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ClipboardList className="h-4 w-4" />
              <span>Event Basics</span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="event-name"
                  className="flex items-center gap-1 h-5"
                >
                  Event Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="event-name"
                  ref={nameInputRef}
                  value={formData.name}
                  onChange={(e) => updateFormData('name', e.target.value)}
                  placeholder="e.g., Corporate Lunch Meeting"
                  className={cn(nameError && 'border-destructive')}
                  required
                  disabled={isSubmitting}
                />
                {nameError ? (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>Event name is required</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This appears on the catering calendar and in reports.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="client" className="flex items-center gap-1 h-5">
                  Client <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="client"
                  value={formData.client}
                  onChange={(e) => updateFormData('client', e.target.value)}
                  placeholder="e.g., ABC Technologies"
                  className={cn(clientError && 'border-destructive')}
                  required
                  disabled={isSubmitting}
                />
                {clientError ? (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>Client name is required</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Company or person requesting the catering service.
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Schedule</span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label
                  htmlFor="event-date"
                  className="flex items-center gap-1 h-5"
                >
                  Date <span className="text-destructive">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="event-date"
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !formData.date && 'text-muted-foreground',
                        (dateMissing || dateError) && 'border-destructive'
                      )}
                      disabled={isSubmitting}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.date ? (
                        format(formData.date, 'PPP')
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="rounded-lg border border-border/60 bg-background/70 p-3 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span>{currentMonthLabel}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={goToPreviousMonth}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background transition-colors hover:bg-muted"
                            aria-label="Previous month"
                          >
                            <ChevronLeft
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={goToNextMonth}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background transition-colors hover:bg-muted"
                            aria-label="Next month"
                          >
                            <ChevronRight
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
                        {SHORT_DAY_LABELS.map((label) => (
                          <div key={label} className="py-1">
                            {label}
                          </div>
                        ))}
                      </div>

                      <div className="mt-1 grid grid-cols-7 gap-1 text-[11px]">
                        {calendarDays.map((day) => (
                          <button
                            key={day.key}
                            type="button"
                            onClick={() => handleDateSelect(day.date)}
                            className={cn(
                              'relative flex h-7 items-center justify-center rounded-sm border border-transparent leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                              day.isCurrentMonth
                                ? 'text-foreground'
                                : 'text-muted-foreground/60',
                              day.isSelected
                                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                : 'hover:bg-muted',
                              day.isToday && !day.isSelected
                                ? 'border border-primary/50'
                                : null
                            )}
                            aria-pressed={day.isSelected}
                            aria-label={dayLabelFormatter.format(day.date)}
                          >
                            {day.date.getDate()}
                          </button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {dateError || dateMissing ? (
                  <div
                    className="flex items-center gap-1 text-xs text-destructive"
                    role="alert"
                  >
                    <AlertCircle className="h-3 w-3" />
                    <span>{dateError || 'Event date is required'}</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Choose a date at least {MIN_EVENT_LEAD_DAYS} days ahead.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="start-time"
                  className="flex items-center gap-1 h-5"
                >
                  Start Time <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="start-time"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => updateFormData('startTime', e.target.value)}
                  className={cn(startTimeError && 'border-destructive')}
                  required
                  disabled={isSubmitting}
                />
                {startTimeError ? (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>Start time is required</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    When service begins for this event.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="end-time"
                  className="flex items-center gap-1 h-5"
                >
                  End Time <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="end-time"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => updateFormData('endTime', e.target.value)}
                  className={cn(endTimeError && 'border-destructive')}
                  required
                  disabled={isSubmitting}
                />
                {endTimeError ? (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    <span>End time is required</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    When service ends for this event.
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Location & Guests</span>
              <Badge variant="secondary" className="text-xs">
                Optional
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="location"
                  className="flex items-center gap-2 h-5"
                >
                  Location
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => updateFormData('location', e.target.value)}
                    placeholder="e.g., Conference Room B, ABC HQ"
                    className="pl-10"
                    disabled={isSubmitting}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Where the catering team should deliver and set up.
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="attendees"
                  className="flex items-center gap-2 h-5"
                >
                  Number of Attendees
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <div className="relative">
                  <Users className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="attendees"
                    type="number"
                    value={formData.attendees}
                    onChange={(e) =>
                      updateFormData('attendees', e.target.value)
                    }
                    placeholder="e.g., 25"
                    className="pl-10"
                    min={0}
                    disabled={isSubmitting}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Estimated headcount (helps with planning).
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Contact</span>
              <Badge variant="secondary" className="text-xs">
                Optional
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label
                  htmlFor="contact-name"
                  className="flex items-center gap-2 h-5"
                >
                  Contact Name
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <Input
                  id="contact-name"
                  value={formData.contactName}
                  onChange={(e) =>
                    updateFormData('contactName', e.target.value)
                  }
                  placeholder="e.g., John Smith"
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  Primary contact for day-of coordination.
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="contact-phone"
                  className="flex items-center gap-2 h-5"
                >
                  Contact Phone
                  <Badge variant="secondary" className="text-xs">
                    Optional
                  </Badge>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="contact-phone"
                    value={formData.contactPhone}
                    onChange={(e) =>
                      updateFormData('contactPhone', e.target.value)
                    }
                    placeholder="e.g., (555) 123-4567"
                    className="pl-10"
                    disabled={isSubmitting}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  A reachable number in case of changes or questions.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>Notes</span>
              <Badge variant="secondary" className="text-xs">
                Optional
              </Badge>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="flex items-center gap-2 h-5">
                Additional Notes
                <Badge variant="secondary" className="text-xs">
                  Optional
                </Badge>
              </Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => updateFormData('notes', e.target.value)}
                placeholder="Any special requests, dietary restrictions, or setup notes"
                className="min-h-[110px]"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Keep it short and actionable for the catering team.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSubmitted(false);
                resetForm();
                onOpenChange(false);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {isSubmitting ? 'Creating...' : 'Create Event'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
