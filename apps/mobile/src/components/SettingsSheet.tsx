// Settings modal: server URL, device token pairing (minted at
// /settings/desktop on the web app — same flow as the desktop app), voice
// output toggle, ElevenLabs voice ID, and a connection probe.

import { useState } from "react";
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
import { colors, mono } from "../theme";

export function SettingsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const settings = getSettings();
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [token, setToken] = useState(getDeviceToken() ?? "");
  const [ttsEnabled, setTtsEnabled] = useState(settings.ttsEnabled);
  const [voiceId, setVoiceId] = useState(settings.voiceId);
  const [probe, setProbe] = useState<string | null>(null);

  const save = async () => {
    await updateSettings({
      serverUrl: serverUrl.trim().replace(/\/$/, "") || settings.serverUrl,
      ttsEnabled,
      voiceId: voiceId.trim() || settings.voiceId,
    });
    await setDeviceToken(token);
    onClose();
  };

  const runProbe = async () => {
    setProbe("probing…");
    // Probe with the values currently in the form, not the saved ones.
    await updateSettings({ serverUrl: serverUrl.trim().replace(/\/$/, "") });
    await setDeviceToken(token);
    const result = await probeConnection();
    setProbe(
      result === "ok"
        ? "connected — token accepted"
        : result === "voice-only"
          ? "connected — voice OK, text route not deployed on this server yet"
          : result === "unauthorized"
            ? "unauthorized — check token"
            : "unreachable — check server URL",
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>SETTINGS</Text>

          <Text style={styles.label}>SERVER URL</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://your-app.vercel.app"
            placeholderTextColor={colors.textDim}
          />

          <Text style={styles.label}>DEVICE TOKEN</Text>
          <Text style={styles.hint}>
            Mint one at /settings/desktop on the web app, then paste it here.
          </Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="hpd_…"
            placeholderTextColor={colors.textDim}
            secureTextEntry
          />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>VOICE OUTPUT</Text>
              <Text style={styles.hint}>Speak responses aloud (ElevenLabs).</Text>
            </View>
            <Switch
              value={ttsEnabled}
              onValueChange={setTtsEnabled}
              trackColor={{ true: "rgba(0, 212, 255, 0.5)", false: "#22313a" }}
              thumbColor={ttsEnabled ? colors.accent : "#5a6b75"}
            />
          </View>

          <Text style={styles.label}>VOICE ID</Text>
          <TextInput
            style={styles.input}
            value={voiceId}
            onChangeText={setVoiceId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="ElevenLabs voice ID"
            placeholderTextColor={colors.textDim}
          />

          <Pressable onPress={runProbe} style={({ pressed }) => [styles.probe, pressed && { opacity: 0.7 }]}>
            <Text style={styles.probeLabel}>TEST CONNECTION</Text>
          </Pressable>
          {probe ? <Text style={styles.probeResult}>{probe}</Text> : null}

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
              <Text style={styles.buttonLabel}>CANCEL</Text>
            </Pressable>
            <Pressable
              onPress={save}
              style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.buttonLabel, { color: colors.bg }]}>SAVE</Text>
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
    backgroundColor: colors.bg,
  },
  content: {
    padding: 24,
    gap: 8,
  },
  title: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 14,
    letterSpacing: 4,
    marginBottom: 16,
  },
  label: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 14,
  },
  hint: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 14,
    marginTop: 6,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  probe: {
    marginTop: 24,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  probeLabel: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 2,
  },
  probeResult: {
    color: colors.textDim,
    fontFamily: mono,
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  buttonLabel: {
    color: colors.text,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 2,
  },
});
