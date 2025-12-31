import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACCESS_TOKEN_KEY } from '../../api/api';

export default function FaceScanScreen() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const redirect = async () => {
      try {
        const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
        if (!active) return;
        router.replace(token ? '/home-dashboard' : '/account-login');
      } catch {
        if (active) {
          router.replace('/account-login');
        }
      }
    };
    redirect();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#f97316" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
  },
});
