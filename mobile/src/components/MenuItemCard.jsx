import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { getPaxRemaining, isPaxAvailable } from '../utils/pax';

export default function MenuItemCard({ item }) {
  const paxRemaining = getPaxRemaining(item);
  const isAvailable = isPaxAvailable(item);
  return (
    <View style={[styles.card, !isAvailable && styles.cardDisabled]}>
      {item.image && (
        <Image source={{ uri: item.image }} style={styles.image} />
      )}
      <Text style={styles.name}>{item.name}</Text>
      {paxRemaining !== null && (
        <View
          style={[styles.paxBadge, paxRemaining === 0 && styles.paxBadgeEmpty]}
        >
          <Text
            style={[
              styles.paxBadgeText,
              paxRemaining === 0 && styles.paxBadgeTextEmpty,
            ]}
          >
            {paxRemaining} pax
          </Text>
        </View>
      )}
      <Text style={styles.price}>${item.price}</Text>
      {!isAvailable && <Text style={styles.unavailable}>Unavailable</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 2,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  image: { width: '100%', height: 150, borderRadius: 8, marginBottom: 8 },
  name: { fontSize: 16, fontWeight: 'bold' },
  price: { fontSize: 14, color: '#888' },
  paxBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#E0F2FE',
  },
  paxBadgeEmpty: {
    backgroundColor: '#FEE2E2',
  },
  paxBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#075985',
  },
  paxBadgeTextEmpty: {
    color: '#B91C1C',
  },
  unavailable: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },
});
