import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/AuthPanel";
import { Callout } from "@/components/ui/primitives";
import { getAuthContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const context = await getAuthContext();

  if (context && (context.role === "parent_educator" || context.role === "developer_admin")) {
    redirect("/parent");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent">
            O
          </span>
          <span className="text-[0.9375rem] font-semibold text-primary">OpenIGCSE</span>
        </div>

        <h1 className="text-title font-semibold text-primary">Sign in</h1>
        <p className="mt-1.5 max-w-[46ch] text-[0.9375rem] leading-relaxed text-secondary">
          Guardians sign in here to reach marking, term dates and the learner's plan. Learners pair their own device
          with a six-digit code instead of a password.
        </p>

        {error === "link" && (
          <div className="mt-4">
            <Callout tone="warning" title="That sign-in link did not work">
              Links expire quickly and only work once. Request a new one, or sign in with your password.
            </Callout>
          </div>
        )}

        {context?.role === "student" && (
          <div className="mt-4">
            <Callout tone="info" title="This device is paired as a learner">
              The learner view lives at <Link href="/today" className="font-semibold underline">Today</Link>. A
              guardian needs their own sign-in for the parent area.
            </Callout>
          </div>
        )}

        <div className="mt-5">
          <AuthPanel />
        </div>

        <p className="mt-5 text-caption text-muted">
          No household on this device yet?{" "}
          <Link href="/parent/onboarding" className="font-medium text-accent-text">
            Set one up
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
