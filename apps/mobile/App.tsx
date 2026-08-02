import {
  EBGaramond_600SemiBold,
  useFonts as useEbGaramond,
} from "@expo-google-fonts/eb-garamond";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  useFonts as useJetBrains,
} from "@expo-google-fonts/jetbrains-mono";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  useFonts as useSpaceGrotesk,
} from "@expo-google-fonts/space-grotesk";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { isAuthed } from "./src/lib/auth-token";
import { maybeDevAutoSignIn } from "./src/lib/dev-auth";
import { loadSettings } from "./src/lib/settings";
import { initAuth, onAuthChange } from "./src/lib/supabase";
import { LoginScreen } from "./src/screens/Login";
import { Root } from "./src/screens/Root";
import { sd } from "./src/theme";
import { registerWidgets } from "./src/widgets";
import { seedWidgetSnapshots, syncTodayWidget } from "./src/widgets/sync";
import { onDataInvalidate } from "./src/lib/use-collection";

registerWidgets();
seedWidgetSnapshots();

export default function App() {
  const [spaceLoaded] = useSpaceGrotesk({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  const [monoLoaded] = useJetBrains({
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  const [logoLoaded] = useEbGaramond({
    EBGaramond_600SemiBold,
  });

  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadSettings();
      await initAuth();
      if (!isAuthed()) await maybeDevAutoSignIn();
      if (cancelled) return;
      const authed = isAuthed();
      setSignedIn(authed);
      setReady(true);
      if (authed) void syncTodayWidget();
    })();
    const off = onAuthChange(() => {
      const authed = isAuthed();
      setSignedIn(authed);
      if (authed) void syncTodayWidget();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // Keep the Today widget fresh: foreground + JARVIS tool invalidation + poll.
  useEffect(() => {
    if (!signedIn) return;
    void syncTodayWidget();
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncTodayWidget();
    });
    const offInvalidate = onDataInvalidate(() => {
      void syncTodayWidget();
    });
    const interval = setInterval(() => {
      void syncTodayWidget();
    }, 60_000);
    return () => {
      appSub.remove();
      offInvalidate();
      clearInterval(interval);
    };
  }, [signedIn]);

  if (!spaceLoaded || !monoLoaded || !logoLoaded || !ready) {
    return <View style={{ flex: 1, backgroundColor: sd.app }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {signedIn ? (
        <Root />
      ) : (
        <LoginScreen onSignedIn={() => setSignedIn(true)} />
      )}
    </SafeAreaProvider>
  );
}
