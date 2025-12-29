import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PlusCircle, Utensils, UtensilsCrossed } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, parseISO, parse } from 'date-fns';
import { NewEventModal } from './catering/NewEventModal';
import { CalendarViewModal } from './catering/CalendarViewModal';
import { EventDetailsModal } from './catering/EventDetailsModal';
import { CateringEventTable } from './catering/CateringEventTable';
import { EventSearchAndFilters } from './catering/EventSearchAndFilters';
import { toast } from 'sonner';
import cateringService from '@/api/services/cateringService';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';

const parseTimeValue = (value) => {
  if (!value) return null;
  const normalized = String(value);
  const formats = ['HH:mm:ss', 'HH:mm'];
  for (const fmt of formats) {
    try {
      return parse(normalized, fmt, new Date());
    } catch {
      continue;
    }
  }
  return null;
};

const combineDateTime = (dateIso, timeIso) => {
  if (!dateIso) return null;
  try {
    const base = parseISO(dateIso);
    if (!timeIso) return base;
    const timeValue = parseTimeValue(timeIso);
    if (!timeValue) return base;
    base.setHours(
      timeValue.getHours(),
      timeValue.getMinutes(),
      timeValue.getSeconds(),
      0
    );
    return base;
  } catch {
    return null;
  }
};

const formatTimeRange = (startTime, endTime, fallbackLabel) => {
  if (fallbackLabel) return fallbackLabel;
  const start = parseTimeValue(startTime);
  const end = parseTimeValue(endTime);
  if (start && end) {
    return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  }
  if (start) return format(start, 'h:mm a');
  if (end) return format(end, 'h:mm a');
  return '';
};

const HIDDEN_EVENTS_STORAGE_KEY = 'catering.hiddenEvents';

const loadHiddenEventIds = () => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.sessionStorage.getItem(HIDDEN_EVENTS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistHiddenEventIds = (ids) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      HIDDEN_EVENTS_STORAGE_KEY,
      JSON.stringify(ids)
    );
  } catch {
    // Ignore storage failures.
  }
};

const mapEventRecord = (record) => {
  if (!record) return null;
  const dateIso = record.date || record.eventDate || '';
  const startTime = record.startTime || record.start_time || null;
  const endTime = record.endTime || record.end_time || null;
  let dateLabel = dateIso;
  try {
    if (dateIso) {
      dateLabel = format(parseISO(dateIso), 'MMMM d, yyyy');
    }
  } catch {
    dateLabel = dateIso;
  }

  const timeLabel = formatTimeRange(startTime, endTime, record.time);
  const attendees = Number(
    record.attendees ?? record.guestCount ?? record.guest_count ?? 0
  );
  const total = Number(
    record.total ?? record.estimatedTotal ?? record.totalAmount ?? 0
  );
  const deposit = Number(record.deposit ?? record.depositAmount ?? 0);
  const items = (record.items || []).map((item) => {
    const unitPrice = Number(
      item.unitPrice ?? item.unit_price ?? item.price ?? 0
    );
    const quantity = Number(item.quantity ?? 0);
    const totalPrice = Number(item.totalPrice ?? unitPrice * quantity);
    return {
      id: item.id,
      menuItemId: item.menuItemId || item.menu_item_id || null,
      name: item.name,
      quantity,
      unitPrice,
      totalPrice,
    };
  });

  const contact = record.contactPerson || {};

  return {
    id: record.id,
    name: record.name || record.eventName || '',
    client: record.client || record.clientName || '',
    status: record.status || 'scheduled',
    date: dateIso,
    dateLabel,
    startTime,
    endTime,
    time: timeLabel,
    location: record.location || record.eventLocation || '',
    attendees,
    total,
    notes: record.notes || '',
    items,
    contactPerson: {
      name: contact.name || record.contactName || record.contact_name || '',
      phone: contact.phone || record.contactPhone || record.contact_phone || '',
      email:
        contact.email ||
        record.contactEmail ||
        record.contact_email ||
        record.clientEmail ||
        record.client_email ||
        '',
    },
    deposit,
    depositPaid: Boolean(record.depositPaid ?? record.deposit_paid),
    paymentStatus: record.paymentStatus ?? record.payment_status ?? 'unpaid',
    raw: record,
  };
};

const isEventPast = (event) => {
  if (!event) return false;
  if (event.status === 'completed' || event.status === 'cancelled') {
    return true;
  }
  const endDate =
    combineDateTime(event.date, event.endTime) ||
    combineDateTime(event.date, event.startTime);
  if (!endDate) return false;
  return endDate < new Date();
};

