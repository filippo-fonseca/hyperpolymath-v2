// Read-only Areas → Projects browser. Opened from the Tasks header; mirrors
// the web sidebar tree. Projects show their open-task count; classes get a
// small marker. Mutations stay on web — this is a reference surface.

import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getProjects, type DeviceArea } from "../lib/data";
import { colors, mono, serif, serifSemiBold } from "../theme";
import { KiwiLoader } from "./KiwiLoader";
import { EmptyState } from "./shell";

export function ProjectsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [areas, setAreas] = useState<DeviceArea[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setAreas(null);
    void getProjects().then((res) => {
      if (!cancelled) setAreas(res ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const totalProjects = (areas ?? []).reduce((n, a) => n + a.projects.length, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Projects</Text>
          {areas !== null ? <Text style={styles.count}>{totalProjects}</Text> : null}
          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <Text style={styles.closeLabel}>DONE</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {areas === null ? (
            <View style={{ paddingTop: 80, alignItems: "center" }}>
              <KiwiLoader size={34} />
            </View>
          ) : null}
          {areas !== null && areas.length === 0 ? (
            <EmptyState message="No areas yet. Set them up on the web." />
          ) : null}
          {(areas ?? []).map((area) => (
            <View key={area.id} style={styles.areaBlock}>
              <Text style={styles.areaName}>
                {area.emoji ? `${area.emoji}  ` : ""}
                {area.name}
              </Text>
              {area.projects.length === 0 ? (
                <Text style={styles.areaEmpty}>no active projects</Text>
              ) : (
                area.projects.map((p) => (
                  <View key={p.id} style={styles.projectRow}>
                    <Text style={styles.projectName} numberOfLines={1}>
                      {p.icon ? `${p.icon}  ` : ""}
                      {p.name}
                      {p.isClass ? <Text style={styles.classTag}>  CLASS</Text> : null}
                    </Text>
                    {p.openTaskCount > 0 ? (
                      <Text style={styles.openCount}>{p.openTaskCount}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    color: colors.accent,
    fontFamily: serifSemiBold,
    fontSize: 22,
    letterSpacing: 1,
  },
  count: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 13,
  },
  close: {
    marginLeft: "auto",
  },
  closeLabel: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 2,
  },
  list: {
    paddingHorizontal: 24,
  },
  areaBlock: {
    marginBottom: 22,
  },
  areaName: {
    color: colors.text,
    fontFamily: serifSemiBold,
    fontSize: 17,
    marginBottom: 8,
  },
  areaEmpty: {
    color: colors.textDim,
    fontFamily: serif,
    fontSize: 14,
    fontStyle: "italic",
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  projectName: {
    flex: 1,
    color: colors.text,
    fontFamily: serif,
    fontSize: 16,
  },
  classTag: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1,
  },
  openCount: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 13,
  },
});
