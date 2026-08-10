// Dependency-free lightweight markdown renderer for the wiki page reader.
// No webview, no third-party markdown lib — a small block + inline parser that
// covers the mirror markdown the web editor emits: headings, bold/italic,
// inline code, fenced code blocks, bullet/numbered lists, blockquotes, links,
// and horizontal rules. Anything fancier degrades to plain text, which is the
// right failure mode for a reader. Ported from the v1 wiki and restyled onto
// the craft type ladder.

import * as WebBrowser from "expo-web-browser";
import React, { Fragment, type ReactNode } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { useTheme, withAlpha, type Theme } from "@/theme";

// ── Inline parsing ────────────────────────────────────────────────────────────

type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; v: Inline[] }
  | { t: "italic"; v: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; v: Inline[]; href: string };

/**
 * Tokenize a single line of inline markdown. Deliberately small: handles
 * `code`, **bold** / __bold__, *italic* / _italic_, and [text](href). Bold is
 * matched before italic so `**x**` doesn't get eaten by the italic rule.
 */
function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push({ t: "text", v: buf });
      buf = "";
    }
  };

  while (i < src.length) {
    const rest = src.slice(i);

    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      out.push({ t: "code", v: code[1]! });
      i += code[0].length;
      continue;
    }

    const link = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest);
    if (link) {
      flush();
      out.push({ t: "link", v: parseInline(link[1]!), href: link[2]! });
      i += link[0].length;
      continue;
    }

    const bold = /^(\*\*|__)(.+?)\1/.exec(rest);
    if (bold) {
      flush();
      out.push({ t: "bold", v: parseInline(bold[2]!) });
      i += bold[0].length;
      continue;
    }

    const italic = /^(\*|_)(?!\s)(.+?)\1/.exec(rest);
    if (italic) {
      flush();
      out.push({ t: "italic", v: parseInline(italic[2]!) });
      i += italic[0].length;
      continue;
    }

    buf += src[i];
    i += 1;
  }
  flush();
  return out;
}

function openHref(href: string): void {
  const url = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  WebBrowser.openBrowserAsync(url).catch(() => {
    Linking.openURL(url).catch(() => {
      /* dead link — swallow, reader must not crash */
    });
  });
}

// ── Block parsing ─────────────────────────────────────────────────────────────

type Block =
  | { t: "heading"; level: number; text: string }
  | { t: "paragraph"; text: string }
  | { t: "code"; text: string }
  | { t: "quote"; text: string }
  | { t: "list"; ordered: boolean; items: string[] }
  | { t: "hr" };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) {
        body.push(lines[i]!);
        i += 1;
      }
      i += 1; // closing fence (or EOF)
      blocks.push({ t: "code", text: body.join("\n") });
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ t: "hr" });
      i += 1;
      continue;
    }

    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ t: "heading", level: heading[1]!.length, text: heading[2]!.trim() });
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i]!)) {
        body.push(lines[i]!.replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ t: "quote", text: body.join("\n") });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/;
    const ordered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || ordered.test(line)) {
      const isOrdered = ordered.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const m = (isOrdered ? ordered : bullet).exec(lines[i]!);
        if (!m) break;
        items.push(m[1]!);
        i += 1;
      }
      blocks.push({ t: "list", ordered: isOrdered, items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !isBlockStart(lines[i]!)) {
      para.push(lines[i]!.trim());
      i += 1;
    }
    blocks.push({ t: "paragraph", text: para.join(" ") });
  }

  return blocks;
}

