// app/(tabs)/OrderHistoryScreen.jsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDietary } from '../../context/DietaryContext';
import { fetchUserOrders } from '../../api/api'; // API function to fetch orders

const OrderCard = ({ order, onRepeat }) => (
  <View style={styles.card}>
    {/* Header */}
    <View style={styles.cardHeader}>
      <Text style={styles.orderId}>Order #{order.id}</Text>
      <Text style={[styles.status, { color: order.statusColor }]}>
        {order.status}
      </Text>
    </View>

    {/* Items preview */}
    <View style={styles.itemsPreview}>
      {order.items.slice(0, 3).map((item, index) => (
        <Image
          key={index}
          source={{ uri: item.image }}
          style={styles.itemImage}
        />
      ))}
      {order.items.length > 3 && (
        <View style={styles.moreItems}>
          <Text style={styles.moreText}>+{order.items.length - 3}</Text>
        </View>
      )}
      <Text style={styles.itemCount}>{order.items.length} items</Text>
    </View>

    {/* Date, total, and repeat button */}
    <View style={styles.cardFooter}>
      <View>
        <Text style={styles.orderDate}>{order.date}</Text>
        <Text style={styles.orderTotal}>₱{order.total.toFixed(2)}</Text>
      </View>
      <TouchableOpacity style={styles.actionBtn} onPress={onRepeat}>
        <Text style={styles.actionText}>Repeat Order</Text>
      </TouchableOpacity>
    </View>
  </View>
);

export default function OrderHistoryScreen() {
  const router = useRouter();
  const { preferences } = useDietary();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch orders from backend on mount
  useEffect(() => {
    const loadOrders = async () => {
      try {
        const data = await fetchUserOrders();
        // Map backend status to color
        const mapped = data.map((order) => ({
          ...order,
          statusColor:
            order.status === 'Delivered'
              ? '#10B981'
              : order.status === 'Pending'
                ? '#F59E0B'
                : '#EF4444',
        }));
        setOrders(mapped);
      } catch (err) {
        console.error('Failed to fetch orders:', err);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, []);

  const repeatOrder = (orderItems) => {
    router.push({
      pathname: '/customer-cart',
      params: {
        orderItems: JSON.stringify(orderItems),
        dietaryPreferences: JSON.stringify(preferences),
      },
    });
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          {
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}
      >
        <ActivityIndicator size="large" color="#F07F13" />
        <Text style={{ marginTop: 12, fontSize: 16, color: '#6B7280' }}>
          Loading your orders...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#F07F13" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Order History</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Orders List */}
      <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingTop: 16 }}>
        {orders.length === 0 ? (
          <View style={styles.emptyWrapper}>
            <MaterialCommunityIcons name="cart-off" size={36} color="#C6C6C6" />
            <Text style={styles.emptyText}>
              You haven’t placed any orders yet.
            </Text>
          </View>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onRepeat={() => repeatOrder(order.items)}
            />
          ))
        )}
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
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderId: { fontSize: 16, fontWeight: '600', color: '#111' },
  status: { fontSize: 14, fontWeight: '600' },
  itemsPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemImage: { width: 50, height: 50, borderRadius: 8, marginRight: 4 },
  moreItems: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  moreText: { color: '#111', fontWeight: '600' },
  itemCount: { marginLeft: 8, fontSize: 14, color: '#6B7280' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  orderDate: { fontSize: 14, color: '#6B7280' },
  orderTotal: { fontSize: 16, fontWeight: '600', color: '#111' },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F07F13',
    borderRadius: 8,
  },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  emptyWrapper: { alignItems: 'center', marginTop: 60 },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});
