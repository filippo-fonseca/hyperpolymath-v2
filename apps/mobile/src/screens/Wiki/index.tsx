// Wiki surface container. The app has no navigation library and keeps every
// tab screen mounted, so this owns a tiny internal browse ↔ reader stack. The
// browse view stays mounted underneath the reader so the folder position and
// scroll are preserved when you come back from a page.

import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { WikiBrowse } from "./WikiBrowse";
import { WikiReader } from "./WikiReader";

type View_ = { view: "browse" } | { view: "reader"; pageId: string };

export function WikiScreen({ active }: { active: boolean }) {
  const [nav, setNav] = useState<View_>({ view: "browse" });

  const openPage = useCallback((pageId: string) => setNav({ view: "reader", pageId }), []);
  const back = useCallback(() => setNav({ view: "browse" }), []);

  return (
    <View style={styles.root}>
      <WikiBrowse active={active} onOpenPage={openPage} />
      {nav.view === "reader" ? (
        <View style={styles.overlay}>
          {/* onEdit intentionally omitted: unit-wiki-editor wires the editor
              route and passes it through, flipping the reader's Edit button on. */}
          <WikiReader pageId={nav.pageId} onBack={back} />
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
