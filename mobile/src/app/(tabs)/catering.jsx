import React, { useCallback, useEffect, useState } from 'react';
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
const to24Hour = (timeString) => {
  if (!timeString) return '';
  const [time, modifier] = timeString.split(' ');
  let [hours, minutes] = time.split(':');
  hours = parseInt(hours, 10);
  if (modifier === 'PM' && hours !== 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
};

const MIN_EVENT_LEAD_DAYS = 5;

const sanitizeDigits = (value) => String(value ?? '').replace(/[^0-9]/g, '');

const sanitizePositiveInt = (value, fallback = 1) => {
  const digits = sanitizeDigits(value);
  const parsed = parseInt(digits, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
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
    const nextQty = sanitizePositiveInt(qty, 1);
    setMenuItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, selectedQuantity: nextQty } : i
      )
    );
  };

  /* ------------------ Schedule Event with 50% Down Payment ------------------ */
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

    const selectedItemsData = scheduleForm.selectedItems.map((itemId) => {
      const item = menuItems.find((i) => i.id === itemId);
      return {
        menu_item: item.id,
        name: item.name,
        quantity: item.selectedQuantity,
        unit_price: item.price || 0,
        notes: item.notes || '',
        image: item.image || null,
      };
    });

    const totalPrice = selectedItemsData.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0
    );

    const downPayment = totalPrice * 0.5; // 50% payment

    // Ask for down payment confirmation
    Alert.alert(
      'Down Payment Required',
      `You need to pay 50% of the total price (₱${downPayment.toLocaleString()}) to schedule this event. Confirm payment?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            try {
              const newEvent = {
                id: Date.now(),
                name: scheduleForm.eventName,
                client_name: scheduleForm.client,
                contact_name: scheduleForm.contactName,
                contact_phone: scheduleForm.contactPhone,
                event_date: scheduleForm.date,
                start_time: to24Hour(scheduleForm.startTime),
                end_time: to24Hour(scheduleForm.endTime),
                location: scheduleForm.location,
                guest_count: Number(scheduleForm.attendees),
                notes: scheduleForm.notes,
                items: selectedItemsData,
                total_price: totalPrice,
                paid_amount: downPayment,
              };

              await createCateringEvent(newEvent);
              setCateringEvents((prev) => [...prev, newEvent]);

              Alert.alert('Success', 'Event scheduled! 50% payment received.');
              setModalVisible(false);

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
          },
        },
      ]
    );
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

                {event.notes ? (
                  <Text style={styles.eventNotes}>{event.notes}</Text>
                ) : null}

                <View style={styles.eventTotalRow}>
                  <View>
                    <Text style={styles.eventTotalLabel}>Total</Text>
                    {event.status === 'Pending Payment' ? (
                      <Text style={styles.eventTotalNote}>
                        Paid: ₱{(event.paid_amount || 0).toLocaleString()}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.eventTotalValue}>
                    ₱{event.total_price?.toLocaleString() || 0}
                  </Text>
                </View>

                <Text style={styles.menuTitle}>Menu Items</Text>
                <View style={styles.menuGrid}>
                  {event.items?.map((item, idx) => (
                    <View key={idx} style={styles.menuCard}>
                      {item.image ? (
                        <Image
                          source={{ uri: item.image }}
                          style={styles.menuImage}
                        />
                      ) : (
                        <View style={styles.menuImagePlaceholder} />
                      )}
                      <Text style={styles.menuCardText}>
                        {item.name} x {item.quantity}
                      </Text>
                      <Text style={styles.menuCardPrice}>
                        ₱{(item.unit_price * item.quantity).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                </View>

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
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setModalVisible(false)}
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
                        const formatted = selected.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        handleInputChange(showTimePicker.field, formatted);
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
                          {item.image ? (
                            <Image
                              source={{ uri: item.image }}
                              style={styles.menuImage}
                            />
                          ) : (
                            <View style={styles.menuImagePlaceholder} />
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
                            <TextInput
                              keyboardType="number-pad"
                              style={styles.qtyInput}
                              value={item.selectedQuantity.toString()}
                              onChangeText={(val) =>
                                handleQuantityChange(item.id, val)
                              }
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                <Pressable
                  onPress={handleScheduleSubmit}
                  style={styles.submitBtn}
                >
                  <Text style={styles.submitBtnText}>Submit</Text>
                </Pressable>
                <Pressable
                  onPress={() => setModalVisible(false)}
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
  menuCardPrice: {
    marginTop: 4,
    fontSize: 11,
    color: '#6B7280',
  },
  menuImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#F7EDE2',
  },
  menuImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#F7EDE2',
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
  qtyInput: {
    width: 50,
    borderWidth: 1,
    borderColor: '#F3D6B7',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 6,
    textAlign: 'center',
    color: '#111827',
    backgroundColor: '#fff',
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
