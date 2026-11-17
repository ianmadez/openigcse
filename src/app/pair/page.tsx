import Link from "next/link";

import { PairDeviceForm } from "@/components/auth/PairDeviceForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pair this device" };

export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<{ revoked?: string }>;
}) {
  const { revoked } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent">
            O
          </span>
          <span className="text-[0.9375rem] font-semibold text-primary">OpenIGCSE</span>
        </div>

        <h1 className="text-title font-semibold text-primary">Pair this device</h1>
        <p className="mt-1.5 max-w-[42ch] text-[0.9375rem] leading-relaxed text-secondary">
          Enter the six-digit code from the parent device. Pairing gives this device its own session, so the learner
          stays signed in without typing a password.
        </p>

        <div className="surface mt-5 p-5">
          <PairDeviceForm revoked={revoked === "1"} />
        </div>

        <p className="mt-5 text-caption text-muted">
          Are you the guardian?{" "}
          <Link href="/login" className="font-medium text-accent-text">
            Sign in instead
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
