// app.config.js
import 'dotenv/config';

export default {
  expo: {
    name: 'TechnoMart',
    slug: 'technomart',
    version: '1.0.0',
    scheme: 'technomart',
    platforms: ['ios', 'android', 'web'],

    userInterfaceStyle: 'automatic',

    android: {
      package: 'com.joseph224.TechnoMart',
      googleServicesFile: './google-services.json',
    },
    ios: {
      bundleIdentifier: 'com.joseph224.TechnoMart',
      googleServicesFile: './GoogleService-Info.plist',
    },

    plugins: [
      'expo-web-browser', // ✅ REQUIRED for Google OAuth
    ],

    extra: {
      eas: {
        projectId: '21ae84c5-ea43-48c9-be6e-1aa4a8d7d641',
      },
      expoClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    },
  },
};
