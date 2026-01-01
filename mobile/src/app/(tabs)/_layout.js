// app/(tabs)/_layout.js
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_CACHE_KEY } from '../../api/api';
import { useNotifications } from '../../context/NotificationContext';

export default function TabsLayout() {
  const [role, setRole] = useState('student');
  const { notifications } = useNotifications();
  const notificationCount = Array.isArray(notifications)
    ? notifications.length
    : 0;
  const badgeValue = notificationCount > 99 ? '99+' : `${notificationCount}`;

  useEffect(() => {
    const loadUser = async () => {
      try {
        const entries = await AsyncStorage.multiGet([USER_CACHE_KEY, 'user']);
        const json = entries[0][1] || entries[1][1];
        if (json) {
          const user = JSON.parse(json);
          setRole(user.role);
        } else {
          setRole('student');
        }
      } catch {
        setRole('student');
      }
    };
    loadUser();
  }, []);

  return (
    <Tabs
      initialRouteName="home-dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: 'orange',
      }}
    >
      <Tabs.Screen
        name="home-dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="catering"
        options={{
          title: 'Catering',
          href: role === 'faculty' ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="customer-cart"
        options={{
          title: 'Cart',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="order-tracking"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <View style={styles.iconWrapper}>
              <Ionicons
                name="notifications-outline"
                size={size}
                color={color}
              />
              {notificationCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeValue}</Text>
                </View>
              ) : null}
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="account-profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
});
