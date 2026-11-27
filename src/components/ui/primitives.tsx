import { AlertTriangle, Check, Info, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function PageHeading({ eyebrow, title, children }: { eyebrow?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className="label mb-1.5">{eyebrow}</p>}
      <h1 className="text-title font-semibold text-primary">{title}</h1>
      {children && <div className="mt-2 max-w-[62ch] text-[0.9375rem] leading-relaxed text-secondary">{children}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface p-4 sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-3">
          {/* The action sits beside the title only, so on a phone it never squeezes the description. */}
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            {title && <h2 className="min-w-0 text-heading font-semibold text-primary">{title}</h2>}
            {action && <div className="shrink-0">{action}</div>}
          </div>
          {description && <p className="mt-1 text-caption text-muted">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = "neutral" | "accent" | "success" | "danger" | "warning" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "border-subtle bg-sunken text-secondary",
  accent: "border-accent-line bg-accent-soft text-accent-text",
  success: "border-success/40 bg-success-soft text-success-text",
  danger: "border-danger/40 bg-danger-soft text-danger-text",
  warning: "border-warning/40 bg-warning-soft text-warning-text",
  info: "border-info/40 bg-info-soft text-info-text",
};

const toneIcon: Record<Tone, typeof Info | null> = {
  neutral: null,
  accent: null,
  success: Check,
  danger: X,
  warning: AlertTriangle,
  info: Info,
};

/** Status always carries an icon and a word, so colour is never the only cue. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = toneIcon[tone];
  return (
    <span
      className={cn(
        // Short labels sit on one line; a long one wraps instead of pushing a phone page sideways.
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption font-medium",
        toneClasses[tone],
      )}
    >
      {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.2} />}
      {children}
    </span>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  const Icon = toneIcon[tone] ?? Info;
  return (
    <div className={cn("flex gap-3 rounded-card border p-4", toneClasses[tone])}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <div className="text-caption leading-relaxed">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
    </div>
  );
}

export function Meter({ value, label, hint }: { value: number; label: string; hint?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.8125rem] text-secondary">{label}</span>
        <span className="text-caption font-medium text-muted tabular">{clamped}%</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-inset"
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${clamped}%` }} />
      </div>
      {hint && <p className="mt-1 text-caption text-muted">{hint}</p>}
    </div>
  );
}

type SubjectFaculty = "stem" | "biology" | "physics" | "humanities" | "languages";

const facultyClass: Record<SubjectFaculty, string> = {
  stem: "subject-stem",
  biology: "subject-biology",
  physics: "subject-physics",
  humanities: "subject-humanities",
  languages: "subject-languages",
};

/** Maps a Cambridge subject code onto its faculty colour. */
export function facultyFor(code: string): SubjectFaculty {
  if (code === "0610") return "biology";
  if (code === "0625" || code === "0620") return "physics";
  if (code === "0530" || code === "0520" || code === "0500") return "languages";
  if (["0460", "0470", "0455"].includes(code)) return "humanities";
  return "stem";
}

export function SubjectChip({ code, name }: { code?: string; name: string }) {
  return (
    <span className={cn("chip-subject", code ? facultyClass[facultyFor(code)] : facultyClass.stem)}>
      {code && <span className="tabular opacity-80">{code}</span>}
      {name}
    </span>
  );
}

export function SubjectDot({ code }: { code: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 shrink-0 rounded-full bg-subject", facultyClass[facultyFor(code)])}
      style={{ backgroundColor: "oklch(var(--subject-ink))" }}
    />
  );
}

/** Loading placeholder that matches the card rhythm, so nothing jumps. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function SkeletonPage() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((card) => (
          <div key={card} className="surface space-y-3 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading this page</span>
    </div>
  );
}

/** For screens that open on one long record, such as a subject or a plan. */
export function SkeletonDetailPage({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="surface space-y-3 p-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading this page</span>
    </div>
  );
}

/** For form screens: a heading and a grid of labelled fields. */
export function SkeletonFormPage() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-56 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="surface space-y-3 p-5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading this page</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-panel border border-dashed border-strong/50 px-4 py-8 text-center">
      <p className="text-[0.9375rem] font-medium text-primary">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-[46ch] text-caption text-secondary">{children}</div>}
    </div>
  );
}

/** Marks anything sourced from demo data so it is never mistaken for real. */
export function DemoNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-caption text-muted">
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
      <span>{children}</span>
    </p>
  );
}
