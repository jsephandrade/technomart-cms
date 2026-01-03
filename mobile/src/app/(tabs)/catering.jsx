import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  Image,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { resolveImageSource } from '../../utils/image';
import {
  USER_CACHE_KEY,
  fetchMenuItems,
  createCateringEvent,
  fetchCateringEvents,
  updateCateringEventPayment,
} from '../../api/api';

/* ---------------------------
   Convert "5:32 PM" → "17:32"
---------------------------- */
const to24Hour = (timeValue) => {
  if (!timeValue) return '';
  if (timeValue instanceof Date) {
    const hours = String(timeValue.getHours()).padStart(2, '0');
    const minutes = String(timeValue.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  const normalized = String(timeValue).trim().replace(/\s+/g, ' ');
  const match = normalized.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/
  );
  if (!match) return normalized;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : null;
  const meridiem = match[4];
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return normalized;
  }
  if (meridiem) {
    const upper = meridiem.toUpperCase();
    if (upper === 'PM' && hours !== 12) hours += 12;
    if (upper === 'AM' && hours === 12) hours = 0;
  }
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  if (Number.isFinite(seconds)) {
    const ss = String(seconds).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}`;
};

const MIN_EVENT_LEAD_DAYS = 5;
const COLLAGE_GAP = 3;

const formatPeso = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '\u20b10';
  return `\u20b1${amount.toLocaleString()}`;
};

const sanitizeDigits = (value) => String(value ?? '').replace(/[^0-9]/g, '');

const sanitizeNonNegativeInt = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim().startsWith('-')) {
    return fallback;
  }
  const digits = sanitizeDigits(value);
  const parsed = parseInt(digits, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const resolveItemImage = (item) => {
  if (!item) return '';
  const candidates = [
    item.image,
    item.imageUrl,
    item.image_url,
    item.thumbnail,
    item?.image?.url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }
  return '';
};

const resolveIngredientEntries = (item) => {
  if (!item) return [];
  const raw =
    item.ingredients ||
    item.ingredientIds ||
    item.ingredient_ids ||
    item.combo_items ||
    item.comboItems;
  return Array.isArray(raw) ? raw : [];
};

const isComboItem = (item) => {
  if (!item) return false;
  const category = String(
    item.category || item.categoryName || item.category_label || ''
  ).toLowerCase();
  if (category.includes('combo')) return true;
  const type = String(
    item.type || item.itemType || item.kind || ''
  ).toLowerCase();
  if (type.includes('combo')) return true;
  if (
    item.isCombo ||
    item.is_combo ||
    item.is_combo_meal ||
    item.isComboMeal ||
    item.combo
  ) {
    return true;
  }
  const ingredients = resolveIngredientEntries(item);
  return Array.isArray(ingredients) && ingredients.length > 0;
};

const resolveComboImages = (item, imageById) => {
  const sources = [];
  resolveIngredientEntries(item).forEach((entry) => {
    if (!entry) return;
    if (typeof entry === 'object') {
      const direct = resolveItemImage(entry);
      if (direct) {
        sources.push(direct);
        return;
      }
      const id =
        entry.id ||
        entry.menuItemId ||
        entry.itemId ||
        entry.menu_item_id ||
        null;
      if (id !== null && id !== undefined) {
        const mapped = imageById.get(String(id));
        if (mapped) sources.push(mapped);
      }
      return;
    }
    const mapped = imageById.get(String(entry));
    if (mapped) sources.push(mapped);
  });

  return sources.filter((src, index, arr) => {
    if (!src) return false;
    if (typeof src === 'string') {
      const lower = src.toLowerCase();
      if (lower.includes('.svg') || lower.startsWith('data:image/svg')) {
        return false;
      }
    }
    return arr.indexOf(src) === index;
  });
};

const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const parseLocalDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return new Date(value);
  if (typeof value === 'string') {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }
  return null;
};

const getDaysUntilEvent = (date) => {
  const eventDate = parseLocalDate(date);
  if (!eventDate) return null;
  const diffMs =
    startOfDay(eventDate).getTime() - startOfDay(new Date()).getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const getMinEventDate = () => {
  const minDate = startOfDay(new Date());
  minDate.setDate(minDate.getDate() + MIN_EVENT_LEAD_DAYS);
  return minDate;
};

const STATUS_STYLES = {
  pending: { label: 'Pending', color: '#FACC15', bg: '#FEF3C7' },
  pending_payment: {
    label: 'Pending Payment',
    color: '#F97316',
    bg: '#FFEDD5',
  },
  confirmed: { label: 'Confirmed', color: '#22C55E', bg: '#DCFCE7' },
  cancelled: { label: 'Cancelled', color: '#EF4444', bg: '#FEE2E2' },
  canceled: { label: 'Cancelled', color: '#EF4444', bg: '#FEE2E2' },
};

const normalizeStatus = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '');

const resolveStatusStyle = (value) => {
  const key = normalizeStatus(value);
  return STATUS_STYLES[key] || STATUS_STYLES.pending;
};

export default function CateringTab() {
  const router = useRouter();
  const [cateringEvents, setCateringEvents] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allowed, setAllowed] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState({
    field: '',
    visible: false,
  });
  const [eventTab, setEventTab] = useState('upcoming');
  const [fontsLoaded] = useFonts({ Roboto_700Bold });
  const [showPaymentSection, setShowPaymentSection] = useState(false);
  const [paymentType, setPaymentType] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [expandedEvents, setExpandedEvents] = useState({});

  const [scheduleForm, setScheduleForm] = useState({
    eventName: '',
    client: '',
    date: '',
    startTime: '',
    endTime: '',
    location: '',
    attendees: '',
    contactName: '',
    contactPhone: '',
    notes: '',
    selectedItems: [],
  });
  const menuImageById = useMemo(() => {
    const map = new Map();
    menuItems.forEach((item) => {
      if (!item) return;
      const id = item.id ?? item.menu_item_id ?? item.menuItemId;
      const image = resolveItemImage(item);
      if (id !== null && id !== undefined && image) {
        map.set(String(id), image);
      }
    });
    return map;
  }, [menuItems]);

  /* ------------------ Load Data ------------------ */
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const entries = await AsyncStorage.multiGet([USER_CACHE_KEY, 'user']);
      const userData = entries[0][1] || entries[1][1];
      const parsed = userData ? JSON.parse(userData) : null;

      if (!parsed || parsed.role !== 'faculty') {
        setAllowed(false);
        return;
      }
      setAllowed(true);

      const clientName = parsed.name?.trim() || '';
      setScheduleForm((prev) => ({ ...prev, client: clientName }));

      const items = await fetchMenuItems();
      setMenuItems(
        (items && Array.isArray(items) ? items : []).map((i) => ({
          ...i,
          selectedQuantity: 1,
        }))
      );

      const events = await fetchCateringEvents(clientName);

      const normalizedEvents = (
        events && Array.isArray(events) ? events : []
      ).map((ev) => ({
        ...ev,
        client_name: ev.client_name?.trim() || '',
        items: Array.isArray(ev.items) ? ev.items : [],
        total_price:
          ev.total_price ??
          (Array.isArray(ev.items)
            ? ev.items.reduce(
                (sum, item) =>
                  sum +
                  (item.unit_price || item.price || 0) * (item.quantity || 0),
                0
              )
            : 0),
        status: ev.status ?? 'Pending',
        paid_amount: ev.paid_amount ?? 0,
      }));

      setCateringEvents(normalizedEvents);
    } catch (err) {
      console.error('Error loading catering data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  /* ------------------ Handlers ------------------ */
  const handleInputChange = (field, value) => {
    if (field === 'attendees' || field === 'contactPhone') {
      const cleaned = sanitizeDigits(value);
      setScheduleForm((prev) => ({ ...prev, [field]: cleaned }));
      return;
    }
    setScheduleForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleMenuItem = (itemId) => {
    setScheduleForm((prev) => {
      const exists = prev.selectedItems.includes(itemId);
      return {
        ...prev,
        selectedItems: exists
          ? prev.selectedItems.filter((id) => id !== itemId)
          : [...prev.selectedItems, itemId],
      };
    });
  };

  const handleQuantityChange = (itemId, qty) => {
    const nextQty = sanitizeNonNegativeInt(qty, 0);
    setMenuItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, selectedQuantity: nextQty } : i
      )
    );
  };

  const closeScheduleModal = () => {
    setModalVisible(false);
    setShowPaymentSection(false);
    setPaymentType('');
    setPaymentMethod('');
  };

  const toggleEventDetails = (eventId) => {
    setExpandedEvents((prev) => ({
      ...prev,
      [eventId]: !prev[eventId],
    }));
  };

  const resolveMenuItemMatch = (eventItem) => {
    if (!eventItem) return null;
    const id =
      eventItem.menu_item ||
      eventItem.menu_item_id ||
      eventItem.menuItemId ||
      eventItem.menu_item?.id ||
      eventItem.menuItem?.id;
    if (id !== null && id !== undefined) {
      const match = menuItems.find((item) => String(item.id) === String(id));
      if (match) return match;
    }
    const name = String(eventItem.name || '')
      .trim()
      .toLowerCase();
    if (name) {
      const match = menuItems.find(
        (item) =>
          String(item.name || '')
            .trim()
            .toLowerCase() === name
      );
      if (match) return match;
    }
    return null;
  };

  /* ------------------ Schedule Event + Payment ------------------ */
  const handleScheduleSubmit = async () => {
    const required = [
      'eventName',
      'client',
      'date',
      'startTime',
      'endTime',
      'location',
      'attendees',
      'contactName',
      'contactPhone',
    ];

    const missing = required.filter(
      (f) => !scheduleForm[f] || scheduleForm[f].toString().trim() === ''
    );
    if (missing.length) {
      Alert.alert('Error', 'Please fill all required fields.');
      return;
    }

    const daysUntilEvent = getDaysUntilEvent(scheduleForm.date);
    if (
      typeof daysUntilEvent === 'number' &&
      daysUntilEvent <= MIN_EVENT_LEAD_DAYS - 1
    ) {
      Alert.alert(
        'Error',
        `Events must be scheduled at least ${MIN_EVENT_LEAD_DAYS} days in advance.`
      );
      return;
    }

    if (scheduleForm.selectedItems.length === 0) {
      Alert.alert('Error', 'Please select at least one menu item.');
      return;
    }

    if (!showPaymentSection) {
      setShowPaymentSection(true);
      return;
    }

    if (!paymentType || !paymentMethod) {
      Alert.alert('Error', 'Please select payment type and method.');
      return;
    }

    const selectedItemsData = scheduleForm.selectedItems
      .map((itemId) => menuItems.find((i) => i.id === itemId))
      .filter(Boolean)
      .map((item) => ({
        menu_item: item.id,
        name: item.name,
        quantity: sanitizeNonNegativeInt(item.selectedQuantity, 0),
        unit_price: item.price || 0,
        notes: item.notes || '',
        image: item.image || null,
      }))
      .filter((item) => item.quantity > 0);

    if (selectedItemsData.length === 0) {
      Alert.alert('Error', 'Please set a quantity for at least one item.');
      return;
    }

    const totalPrice = selectedItemsData.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0
    );

    const startTime = to24Hour(scheduleForm.startTime);
    const endTime = to24Hour(scheduleForm.endTime);
    const timePattern = /^\d{2}:\d{2}(:\d{2})?$/;
    if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
      Alert.alert('Error', 'Please select a valid start and end time.');
      return;
    }

    const isFullPayment = paymentType === 'full';
    const paidAmount = isFullPayment ? totalPrice : totalPrice * 0.5;
    const paymentStatus = isFullPayment ? 'paid' : 'partial';

    try {
      const payload = {
        name: scheduleForm.eventName,
        client_name: scheduleForm.client,
        contact_name: scheduleForm.contactName,
        contact_phone: scheduleForm.contactPhone,
        event_date: scheduleForm.date,
        start_time: startTime,
        end_time: endTime,
        location: scheduleForm.location,
        guest_count: Number(scheduleForm.attendees),
        notes: scheduleForm.notes,
        items: selectedItemsData,
        estimated_total: totalPrice,
        deposit_amount: paidAmount,
        deposit_paid: true,
        payment_status: paymentStatus,
      };

      const result = await createCateringEvent(payload);
      if (!result?.success) {
        Alert.alert('Error', result?.message || 'Failed to schedule event.');
        return;
      }

      const createdEvent = result?.data?.data || result?.data || payload;
      const localEvent = {
        id: Date.now(),
        ...payload,
        total_price: totalPrice,
        paid_amount: paidAmount,
      };
      setCateringEvents((prev) => [
        ...prev,
        { ...localEvent, ...createdEvent },
      ]);

      Alert.alert(
        'Success',
        `Event scheduled! ${
          isFullPayment ? 'Full payment' : '50% downpayment'
        } recorded via ${paymentMethod}.`
      );
      closeScheduleModal();

      // Reset form
      setScheduleForm((prev) => ({
        ...prev,
        eventName: '',
        date: '',
        startTime: '',
        endTime: '',
        location: '',
        attendees: '',
        contactName: '',
        contactPhone: '',
        notes: '',
        selectedItems: [],
      }));
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to schedule event.');
    }
  };

  /* ------------------ Pay Remaining 50% ------------------ */
  const handlePayRemaining = (event) => {
    const remaining = event.total_price - (event.paid_amount || 0);
    if (remaining <= 0) return;

    Alert.alert(
      'Pay Remaining 50%',
      `Remaining payment: ₱${remaining.toLocaleString()}. Proceed to pay?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            try {
              // Here you would integrate real payment API
              // For now we simulate payment success
              await updateCateringEventPayment(event.id, remaining);

              // Update state
              setCateringEvents((prev) =>
                prev.map((ev) =>
                  ev.id === event.id
                    ? {
                        ...ev,
                        paid_amount: ev.total_price,
                        status: 'Confirmed',
                      }
                    : ev
                )
              );

              Alert.alert('Success', 'Full payment received! Event confirmed.');
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'Payment failed.');
            }
          },
        },
      ]
    );
  };

  /* ------------------ Loading / Access ------------------ */
  if (!fontsLoaded || loading || allowed === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading catering...</Text>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.container}>
        <View style={styles.backgroundGlowTop} />
        <View style={styles.backgroundGlowBottom} />
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Access restricted</Text>
          <Text style={styles.emptySubtitle}>
            You are not allowed to access Catering.
          </Text>
        </View>
      </View>
    );
  }

  /* ------------------ Filter events ------------------ */
  const today = new Date();
  const userEvents = cateringEvents.filter(
    (event) =>
      event.client_name.toLowerCase() ===
      scheduleForm.client.trim().toLowerCase()
  );

  const upcomingEvents = userEvents.filter(
    (event) => new Date(event.event_date) >= today
  );
  const pastEvents = userEvents.filter(
    (event) => new Date(event.event_date) < today
  );
  const displayedEvents = eventTab === 'upcoming' ? upcomingEvents : pastEvents;
  const totalEvents = userEvents.length;
  const upcomingCount = upcomingEvents.length;
  const pastCount = pastEvents.length;
  const emptyTitle =
    eventTab === 'upcoming' ? 'No upcoming events' : 'No past events';
  const emptySubtitle =
    eventTab === 'upcoming'
      ? 'Schedule a new catering event to get started.'
      : 'Your completed events will appear here.';
  const selectedMenuItems = scheduleForm.selectedItems
    .map((itemId) => menuItems.find((item) => item.id === itemId))
    .filter(Boolean);
  const currentTotal = selectedMenuItems.reduce((sum, item) => {
    const price = Number(item.price || 0);
    const qty = sanitizeNonNegativeInt(item.selectedQuantity, 0);
    return sum + price * qty;
  }, 0);
  const downPaymentAmount = currentTotal * 0.5;
  const paymentDue =
    paymentType === 'full'
      ? currentTotal
      : paymentType === 'downpayment'
        ? downPaymentAmount
        : 0;

  /* ------------------ Render ------------------ */
  return (
    <View style={styles.container}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#f97316']}
          />
        }
      >
        <LinearGradient
          colors={['#FFE4C7', '#FFC37A', '#FF8A3D']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.heroCard}
        >
          <View style={styles.heroRow}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="calendar-outline" size={22} color="#1F2937" />
            </View>
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>Catering</Text>
              <Text style={styles.heroSubtitle}>
                Plan and track catering events
              </Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{totalEvents} total</Text>
            </View>
          </View>
        </LinearGradient>

        <TouchableOpacity
          style={styles.primaryAction}
          onPress={() => setModalVisible(true)}
        >
          <View style={styles.primaryActionIcon}>
            <Ionicons name="add-circle-outline" size={20} color="#9A3412" />
          </View>
          <View style={styles.primaryActionText}>
            <Text style={styles.primaryActionTitle}>
              Schedule New Catering Event
            </Text>
            <Text style={styles.primaryActionSubtitle}>
              Reserve a date, menu, and guest count.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Events</Text>
            <Text style={styles.sectionSubtitle}>
              Upcoming and past bookings
            </Text>
          </View>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>
              {displayedEvents.length} showing
            </Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            onPress={() => setEventTab('upcoming')}
            style={[
              styles.tabPill,
              eventTab === 'upcoming' && styles.tabPillActive,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                eventTab === 'upcoming' && styles.tabTextActive,
              ]}
            >
              Upcoming ({upcomingCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setEventTab('past')}
            style={[
              styles.tabPill,
              eventTab === 'past' && styles.tabPillActive,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                eventTab === 'past' && styles.tabTextActive,
              ]}
            >
              Past ({pastCount})
            </Text>
          </TouchableOpacity>
        </View>

        {displayedEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
          </View>
        ) : (
          displayedEvents.map((event) => {
            const statusStyle = resolveStatusStyle(event.status);
            const isExpanded = !!expandedEvents[event.id];
            const itemCount = Array.isArray(event.items)
              ? event.items.length
              : 0;
            const paidAmount =
              event.paid_amount ??
              event.deposit_amount ??
              event.paidAmount ??
              0;
            const paymentStatus =
              event.payment_status || event.paymentStatus || '';
            return (
              <View key={event.id} style={styles.eventCard}>
                <View style={styles.orderHeader}>
                  <View style={styles.orderHeaderInfo}>
                    <Text style={styles.eventTitle}>{event.name}</Text>
                    <Text style={styles.eventDate}>{event.event_date}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: statusStyle.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: statusStyle.color },
                      ]}
                    >
                      {statusStyle.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.eventMetaRow}>
                  <Ionicons name="time-outline" size={16} color="#9A3412" />
                  <Text style={styles.eventMetaText}>
                    {event.start_time} - {event.end_time}
                  </Text>
                </View>
                <View style={styles.eventMetaRow}>
                  <Ionicons name="location-outline" size={16} color="#9A3412" />
                  <Text style={styles.eventMetaText}>{event.location}</Text>
                </View>
                <View style={styles.eventMetaRow}>
                  <Ionicons name="people-outline" size={16} color="#9A3412" />
                  <Text style={styles.eventMetaText}>
                    {event.guest_count} attendees
                  </Text>
                </View>
                <View style={styles.eventMetaRow}>
                  <Ionicons
                    name="fast-food-outline"
                    size={16}
                    color="#9A3412"
                  />
                  <Text style={styles.eventMetaText}>
                    {itemCount} menu item{itemCount === 1 ? '' : 's'}
                  </Text>
                </View>

                {event.notes ? (
                  <Text style={styles.eventNotes}>{event.notes}</Text>
                ) : null}

                <View style={styles.eventTotalRow}>
                  <View>
                    <Text style={styles.eventTotalLabel}>Total</Text>
                    {event.status === 'Pending Payment' ? (
                      <Text style={styles.eventTotalNote}>
                        Paid: ₱{Number(paidAmount || 0).toLocaleString()}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.eventTotalValue}>
                    ₱{event.total_price?.toLocaleString() || 0}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.detailsToggle}
                  onPress={() => toggleEventDetails(event.id)}
                >
                  <Text style={styles.detailsToggleText}>
                    {isExpanded ? 'Hide Details' : 'See Details'}
                  </Text>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="#9A3412"
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.detailsPanel}>
                    <View style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Contact</Text>
                      <Text style={styles.detailsValue}>
                        {event.contact_name || '—'}
                      </Text>
                    </View>
                    <View style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Phone</Text>
                      <Text style={styles.detailsValue}>
                        {event.contact_phone || '—'}
                      </Text>
                    </View>
                    <View style={styles.detailsRow}>
                      <Text style={styles.detailsLabel}>Payment</Text>
                      <Text style={styles.detailsValue}>
                        {paymentStatus || (paidAmount ? 'partial' : 'unpaid')}
                      </Text>
                    </View>

                    <View style={styles.detailsDivider} />
                    <Text style={styles.detailsSectionTitle}>Menu Items</Text>
                    {Array.isArray(event.items) && event.items.length ? (
                      event.items.map((item, idx) => {
                        const matchedMenu = resolveMenuItemMatch(item);
                        const baseItem = matchedMenu || item;
                        const combo = isComboItem(baseItem);
                        const collageImages = combo
                          ? resolveComboImages(baseItem, menuImageById).slice(
                              0,
                              3
                            )
                          : [];
                        const showCollage = collageImages.length === 3;
                        const imageSource = resolveImageSource(
                          resolveItemImage(baseItem)
                        );
                        return (
                          <View
                            key={`${item.id || idx}`}
                            style={styles.detailsMenuRow}
                          >
                            {showCollage ? (
                              <View style={styles.menuCollage}>
                                <View style={styles.menuCollageMain}>
                                  <Image
                                    source={{ uri: collageImages[0] }}
                                    style={styles.menuCollageImage}
                                  />
                                </View>
                                <View style={styles.menuCollageSide}>
                                  <View
                                    style={[
                                      styles.menuCollageTile,
                                      styles.menuCollageTileTop,
                                    ]}
                                  >
                                    <Image
                                      source={{ uri: collageImages[1] }}
                                      style={styles.menuCollageImage}
                                    />
                                  </View>
                                  <View style={styles.menuCollageTile}>
                                    <Image
                                      source={{ uri: collageImages[2] }}
                                      style={styles.menuCollageImage}
                                    />
                                  </View>
                                </View>
                              </View>
                            ) : (
                              <Image
                                source={imageSource}
                                style={styles.menuImage}
                              />
                            )}
                            <View style={styles.detailsMenuInfo}>
                              <Text
                                style={styles.detailsMenuName}
                                numberOfLines={1}
                              >
                                {item.name || baseItem.name || 'Menu item'}
                              </Text>
                              <Text style={styles.detailsMenuMeta}>
                                Qty: {item.quantity || 0}
                              </Text>
                            </View>
                            <Text style={styles.detailsMenuPrice}>
                              ₱
                              {(
                                Number(item.unit_price || 0) *
                                Number(item.quantity || 0)
                              ).toLocaleString()}
                            </Text>
                          </View>
                        );
                      })
                    ) : (
                      <Text style={styles.detailsEmptyText}>
                        No menu items added.
                      </Text>
                    )}
                  </View>
                )}

                {event.status === 'Pending Payment' && (
                  <TouchableOpacity
                    style={styles.payButton}
                    onPress={() => handlePayRemaining(event)}
                  >
                    <Text style={styles.payButtonText}>Pay Remaining 50%</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {/* MODAL: Schedule Event */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={closeScheduleModal}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={closeScheduleModal}
            />
            <View style={styles.modalCard}>
              <View style={styles.modalHandle} />
              <ScrollView
                contentContainerStyle={styles.modalContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Schedule Catering Event</Text>

                <Field
                  label="Event Name"
                  value={scheduleForm.eventName}
                  onChange={(v) => handleInputChange('eventName', v)}
                />
                <Field
                  label="Client"
                  value={scheduleForm.client}
                  editable={false}
                />

                {/* Date */}
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.inputLabel}>Event Date</Text>
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    style={styles.inputField}
                  >
                    <Text style={styles.inputText}>
                      {scheduleForm.date || 'Select date'}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={parseLocalDate(scheduleForm.date) || new Date()}
                      minimumDate={getMinEventDate()}
                      mode="date"
                      display="default"
                      onChange={(e, selectedDate) => {
                        setShowDatePicker(false);
                        if (selectedDate) {
                          const daysUntilEvent =
                            getDaysUntilEvent(selectedDate);
                          if (
                            typeof daysUntilEvent === 'number' &&
                            daysUntilEvent <= MIN_EVENT_LEAD_DAYS - 1
                          ) {
                            Alert.alert(
                              'Error',
                              `Events must be scheduled at least ${MIN_EVENT_LEAD_DAYS} days in advance.`
                            );
                            return;
                          }
                          handleInputChange(
                            'date',
                            selectedDate.toISOString().split('T')[0]
                          );
                        }
                      }}
                    />
                  )}
                </View>

                {/* Time */}
                <TimeField
                  label="Start Time"
                  value={scheduleForm.startTime}
                  onPress={() =>
                    setShowTimePicker({ field: 'startTime', visible: true })
                  }
                />
                <TimeField
                  label="End Time"
                  value={scheduleForm.endTime}
                  onPress={() =>
                    setShowTimePicker({ field: 'endTime', visible: true })
                  }
                />

                {showTimePicker.visible && (
                  <DateTimePicker
                    value={new Date()}
                    mode="time"
                    display="default"
                    onChange={(e, selected) => {
                      setShowTimePicker({ field: '', visible: false });
                      if (selected) {
                        handleInputChange(
                          showTimePicker.field,
                          to24Hour(selected)
                        );
                      }
                    }}
                  />
                )}

                <Field
                  label="Location"
                  value={scheduleForm.location}
                  onChange={(v) => handleInputChange('location', v)}
                />

                <Field
                  label="Number of Attendees"
                  value={scheduleForm.attendees}
                  onChange={(v) => handleInputChange('attendees', v)}
                  keyboardType="number-pad"
                />
                <Field
                  label="Contact Name"
                  value={scheduleForm.contactName}
                  onChange={(v) => handleInputChange('contactName', v)}
                />
                <Field
                  label="Contact Phone"
                  value={scheduleForm.contactPhone}
                  onChange={(v) => handleInputChange('contactPhone', v)}
                  keyboardType="phone-pad"
                />
                <Field
                  label="Additional Notes"
                  value={scheduleForm.notes}
                  onChange={(v) => handleInputChange('notes', v)}
                />

                <Text style={styles.menuTitle}>Select Menu Items</Text>
                <View style={styles.menuGrid}>
                  {menuItems?.map((item) => {
                    const selected = scheduleForm.selectedItems.includes(
                      item.id
                    );
                    const combo = isComboItem(item);
                    const collageImages = combo
                      ? resolveComboImages(item, menuImageById).slice(0, 3)
                      : [];
                    const showCollage = collageImages.length === 3;
                    const imageSource = resolveImageSource(
                      resolveItemImage(item)
                    );
                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.menuCard,
                          selected && styles.menuCardSelected,
                        ]}
                      >
                        <TouchableOpacity
                          onPress={() => toggleMenuItem(item.id)}
                        >
                          {showCollage ? (
                            <View style={styles.menuCollage}>
                              <View style={styles.menuCollageMain}>
                                <Image
                                  source={{ uri: collageImages[0] }}
                                  style={styles.menuCollageImage}
                                />
                              </View>
                              <View style={styles.menuCollageSide}>
                                <View
                                  style={[
                                    styles.menuCollageTile,
                                    styles.menuCollageTileTop,
                                  ]}
                                >
                                  <Image
                                    source={{ uri: collageImages[1] }}
                                    style={styles.menuCollageImage}
                                  />
                                </View>
                                <View style={styles.menuCollageTile}>
                                  <Image
                                    source={{ uri: collageImages[2] }}
                                    style={styles.menuCollageImage}
                                  />
                                </View>
                              </View>
                            </View>
                          ) : (
                            <Image
                              source={imageSource}
                              style={styles.menuImage}
                            />
                          )}
                          <Text
                            style={[
                              styles.menuCardText,
                              selected && styles.menuCardTextSelected,
                            ]}
                          >
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                        {selected && (
                          <View style={styles.qtyRow}>
                            <Text style={styles.qtyLabel}>Qty</Text>
                            <View style={styles.qtyControls}>
                              <TouchableOpacity
                                style={[
                                  styles.qtyButton,
                                  sanitizeNonNegativeInt(
                                    item.selectedQuantity,
                                    0
                                  ) === 0 && styles.qtyButtonDisabled,
                                ]}
                                onPress={() =>
                                  handleQuantityChange(
                                    item.id,
                                    sanitizeNonNegativeInt(
                                      item.selectedQuantity,
                                      0
                                    ) - 1
                                  )
                                }
                                disabled={
                                  sanitizeNonNegativeInt(
                                    item.selectedQuantity,
                                    0
                                  ) === 0
                                }
                              >
                                <Text style={styles.qtyButtonText}>-</Text>
                              </TouchableOpacity>
                              <Text style={styles.qtyValue}>
                                {sanitizeNonNegativeInt(
                                  item.selectedQuantity,
                                  0
                                )}
                              </Text>
                              <TouchableOpacity
                                style={styles.qtyButton}
                                onPress={() =>
                                  handleQuantityChange(
                                    item.id,
                                    sanitizeNonNegativeInt(
                                      item.selectedQuantity,
                                      0
                                    ) + 1
                                  )
                                }
                              >
                                <Text style={styles.qtyButtonText}>+</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                <View style={styles.paymentSummary}>
                  <View style={styles.paymentRow}>
                    <Text style={styles.paymentLabel}>Total</Text>
                    <Text style={styles.paymentValue}>
                      {formatPeso(currentTotal)}
                    </Text>
                  </View>
                  <View style={[styles.paymentRow, styles.paymentRowLast]}>
                    <Text style={styles.paymentLabel}>50% Downpayment</Text>
                    <Text style={styles.paymentValue}>
                      {formatPeso(downPaymentAmount)}
                    </Text>
                  </View>
                </View>

                {showPaymentSection && (
                  <View style={styles.paymentSection}>
                    <Text style={styles.paymentSectionTitle}>Payment</Text>

                    <View style={{ marginBottom: 14 }}>
                      <Text style={styles.inputLabel}>Payment Type *</Text>
                      <View style={styles.paymentOptionRow}>
                        <TouchableOpacity
                          style={[
                            styles.paymentOption,
                            paymentType === 'full' &&
                              styles.paymentOptionActive,
                          ]}
                          onPress={() => setPaymentType('full')}
                        >
                          <Text
                            style={[
                              styles.paymentOptionText,
                              paymentType === 'full' &&
                                styles.paymentOptionTextActive,
                            ]}
                          >
                            Full Payment
                          </Text>
                          <Text style={styles.paymentOptionValue}>
                            {formatPeso(currentTotal)}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.paymentOption,
                            styles.paymentOptionLast,
                            paymentType === 'downpayment' &&
                              styles.paymentOptionActive,
                          ]}
                          onPress={() => setPaymentType('downpayment')}
                        >
                          <Text
                            style={[
                              styles.paymentOptionText,
                              paymentType === 'downpayment' &&
                                styles.paymentOptionTextActive,
                            ]}
                          >
                            50% Downpayment
                          </Text>
                          <Text style={styles.paymentOptionValue}>
                            {formatPeso(downPaymentAmount)}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={{ marginBottom: 14 }}>
                      <Text style={styles.inputLabel}>Payment Method *</Text>
                      <View style={styles.paymentOptionRow}>
                        <TouchableOpacity
                          style={[
                            styles.paymentOption,
                            paymentMethod === 'GCash' &&
                              styles.paymentOptionActive,
                          ]}
                          onPress={() => setPaymentMethod('GCash')}
                        >
                          <Text
                            style={[
                              styles.paymentOptionText,
                              paymentMethod === 'GCash' &&
                                styles.paymentOptionTextActive,
                            ]}
                          >
                            GCash
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.paymentOption,
                            styles.paymentOptionLast,
                            paymentMethod === 'Cash' &&
                              styles.paymentOptionActive,
                          ]}
                          onPress={() => setPaymentMethod('Cash')}
                        >
                          <Text
                            style={[
                              styles.paymentOptionText,
                              paymentMethod === 'Cash' &&
                                styles.paymentOptionTextActive,
                            ]}
                          >
                            Cash
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.paymentDueRow}>
                      <Text style={styles.paymentLabel}>Amount Due Now</Text>
                      <Text style={styles.paymentValue}>
                        {formatPeso(paymentDue)}
                      </Text>
                    </View>
                  </View>
                )}

                <Pressable
                  onPress={handleScheduleSubmit}
                  style={styles.submitBtn}
                >
                  <Text style={styles.submitBtnText}>
                    {showPaymentSection
                      ? 'Confirm Payment'
                      : 'Continue to Payment'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={closeScheduleModal}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

/* ---------------------- Reusable Components ---------------------- */
const Field = ({ label, value, onChange, editable = true, ...props }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={`Enter ${label.toLowerCase()}`}
      placeholderTextColor="#9CA3AF"
      style={[styles.inputField, styles.inputText]}
      editable={editable}
      {...props}
    />
  </View>
);

const TimeField = ({ label, value, onPress }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TouchableOpacity onPress={onPress} style={styles.inputField}>
      <Text style={styles.inputText}>
        {value || `Select ${label.toLowerCase()}`}
      </Text>
    </TouchableOpacity>
  </View>
);

/* ---------------------- Styles ---------------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF7EE',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#FFE5C8',
    opacity: 0.7,
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: -140,
    left: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#FFD6AE',
    opacity: 0.6,
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  heroCard: {
    margin: 16,
    borderRadius: 24,
    padding: 16,
    overflow: 'hidden',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFE7C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    flex: 1,
    marginHorizontal: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  heroBadge: {
    backgroundColor: '#FFE7C7',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  primaryAction: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#FFE7C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  primaryActionText: {
    flex: 1,
  },
  primaryActionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  primaryActionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  sectionBadge: {
    backgroundColor: '#FFE7C7',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFE7C7',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  tabPillActive: {
    backgroundColor: '#F97316',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  tabTextActive: {
    color: '#fff',
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderHeaderInfo: {
    flex: 1,
    paddingRight: 12,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  eventDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  eventMetaText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#6B7280',
  },
  eventNotes: {
    marginTop: 10,
    fontSize: 12,
    color: '#111827',
    lineHeight: 18,
  },
  eventTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF0E0',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  eventTotalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  eventTotalNote: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  eventTotalValue: {
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFE7C7',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  detailsToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  detailsPanel: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F3D6B7',
    padding: 12,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailsLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  detailsValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  detailsDivider: {
    height: 1,
    backgroundColor: '#F3D6B7',
    marginVertical: 10,
  },
  detailsSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  detailsMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  detailsMenuInfo: {
    flex: 1,
    marginLeft: 10,
  },
  detailsMenuName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  detailsMenuMeta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  detailsMenuPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  detailsEmptyText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginTop: 14,
    marginBottom: 8,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  menuCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3D6B7',
    marginBottom: 12,
  },
  menuCardSelected: {
    borderColor: '#F97316',
    backgroundColor: '#FFFCF7',
  },
  menuCardText: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 12,
    color: '#111827',
  },
  menuCardTextSelected: {
    fontWeight: '700',
    color: '#9A3412',
  },
  menuImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#F7EDE2',
    alignSelf: 'center',
  },
  menuCollage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#F7EDE2',
    overflow: 'hidden',
    padding: COLLAGE_GAP,
    flexDirection: 'row',
    alignSelf: 'center',
  },
  menuCollageMain: {
    flex: 2,
    marginRight: COLLAGE_GAP,
    borderRadius: 10,
    overflow: 'hidden',
  },
  menuCollageSide: {
    flex: 1,
    justifyContent: 'space-between',
  },
  menuCollageTile: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  menuCollageTileTop: {
    marginBottom: COLLAGE_GAP,
  },
  menuCollageImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    width: '100%',
  },
  qtyLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 90,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFE7C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonDisabled: {
    opacity: 0.4,
  },
  qtyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9A3412',
  },
  qtyValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  payButton: {
    marginTop: 12,
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  payButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalCard: {
    backgroundColor: '#FFF7EE',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 12,
    maxHeight: '90%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#F3D6B7',
    marginTop: 10,
    marginBottom: 10,
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 6,
  },
  inputField: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F3D6B7',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputText: {
    fontSize: 14,
    color: '#111827',
  },
  submitBtn: {
    backgroundColor: '#F97316',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  paymentSummary: {
    backgroundColor: '#FFF0E0',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  paymentRowLast: {
    marginBottom: 0,
  },
  paymentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  paymentValue: {
    fontSize: 14,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
  },
  paymentSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F3D6B7',
  },
  paymentSectionTitle: {
    fontSize: 14,
    fontFamily: 'Roboto_700Bold',
    color: '#111827',
    marginBottom: 8,
  },
  paymentOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paymentOption: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3D6B7',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  paymentOptionLast: {
    marginLeft: 8,
  },
  paymentOptionActive: {
    borderColor: '#F97316',
    backgroundColor: '#FFF0E0',
  },
  paymentOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  paymentOptionTextActive: {
    color: '#9A3412',
  },
  paymentOptionValue: {
    marginTop: 4,
    fontSize: 11,
    color: '#6B7280',
  },
  paymentDueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3D6B7',
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: '#FFE7C7',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  cancelBtnText: {
    color: '#9A3412',
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF7EE',
  },
  loadingText: {
    marginTop: 8,
    color: '#F97316',
    fontFamily: 'Roboto_700Bold',
  },
});
