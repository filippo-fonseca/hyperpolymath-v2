import { requireOnboarded } from "@/lib/auth/get-user";

export default async function TodayPage() {
  await requireOnboarded();

  return (
    <div className="flex h-full items-center justify-center">
      <h1
        className="font-serif text-[28px] font-semibold"
        style={{ letterSpacing: "-0.02em" }}
      >
        Hyperpolymath
      </h1>
    </div>
  );
}
