import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';

export default function BiometricFaceEnrollmentScreen() {
  const router = useRouter();
  const promptStartedRef = useRef(false);

  useEffect(() => {
    if (promptStartedRef.current) return;
    promptStartedRef.current = true;

    const runBiometricCheck = async () => {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        if (!compatible) {
          router.replace('/home-dashboard');
          return;
        }

        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!enrolled) {
          router.replace('/home-dashboard');
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Scan your fingerprint to continue',
          fallbackLabel: 'Use Passcode',
        });

        if (result.success) {
          router.replace('/home-dashboard');
        } else {
          router.replace('/home-dashboard');
        }
      } catch (error) {
        router.replace('/home-dashboard');
      }
    };

    runBiometricCheck();
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#FF8C00" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
});
