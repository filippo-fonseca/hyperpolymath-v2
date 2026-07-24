/**
 * Sign-in gate — Google OAuth, one tap. The server is auto-resolved
 * (Metro host in dev, production site otherwise); no manual URL entry.
 * Spacedrive register: solid canvas, hairline chrome, Space Grotesk, cyan CTA.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { resolveServerUrl } from "../lib/server";
import { signInWithGoogle } from "../lib/supabase";
import { font, sd } from "../theme";

export function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      const server = await resolveServerUrl();
      if (!server) {
        setError("Could not reach a Hyperpolymath server.");
        return;
      }
      const result = await signInWithGoogle(server);
      if (!result.ok) {
        if (result.error !== "cancelled") setError(result.error);
        return;
      }
      onSignedIn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.logotype}>Hyperpolymath</Text>
      <Text style={styles.eyebrow}>JARVIS · MOBILE</Text>
      <Text style={styles.lede}>
        Sign in with the same Google account you use on the web. No device codes.
      </Text>

      <Pressable
        onPress={onGoogle}
        disabled={busy}
        style={({ pressed }) => [
          styles.cta,
          pressed && { opacity: 0.85 },
          busy && { opacity: 0.6 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
      >
        {busy ? (
          <ActivityIndicator color={sd.app} />
        ) : (
          <Text style={styles.ctaLabel}>Continue with Google</Text>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ flex: 1 }} />
      <Text style={styles.footnote}>
        Advanced device-token pairing and server override remain available in
        Settings after sign-in.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: sd.app,
    paddingHorizontal: 28,
  },
  logotype: {
    fontFamily: font.logotype,
    fontSize: 36,
    color: sd.ink,
    letterSpacing: -0.5,
  },
  eyebrow: {
    marginTop: 10,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    color: sd.inkFaint,
    textTransform: "uppercase",
  },
  lede: {
    marginTop: 18,
    fontFamily: font.sans,
    fontSize: 16,
    lineHeight: 24,
    color: sd.inkDull,
    maxWidth: 340,
  },
  cta: {
    marginTop: 36,
    height: 48,
    borderRadius: sd.radius.full,
    backgroundColor: sd.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaLabel: {
    fontFamily: font.sansSemiBold,
    fontSize: 15,
    color: sd.app,
    letterSpacing: -0.1,
  },
  error: {
    marginTop: 14,
    fontFamily: font.sans,
    fontSize: 13,
    color: sd.coral,
  },
  footnote: {
    fontFamily: font.sans,
    fontSize: 12,
    lineHeight: 18,
    color: sd.inkFaint,
  },
});
