/**
 * /manifesto - the thesis behind the system.
 *
 * A static, prose-first page linked from the landing footer. Mirrors the
 * /branding route's chrome (back-link header, SectionEyebrow, 960px max,
 * single column) so the two reference routes feel like one set.
 *
 * Voice: serious, calm, first-person, declarative. No em dashes per
 * house style on this branch.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { SectionEyebrow } from "@/components/landing/SectionEyebrow";

export const metadata: Metadata = {
  title: "Manifesto · Hyperpolymath",
  description:
 "Why Hyperpolymath exists, what it refuses to do, and the contract between the agent and the schema underneath.",
};

function Article({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <SectionEyebrow label={label} />
      <h2
        className="font-semibold text-[28px] leading-[1.2] text-[var(--sd-ink)]"
        style={{ letterSpacing: "-0.015em" }}
      >
        {title}
      </h2>
      <div className="space-y-4 text-[18px] leading-[1.65] text-[var(--sd-ink)]">
        {children}
      </div>
    </section>
  );
}

export default function ManifestoPage() {
  return (
    <main className="mx-auto w-full max-w-[760px] px-6 md:px-10 py-16 space-y-16">
      <header className="flex flex-col gap-4">
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)] transition-colors w-fit"
        >
          ← Hyperpolymath
        </Link>
        <div>
          <SectionEyebrow label="§ 00 · MANIFESTO" />
          <h1
            className="mt-4 font-semibold text-[40px] md:text-[48px] leading-[1.05] text-[var(--sd-ink)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            Manifesto.
          </h1>
          <p className="mt-3 italic text-[18px] leading-[1.55] text-[var(--sd-ink-dull)]">
            The thesis behind the system, written plainly, in one sitting.
          </p>
        </div>
      </header>

      <Article label="§ 01 · PREMISE" title="The Renaissance ideal is a working hypothesis.">
        <p>
          The same person who trains for a marathon can read Augustine and
          ship code. They can keep a garden, study a language, raise a
          family, and run a company. None of these things are in conflict.
          They only feel that way because the tools we use to organize our
          digital lives were designed by people who believed they were.
        </p>
        <p>
          Hyperpolymath is built on the opposite belief. Specialization is
          a strategy, not a virtue. The interesting lives are the ones that
          refuse to choose.
        </p>
      </Article>

      <Article label="§ 02 · DIAGNOSIS" title="The obstacle is fragmentation, not time.">
        <p>
          We tell ourselves we are too busy. We are not. We are scattered.
          A task lives in one app, a calendar event in another, a note in a
          third, an idea in a group chat, a deadline inside an email
          thread. The cost of moving information between these places is
          paid in small, constant attention taxes that add up to most of
          the day.
        </p>
        <p>
          The unsolved version of disorganization in our digital lives is
          the disorganization we would never tolerate in our physical
          ones. You would not keep your books in nine different rooms with
          nine different librarians. You should not keep your life there
          either.
        </p>
      </Article>

      <Article label="§ 03 · PRIMITIVES" title="Five nouns, one verb.">
        <p>
          A life-OS does not need fifty primitives. It needs five.
        </p>
        <p>
          <em>Areas</em> are the long-running domains of a life: health,
          work, study, relationships, craft. <em>Projects</em> are
          finite arcs inside an area, including classes and one-off
          builds. <em>Tasks</em> are the units of action. <em>Captures</em>{" "}
          are the loose thoughts that have not been routed yet.{" "}
          <em>Events</em> are the moments when time itself becomes the
          constraint, and they live in Google Calendar where they belong.
        </p>
        <p>
          The verb is <em>route</em>. One sentence in, one action in the
          right place out. Everything else the system does is in service
          of that single motion.
        </p>
      </Article>

      <Article label="§ 04 · AGENT" title="JARVIS is a router, not an oracle.">
        <p>
          The agent does not pretend to be wise. It does not propose
          strategies. It does not ask three follow-up questions before
          doing the obvious thing. It takes a sentence, decides which
          primitive it belongs to, and writes the row. When it is wrong,
          it is wrong cheaply, and you can fix it in one more sentence.
        </p>
        <p>
          This is not a limitation. It is the whole point. A good router
          you trust is more valuable than a clever advisor you have to
          double-check.
        </p>
      </Article>

      <Article label="§ 05 · CONTRACT" title="The schema is the artifact.">
        <p>
          The app you are looking at is one rendering of Hyperpolymath.
          The real artifact is the contract underneath: a typed schema, a
          JSON tool definition the agent speaks, and a small set of
          realtime conventions that keep every surface honest about the
          same source of truth.
        </p>
        <p>
          That is why the repository is public and the license is MIT. If
          the methodology only works for me, it is not a methodology. If
          you fork the schema and ship something I would never have built,
          that is not a defection. That is the project succeeding.
        </p>
      </Article>

      <Article label="§ 06 · AESTHETIC" title="Academic paper meets quiet terminal.">
        <p>
          The visual register is deliberate. Serif body type, mono labels,
          generous margins, restrained color. We are trying to build
          something you would not be embarrassed to use in a library.
        </p>
        <p>
          Productivity software has spent a decade looking like a casino
          floor: notifications, badges, streaks, celebratory animations
          when you complete a chore. Hyperpolymath is the opposite of
          that. It is a desk, a journal, and a calm assistant standing
          slightly to the left of the page.
        </p>
      </Article>

      <Article label="§ 07 · COMMITMENTS" title="What the project will not do.">
        <p>
          It will not gamify your life. It will not sell your data, ever,
          for any reason, because there is nothing to sell that you have
          not already chosen to put inside it. It will not lock you in.
          It will not pretend to be your friend. It will not ship a
          feature whose only purpose is to make a graph go up.
        </p>
        <p>
          It will stay small enough to understand, open enough to fork,
          and serious enough to use for years.
        </p>
      </Article>

      <Article label="§ 08 · INVITATION" title="Use it, or build your own.">
        <p>
          If the system fits the shape of your life, sign in and start
          typing. If it does not, the framework is yours: the primitives,
          the JSON contract, the schema, the patterns. Build the version
          that fits you. I encourage it.
        </p>
        <p>
          Either way, the thesis is the same. The way we organize our
          attention is the most consequential design decision of a life.
          It deserves better than the tools we have been handed.
        </p>
      </Article>

      <footer className="pt-8 border-t border-[var(--sd-line)]">
        <p className="italic text-[16px] leading-[1.55] text-[var(--sd-ink-dull)]">
          how you do one thing is how you do everything. love what you do.
        </p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--sd-ink-dull)]">
          ❦  Filippo Fonseca  ·  New Haven
        </p>
      </footer>
    </main>
  );
}
