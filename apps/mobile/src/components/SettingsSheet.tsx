// Settings: account (Google), server URL, voice, advanced device-token fallback.

import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { probeConnection } from "../lib/api";
import {
  getDeviceToken,
  getSettings,
  setDeviceToken,
  updateSettings,
} from "../lib/settings";
import { getSession, signOut } from "../lib/supabase";
import {
  getNotificationPermission,
  requestNotificationPermissions,
  type NotificationPermissionState,
} from "../lib/task-notifications";
import { font, sd } from "../theme";

export function SettingsSheet({
  visible,
  onClose,
  onSignedOut,
}: {
  visible: boolean;
  onClose: () => void;
  onSignedOut?: () => void;
}) {
  const settings = getSettings();
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [token, setToken] = useState(getDeviceToken() ?? "");
  const [ttsEnabled, setTtsEnabled] = useState(settings.ttsEnabled);
  const [voiceId, setVoiceId] = useState(settings.voiceId);
  const [probe, setProbe] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermissionState>("undetermined");
  const session = getSession();
  const email =
    (typeof session?.user?.email === "string" && session.user.email) || null;

  useEffect(() => {
    if (!visible) return;
    const s = getSettings();
    setServerUrl(s.serverUrl);
    setTtsEnabled(s.ttsEnabled);
    setVoiceId(s.voiceId);
    setToken(getDeviceToken() ?? "");
    setProbe(null);
    void getNotificationPermission().then(setNotifPerm);
  }, [visible]);

  const save = async () => {
    await updateSettings({
      serverUrl: serverUrl.trim().replace(/\/$/, "") || settings.serverUrl,
      ttsEnabled,
      voiceId: voiceId.trim() || settings.voiceId,
    });
    if (showAdvanced) await setDeviceToken(token);
    onClose();
  };

  const runProbe = async () => {
    setProbe("probing…");
    await updateSettings({ serverUrl: serverUrl.trim().replace(/\/$/, "") });
    if (showAdvanced) await setDeviceToken(token);
    const result = await probeConnection();
    setProbe(
      result === "ok"
        ? "connected"
        : result === "voice-only"
          ? "connected — voice OK, text route not deployed yet"
          : result === "unauthorized"
            ? "unauthorized — sign in again or check token"
            : "unreachable — check server URL",
    );
  };

  const onSignOut = async () => {
    await signOut();
    onClose();
    onSignedOut?.();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Settings</Text>

          <Text style={styles.label}>ACCOUNT</Text>
          <View style={styles.accountCard}>
            <Text style={styles.accountEmail}>{email ?? "Signed in"}</Text>
            <Text style={styles.hint}>Google · Supabase session</Text>
            <Pressable
              onPress={onSignOut}
              style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.signOutLabel}>Sign out</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>SERVER URL</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://hyperpolymath.com"
            placeholderTextColor={sd.inkFaint}
          />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>VOICE OUTPUT</Text>
              <Text style={styles.hint}>Speak responses aloud (ElevenLabs).</Text>
            </View>
            <Switch
              value={ttsEnabled}
              onValueChange={setTtsEnabled}
              trackColor={{ true: "rgba(34, 211, 238, 0.45)", false: sd.darkBox }}
              thumbColor={ttsEnabled ? sd.accent : sd.inkFaint}
            />
          </View>

          <Text style={styles.label}>TASK NOTIFICATIONS</Text>
          <Text style={styles.hint}>
            Local reminders for task deadlines. Status: {notifPerm}.
            {notifPerm === "denied"
              ? " Enable notifications for JARVIS in system Settings."
              : ""}
          </Text>
          {notifPerm !== "granted" ? (
            <Pressable
              onPress={async () => {
                const ok = await requestNotificationPermissions();
                setNotifPerm(ok ? "granted" : await getNotificationPermission());
              }}
              style={({ pressed }) => [styles.probe, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.probeLabel}>ENABLE NOTIFICATIONS</Text>
            </Pressable>
          ) : null}

          <Text style={styles.label}>VOICE ID</Text>
          <TextInput
            style={styles.input}
            value={voiceId}
            onChangeText={setVoiceId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="ElevenLabs voice ID"
            placeholderTextColor={sd.inkFaint}
          />

          <Pressable
            onPress={() => setShowAdvanced((v) => !v)}
            style={({ pressed }) => [styles.advancedToggle, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.advancedToggleLabel}>
              {showAdvanced ? "▾ Advanced · device token" : "▸ Advanced · device token"}
            </Text>
          </Pressable>
          {showAdvanced ? (
            <>
              <Text style={styles.hint}>
                Optional fallback. Mint at /settings/desktop on the web app if you still need a paired `hpd_` token.
              </Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="hpd_…"
                placeholderTextColor={sd.inkFaint}
                secureTextEntry
              />
            </>
          ) : null}

          <Pressable onPress={runProbe} style={({ pressed }) => [styles.probe, pressed && { opacity: 0.7 }]}>
            <Text style={styles.probeLabel}>TEST CONNECTION</Text>
          </Pressable>
          {probe ? <Text style={styles.probeResult}>{probe}</Text> : null}

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
              <Text style={styles.buttonLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.buttonLabel, { color: sd.app }]}>Save</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: sd.app,
  },
  content: {
    padding: 24,
    gap: 8,
  },
  title: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 22,
    letterSpacing: -0.2,
    marginBottom: 16,
  },
  label: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    marginTop: 14,
  },
  hint: {
    color: sd.inkDull,
    fontFamily: font.sans,
    fontSize: 13,
    marginTop: 2,
    marginBottom: 4,
    lineHeight: 18,
  },
  accountCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: sd.radius.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    gap: 4,
  },
  accountEmail: {
    color: sd.ink,
    fontFamily: font.sansMedium,
    fontSize: 15,
  },
  signOut: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: sd.radius.chrome,
    backgroundColor: sd.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
  },
  signOutLabel: {
    color: sd.coral,
    fontFamily: font.sansMedium,
    fontSize: 13,
  },
  input: {
    height: 44,
    borderRadius: sd.radius.pillInset,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.input,
    color: sd.ink,
    paddingHorizontal: 14,
    fontFamily: font.sans,
    fontSize: 15,
    marginTop: 6,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  advancedToggle: {
    marginTop: 22,
    paddingVertical: 8,
  },
  advancedToggleLabel: {
    color: sd.inkDull,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  probe: {
    marginTop: 24,
    height: 44,
    borderRadius: sd.radius.pillInset,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    alignItems: "center",
    justifyContent: "center",
  },
  probeLabel: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 12,
    letterSpacing: 1.4,
  },
  probeResult: {
    color: sd.inkDull,
    fontFamily: font.mono,
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 28,
  },
  button: {
    flex: 1,
    height: 46,
    borderRadius: sd.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: sd.accent,
    borderColor: sd.accent,
  },
  buttonLabel: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 14,
  },
});
