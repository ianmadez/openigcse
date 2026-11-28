import { WriteError } from "@/components/ui/WriteError";
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
  onRetry,
  pending,
}: {
  result: { ok: true; message?: string } | { ok: false; error: string } | null;
  className?: string;
  /** Repeats the write that failed; a failure then shows a Try again button (Phase 8). */
  onRetry?: () => void;
  pending?: boolean;
}) {
  if (result && !result.ok && onRetry) return <WriteError error={result.error} onRetry={onRetry} pending={pending} className={className} />;
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
