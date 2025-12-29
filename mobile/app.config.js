// app.config.js
import 'dotenv/config';

export default {
  expo: {
    name: 'MOBILE_CAPSTONE',
    slug: 'MOBILE_CAPSTONE',
    version: '1.0.0',
    scheme: 'mobilecapstone',
    platforms: ['ios', 'android', 'web'],

    // ✅ Add userInterfaceStyle here
    userInterfaceStyle: 'automatic', // can be 'automatic', 'light', or 'dark'

    android: {
      package: 'com.anonymous.MOBILE_CAPSTONE',
      googleServicesFile: './google-services.json',
    },
    ios: {
      bundleIdentifier: 'com.anonymous.MOBILE_CAPSTONE',
      googleServicesFile: './GoogleService-Info.plist',
    },
    extra: {
      expoClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    },
  },
};
