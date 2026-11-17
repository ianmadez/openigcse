"use client";

import {
  ArrowUpRight,
  BookOpen,
  CalendarRange,
  ChevronDown,
  ClipboardCheck,
  Clapperboard,
  Gauge,
  GraduationCap,
  Home,
  MapPin,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { SoundProvider } from "@/components/sound/SoundProvider";
import { SoundToggle } from "@/components/sound/SoundToggle";
import { cn } from "@/lib/utils/cn";

type NavItem = { label: string; href: string; icon: typeof Home };

/** The sidebar tree comes from the learner's enrolments, never a hardcoded list. */
export type NavSubject = {
  code: string;
  name: string;
  slug: string;
  topics: Array<{ code: string; name: string }>;
};

const studentNav: NavItem[] = [
  { label: "Today", href: "/today", icon: Home },
  { label: "Timetable", href: "/timetable", icon: CalendarRange },
  { label: "Subjects", href: "/subjects", icon: BookOpen },
  { label: "Trivia", href: "/trivia", icon: Clapperboard },
  { label: "Review", href: "/review", icon: Target },
  { label: "Plan", href: "/plan", icon: MapPin },
  { label: "Progress", href: "/progress", icon: Gauge },
];

const parentNav: NavItem[] = [
  { label: "Overview", href: "/parent", icon: Home },
  { label: "Timetable", href: "/parent/timetable", icon: CalendarRange },
  { label: "Term planner", href: "/parent/term-planner", icon: MapPin },
  { label: "Marking desk", href: "/parent/marking-desk", icon: ClipboardCheck },
  { label: "Focus", href: "/parent/focus", icon: ShieldCheck },
  { label: "Progress", href: "/parent/progress", icon: Gauge },
  { label: "Household", href: "/parent/onboarding", icon: Sparkles },
  { label: "Settings", href: "/parent/settings", icon: Settings },
];

type AppShellProps = {
  variant: "student" | "parent";
  description?: string;
  learnerName: string;
  streakDays?: number;
  subjects?: NavSubject[];
  children: ReactNode;
};

export function AppShell({ variant, description, learnerName, streakDays, subjects = [], children }: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    setSubjectsOpen(pathname.startsWith("/subjects"));
  }, [pathname]);

  const nav = variant === "student" ? studentNav : parentNav;
  const home = variant === "student" ? "/today" : "/parent";
  const current = [...nav].sort((a, b) => b.href.length - a.href.length).find((item) => pathname.startsWith(item.href));

  return (
    <SoundProvider>
      <div className="min-h-dvh bg-page">
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className={cn(
            "fixed inset-0 z-30 bg-scrim transition-opacity duration-150 lg:hidden",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />

        <aside
          id="app-sidebar"
          aria-label={variant === "student" ? "Study navigation" : "Parent navigation"}
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-[17.5rem] flex-col border-r border-subtle bg-card transition-transform duration-200 ease-tactile lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-4">
            <Link href={home} className="pressable flex items-center gap-2.5 rounded-panel">
              <span className="flex size-9 items-center justify-center rounded-panel border-b-[3px] border-accent-hover bg-accent text-sm font-bold text-on-accent">
                O
              </span>
              <span className="leading-tight">
                <span className="block text-[0.9375rem] font-semibold tracking-tight text-primary">OpenIGCSE</span>
                <span className="block text-caption text-muted">
                  {variant === "student" ? "Study workspace" : "Parent area"}
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="icon-btn lg:hidden"
              aria-label="Close navigation"
            >
              <X aria-hidden="true" className="size-4" strokeWidth={2} />
            </button>
          </div>

          <nav
            aria-label={variant === "student" ? "Study" : "Parent"}
            className="scroll-contain flex-1 overflow-y-auto px-2.5 pb-4"
          >
            <ul className="space-y-0.5">
              {nav.map((item, index) => {
                const active = pathname === item.href || (item.href !== home && pathname.startsWith(item.href));

                // The Subjects entry unfolds into the subject list.
                if (variant === "student" && item.href === "/subjects") {
                  return (
                    <li key={item.href}>
                      <button
                        type="button"
                        onClick={() => setSubjectsOpen((value) => !value)}
                        aria-expanded={subjectsOpen}
                        aria-controls="sidebar-subjects"
                        className={cn("nav-link w-full justify-between", active && "text-primary")}
                      >
                        <span className="flex items-center gap-2.5">
                          <item.icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
                          {item.label}
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className={cn(
                            "size-3.5 transition-transform duration-200 ease-tactile",
                            subjectsOpen && "rotate-180",
                          )}
                          strokeWidth={2}
                        />
                      </button>

                      <div
                        id="sidebar-subjects"
                        hidden={!subjectsOpen}
                        className="mt-1 space-y-0.5 border-l border-subtle pl-3 ml-3"
                      >
                        {subjects.map((subject) => {
                          const expanded = expandedSubject === subject.code;
                          return (
                            <div key={subject.code}>
                              <button
                                type="button"
                                onClick={() => setExpandedSubject(expanded ? null : subject.code)}
                                aria-expanded={expanded}
                                className="row-hover flex w-full items-center gap-2 rounded-panel px-2 py-1.5 text-left text-[0.8125rem] text-secondary"
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn("size-1.5 shrink-0 rounded-full subject-" + facultyKey(subject.code))}
                                  style={{ backgroundColor: "oklch(var(--subject-ink))" }}
                                />
                                <span className="flex-1 truncate">{subject.name}</span>
                                <ChevronDown
                                  aria-hidden="true"
                                  className={cn("size-3 transition-transform duration-200", expanded && "rotate-180")}
                                  strokeWidth={2}
                                />
                              </button>

                              {expanded && (
                                <ul className="mb-1 space-y-0.5 pl-5">
                                  {subject.topics.slice(0, 4).map((topic) => (
                                    <li key={topic.code}>
                                      <Link
                                        href={`/subjects/${subject.slug}`}
                                        className="row-hover block truncate rounded px-2 py-1 text-[0.75rem] text-muted"
                                      >
                                        <span className="mr-1.5 tabular opacity-70">{topic.code}</span>
                                        {topic.name}
                                      </Link>
                                    </li>
                                  ))}
                                  {subject.topics.length > 4 && (
                                    <li>
                                      <Link
                                        href={`/subjects/${subject.slug}`}
                                        className="block px-2 py-1 text-[0.75rem] font-medium text-accent-text"
                                      >
                                        All {subject.topics.length} topics
                                      </Link>
                                    </li>
                                  )}
                                </ul>
                              )}
                            </div>
                          );
                        })}

                        <Link
                          href="/subjects"
                          className="block px-2 py-1.5 text-[0.75rem] font-medium text-accent-text"
                        >
                          All subjects and electives
                        </Link>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={item.href}>
                    <Link href={item.href} className="nav-link" aria-current={active ? "page" : undefined}>
                      <item.icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 border-t border-subtle pt-4">
              <Link href={variant === "student" ? "/parent" : "/today"} className="nav-link text-muted">
                {variant === "student" ? (
                  <>
                    <ShieldCheck aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
                    Parent area
                    <ArrowUpRight aria-hidden="true" className="ml-auto size-3.5" strokeWidth={2} />
                  </>
                ) : (
                  <>
                    <GraduationCap aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
                    Student view
                    <ArrowUpRight aria-hidden="true" className="ml-auto size-3.5" strokeWidth={2} />
                  </>
                )}
              </Link>
            </div>
          </nav>

          <div className="border-t border-subtle px-4 py-3">
            <p className="truncate text-[0.8125rem] font-medium text-primary">{learnerName}</p>
            <p className="text-caption text-muted">
              {variant === "student"
                ? streakDays !== undefined
                  ? `${streakDays}-day streak`
                  : "Study workspace"
                : "Guardian account"}
            </p>
          </div>
        </aside>

        <div className="lg:pl-[17.5rem]">
          <header className="sticky top-0 z-20 border-b border-subtle bg-page/90 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="icon-btn lg:hidden"
                aria-label="Open navigation"
                aria-controls="app-sidebar"
                aria-expanded={open}
              >
                <Menu aria-hidden="true" className="size-4" strokeWidth={2} />
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] font-medium text-muted">{current?.label ?? "OpenIGCSE"}</p>
              </div>

              <SoundToggle />
              <ThemeToggle />
            </div>
          </header>

          <main key={pathname} className="page-enter mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
            {description && (
              <p className="mb-6 max-w-[62ch] text-[0.9375rem] leading-relaxed text-secondary">{description}</p>
            )}
            {children}
          </main>
        </div>
      </div>
    </SoundProvider>
  );
}

/** Faculty class suffix used for the sidebar dot. */
function facultyKey(code: string) {
  if (code === "0610") return "biology";
  if (code === "0625" || code === "0620") return "physics";
  if (code === "0530" || code === "0520" || code === "0500") return "languages";
  if (["0460", "0470", "0455"].includes(code)) return "humanities";
  return "stem";
}
