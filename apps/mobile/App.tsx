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
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Root } from "./src/screens/Root";
import { sd } from "./src/theme";

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

  if (!spaceLoaded || !monoLoaded || !logoLoaded) {
    return <View style={{ flex: 1, backgroundColor: sd.app }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Root />
    </SafeAreaProvider>
  );
}
