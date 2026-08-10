import { Redirect } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { signInWithGoogle } from "../src/lib/supabase";
import { useTheme } from "@/theme";
import { AppText, Button, Logotype, Screen } from "@/ui";
import { useAuth } from "@/ui/auth";

export default function SignInScreen() {
  const t = useTheme();
  const { status } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "signedIn") return <Redirect href="/" />;

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithGoogle();
      if (!result.ok) setError(result.error);
    } catch {
      setError("Sign-in failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ justifyContent: "center" }}>
      <Animated.View
        entering={FadeInDown.duration(t.motion.duration.panel).springify().damping(26)}
        style={{ alignItems: "center", gap: 8, paddingBottom: 64 }}
      >
        <Logotype size={40} />
        <AppText variant="meta" muted style={{ marginBottom: 28 }}>
          Your life, one sentence at a time.
        </AppText>
        <Button
          label="Continue with Google"
          size="lg"
          loading={busy}
          onPress={handleSignIn}
          style={{ alignSelf: "stretch", marginHorizontal: 32 }}
        />
        {error ? (
          <View style={{ marginTop: 16, paddingHorizontal: 32 }}>
            <AppText variant="meta" color={t.c.coral} style={{ textAlign: "center" }}>
              {error}
            </AppText>
          </View>
        ) : null}
      </Animated.View>
    </Screen>
  );
}
