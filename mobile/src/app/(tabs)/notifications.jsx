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
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { useFocusEffect } from 'expo-router';
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

const formatTypeLabel = (value) => {
  if (!value) return 'Update';
  const clean = String(value).replace(/_/g, ' ').trim();
  if (!clean || clean === 'default') return 'Update';
  return clean.replace(/\b\w/g, (match) => match.toUpperCase());
};

export default function NotificationsScreen() {
  const { notifications, loading, refresh } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const [fontsLoaded] = useFonts({ Roboto_700Bold });

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

  useFocusEffect(
    useCallback(() => {
      refresh?.({ silent: true });
    }, [refresh])
  );

  const renderItem = ({ item }) => {
    const typeKey = (item?.type || 'default').toLowerCase();
    const accent = typeStyles[typeKey] || typeStyles.default;
    const title = item?.title || item?.subject || 'Notification';
    const message = item?.message || item?.body || item?.description || '';
    const timestamp = formatTime(item?.created_at || item?.createdAt);
    const typeLabel = formatTypeLabel(typeKey);

    return (
      <View style={[styles.card, { borderLeftColor: accent.color }]}>
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
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: accent.bg, borderColor: accent.color },
              ]}
            >
              <Text style={[styles.typeBadgeText, { color: accent.color }]}>
                {typeLabel}
              </Text>
            </View>
          </View>
          {timestamp ? <Text style={styles.time}>{timestamp}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <>
      <LinearGradient
        colors={['#FFE4C7', '#FFC37A', '#FF8A3D']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.heroCard}
      >
        <View style={styles.heroRow}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="notifications-outline" size={22} color="#1F2937" />
          </View>
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Alerts</Text>
            <Text style={styles.heroSubtitle}>
              Latest updates and reminders
            </Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>
              {sortedNotifications.length} updates
            </Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <Text style={styles.sectionSubtitle}>Stay in the loop</Text>
        </View>
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>
            {sortedNotifications.length}
          </Text>
        </View>
      </View>
    </>
  );

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F97316" />
        <Text style={styles.loadingText}>Loading alerts...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

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
          ListHeaderComponent={renderHeader}
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
            <View style={styles.emptyCard}>
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
  listContent: {
    paddingTop: 12,
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
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#F97316',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
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
    gap: 8,
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
    marginTop: 4,
  },
  message: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
    lineHeight: 16,
  },
  typeBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    marginHorizontal: 16,
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
