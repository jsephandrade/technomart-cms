import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotFoundScreen() {
  const router = useRouter();

  const handleGoHome = useCallback(() => {
    router.replace('/home-dashboard');
  }, [router]);

  const handleGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/account-login');
    }
  }, [router]);

  return (
    <SafeAreaView className="flex-1 bg-white px-6 py-10">
      <View className="flex-1 items-center justify-center">
        <View className="mb-10 items-center">
          <Text className="text-4xl font-semibold text-gray-900">Oops!</Text>
          <Text className="mt-2 text-center text-base text-gray-600">
            We couldn&apos;t find that screen. The page may have moved or no
            longer exists.
          </Text>
        </View>

        <View className="w-full gap-4">
          <TouchableOpacity
            className="items-center rounded-lg bg-amber-500 py-3"
            onPress={handleGoHome}
            activeOpacity={0.85}
          >
            <Text className="text-base font-semibold text-white">
              Go to Home
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="items-center rounded-lg border border-gray-300 py-3"
            onPress={handleGoBack}
            activeOpacity={0.85}
          >
            <Text className="text-base font-semibold text-gray-700">
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
