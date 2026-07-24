// Areas → Projects manager for paired mobile. Mirrors the web sidebar tree,
// with compact create/rename/archive/delete affordances.

import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  createArea,
  createProject,
  deleteArea,
  deleteProject,
  getProjects,
  updateArea,
  updateProject,
  type DeviceArea,
  type DeviceProject,
} from "../lib/data";
import { font, sd } from "../theme";
import { KiwiLoader } from "./KiwiLoader";
import { EmptyState, ErrorState, Field, FieldLabel, FormSheet } from "./shell";

type FormState =
  | { kind: "area"; id: string | null; name: string; emoji: string }
  | {
      kind: "project";
      id: string | null;
      areaId: string;
      areaName: string;
      name: string;
      icon: string;
    };

export function ProjectsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [areas, setAreas] = useState<DeviceArea[] | null>(null);
  const [error, setError] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  const refresh = useCallback(async () => {
    const res = await getProjects();
    if (res === null) {
      setError(true);
    } else {
      setError(false);
      setAreas(res);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setAreas(null);
    setError(false);
    void getProjects().then((res) => {
      if (cancelled) return;
      if (res === null) setError(true);
      else setAreas(res);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const totalProjects = (areas ?? []).reduce((n, a) => n + a.projects.length, 0);

  const openArea = (area?: DeviceArea) => {
    setForm({
      kind: "area",
      id: area?.id ?? null,
      name: area?.name ?? "",
      emoji: area?.emoji ?? "",
    });
  };

  const openProject = (area: DeviceArea, project?: DeviceProject) => {
    setForm({
      kind: "project",
      id: project?.id ?? null,
      areaId: area.id,
      areaName: area.name,
      name: project?.name ?? "",
      icon: project?.icon ?? "",
    });
  };

  const save = async () => {
    if (!form || !form.name.trim()) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const current = form;
    setForm(null);
    if (current.kind === "area") {
      if (current.id) {
        await updateArea({ id: current.id, name: current.name.trim(), emoji: current.emoji.trim() || null });
      } else {
        await createArea({ name: current.name.trim(), emoji: current.emoji.trim() || null });
      }
    } else if (current.id) {
      await updateProject({ id: current.id, name: current.name.trim(), icon: current.icon.trim() || null });
    } else {
      await createProject({
        areaId: current.areaId,
        name: current.name.trim(),
        icon: current.icon.trim() || null,
      });
    }
    await refresh();
  };

  const archive = async () => {
    if (!form?.id) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const current = form;
    const id = form.id;
    setForm(null);
    if (current.kind === "area") {
      await updateArea({ id, archived: true });
    } else {
      await updateProject({ id, archived: true });
    }
    await refresh();
  };

  const remove = () => {
    if (!form?.id) return;
    const current = form;
    const id = form.id;
    const label = current.kind === "area" ? "area" : "project";
    Alert.alert(`Delete ${label}?`, "This is permanent. Archiving is safer if you might need it later.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            setForm(null);
            if (current.kind === "area") {
              await deleteArea(id);
            } else {
              await deleteProject(id);
            }
            await refresh();
          })();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Projects</Text>
          {areas !== null ? <Text style={styles.count}>{totalProjects}</Text> : null}
          <Pressable
            onPress={() => openArea()}
            hitSlop={10}
            style={({ pressed }) => [styles.addArea, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.addAreaLabel}>+ AREA</Text>
          </Pressable>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <Text style={styles.closeLabel}>DONE</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={areas === null && !error} onRefresh={() => void refresh()} tintColor={sd.accent} />
          }
        >
          {areas === null && !error ? (
            <View style={{ paddingTop: 80, alignItems: "center" }}>
              <KiwiLoader size={34} />
            </View>
          ) : null}
          {areas === null && error ? <ErrorState onRetry={() => void refresh()} /> : null}
          {areas !== null && areas.length === 0 ? (
            <EmptyState message="No areas yet. Tap + area to start." />
          ) : null}
          {(areas ?? []).map((area) => (
            <View key={area.id} style={styles.areaBlock}>
              <View style={styles.areaHeader}>
                <Pressable
                  onPress={() => openArea(area)}
                  style={({ pressed }) => [styles.areaTitleButton, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.areaName} numberOfLines={1}>
                    {area.emoji ? `${area.emoji}  ` : ""}
                    {area.name}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => openProject(area)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.smallButtonLabel}>+ PROJECT</Text>
                </Pressable>
              </View>
              {area.projects.length === 0 ? (
                <Text style={styles.areaEmpty}>no active projects</Text>
              ) : (
                area.projects.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => openProject(area, p)}
                    style={({ pressed }) => [styles.projectRow, pressed && { opacity: 0.72 }]}
                  >
                    <Text style={styles.projectName} numberOfLines={1}>
                      {p.icon ? `${p.icon}  ` : ""}
                      {p.name}
                      {p.isClass ? <Text style={styles.classTag}>  CLASS</Text> : null}
                    </Text>
                    {p.openTaskCount > 0 ? (
                      <Text style={styles.openCount}>{p.openTaskCount}</Text>
                    ) : null}
                  </Pressable>
                ))
              )}
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>

        <FormSheet
          visible={form !== null}
          title={
            form?.kind === "area"
              ? form.id
                ? "Edit area"
                : "New area"
              : form?.id
                ? "Edit project"
                : "New project"
          }
          onClose={() => setForm(null)}
          onSave={() => void save()}
          onDelete={form?.id ? remove : undefined}
        >
          {form?.kind === "area" ? (
            <>
              <FieldLabel>NAME</FieldLabel>
              <Field
                value={form.name}
                onChangeText={(name) => setForm({ ...form, name })}
                placeholder="Area name"
                autoFocus={!form.id}
              />
              <FieldLabel>EMOJI</FieldLabel>
              <Field
                value={form.emoji}
                onChangeText={(emoji) => setForm({ ...form, emoji })}
                placeholder="Optional"
              />
            </>
          ) : null}
          {form?.kind === "project" ? (
            <>
              <Text style={styles.formContext}>UNDER {form.areaName.toUpperCase()}</Text>
              <FieldLabel>NAME</FieldLabel>
              <Field
                value={form.name}
                onChangeText={(name) => setForm({ ...form, name })}
                placeholder="Project name"
                autoFocus={!form.id}
              />
              <FieldLabel>ICON</FieldLabel>
              <Field
                value={form.icon}
                onChangeText={(icon) => setForm({ ...form, icon })}
                placeholder="Optional"
              />
            </>
          ) : null}
          {form?.id ? (
            <Pressable
              onPress={() => void archive()}
              style={({ pressed }) => [styles.archiveButton, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.archiveLabel}>ARCHIVE</Text>
            </Pressable>
          ) : null}
        </FormSheet>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: sd.app,
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
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 22,
    letterSpacing: -0.2,
  },
  count: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 13,
  },
  addArea: {
    marginLeft: "auto",
  },
  addAreaLabel: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  close: {
    marginLeft: 8,
  },
  closeLabel: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 12,
    letterSpacing: 2,
  },
  list: {
    paddingHorizontal: 24,
  },
  areaBlock: {
    marginBottom: 22,
  },
  areaHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  areaTitleButton: {
    flex: 1,
  },
  areaName: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 17,
  },
  smallButton: {
    borderRadius: sd.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  smallButtonLabel: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  areaEmpty: {
    color: sd.inkFaint,
    fontFamily: font.sans,
    fontSize: 14,
    fontStyle: "italic",
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sd.line,
  },
  projectName: {
    flex: 1,
    color: sd.ink,
    fontFamily: font.sans,
    fontSize: 16,
  },
  classTag: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1,
  },
  openCount: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 13,
  },
  formContext: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  archiveButton: {
    marginTop: 16,
    height: 42,
    borderRadius: sd.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(229, 168, 75, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  archiveLabel: {
    color: sd.amber,
    fontFamily: font.sansMedium,
    fontSize: 13,
    letterSpacing: 0.6,
  },
});
