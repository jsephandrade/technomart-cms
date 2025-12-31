import React, { useEffect, useState } from 'react';
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
  StyleSheet,
  ImageBackground,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
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

export default function CateringTab({ navigation }) {
  const [cateringEvents, setCateringEvents] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState({
    field: '',
    visible: false,
  });
  const [eventTab, setEventTab] = useState('upcoming');

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
  useEffect(() => {
    const loadData = async () => {
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
    };

    loadData();
  }, []);

  /* ------------------ Handlers ------------------ */
  const handleInputChange = (field, value) => {
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
    setMenuItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, selectedQuantity: qty } : i))
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
  if (loading || allowed === null) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.loaderContainer}>
        <Text style={{ color: 'red', fontSize: 16 }}>
          You are not allowed to access Catering.
        </Text>
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

  /* ------------------ Render ------------------ */
  return (
    <View style={{ flex: 1, backgroundColor: '#fdfdfd' }}>
      <ImageBackground
        source={require('../../../assets/drop_1.png')}
        resizeMode="cover"
        style={styles.headerBackground}
      >
        <View style={styles.overlay} />
        <View style={styles.headerContainer}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={{ fontSize: 24, fontWeight: '700' }}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Catering Events</Text>
            <View style={{ width: 24 }} />
          </View>
        </View>
      </ImageBackground>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity
          style={styles.scheduleBtn}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.scheduleBtnText}>
            Schedule New Catering Event
          </Text>
        </TouchableOpacity>

        {/* Tabs */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            marginBottom: 12,
          }}
        >
          <TouchableOpacity
            onPress={() => setEventTab('upcoming')}
            style={[
              { padding: 8, borderRadius: 8 },
              eventTab === 'upcoming' && { backgroundColor: '#f97316' },
            ]}
          >
            <Text
              style={{
                color: eventTab === 'upcoming' ? '#fff' : '#333',
                fontWeight: '600',
              }}
            >
              Upcoming
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setEventTab('past')}
            style={[
              { padding: 8, borderRadius: 8 },
              eventTab === 'past' && { backgroundColor: '#f97316' },
            ]}
          >
            <Text
              style={{
                color: eventTab === 'past' ? '#fff' : '#333',
                fontWeight: '600',
              }}
            >
              Past
            </Text>
          </TouchableOpacity>
        </View>

        {displayedEvents.length === 0 && (
          <Text style={{ padding: 16, color: '#555', textAlign: 'center' }}>
            No {eventTab === 'upcoming' ? 'upcoming' : 'past'} events.
          </Text>
        )}

        {displayedEvents.map((event) => (
          <View key={event.id} style={styles.eventCard}>
            <Text style={styles.eventTitle}>{event.name}</Text>

            {/* STATUS */}
            <Text
              style={[
                styles.statusText,
                event.status === 'Confirmed'
                  ? styles.statusConfirmed
                  : event.status === 'Pending Payment'
                    ? styles.statusPending
                    : styles.statusAccepted,
              ]}
            >
              📌 Status: {event.status}
            </Text>

            <Text style={styles.highlightedText}>
              📅 Date: {event.event_date}
            </Text>
            <Text style={styles.highlightedText}>
              ⏰ Time: {event.start_time} - {event.end_time}
            </Text>
            <Text style={styles.highlightedText}>
              📍 Location: {event.location}
            </Text>
            <Text style={styles.highlightedText}>
              👥 Attendees: {event.guest_count}
            </Text>

            {/* TOTAL PRICE */}
            <Text
              style={[styles.highlightedText, { marginTop: 4, fontSize: 16 }]}
            >
              💰 Total Price: ₱ {event.total_price?.toLocaleString() || 0}
              {event.status === 'Pending Payment' &&
                ` (Paid: ₱${event.paid_amount?.toLocaleString() || 0})`}
            </Text>

            {event.notes && (
              <Text style={styles.highlightedText}>
                📝 Notes: {event.notes}
              </Text>
            )}

            <Text style={{ marginTop: 6, fontWeight: '700' }}>
              🍽 Menu Items:
            </Text>
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
                    {item.name} x {item.quantity} — ₱
                    {(item.unit_price * item.quantity).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>

            {/* Pay Remaining Button */}
            {event.status === 'Pending Payment' && (
              <TouchableOpacity
                style={{
                  backgroundColor: '#f97316',
                  padding: 8,
                  borderRadius: 8,
                  marginTop: 8,
                  alignItems: 'center',
                }}
                onPress={() => handlePayRemaining(event)}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  Pay Remaining 50%
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* MODAL: Schedule Event */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <ScrollView style={styles.modalContent}>
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
                  <Text>{scheduleForm.date || 'Select date'}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={
                      scheduleForm.date
                        ? new Date(scheduleForm.date)
                        : new Date()
                    }
                    mode="date"
                    display="default"
                    onChange={(e, selectedDate) => {
                      setShowDatePicker(false);
                      if (selectedDate)
                        handleInputChange(
                          'date',
                          selectedDate.toISOString().split('T')[0]
                        );
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

              {/* Location */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.inputLabel}>Location</Text>
                <View style={styles.inputField}>
                  <Picker
                    selectedValue={scheduleForm.location}
                    onValueChange={(v) => handleInputChange('location', v)}
                  >
                    <Picker.Item label="Select location" value="" />
                    <Picker.Item
                      label="Conference Room A"
                      value="Conference Room A"
                    />
                    <Picker.Item
                      label="Conference Room B"
                      value="Conference Room B"
                    />
                    <Picker.Item label="Main Hall" value="Main Hall" />
                  </Picker>
                </View>
              </View>

              <Field
                label="Number of Attendees"
                value={scheduleForm.attendees}
                onChange={(v) => handleInputChange('attendees', v)}
                keyboardType="numeric"
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
                  const selected = scheduleForm.selectedItems.includes(item.id);
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.menuCard,
                        selected && styles.menuCardSelected,
                      ]}
                    >
                      <TouchableOpacity onPress={() => toggleMenuItem(item.id)}>
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
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: 6,
                          }}
                        >
                          <Text style={{ marginRight: 8 }}>Qty:</Text>
                          <TextInput
                            keyboardType="numeric"
                            style={styles.qtyInput}
                            value={item.selectedQuantity.toString()}
                            onChangeText={(val) =>
                              handleQuantityChange(item.id, parseInt(val) || 1)
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
      style={styles.inputField}
      editable={editable}
      {...props}
    />
  </View>
);

const TimeField = ({ label, value, onPress }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TouchableOpacity onPress={onPress} style={styles.inputField}>
      <Text>{value || `Select ${label.toLowerCase()}`}</Text>
    </TouchableOpacity>
  </View>
);

/* ---------------------- Styles ---------------------- */
const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  headerBackground: {
    width: '100%',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(254,192,117,0.5)',
  },
  headerContainer: { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 14 },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#333' },
  scheduleBtn: {
    backgroundColor: '#f97316',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  scheduleBtnText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  inputLabel: { fontWeight: '600', marginBottom: 4 },
  inputField: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
  },
  menuTitle: { fontWeight: '700', fontSize: 16, marginBottom: 8 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  menuCard: {
    width: '48%',
    margin: '1%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  menuCardSelected: { borderColor: '#f97316', backgroundColor: '#fff7f0' },
  menuCardText: { marginTop: 4, textAlign: 'center' },
  menuCardTextSelected: { fontWeight: '700', color: '#f97316' },
  menuImage: { width: 80, height: 80, borderRadius: 8 },
  menuImagePlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: '#eee',
    borderRadius: 8,
  },
  qtyInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    width: 50,
    borderRadius: 4,
    padding: 4,
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: '#f97316',
    padding: 12,
    borderRadius: 12,
    marginVertical: 12,
  },
  submitBtnText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  cancelBtn: {
    backgroundColor: '#ccc',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  cancelBtnText: { textAlign: 'center', fontWeight: '700' },
  eventCard: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  eventTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  highlightedText: { fontWeight: '600', marginBottom: 2 },
  statusText: { fontWeight: '700', fontSize: 15, marginBottom: 6 },
  statusPending: { color: '#f39c12' },
  statusAccepted: { color: '#3498db' },
  statusConfirmed: { color: '#27ae60' },
});
