// Wiki surface container. The app has no navigation library and keeps every
// tab screen mounted, so this owns a tiny internal browse ↔ reader ↔ editor
// stack. The browse view stays mounted underneath the reader so the folder
// position and scroll are preserved when you come back from a page. The editor
// mounts over the top when editing a page or writing today's note; closing it
// remounts the reader so freshly-saved content shows on return.

import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  WikiEditorScreen,
  dailyQuickEntryTarget,
  type WikiEditorTarget,
} from "../WikiEditor";
import { WikiBrowse } from "./WikiBrowse";
import { WikiReader } from "./WikiReader";

type View_ = { view: "browse" } | { view: "reader"; pageId: string };

export function WikiScreen({ active }: { active: boolean }) {
  const [nav, setNav] = useState<View_>({ view: "browse" });
  const [editing, setEditing] = useState<WikiEditorTarget | null>(null);
  // Bumped when the editor closes so the reader remounts and re-fetches.
  const [readerEpoch, setReaderEpoch] = useState(0);

  const openPage = useCallback((pageId: string) => setNav({ view: "reader", pageId }), []);
  const back = useCallback(() => setNav({ view: "browse" }), []);

  const editPage = useCallback((pageId: string) => setEditing({ kind: "page", id: pageId }), []);
  const openDaily = useCallback(() => setEditing(dailyQuickEntryTarget()), []);
  const closeEditor = useCallback(() => {
    setEditing(null);
    // Fresh content for whatever page we just left the editor on.
    setReaderEpoch((n) => n + 1);
  }, []);

  return (
    <View style={styles.root}>
      <WikiBrowse active={active} onOpenPage={openPage} onOpenDaily={openDaily} />
      {nav.view === "reader" ? (
        <View style={styles.overlay}>
          <WikiReader
            key={`reader:${nav.pageId}:${readerEpoch}`}
            pageId={nav.pageId}
            onBack={back}
            onEdit={(page) => editPage(page.id)}
          />
        </View>
      ) : null}
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
