// Settings modal: account, server, voice, connection probe. Ports the
// essentials of v1's SettingsSheet onto the craft register.

import Constants from "expo-constants";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";

import { probeConnection } from "@/api/jarvis";
import {
  DEFAULT_SERVER_URL,
  getSettings,
  updateSettings,
} from "@/lib/settings";
import { getSession, signOut } from "@/lib/supabase";
import { useTheme } from "@/theme";
import {
  AppText,
  Button,
  Divider,
  Screen,
  ScreenHeader,
  SectionHeader,
} from "@/ui";

type ProbeState =
  | { kind: "idle" }
  | { kind: "probing" }
  | { kind: "done"; label: string; ok: boolean };

const PROBE_LABELS: Record<string, { label: string; ok: boolean }> = {
  ok: { label: "Connected", ok: true },
  "voice-only": { label: "Connected · voice only", ok: true },
  unauthorized: { label: "Unauthorized — sign in again", ok: false },
  unreachable: { label: "Unreachable — check the URL", ok: false },
};

function Field({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="micro" weight="medium" faint>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={t.c.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          fontFamily: t.fonts.mono,
          fontSize: t.type.meta.fontSize,
          color: t.c.ink,
          backgroundColor: t.c.surface,
          borderRadius: t.radius.btn,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.c.edge,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
        accessibilityLabel={label}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const settings = getSettings();
  const session = getSession();
  const email = session?.user?.email ?? null;

  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [ttsEnabled, setTtsEnabled] = useState(settings.ttsEnabled);
  const [voiceId, setVoiceId] = useState(settings.voiceId);
  const [probe, setProbe] = useState<ProbeState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  const commitServerUrl = () => {
    const next = serverUrl.trim().replace(/\/$/, "") || DEFAULT_SERVER_URL;
    setServerUrl(next);
    void updateSettings({ serverUrl: next });
  };

  const commitVoiceId = () => {
    const next = voiceId.trim() || settings.voiceId;
    setVoiceId(next);
    void updateSettings({ voiceId: next });
  };

  const toggleTts = (on: boolean) => {
    setTtsEnabled(on);
    void updateSettings({ ttsEnabled: on });
  };

  const runProbe = async () => {
    setProbe({ kind: "probing" });
    const result = await probeConnection();
    const mapped = PROBE_LABELS[result] ?? PROBE_LABELS.unreachable!;
    setProbe({ kind: "done", ...mapped });
  };

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
      <ScreenHeader
        title="Settings"
        right={
          <Button
            label="Done"
            variant="ghost"
            size="sm"
            onPress={() => router.back()}
          />
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 32, gap: 4 }}
      >
        <SectionHeader title="Account" />
        <View style={{ paddingHorizontal: 10, paddingVertical: 6, gap: 2 }}>
          <AppText variant="body">{email ?? "Signed in"}</AppText>
          <AppText variant="micro" faint>
            Google account
          </AppText>
        </View>

        <SectionHeader title="Server" />
        <View style={{ gap: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Field
            label="Server URL"
            value={serverUrl}
            onChangeText={setServerUrl}
            onBlur={commitServerUrl}
            placeholder={DEFAULT_SERVER_URL}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Button
              label="Test connection"
              variant="outline"
              size="sm"
              loading={probe.kind === "probing"}
              onPress={() => void runProbe()}
            />
            {probe.kind === "done" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: probe.ok ? t.c.sage : t.c.coral,
                  }}
                />
                <AppText variant="micro" muted>
                  {probe.label}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        <SectionHeader title="Voice" />
        <View style={{ gap: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ gap: 2 }}>
              <AppText variant="body">Speak replies</AppText>
              <AppText variant="micro" faint>
                Jarvis reads answers aloud
              </AppText>
            </View>
            <Switch
              value={ttsEnabled}
              onValueChange={toggleTts}
              trackColor={{ true: t.c.accent }}
              accessibilityLabel="Speak replies"
            />
          </View>
          {ttsEnabled ? (
            <Field
              label="Voice id"
              value={voiceId}
              onChangeText={setVoiceId}
              onBlur={commitVoiceId}
            />
          ) : null}
        </View>

        <View style={{ marginTop: 20, gap: 16 }}>
          <Button
            label="Sign out"
            variant="destructive"
            loading={busy}
            onPress={() => void handleSignOut()}
          />
          <Divider />
          <AppText variant="micro" mono faint style={{ textAlign: "center" }}>
            Hyperpolymath {Constants.expoConfig?.version ?? ""}
          </AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}
