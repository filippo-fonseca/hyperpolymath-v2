import { Logotype } from "@/components/ui/Logotype";

interface Props {
  collapsed: boolean;
}

/**
 * Sidebar brand mark. Delegates to Logotype, which owns the only sanctioned use
 * of EB Garamond left in the app (UI contract R2) — the `font-serif` class this
 * used to carry now resolves to Space Grotesk like everything else.
 */
export function Wordmark({ collapsed }: Props) {
  return (
    <div className="text-[15px] leading-none overflow-hidden">
      <Logotype collapsed={collapsed} />
    </div>
  );
}
