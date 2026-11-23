import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const payloadSchema = z.object({
  objectiveCode: z.string().min(3),
  kind: z.enum(["lesson", "review", "assessment", "stuck"]),
  minutes: z.number().int().min(0).max(600).default(0),
  scoreRatio: z.number().min(0).max(1).default(0),
});

/** App study kinds, mapped onto the schema's event vocabulary. */
const EVENT_TYPE = {
  lesson: "Exposure_Lesson",
  review: "Active_Recall",
  assessment: "Formal_Assessment",
  stuck: "Application_Question",
} as const;

/**
 * Records study time and stuck requests against the signed-in student.
 * Unauthenticated or unconfigured setups answer { persisted: false } so the
 * client can keep the value on the device instead of pretending it saved.
 */
export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ persisted: false, problems: parsed.error.issues }, { status: 400 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ persisted: false, reason: "database-not-configured" });
  }

  const { objectiveCode, kind, minutes, scoreRatio } = parsed.data;

  try {
    const client = createAdminClient();

    // One learner per household in this deployment; the seed sets the row up.
    const { data: student, error: studentError } = await client
      .from("profiles")
      .select("id, household_id")
      .eq("role", "student")
      .limit(1)
      .maybeSingle();

    if (studentError) throw studentError;
    if (!student) return NextResponse.json({ persisted: false, reason: "no-student-profile" });

    const { data: objective, error: objectiveError } = await client
      .from("learning_objectives")
      .select("id")
      .eq("objective_code", objectiveCode)
      .limit(1)
      .maybeSingle();

    if (objectiveError) throw objectiveError;

    const { error: insertError } = await client.from("learning_events").insert({
      student_id: student.id,
      objective_id: objective?.id ?? null,
      event_type: EVENT_TYPE[kind],
      score_ratio: scoreRatio,
      actual_minutes_spent: minutes,
      flagged_stuck: kind === "stuck",
    });

    if (insertError) throw insertError;

    if (kind === "stuck") {
      await client.from("kiosk_sessions").insert({
        student_id: student.id,
        student_stuck_alert: true,
        session_start: new Date().toISOString(),
      });
    }

    return NextResponse.json({ persisted: true });
  } catch (error) {
    return NextResponse.json({ persisted: false, reason: (error as Error).message });
  }
}
