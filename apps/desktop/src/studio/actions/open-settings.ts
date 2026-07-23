/**
 * Summon (or focus) the Settings widget on the studio stage.
 *
 * The HUD gear button and any voice/gesture "open settings" path route through
 * here so there is one definition of what "open settings" means. Settings is a
 * singleton widget, so a repeat call focuses the existing sheet rather than
 * spawning a second one. Safe to call before the studio has mounted — the
 * summon just seeds the persisted window store, which the layer picks up on
 * mount.
 */

import { summonWidget } from "../state/widget-windows";
import { WIDGET_CATALOG } from "../windows/catalog";

export function openSettingsWidget(): void {
  const entry = WIDGET_CATALOG.settings;
  summonWidget("settings", {}, undefined, {
    singleton: entry.singleton,
  });
}
