import { cn } from "@/lib/utils/cn";

/**
 * The outcome of a write, said out loud. Failures use role="alert" so screen
 * readers and the sound layer treat them as errors; successes use
 * role="status". The line keeps its height when empty so the layout does not
 * jump when a message appears.
 */
export function FormMessage({
  result,
  className,
}: {
  result: { ok: true; message?: string } | { ok: false; error: string } | null;
  className?: string;
}) {
  if (result && !result.ok) {
    return (
      <p role="alert" className={cn("text-caption font-medium text-danger-text", className)}>
        {result.error}
      </p>
    );
  }

  return (
    <p role="status" aria-live="polite" className={cn("min-h-[1.25rem] text-caption text-success-text", className)}>
      {result?.ok ? (result.message ?? "Saved.") : ""}
    </p>
  );
}
