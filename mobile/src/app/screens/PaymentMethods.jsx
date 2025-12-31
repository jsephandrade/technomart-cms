import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  TextInput,
  Modal,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const PaymentRow = ({ type, last4, onPress }) => (
  <TouchableOpacity onPress={onPress} style={styles.rowCard}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <MaterialCommunityIcons
        name={
          type === 'Visa' || type === 'Mastercard'
            ? 'credit-card-outline'
            : 'cash-multiple'
        }
        size={24}
        color="#4B5563"
        style={{ marginRight: 12 }}
      />
      <Text style={styles.rowText}>
        {type} {last4 ? `•••• ${last4}` : ''}
      </Text>
    </View>
    <Feather name="chevron-right" size={20} color="#C6C6C6" />
  </TouchableOpacity>
);

export default function PaymentMethodsScreen() {
  const router = useRouter();

  const [cards, setCards] = useState([
    { id: 1, type: 'Visa', last4: '1234' },
    { id: 2, type: 'Mastercard', last4: '5678' },
  ]);

  const [gcashModalVisible, setGcashModalVisible] = useState(false);
  const [gcashNumber, setGcashNumber] = useState('');
  const [amount, setAmount] = useState('');

  const addNewCard = () => {
    Alert.alert('Add New Card', 'This would open a card input form.');
  };

  const editCard = (id) => {
    Alert.alert('Edit Card', `This would edit card with id ${id}.`);
  };

  const handleGcashPayment = () => {
    if (!gcashNumber || !amount) {
      Alert.alert('Error', 'Please enter your Gcash number and amount.');
      return;
    }

    // Try to open Gcash app via deep link
    const gcashURL = `gcash://pay?recipient=${gcashNumber}&amount=${amount}`;
    Linking.canOpenURL(gcashURL)
      .then((supported) => {
        if (supported) {
          Linking.openURL(gcashURL);
        } else {
          Alert.alert(
            'Gcash not installed',
            'Please install Gcash app or complete payment manually.'
          );
        }
      })
      .catch((err) => console.error('Error opening Gcash:', err));

    setGcashModalVisible(false);
    setGcashNumber('');
    setAmount('');
  };

  const payWithGcash = () => {
    setGcashModalVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#F07F13" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Payment Methods</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingTop: 16 }}>
        {cards.map((card) => (
          <PaymentRow
            key={card.id}
            type={card.type}
            last4={card.last4}
            onPress={() => editCard(card.id)}
          />
        ))}

        {/* Add Gcash Option */}
        <PaymentRow type="Gcash" onPress={payWithGcash} />

        <TouchableOpacity style={styles.addBtn} onPress={addNewCard}>
          <Feather
            name="plus"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.addBtnText}>Add New Card</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Gcash Payment Modal */}
      <Modal
        visible={gcashModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setGcashModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Pay with Gcash</Text>
            <TextInput
              placeholder="Gcash Number"
              keyboardType="phone-pad"
              value={gcashNumber}
              onChangeText={setGcashNumber}
              style={styles.modalInput}
            />
            <TextInput
              placeholder="Amount"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              style={styles.modalInput}
            />
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#6b7280' }]}
                onPress={() => setGcashModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#F07F13' }]}
                onPress={handleGcashPayment}
              >
                <Text style={styles.modalBtnText}>Pay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    elevation: 2,
  },
  headerText: { fontSize: 22, fontWeight: 'bold', color: '#0f172a' },
  rowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    elevation: 1,
  },
  rowText: { fontSize: 16, color: '#111' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#F07F13',
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 16,
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  modalBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  modalBtnText: { color: '#fff', fontWeight: '600' },
});