function isBlockStart(line: string): boolean {
  return (
    /^\s*#{1,6}\s+/.test(line) ||
    /^\s*```/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)
  );
}

// ── Styling (craft type ladder) ───────────────────────────────────────────────

function docStyles(t: Theme) {
  // Reading sizes sit one notch above UI chrome: paragraphs at 16/1.55.
  const readSize = t.type.subtitle.fontSize;
  const readLine = Math.round(readSize * 1.55);
  const heading = (size: number, lh: number) => ({
    color: t.c.ink,
    fontFamily: t.fonts.sansSemiBold,
    fontSize: size,
    lineHeight: lh,
    letterSpacing: -0.3,
    marginTop: 6,
  });
  return StyleSheet.create({
    doc: { gap: 12 },
    h1: heading(24, 30),
    h2: heading(t.type.title.fontSize, t.type.title.lineHeight),
    h3: heading(17, 24),
    h4: heading(readSize, readLine),
    paragraph: {
      color: t.c.ink,
      fontFamily: t.fonts.sans,
      fontSize: readSize,
      lineHeight: readLine,
    },
    bold: { fontFamily: t.fonts.sansSemiBold, color: t.c.ink },
    italic: { fontStyle: "italic" as const },
    inlineCode: {
      fontFamily: t.fonts.mono,
      fontSize: readSize - 2,
      color: t.c.ink,
      backgroundColor: t.c.surface,
    },
    link: { color: t.c.accent, textDecorationLine: "underline" as const },
    codeBlock: {
      borderRadius: t.radius.tile,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.c.edge,
      backgroundColor: t.c.surface,
      padding: 12,
    },
    codeText: {
      fontFamily: t.fonts.mono,
      fontSize: t.type.meta.fontSize,
      lineHeight: Math.round(t.type.meta.fontSize * 1.5),
      color: t.c.inkMuted,
    },
    quote: {
      borderLeftWidth: 2,
      borderLeftColor: t.c.edgeStrong,
      paddingLeft: 12,
    },
    quoteText: {
      color: t.c.inkMuted,
      fontFamily: t.fonts.sans,
      fontSize: readSize - 1,
      lineHeight: Math.round((readSize - 1) * 1.5),
      fontStyle: "italic" as const,
    },
    list: { gap: 6 },
    listItem: { flexDirection: "row" as const, gap: 10 },
    bullet: {
      color: t.c.inkFaint,
      fontFamily: t.fonts.mono,
      fontSize: readSize - 1,
      lineHeight: readLine,
      minWidth: 18,
    },
    listText: {
      flex: 1,
      color: t.c.ink,
      fontFamily: t.fonts.sans,
      fontSize: readSize,
      lineHeight: readLine,
    },
    hr: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: withAlpha(t.c.edgeStrong, 0.9),
      marginVertical: 4,
    },
  });
}

// ── Public component ──────────────────────────────────────────────────────────

export function Markdown({ source }: { source: string }) {
  const t = useTheme();
  const s = docStyles(t);
  const blocks = parseBlocks(source);

  const renderInline = (nodes: Inline[], keyPrefix: string): ReactNode =>
    nodes.map((n, idx) => {
      const key = `${keyPrefix}.${idx}`;
      switch (n.t) {
        case "text":
          return <Fragment key={key}>{n.v}</Fragment>;
        case "bold":
          return (
            <Text key={key} style={s.bold}>
              {renderInline(n.v, key)}
            </Text>
          );
        case "italic":
          return (
            <Text key={key} style={s.italic}>
              {renderInline(n.v, key)}
            </Text>
          );
        case "code":
          return (
            <Text key={key} style={s.inlineCode}>
              {n.v}
            </Text>
          );
        case "link":
          return (
            <Text key={key} style={s.link} onPress={() => openHref(n.href)}>
              {renderInline(n.v, key)}
            </Text>
          );
      }
    });

  const headingStyle = (level: number) =>
    level <= 1 ? s.h1 : level === 2 ? s.h2 : level === 3 ? s.h3 : s.h4;

  return (
    <View style={s.doc}>
      {blocks.map((b, idx) => {
        const key = `b${idx}`;
        switch (b.t) {
          case "heading":
            return (
              <Text key={key} style={headingStyle(b.level)} selectable>
                {renderInline(parseInline(b.text), key)}
              </Text>
            );
          case "paragraph":
            return (
              <Text key={key} style={s.paragraph} selectable>
                {renderInline(parseInline(b.text), key)}
              </Text>
            );
          case "code":
            return (
              <View key={key} style={s.codeBlock}>
                <Text style={s.codeText} selectable>
                  {b.text}
                </Text>
              </View>
            );
          case "quote":
            return (
              <View key={key} style={s.quote}>
                <Text style={s.quoteText} selectable>
                  {renderInline(parseInline(b.text), key)}
                </Text>
              </View>
            );
          case "list":
            return (
              <View key={key} style={s.list}>
                {b.items.map((item, li) => (
                  <View key={`${key}.${li}`} style={s.listItem}>
                    <Text style={s.bullet}>{b.ordered ? `${li + 1}.` : "•"}</Text>
                    <Text style={s.listText} selectable>
                      {renderInline(parseInline(item), `${key}.${li}`)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "hr":
            return <View key={key} style={s.hr} />;
        }
      })}
    </View>
  );
}
