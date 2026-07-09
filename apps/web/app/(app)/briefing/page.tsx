import type { Metadata } from "next";
import { BriefingPage } from "@/components/briefing/BriefingPage";
import { requireOnboarded } from "@/lib/auth/get-user";
import { getBriefingData } from "@/lib/briefing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Briefing",
};

export default async function BriefingRoute() {
  await requireOnboarded();
  const data = await getBriefingData();
  return <BriefingPage data={data} />;
}
