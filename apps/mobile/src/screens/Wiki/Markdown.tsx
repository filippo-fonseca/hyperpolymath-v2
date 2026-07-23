// Dependency-free lightweight markdown renderer for the wiki page reader.
// No webview, no third-party markdown lib — a small block + inline parser that
// covers the mirror markdown the web editor emits: headings, bold/italic,
// inline code, fenced code blocks, bullet/numbered lists, blockquotes, links,
// and horizontal rules. Anything fancier degrades to plain text, which is the
// right failure mode for a reader.

import { Fragment, type ReactNode } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";

import { font, sd } from "../../theme";

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

    // Inline code — highest precedence, no nested formatting.
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      out.push({ t: "code", v: code[1] });
      i += code[0].length;
      continue;
    }

    // Link [text](href)
    const link = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest);
    if (link) {
      flush();
      out.push({ t: "link", v: parseInline(link[1]), href: link[2] });
      i += link[0].length;
      continue;
    }

    // Bold **…** or __…__
    const bold = /^(\*\*|__)(.+?)\1/.exec(rest);
    if (bold) {
      flush();
      out.push({ t: "bold", v: parseInline(bold[2]) });
      i += bold[0].length;
      continue;
    }

    // Italic *…* or _…_  (single marker, non-greedy, non-empty)
    const italic = /^(\*|_)(?!\s)(.+?)\1/.exec(rest);
    if (italic) {
      flush();
      out.push({ t: "italic", v: parseInline(italic[2]) });
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

function renderInline(nodes: Inline[], keyPrefix: string): ReactNode {
  return nodes.map((n, idx) => {
    const key = `${keyPrefix}.${idx}`;
    switch (n.t) {
      case "text":
        return <Fragment key={key}>{n.v}</Fragment>;
      case "bold":
        return (
          <Text key={key} style={styles.bold}>
            {renderInline(n.v, key)}
          </Text>
        );
      case "italic":
        return (
          <Text key={key} style={styles.italic}>
            {renderInline(n.v, key)}
          </Text>
        );
      case "code":
        return (
          <Text key={key} style={styles.inlineCode}>
            {n.v}
          </Text>
        );
      case "link":
        return (
          <Text key={key} style={styles.link} onPress={() => openHref(n.href)}>
            {renderInline(n.v, key)}
          </Text>
        );
    }
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
    const line = lines[i];

    // Blank line — skip.
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Fenced code block ```
    const fence = /^\s*```/.exec(line);
    if (fence) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence (or EOF)
      blocks.push({ t: "code", text: body.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ t: "hr" });
      i += 1;
      continue;
    }

    // Heading
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ t: "heading", level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    // Blockquote (consume consecutive > lines)
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ t: "quote", text: body.join("\n") });
      continue;
    }

    // Lists (bullet or ordered) — consume consecutive item lines.
    const bullet = /^\s*[-*+]\s+(.*)$/;
    const ordered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || ordered.test(line)) {
      const isOrdered = ordered.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const m = (isOrdered ? ordered : bullet).exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      blocks.push({ t: "list", ordered: isOrdered, items });
      continue;
    }

    // Paragraph — gather until a blank line or a block starter.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i].trim());
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

const HEADING_STYLE = [styles_h(28), styles_h(23), styles_h(19), styles_h(17), styles_h(15), styles_h(14)];

function styles_h(size: number) {
  return { fontSize: size, lineHeight: Math.round(size * 1.3) };
}

// ── Public component ──────────────────────────────────────────────────────────

export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <View style={styles.doc}>
      {blocks.map((b, idx) => {
        const key = `b${idx}`;
        switch (b.t) {
          case "heading":
            return (
              <Text
                key={key}
                style={[styles.heading, HEADING_STYLE[b.level - 1]]}
                selectable
              >
                {renderInline(parseInline(b.text), key)}
              </Text>
            );
          case "paragraph":
            return (
              <Text key={key} style={styles.paragraph} selectable>
                {renderInline(parseInline(b.text), key)}
              </Text>
            );
          case "code":
            return (
              <View key={key} style={styles.codeBlock}>
                <Text style={styles.codeText} selectable>
                  {b.text}
                </Text>
              </View>
            );
          case "quote":
            return (
              <View key={key} style={styles.quote}>
                <Text style={styles.quoteText} selectable>
                  {renderInline(parseInline(b.text), key)}
                </Text>
              </View>
            );
          case "list":
            return (
              <View key={key} style={styles.list}>
                {b.items.map((item, li) => (
                  <View key={`${key}.${li}`} style={styles.listItem}>
                    <Text style={styles.bullet}>{b.ordered ? `${li + 1}.` : "•"}</Text>
                    <Text style={styles.listText} selectable>
                      {renderInline(parseInline(item), `${key}.${li}`)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "hr":
            return <View key={key} style={styles.hr} />;
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  doc: {
    gap: 12,
  },
  heading: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    letterSpacing: -0.3,
    marginTop: 6,
  },
  paragraph: {
    color: sd.ink,
    fontFamily: font.sans,
    fontSize: 16,
    lineHeight: 24,
  },
  bold: {
    fontFamily: font.sansSemiBold,
    color: sd.ink,
  },
  italic: {
    fontStyle: "italic",
  },
  inlineCode: {
    fontFamily: font.mono,
    fontSize: 14,
    color: sd.accentFaint,
    backgroundColor: sd.darkBox,
  },
  link: {
    color: sd.accent,
    textDecorationLine: "underline",
  },
  codeBlock: {
    borderRadius: sd.radius.tile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.darkerBox,
    padding: 12,
  },
  codeText: {
    fontFamily: font.mono,
    fontSize: 13,
    lineHeight: 19,
    color: sd.inkDull,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: sd.line,
    paddingLeft: 12,
  },
  quoteText: {
    color: sd.inkDull,
    fontFamily: font.sans,
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
  },
  list: {
    gap: 6,
  },
  listItem: {
    flexDirection: "row",
    gap: 10,
  },
  bullet: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 15,
    lineHeight: 23,
    minWidth: 18,
  },
  listText: {
    flex: 1,
    color: sd.ink,
    fontFamily: font.sans,
    fontSize: 16,
    lineHeight: 23,
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: sd.line,
    marginVertical: 4,
  },
});
