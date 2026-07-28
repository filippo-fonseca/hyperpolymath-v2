import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/auth/get-user";
import { listDesktopDevices } from "@/app/actions/desktop-devices";
import { DesktopDevicesClient } from "./DesktopDevicesClient";

/**
 * /settings/desktop — manage device tokens for the Tauri desktop app.
 *
 * Each token is a long-lived bearer string (`hpd_...`) the desktop pastes
 * into its settings. Server stores only the sha256 hash and validates
 * incoming `Authorization: Bearer ...` headers against it. Revoke kills a
 * device without touching others.
 */
export default async function DesktopDevicesPage() {
  await requireOnboarded();
  const result = await listDesktopDevices();
  if (!result.success) {
    redirect("/sign-in");
  }

  return (
    <main className="relative min-h-full bg-[var(--sd-app)] text-[var(--sd-ink)]">
      <div className="mx-auto w-full max-w-[720px] px-6 md:px-10 pt-10 pb-16">
        <header className="mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--sd-ink-dull)]">
            Settings · Desktop
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--sd-ink)]">
            Desktop devices
          </h1>
          <p className="mt-3 text-[16px] leading-[1.55] text-[var(--sd-ink-dull)]">
            Authorize the Hyperpolymath desktop app on each machine you use.
            Mint a token here, paste it once into the app&rsquo;s settings, and
            every request from that machine is signed as you. Revoke a token
            here and that machine immediately stops working — the other
            devices are untouched.
          </p>
        </header>

        <DesktopDevicesClient initialDevices={result.data} />
      </div>
    </main>
  );
}
