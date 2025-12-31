// screens/FAQsScreen.jsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Platform,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking'; // ✅ Added for Telegram link

const isNewArchitectureEnabled =
  Boolean(global?.nativeFabricUIManager) ||
  Boolean(global?.RN$Bridgeless) ||
  Boolean(UIManager.getConstants?.()?.fabric);

// Enable LayoutAnimation on Android for the old architecture only.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental &&
  !isNewArchitectureEnabled
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const QAItem = ({ id, question, answer, expanded, onToggle }) => {
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.qHeader}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggle?.(id);
        }}
      >
        <Text style={styles.questionText}>{question}</Text>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#F07F13"
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.answerWrapper}>
          <Text style={styles.answerText}>{answer}</Text>
        </View>
      )}
    </View>
  );
};

const DEFAULT_FAQS = [
  // Orders
  {
    id: 'order-tracking',
    q: 'How do I track my order?',
    a: 'Go to Profile → Orders to see real-time status. Tap an order to view courier details and a live map when available.',
  },
  {
    id: 'order-cancel',
    q: 'Can I cancel my order?',
    a: 'Orders can be canceled before preparation starts. Once the order is confirmed, it cannot be canceled.',
  },
  {
    id: 'order-modify',
    q: 'Can I modify my order after placing it?',
    a: 'Unfortunately, modifications aren’t possible after an order is placed. You can place a new order instead.',
  },

  // Payments
  {
    id: 'payment-methods',
    q: 'What payment methods are supported?',
    a: 'You can pay using cash on delivery, GCash, Maya, or credit/debit cards.',
  },
  {
    id: 'payment-points',
    q: 'How do I use my credit points?',
    a: 'At checkout, toggle “Use Points” to apply your earned points to reduce your subtotal.',
  },

  // Refunds
  {
    id: 'refunds',
    q: 'How do refunds work?',
    a: 'Refunds are issued back to your original payment method within 3–5 business days after approval. You’ll get an email once processed.',
  },
  {
    id: 'refund-delay',
    q: 'Why hasn’t my refund arrived yet?',
    a: 'Refunds can take a few business days. If delayed beyond 5 days, contact support with your order ID.',
  },

  // Delivery
  {
    id: 'delivery-time',
    q: 'How long does delivery take?',
    a: 'Delivery usually takes 30–60 minutes depending on your location and order volume.',
  },
  {
    id: 'delivery-fee',
    q: 'Are there delivery fees?',
    a: 'Delivery fees depend on your distance from the restaurant and are displayed at checkout.',
  },

  // Account
  {
    id: 'account-change',
    q: 'Can I change my account details?',
    a: 'Yes! Go to Profile → Personal Information to update your name, phone number, and email.',
  },
  {
    id: 'account-delete',
    q: 'Can I delete my account?',
    a: 'Please contact support via Profile → Share Feedback to request account deletion.',
  },

  // Notifications
  {
    id: 'notifications',
    q: 'I’m not receiving notifications. What should I check?',
    a: 'In Profile → Notifications, ensure the toggle is on. Then, enable notifications for this app in your device Settings.',
  },

  // Promotions
  {
    id: 'promo-apply',
    q: 'How do I apply promo codes?',
    a: 'At checkout, enter your promo code in the designated field to apply discounts.',
  },
  {
    id: 'promo-expire',
    q: 'Why isn’t my promo code working?',
    a: 'Promo codes may expire or have specific conditions. Check the terms and ensure your order meets them.',
  },
];

export default function FAQsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const filteredData = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEFAULT_FAQS;
    return DEFAULT_FAQS.filter(
      (item) =>
        item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#F07F13" />
        </TouchableOpacity>
        <Text style={styles.headerText}>FAQs</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <Feather name="search" size={18} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search FAQs"
          placeholderTextColor="#9ca3af"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Feather name="x-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* FAQ List */}
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {filteredData.length === 0 ? (
          <View style={styles.emptyWrapper}>
            <MaterialCommunityIcons
              name="help-circle"
              size={36}
              color="#c6c6c6"
            />
            <Text style={styles.emptyText}>No results found.</Text>
          </View>
        ) : (
          filteredData.map((item) => (
            <QAItem
              key={item.id}
              id={item.id}
              question={item.q}
              answer={item.a}
              expanded={expandedId === item.id}
              onToggle={(id) =>
                setExpandedId((prev) => (prev === id ? null : id))
              }
            />
          ))
        )}

        {/* ✅ Contact Support (Telegram link) */}
        <TouchableOpacity
          style={styles.contactBtn}
          onPress={() => Linking.openURL('https://t.me/TechnoMartSupport')}
        >
          <Text style={styles.contactText}>Contact Support</Text>
        </TouchableOpacity>
      </ScrollView>
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
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e5e7eb',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#111' },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
  },
  qHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  questionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
    paddingRight: 8,
  },
  answerWrapper: { marginTop: 8 },
  answerText: { fontSize: 14, color: '#4b5563', lineHeight: 20 },
  emptyWrapper: { alignItems: 'center', marginTop: 60 },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  contactBtn: {
    backgroundColor: '#F07F13',
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  contactText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
