interface Props {
  collapsed: boolean;
}

export function Wordmark({ collapsed }: Props) {
  // EB Garamond 16px/400, letter-spacing -0.03em per UI-SPEC §Wordmark
  return (
    <div
      className="font-serif text-base select-none overflow-hidden"
      style={{ letterSpacing: "-0.03em" }}
    >
      {collapsed ? "H" : "Hyperpolymath"}
    </div>
  );
}
