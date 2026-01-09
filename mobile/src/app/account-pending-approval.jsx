import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_700Bold,
  Roboto_900Black,
} from '@expo-google-fonts/roboto';

export default function AccountPendingApprovalScreen() {
  const router = useRouter();

  let [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_700Bold,
    Roboto_900Black,
  });
  if (!fontsLoaded) return null;

  return (
    <ImageBackground
      source={require('../../assets/drop_3.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.3)']}
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContainer}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Text style={styles.title}>Pending Approval</Text>
          <Text style={styles.subtitle}>
            Your account is under review. Please wait for approval before
            logging in.
          </Text>

          <View style={styles.card}>
            <View style={{ alignItems: 'center', marginBottom: 15 }}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={60}
                color="#F97316"
              />
            </View>

            <Text style={styles.messageText}>
              We are validating your ID. You will be notified once your account
              is approved.
            </Text>

            <TouchableOpacity
              style={styles.button}
              onPress={() => router.push('/account-login')}
            >
              <Text style={styles.buttonText}>Go back to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 25,
    paddingVertical: 40,
  },
  container: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  title: {
    fontSize: 28,
    fontFamily: 'Roboto_900Black',
    color: '#333',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Roboto_400Regular',
    color: '#555',
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 25,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
    elevation: 3,
  },
  messageText: {
    fontSize: 15,
    fontFamily: 'Roboto_400Regular',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#FF8C00',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontFamily: 'Roboto_700Bold',
    fontSize: 16,
  },
});
