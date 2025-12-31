// app/(tabs)/_layout.js
import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_CACHE_KEY } from '../../api/api';

export default function TabsLayout() {
  const [role, setRole] = useState('student');

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
            <Ionicons name="notifications-outline" size={size} color={color} />
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
