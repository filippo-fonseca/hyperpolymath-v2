// Standalone dev entry for the wiki editor. Lets the screen be driven in the
// simulator WITHOUT wiring it into Root — the Conductor stitches real
// navigation at merge (unit-wiki-browse links to WikiEditorScreen). Rendered
// inside the existing App providers (fonts + auth + SafeAreaProvider), so it
// assumes a live bearer.
//
// Not referenced by production nav. Kept in the editor's fenced dir purely as a
// verification harness.

import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { setDeviceToken, updateSettings } from "../../lib/settings";
import { WikiEditorScreen, dailyQuickEntryTarget, type WikiEditorTarget } from "../../screens/WikiEditor";
import { font, sd } from "../../theme";

/**
 * Dev-only: point the client at the local mock wiki server (the sealed
 * API-CONTRACT stand-in used for verification). Override via
 * EXPO_PUBLIC_WIKI_MOCK_URL if the simulator can't reach localhost.
 */
const MOCK_SERVER_URL = process.env.EXPO_PUBLIC_WIKI_MOCK_URL ?? "http://localhost:3215";

export function WikiEditorDevHarness() {
  const insets = useSafeAreaInsets();
  const [target, setTarget] = useState<WikiEditorTarget | null>(null);
  const [pageId, setPageId] = useState("");

  useEffect(() => {
    void updateSettings({ serverUrl: MOCK_SERVER_URL });
    void setDeviceToken("hpd_devharness");
  }, []);

  if (target) {
    return <WikiEditorScreen target={target} onClose={() => setTarget(null)} />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40 }]}>
      <Text style={styles.kicker}>WIKI EDITOR — DEV HARNESS</Text>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
        onPress={() => setTarget(dailyQuickEntryTarget())}
      >
        <Text style={styles.btnLabel}>Daily quick entry</Text>
        <Text style={styles.btnSub}>Get-or-create today&apos;s page, cursor ready</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
        onPress={() => setTarget({ kind: "new" })}
      >
        <Text style={styles.btnLabel}>New blank page</Text>
        <Text style={styles.btnSub}>POST /pages then edit</Text>
      </Pressable>
      <View style={styles.openRow}>
        <TextInput
          style={styles.input}
          value={pageId}
          onChangeText={setPageId}
          placeholder="page id…"
          placeholderTextColor={sd.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={({ pressed }) => [styles.openBtn, pressed && { opacity: 0.7 }]}
          onPress={() => pageId.trim() && setTarget({ kind: "page", id: pageId.trim() })}
        >
          <Text style={styles.openLabel}>Open</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: sd.app,
    paddingHorizontal: 20,
    gap: 12,
  },
  kicker: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  btn: {
    borderRadius: sd.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    padding: 16,
    gap: 4,
  },
  btnLabel: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 17,
  },
  btnSub: {
    color: sd.inkFaint,
    fontFamily: font.sans,
    fontSize: 13,
  },
  openRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  input: {
    flex: 1,
    height: 46,
    borderRadius: sd.radius.pillInset,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.input,
    color: sd.ink,
    paddingHorizontal: 14,
    fontFamily: font.sans,
    fontSize: 15,
  },
  openBtn: {
    paddingHorizontal: 18,
    height: 46,
    borderRadius: sd.radius.pillInset,
    backgroundColor: sd.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  openLabel: {
    color: sd.app,
    fontFamily: font.sansSemiBold,
    fontSize: 15,
  },
});
