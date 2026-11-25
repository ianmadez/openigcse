import { cn } from "@/lib/utils/cn";

export type MasteryMapObjective = {
  id: string;
  code: string;
  title: string;
  topicName: string;
  mastery: number;
  covered: boolean;
};

const BANDS = [
  { min: 0.8, label: "Secure", className: "border-success/40 bg-success-soft text-success-text" },
  { min: 0.6, label: "Steady", className: "border-info/40 bg-info-soft text-info-text" },
  { min: 0.4, label: "Shaky", className: "border-warning/40 bg-warning-soft text-warning-text" },
  { min: 0, label: "Starting", className: "border-danger/40 bg-danger-soft text-danger-text" },
] as const;

export function masteryBand(mastery: number, covered: boolean) {
  if (!covered) return { label: "No evidence", className: "border-subtle bg-sunken text-muted" };
  return BANDS.find((band) => mastery >= band.min) ?? BANDS[BANDS.length - 1]!;
}

/**
 * The syllabus coloured by mastery (Step 4.4). Colour is never the only cue: every row also carries
 * its percentage or a dash, and the band in words.
 */
export function MasteryMap({
  subjects,
}: {
  subjects: Array<{ key: string; code: string; name: string; objectives: MasteryMapObjective[] }>;
}) {
  return (
    <div className="space-y-5">
      <ul aria-label="Mastery bands" className="flex flex-wrap gap-1.5">
        {[{ label: "No evidence", className: "border-subtle bg-sunken text-muted" }, ...BANDS].map((band) => (
          <li key={band.label} className={cn("rounded-full border px-2.5 py-0.5 text-caption font-medium", band.className)}>
            {band.label}
          </li>
        ))}
      </ul>

      {subjects.map((subject) => (
        <section key={subject.key}>
          <h3 className="text-[0.875rem] font-medium text-primary">
            {subject.code} {subject.name}
          </h3>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {subject.objectives.map((objective) => {
              const band = masteryBand(objective.mastery, objective.covered);
              return (
                <li key={objective.id} className={cn("rounded-lg border px-2.5 py-2", band.className)}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[0.6875rem] font-semibold tabular">{objective.code}</span>
                    <span className="text-[0.6875rem] font-semibold tabular">
                      {objective.covered ? `${Math.round(objective.mastery * 100)}%` : "—"}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[0.75rem] leading-snug">{objective.title}</p>
                  <p className="mt-0.5 text-[0.6875rem] opacity-80">
                    {objective.topicName} · {band.label}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