const Catering = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentTab, setCurrentTab] = useState('upcoming');
  const [showNewEventModal, setShowNewEventModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showEventDetailsModal, setShowEventDetailsModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [rescheduleEventId, setRescheduleEventId] = useState(null);
  const [events, setEvents] = useState([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState(null);
  const [hiddenEventIds, setHiddenEventIds] = useState(loadHiddenEventIds);

  const fetchEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    setEventsError(null);
    try {
      const res = await cateringService.listEvents({ limit: 500 });
      const list = res?.data || [];
      setEvents(list.map(mapEventRecord).filter(Boolean));
    } catch (error) {
      const message =
        error?.message ||
        error?.details?.message ||
        'Failed to load catering events';
      setEventsError(message);
      toast.error(message);
      setEvents([]);
    } finally {
      setIsLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    persistHiddenEventIds(hiddenEventIds);
  }, [hiddenEventIds]);

  const filteredBySearch = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const visibleEvents = events.filter(
      (event) => !hiddenEventIds.includes(event.id)
    );
    if (!term) return visibleEvents;
    return visibleEvents.filter((event) => {
      const nameMatch = event.name.toLowerCase().includes(term);
      const clientMatch = event.client.toLowerCase().includes(term);
      const locationMatch = event.location.toLowerCase().includes(term);
      return nameMatch || clientMatch || locationMatch;
    });
  }, [events, searchTerm, hiddenEventIds]);

  const upcomingEvents = useMemo(
    () =>
      filteredBySearch
        .filter((event) => event.status !== 'cancelled' && !isEventPast(event))
        .sort((a, b) => {
          const aDate =
            combineDateTime(a.date, a.startTime) || new Date(8640000000000000);
          const bDate =
            combineDateTime(b.date, b.startTime) || new Date(8640000000000000);
          return aDate - bDate;
        }),
    [filteredBySearch]
  );

  const pastEvents = useMemo(
    () =>
      filteredBySearch
        .filter((event) => event.status !== 'cancelled' && isEventPast(event))
        .sort((a, b) => {
          const aDate = combineDateTime(a.date, a.endTime) || new Date(0);
          const bDate = combineDateTime(b.date, b.endTime) || new Date(0);
          return bDate - aDate;
        }),
    [filteredBySearch]
  );

  const cancelledEvents = useMemo(
    () =>
      filteredBySearch
        .filter((event) => event.status === 'cancelled')
        .sort((a, b) => {
          const aDate = combineDateTime(a.date, a.startTime) || new Date(0);
          const bDate = combineDateTime(b.date, b.startTime) || new Date(0);
          return bDate - aDate;
        }),
    [filteredBySearch]
  );

  const handleCreateEvent = useCallback(async (formValues) => {
    try {
      const payload = {
        name: formValues.name,
        client: formValues.client,
        date: formValues.date,
        startTime: formValues.startTime,
        endTime: formValues.endTime,
        location: formValues.location,
        attendees: formValues.attendees,
        contactName: formValues.contactName,
        contactPhone: formValues.contactPhone,
        notes: formValues.notes,
        estimatedTotal: 0, // Will be calculated from menu items
      };
      const res = await cateringService.createEvent(payload);
      if (!res?.success) {
        throw new Error(res?.message || 'Failed to create event');
      }
      const mapped = mapEventRecord(res.data);
      setEvents((prev) => [...prev, mapped]);
      toast.success('Event created successfully!');
      return true;
    } catch (error) {
      const message =
        error?.message || error?.details?.message || 'Failed to create event';
      toast.error(message);
      return false;
    }
  }, []);

  const openEventDetails = useCallback(async (event, options = {}) => {
    if (!event?.id) return;
    const { reschedule = false } = options || {};
    if (reschedule) {
      setRescheduleEventId(event.id);
    } else {
      setRescheduleEventId(null);
    }
    setSelectedEvent(event);
    setShowEventDetailsModal(true);
    try {
      const res = await cateringService.getEvent(event.id, {
        includeItems: true,
      });
      if (!res?.success) throw new Error(res?.message);
      const mapped = mapEventRecord(res.data);
      setSelectedEvent(mapped);
      setEvents((prev) =>
        prev.map((item) => (item.id === mapped.id ? mapped : item))
      );
    } catch (error) {
      const message =
        error?.message ||
        error?.details?.message ||
        'Failed to load event details';
      toast.error(message);
    }
  }, []);

  const handleViewDetails = useCallback(
    (event) => openEventDetails(event),
    [openEventDetails]
  );

  const handleRescheduleEvent = useCallback(
    (event) => openEventDetails(event, { reschedule: true }),
    [openEventDetails]
  );

  const handleCancelEvent = useCallback(
    async (event) => {
      try {
        const res = await cateringService.cancelEvent(event.id);
        if (!res?.success) throw new Error(res?.message);
        const mapped = mapEventRecord(res.data);
        setEvents((prev) =>
          prev.map((item) => (item.id === mapped.id ? mapped : item))
        );
        if (selectedEvent?.id === mapped.id) {
          setSelectedEvent(mapped);
        }
        toast.success(`Event "${event.name}" has been cancelled.`);
      } catch (error) {
        const message =
          error?.message || error?.details?.message || 'Failed to cancel event';
        toast.error(message);
      }
    },
    [selectedEvent]
  );

  const handleUpdateEventSchedule = useCallback(
    async (eventId, updates) => {
      try {
        const res = await cateringService.updateEvent(eventId, updates);
        if (!res?.success) throw new Error(res?.message);
        const mapped = mapEventRecord(res.data);
        setEvents((prev) =>
          prev.map((item) => (item.id === mapped.id ? mapped : item))
        );
        if (selectedEvent?.id === mapped.id) {
          setSelectedEvent(mapped);
        }
        if (rescheduleEventId === mapped.id) {
          setRescheduleEventId(null);
        }
        toast.success('Event schedule updated.');
        return mapped;
      } catch (error) {
        const message =
          error?.message ||
          error?.details?.message ||
          'Failed to update event schedule';
        toast.error(message);
        throw error;
      }
    },
    [selectedEvent, rescheduleEventId]
  );

  const handleRemoveEvent = useCallback(
    (event) => {
      setHiddenEventIds((prev) =>
        prev.includes(event.id) ? prev : [...prev, event.id]
      );
      setEvents((prev) => prev.filter((item) => item.id !== event.id));
      if (selectedEvent?.id === event.id) {
        setSelectedEvent(null);
        setShowEventDetailsModal(false);
      }
      toast.success(`Event "${event.name}" has been removed.`);
    },
    [selectedEvent]
  );

  const handleMenuItems = useCallback(
    (event) => {
      navigate(`/catering-menu-selection/${event.id}`);
    },
    [navigate]
  );

  const renderTable = (data, emptyMessage, listType) => {
    if (isLoadingEvents) {
      return (
        <div className="text-center py-10">
          <p className="text-muted-foreground">Loading catering events...</p>
        </div>
      );
    }

    if (eventsError) {
      return (
        <div className="text-center py-10">
          <p className="text-muted-foreground">{eventsError}</p>
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={fetchEvents}
          >
            Retry
          </Button>
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div className="text-center py-10">
          <Utensils className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">{emptyMessage}</p>
          {currentTab === 'upcoming' && (
            <Button
              className="mt-4"
              variant="outline"
              size="sm"
              onClick={() => setShowNewEventModal(true)}
            >
              Create New Event
            </Button>
          )}
        </div>
      );
    }

    return (
      <CateringEventTable
        events={data}
        onViewDetails={handleViewDetails}
        onMenuItems={handleMenuItems}
        onCancelEvent={handleCancelEvent}
        onRemoveEvent={handleRemoveEvent}
        onRescheduleEvent={handleRescheduleEvent}
        listType={listType}
      />
    );
  };

  return (
    <>
      <div className="grid gap-4">
        <FeaturePanelCard
          badgeIcon={UtensilsCrossed}
          badgeText="Catering Management"
          description="Handle catering orders and events"
          headerActions={
            <Button onClick={() => setShowNewEventModal(true)}>
              <PlusCircle className="h-4 w-4 mr-1" /> New Event
            </Button>
          }
        >
          <EventSearchAndFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onCalendarView={() => setShowCalendarModal(true)}
          />

          <Tabs value={currentTab} onValueChange={setCurrentTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past Events</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming" className="pt-2">
              {renderTable(
                upcomingEvents,
                'No upcoming catering events found',
                'upcoming'
              )}
            </TabsContent>
            <TabsContent value="past" className="pt-2">
              {renderTable(
                pastEvents,
                'No past catering events to display',
                'past'
              )}
            </TabsContent>
            <TabsContent value="cancelled" className="pt-2">
              {renderTable(
                cancelledEvents,
                'No cancelled catering events to display',
                'cancelled'
              )}
            </TabsContent>
          </Tabs>
        </FeaturePanelCard>
      </div>

      <NewEventModal
        open={showNewEventModal}
        onOpenChange={setShowNewEventModal}
        onCreateEvent={handleCreateEvent}
      />

      <CalendarViewModal
        open={showCalendarModal}
        onOpenChange={setShowCalendarModal}
        events={events}
        onViewDetails={handleViewDetails}
      />

      <EventDetailsModal
        open={showEventDetailsModal}
        onOpenChange={(nextOpen) => {
          setShowEventDetailsModal(nextOpen);
          if (!nextOpen) {
            setRescheduleEventId(null);
          }
        }}
        event={selectedEvent}
        onUpdateEvent={handleUpdateEventSchedule}
        rescheduleMode={rescheduleEventId === selectedEvent?.id}
      />
    </>
  );
};

export default Catering;
