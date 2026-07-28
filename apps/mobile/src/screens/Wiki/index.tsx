// Wiki surface container. The app has no navigation library and keeps every
// tab screen mounted, so this owns a tiny browse ↔ editor stack.
//
// Notion-style mobile: tapping a page opens the BlockNote editor directly
// (editable by default). The formatting accessory stays hidden until a block
// is focused. Browse stays mounted underneath so folder scroll is preserved
// when Done closes the editor.

import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  WikiEditorScreen,
  dailyQuickEntryTarget,
  type WikiEditorTarget,
} from "../WikiEditor";
import { WikiBrowse } from "./WikiBrowse";

export function WikiScreen({ active }: { active: boolean }) {
  const [editing, setEditing] = useState<WikiEditorTarget | null>(null);

  const openPage = useCallback(
    (pageId: string) => setEditing({ kind: "page", id: pageId }),
    [],
  );
  const openDaily = useCallback(() => setEditing(dailyQuickEntryTarget()), []);
  const closeEditor = useCallback(() => setEditing(null), []);

  return (
    <View style={styles.root}>
      <WikiBrowse active={active} onOpenPage={openPage} onOpenDaily={openDaily} />
      {editing ? (
        <View style={styles.overlay}>
          <WikiEditorScreen target={editing} onClose={closeEditor} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
