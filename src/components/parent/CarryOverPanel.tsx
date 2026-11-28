"use client";

import { ArrowRightLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { carryOverProgressAction } from "@/app/(parent)/parent/(gated)/curriculum/actions";
import { ActionButton } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Panel } from "@/components/ui/primitives";

/** Step 6.4: shown when progress still sits on objectives a newer package replaced. */
export function CarryOverPanel({ links, waiting }: { links: number; waiting: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const last = useRef<(() => void) | null>(null);
  const move = () => {
    last.current = move;
    startTransition(async () => {
      const outcome = await carryOverProgressAction();
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  };
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; error: string } | null>(null);

  return (
    <Panel
      title="Move progress to the new objectives"
      description={`${waiting} record${waiting === 1 ? "" : "s"} (lessons, notebook entries, review schedules) sit on objectives that a reviewed package replaced. ${links} confirmed link${links === 1 ? "" : "s"} say where each should go.`}
    >
      <ActionButton
        type="button"
        pending={pending}
        pendingLabel="Moving…"
        icon={<ArrowRightLeft aria-hidden="true" className="size-4" />}
        onClick={move}
      >
        Move progress
      </ActionButton>
      <FormMessage result={result} className="mt-2" onRetry={() => last.current?.()} pending={pending} />
    </Panel>
  );
}
