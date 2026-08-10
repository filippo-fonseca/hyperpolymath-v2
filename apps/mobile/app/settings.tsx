import Constants from "expo-constants";
import { router } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";

import { signOut } from "../src/lib/supabase";
import { AppText, Button, Divider, Screen, ScreenHeader } from "@/ui";

export default function SettingsScreen() {
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      router.replace("/sign-in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen topInset={false} style={{ paddingTop: 8 }}>
      <ScreenHeader title="Settings" />
      <View style={{ gap: 16, marginTop: 12 }}>
        <Button
          label="Sign out"
          variant="destructive"
          loading={busy}
          onPress={handleSignOut}
        />
        <Divider />
        <AppText variant="micro" mono faint>
          Hyperpolymath {Constants.expoConfig?.version ?? ""}
        </AppText>
      </View>
    </Screen>
  );
}
