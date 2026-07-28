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
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { isAuthed } from "./src/lib/auth-token";
import { maybeDevAutoSignIn } from "./src/lib/dev-auth";
import { loadSettings } from "./src/lib/settings";
import { initAuth, onAuthChange } from "./src/lib/supabase";
import { installNotificationHandler } from "./src/lib/task-notifications";
import { LoginScreen } from "./src/screens/Login";
import { Root } from "./src/screens/Root";
import { sd } from "./src/theme";

installNotificationHandler();

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
      setSignedIn(isAuthed());
      setReady(true);
    })();
    const off = onAuthChange(() => {
      setSignedIn(isAuthed());
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

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
