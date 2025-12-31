// screens/ShareFeedbackScreen.jsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { sendFeedback } from '../../api/api';

const MAX = 500;
const MIN = 10;
const ORANGE = '#F07F13';

const Chip = ({ label, active, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[
      styles.chip,
      {
        backgroundColor: active ? '#FFF3E9' : 'white',
        borderColor: active ? ORANGE : '#E5E7EB',
      },
    ]}
  >
    <Text style={[styles.chipText, { color: active ? ORANGE : '#6B7280' }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

export default function ShareFeedbackScreen() {
  const router = useRouter();

  const [text, setText] = useState('');
  const [category, setCategory] = useState('Other');
  const [loading, setLoading] = useState(false);

  const remaining = MAX - text.length;
  const isValid = text.trim().length >= MIN && text.length <= MAX;

  const onSend = async () => {
    if (!isValid) return;

    setLoading(true);
    try {
      await sendFeedback({ category, message: text.trim() });
      Alert.alert('Thanks!', 'Your feedback was sent. We appreciate it.');
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert(
        'Error',
        'There was a problem sending your feedback. Please try again later.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color={ORANGE} />
        </TouchableOpacity>
        <Text style={styles.headerText}>Share Feedback</Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 10, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Intro Card */}
          <View style={[styles.card, styles.visibleCard]}>
            <Text style={styles.cardTitle}>We value your feedback</Text>
            <Text style={styles.grayText}>
              Tell us what’s working well or what we can improve. Every message
              is read carefully.
            </Text>
          </View>

          {/* Category Card */}
          <View style={[styles.card, styles.visibleCard]}>
            <Text style={styles.cardTitle}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {[
                'App Experience',
                'Food Quality',
                'Customer Service',
                'Pricing / Offers',
                'Menu / Variety',
                'Payment / Checkout',
                'Other',
              ].map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
          </View>

          {/* Feedback Input */}
          <View style={[styles.card, styles.visibleCard]}>
            <Text style={styles.cardTitle}>Your Feedback</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Type your feedback here..."
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={MAX}
              textAlignVertical="top"
              style={styles.textInput}
              editable={!loading}
            />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: text.trim().length < MIN ? '#EF4444' : '#6B7280',
                }}
              >
                {text.trim().length < MIN
                  ? `At least ${MIN} characters (${MIN - text.trim().length} more)`
                  : 'Looks good'}
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280' }}>
                {remaining}
              </Text>
            </View>
          </View>

          {/* Send Button */}
          <TouchableOpacity
            style={[
              styles.btnOrange,
              { opacity: isValid && !loading ? 1 : 0.6 },
            ]}
            onPress={onSend}
            disabled={!isValid || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Send Feedback</Text>
            )}
          </TouchableOpacity>

          <Text
            style={{
              marginTop: 12,
              fontSize: 12,
              color: '#6B7280',
              textAlign: 'center',
            }}
          >
            By sending, you agree that your feedback may be used to improve the
            app experience.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    elevation: 2,
    marginBottom: 16,
  },
  headerText: { fontSize: 22, fontWeight: 'bold', color: '#0f172a' },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  visibleCard: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  grayText: { color: '#6b7280', fontSize: 14 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  textInput: {
    minHeight: 120,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    color: '#0f172a',
    fontSize: 14,
    backgroundColor: '#f9fafb',
  },
  btnOrange: {
    backgroundColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
