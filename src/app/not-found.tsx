import Link from "next/link";
import { Compass, Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-page px-4 py-12">
      <div className="w-full max-w-md">
        <div className="surface p-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-panel border-b-[3px] border-accent-hover bg-accent text-on-accent">
            <Compass aria-hidden="true" className="size-6" strokeWidth={2} />
          </span>

          <p className="mt-4 label">404</p>
          <h1 className="mt-1 text-title font-semibold text-primary">That page is not in the syllabus</h1>
          <p className="mx-auto mt-2 max-w-[38ch] text-[0.9375rem] leading-relaxed text-secondary">
            The link may be old, or the subject package may not have been imported yet. Both are easy to check.
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/today" className="btn-primary pressable">
              <Home aria-hidden="true" className="size-4" strokeWidth={2} />
              Back to today
            </Link>
            <Link href="/subjects" className="btn-secondary pressable">
              <Search aria-hidden="true" className="size-4" strokeWidth={2} />
              Browse subjects
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
