import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function BiometricFaceEnrollmentScreen() {
  const router = useRouter();
  const { autoPrompt } = useLocalSearchParams();
  const [checkingSupport, setCheckingSupport] = useState(true);

  const handleFaceScan = useCallback(async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        router.replace('/home-dashboard');
        return;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert(
          'Error',
          'No biometrics enrolled. Please set up Face ID or fingerprint first.'
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Scan your fingerprint to continue',
        fallbackLabel: 'Use Passcode',
      });

      if (result.success) {
        Alert.alert('Success', 'verified successfully!');
        router.push('/(tabs)/home-dashboard'); // ✅ Navigate to main app
      } else {
        Alert.alert('Failed', 'scan failed. Try again.');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  }, [router]);

  useEffect(() => {
    let isMounted = true;
    const checkSupport = async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        router.replace('/home-dashboard');
        return;
      }
      if (autoPrompt === 'true') {
        handleFaceScan();
      }
    };
    checkSupport().finally(() => {
      if (isMounted) setCheckingSupport(false);
    });
    return () => {
      isMounted = false;
    };
  }, [autoPrompt, handleFaceScan, router]);

  if (checkingSupport) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FF8C00" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fingerprint Scan</Text>
      <Text style={styles.subtitle}>
        Scan Fingerprint to verify your identity
      </Text>

      <TouchableOpacity style={styles.button} onPress={handleFaceScan}>
        <Text style={styles.buttonText}>Start Finger Scan</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.cancelButton}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>

      <ActivityIndicator
        size="large"
        color="#FF8C00"
        style={{ marginTop: 30 }}
      />
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
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#FF8C00',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelButton: { marginTop: 20 },
  cancelText: { color: '#888', fontSize: 16 },
});
