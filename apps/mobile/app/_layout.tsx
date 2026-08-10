import {
  EBGaramond_600SemiBold,
} from "@expo-google-fonts/eb-garamond";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from "@expo-google-fonts/jetbrains-mono";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  useFonts,
} from "@expo-google-fonts/space-grotesk";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { queryClient } from "@/data/queryClient";
import { startRealtime, stopRealtime, useAppStateRefetch } from "@/data/realtime";
import { useNotificationTapRouting, useTaskNotificationSync } from "@/lib/notifications";
import { ThemeProvider, useTheme } from "@/theme";
import { ToastHost } from "@/ui";
import { AuthProvider, useAuth } from "@/ui/auth";
import { startWidgetSync } from "@/widgets/sync";

void SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Session-scoped side channels — realtime invalidation, widget snapshots,
 * due-date notifications, foreground refetch — mounted once per signed-in
 * user so sign-out tears everything down together.
 */
function IntegrationsBridge({ userId }: { userId: string }) {
  useAppStateRefetch();
  useTaskNotificationSync();
  useNotificationTapRouting();
  useEffect(() => {
    void startRealtime(userId);
    const stopWidgets = startWidgetSync();
    return () => {
      stopRealtime();
      stopWidgets();
    };
  }, [userId]);
  return null;
}

function Gate() {
  const t = useTheme();
  const { status, session } = useAuth();
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    EBGaramond_600SemiBold,
  });

  const ready = fontsLoaded && status !== "loading";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      {status === "signedIn" && session ? (
        <IntegrationsBridge userId={session.user.id} />
      ) : null}
      <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.c.canvas },
        animation: "fade",
        animationDuration: 220,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
      <Stack.Screen name="settings" options={{ presentation: "modal" }} />
      <Stack.Screen name="wiki/[pageId]" options={{ animation: "default" }} />
      </Stack>
      <ToastHost />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <StatusBar style="auto" />
              <Gate />
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
