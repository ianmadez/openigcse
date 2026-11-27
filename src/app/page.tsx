import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/login/actions";
import { demoMode, getSetupState, onboardingBypass } from "@/lib/data/session";
import { SubmitButton } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Menu" };

type Item = { label: string; href: string; hint: string };

const LEARNER: Item[] = [
  { label: "Today", href: "/today", hint: "What to study now" },
  { label: "Timetable", href: "/timetable", hint: "This week" },
  { label: "Assessments", href: "/assessments", hint: "Quizzes and papers" },
  { label: "Review", href: "/review", hint: "Mistakes to fix" },
  { label: "Progress", href: "/progress", hint: "How it is going" },
  { label: "Trivia", href: "/trivia", hint: "Documentaries" },
];

const PARENT: Item[] = [
  { label: "Overview", href: "/parent", hint: "Household at a glance" },
  { label: "Timetable", href: "/parent/timetable", hint: "Plan the week" },
  { label: "Questions", href: "/parent/questions", hint: "Question bank" },
  { label: "Assessments", href: "/parent/assessments", hint: "Build a paper" },
  { label: "Marking desk", href: "/parent/marking-desk", hint: "Mark and review" },
  { label: "Settings", href: "/parent/settings", hint: "PIN and devices" },
];

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <section className="mt-6">
      <h2 className="label">{title}</h2>
      <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="surface pressable block p-4">
              <span className="block text-[0.9375rem] font-semibold text-primary">{item.label}</span>
              <span className="block text-caption text-secondary">{item.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The main menu: one page that links every area the signed-in person can use. */
export default async function MenuPage() {
  const state = await getSetupState();

  if (state.status === "signed-out" && !demoMode()) redirect("/login");
  if (state.status === "unconfigured" && !onboardingBypass()) redirect("/parent/onboarding");

  const isLearner = state.status === "configured" && state.role === "student";
  const name = state.status === "configured" ? state.householdName : "OpenIGCSE";

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl bg-page px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-caption text-muted">OpenIGCSE</p>
          <h1 className="text-title font-semibold text-primary">{name}</h1>
        </div>
        <form action={signOutAction}>
          <SubmitButton variant="secondary" pendingLabel="Signing out">
            Sign out
          </SubmitButton>
        </form>
      </div>

      <Section title="Learner" items={LEARNER} />
      {!isLearner && <Section title="Parent (asks for the PIN)" items={PARENT} />}
    </main>
  );
}
