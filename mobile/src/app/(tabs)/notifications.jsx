import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../../context/NotificationContext';

const typeStyles = {
  info: { color: '#2563EB', bg: '#DBEAFE', icon: 'information-circle' },
  warning: { color: '#D97706', bg: '#FEF3C7', icon: 'alert-circle' },
  success: { color: '#16A34A', bg: '#DCFCE7', icon: 'checkmark-circle' },
  error: { color: '#DC2626', bg: '#FEE2E2', icon: 'close-circle' },
  default: { color: '#6B7280', bg: '#F3F4F6', icon: 'notifications' },
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

export default function NotificationsScreen() {
  const { notifications, loading, refresh } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const sortedNotifications = useMemo(() => {
    const list = Array.isArray(notifications) ? notifications : [];
    return [...list].sort((a, b) => {
      const aTime = new Date(a.created_at || a.createdAt || 0).getTime();
      const bTime = new Date(b.created_at || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [notifications]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.resolve(refresh?.({ silent: false })).finally(() =>
      setRefreshing(false)
    );
  }, [refresh]);

  const renderItem = ({ item }) => {
    const typeKey = (item?.type || 'default').toLowerCase();
    const accent = typeStyles[typeKey] || typeStyles.default;
    const title = item?.title || item?.subject || 'Notification';
    const message = item?.message || item?.body || item?.description || '';
    const timestamp = formatTime(item?.created_at || item?.createdAt);

    return (
      <View style={styles.card}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: accent.bg, borderColor: accent.color },
          ]}
        >
          <Ionicons name={accent.icon} size={18} color={accent.color} />
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {timestamp ? <Text style={styles.time}>{timestamp}</Text> : null}
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: 16 }]}>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Text style={styles.headerSubtitle}>
          {sortedNotifications.length} updates
        </Text>
      </View>

      {loading && !sortedNotifications.length ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      ) : (
        <FlatList
          data={sortedNotifications}
          keyExtractor={(item, index) =>
            item?.id ? String(item.id) : `${item?.title || 'notif'}-${index}`
          }
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            !sortedNotifications.length && styles.emptyContent,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#F97316']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off" size={42} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>All caught up</Text>
              <Text style={styles.emptySubtitle}>
                New updates will appear here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF7EE',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    paddingRight: 8,
  },
  time: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  message: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
