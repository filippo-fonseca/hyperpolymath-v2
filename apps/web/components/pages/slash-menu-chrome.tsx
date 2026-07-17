import {
  Code,
  File,
  Film,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Image,
  List,
  ListChecks,
  ListCollapse,
  ListOrdered,
  Minus,
  Smile,
  Table,
  TextQuote,
  Type,
  Volume2,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Chrome for BlockNote's default `/` slash items: our icons and our kbd chips.
 *
 * BlockNote ships each default item with a react-icons/ri glyph at 18px
 * (`getDefaultReactSlashMenuItems`). Two problems: the heading items use RiH1…RiH6,
 * which are literal "H1"…"H6" letterforms rather than icons, and the rest mix
 * remixicon's Fill and Line families, so a single menu carries three drawing
 * languages at once.
 *
 * These are lucide at 16px — the app's own icon vocabulary (~150 component files
 * import it), one consistent 2px-stroke language. Deliberately NOT the dimensional
 * set in `components/ui/icons`: those are 80x80 illustrations built from radial
 * body gradients, feDropShadow and specular sheen (see `icons/shared.tsx`), which
 * turn to mush at 16px and only cover entities (Area/Task/Page), not block types
 * like "bulleted list". Sizing/color live in CSS (`page-block-editor.css`, the
 * `[data-position="left"]` rules).
 */
const SLASH_ICONS: Record<string, ReactNode> = {
  heading: <Heading1 />,
  heading_2: <Heading2 />,
  heading_3: <Heading3 />,
  heading_4: <Heading4 />,
  heading_5: <Heading5 />,
  heading_6: <Heading6 />,
  toggle_heading: <Heading1 />,
  toggle_heading_2: <Heading2 />,
  toggle_heading_3: <Heading3 />,
  quote: <TextQuote />,
  toggle_list: <ListCollapse />,
  numbered_list: <ListOrdered />,
  bullet_list: <List />,
  check_list: <ListChecks />,
  paragraph: <Type />,
  table: <Table />,
  image: <Image />,
  video: <Film />,
  audio: <Volume2 />,
  file: <File />,
  emoji: <Smile />,
  code_block: <Code />,
  divider: <Minus />,
};

/**
 * BlockNote renders its badges as "⌘-Alt-1" (or "Ctrl-Alt-1" off macOS) — the
 * modifier words and hyphens read nothing like the app's own kbd chips, which are
 * bare symbol runs ("⌃⌥C" in the tab bar, CommandShortcut in ui/command.tsx).
 * Map the remaining word-modifiers to glyphs and drop the separators.
 */
const MODIFIER_GLYPHS: Record<string, string> = {
  mod: "⌘",
  cmd: "⌘",
  command: "⌘",
  ctrl: "⌃",
  control: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
};

export function formatSlashBadge(badge: string): string {
  return badge
    .split("-")
    .map((part) => MODIFIER_GLYPHS[part.trim().toLowerCase()] ?? part.trim())
    .join("");
}

/**
 * Clone each default slash item, swapping in our icon and kbd chip. Non-destructive
 * in the same spirit as `withSlashShorthand`: an unknown key keeps whatever BlockNote
 * gave it, so a new default block type still renders rather than losing its icon.
 */
export function withSdSlashChrome<T extends { key?: string; icon?: ReactNode; badge?: string }>(
  items: T[]
): T[] {
  return items.map((item) => {
    const icon = item.key ? SLASH_ICONS[item.key] : undefined;
    return {
      ...item,
      icon: icon ?? item.icon,
      badge: item.badge ? formatSlashBadge(item.badge) : item.badge,
    };
  });
}
