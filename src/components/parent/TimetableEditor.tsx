"use client";

import { CalendarPlus, Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  clearWeekAction,
  copyMondayAction,
  deleteSlotAction,
  generatePlanAction,
  saveSlotAction,
} from "@/app/(parent)/parent/(gated)/timetable/actions";
import { ActionButton } from "@/components/ui/Button";
import { EmptyState, Panel, Status } from "@/components/ui/primitives";
import { phoneSlotTimes, toTimeString, type SlotType, type TimetableSlot } from "@/lib/data/timetable-shared";
import { cn } from "@/lib/utils/cn";

/**
 * The week grid.
 *
 * Pointer drag moves a block and the bottom handle resizes it, snapped to 15
 * minutes. The same edits are available from the keyboard: arrows move a
 * focused block, Shift+arrows resize it, Delete removes it. That matters more
 * than a drag library's keyboard sensor here, because the grid snaps to time:
 * arrows map onto the same 15-minute steps the pointer uses.
 */

const DAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 7, short: "Sun", label: "Sunday" },
];

const SNAP = 15;
const PX_PER_MINUTE = 1.2;

export type PaletteSubject = {
  subjectId: string;
  code: string;
  name: string;
  weeklyMinutes: number;
  colour: string;
};

type Armed = { slotType: SlotType; subjectId: string | null; label: string; colour: string | null };

type DragState = {
  id: string;
  mode: "move" | "resize";
  pointerId: number;
  originX: number;
  originY: number;
  startMinutes: number;
  endMinutes: number;
  dayOfWeek: number;
};

export function TimetableEditor({
  slots: initialSlots,
  subjects,
  schoolStart,
  schoolEnd,
  dailyCap,
  today,
}: {
  slots: TimetableSlot[];
  subjects: PaletteSubject[];
  schoolStart: number;
  schoolEnd: number;
  dailyCap: number;
  today: string;
}) {
  const [slots, setSlots] = useState(initialSlots);
  const [armed, setArmed] = useState<Armed | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<{ id: string; dayOfWeek: number; startMinutes: number; endMinutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mobileDay, setMobileDay] = useState(todayDayNumber(today));
  const gridRef = useRef<HTMLDivElement | null>(null);

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let minute = schoolStart; minute < schoolEnd; minute += 60) list.push(minute);
    return list;
  }, [schoolStart, schoolEnd]);

  const height = (schoolEnd - schoolStart) * PX_PER_MINUTE;

  const overlaps = useMemo(() => {
    const pairs = new Set<string>();
    for (const a of slots) {
      for (const b of slots) {
        if (a.id >= b.id || a.dayOfWeek !== b.dayOfWeek) continue;
        if (a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes) {
          pairs.add(a.id);
          pairs.add(b.id);
        }
      }
    }
    return pairs;
  }, [slots]);

  const weeklyMinutes = useMemo(() => {
    const totals = new Map<string, number>();
    for (const slot of slots) {
      if (!slot.subjectId || slot.slotType === "break") continue;
      totals.set(slot.subjectId, (totals.get(slot.subjectId) ?? 0) + (slot.endMinutes - slot.startMinutes));
    }
    return totals;
  }, [slots]);

  const dayMinutes = useMemo(() => {
    const totals = new Map<number, number>();
    for (const slot of slots) {
      if (slot.slotType === "break") continue;
      totals.set(slot.dayOfWeek, (totals.get(slot.dayOfWeek) ?? 0) + (slot.endMinutes - slot.startMinutes));
    }
    return totals;
  }, [slots]);

  const commit = useCallback(
    (slot: TimetableSlot, startMinutes: number, endMinutes: number, dayOfWeek: number) => {
      const optimistic: TimetableSlot = {
        ...slot,
        startMinutes,
        endMinutes,
        dayOfWeek,
        startTime: toTimeString(startMinutes),
        endTime: toTimeString(endMinutes),
      };

      setSlots((current) => current.map((entry) => (entry.id === slot.id ? optimistic : entry)));
      setError(null);
      setNotice(null);

      startTransition(async () => {
        const result = await saveSlotAction({
          id: slot.id,
          dayOfWeek,
          startMinutes,
          endMinutes,
          slotType: slot.slotType,
          subjectId: slot.subjectId,
          title: slot.title,
          colour: slot.colour,
        });

        if (!result.ok) {
          setSlots((current) => current.map((entry) => (entry.id === slot.id ? slot : entry)));
          setError(result.error ?? "That change could not be saved.");
          return;
        }

        setNotice(
          `${slotLabel(optimistic)} moved to ${DAYS.find((day) => day.value === dayOfWeek)?.short} ${toTimeString(
            startMinutes,
          )}.`,
        );
      });
    },
    [],
  );

  /* Phone mode (Step 7.2): a block opens an editor on tap or press-and-hold. */
  const [phoneEdit, setPhoneEdit] = useState<{
    id: string;
    day: number;
    start: string;
    end: string;
    error: string | null;
  } | null>(null);
  const [phoneAddAt, setPhoneAddAt] = useState("09:00");
  const holdTimer = useRef<number | null>(null);

  const openPhoneEdit = (slot: TimetableSlot) =>
    setPhoneEdit({ id: slot.id, day: slot.dayOfWeek, start: slot.startTime, end: slot.endTime, error: null });
  const cancelHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const holdToEdit = (slot: TimetableSlot) => {
    cancelHold();
    holdTimer.current = window.setTimeout(() => openPhoneEdit(slot), 500);
  };
  const savePhoneEdit = (slot: TimetableSlot) => {
    if (!phoneEdit) return;
    const times = phoneSlotTimes(phoneEdit.start, phoneEdit.end, { schoolStart, schoolEnd });
    if (!times.ok) {
      setPhoneEdit({ ...phoneEdit, error: times.error });
      return;
    }
    setPhoneEdit(null);
    const moved =
      times.startMinutes !== slot.startMinutes || times.endMinutes !== slot.endMinutes || phoneEdit.day !== slot.dayOfWeek;
    if (moved) commit(slot, times.startMinutes, times.endMinutes, phoneEdit.day);
  };

  const addSlot = (dayOfWeek: number, minute: number) => {
    if (!armed) return;

    const startMinutes = snap(clamp(minute, schoolStart, schoolEnd - SNAP * 2));
    const endMinutes = Math.min(startMinutes + SNAP * 2, schoolEnd);

    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await saveSlotAction({
        dayOfWeek,
        startMinutes,
        endMinutes,
        slotType: armed.slotType,
        subjectId: armed.subjectId,
        title: armed.slotType === "subject" || armed.slotType === "revision" ? null : armed.label,
        colour: armed.colour,
      });

      if (!result.ok) {
        setError(result.error ?? "That block could not be added.");
        return;
      }

      setSlots((current) => [
        ...current,
        {
          id: result.id,
          dayOfWeek,
          startTime: toTimeString(startMinutes),
          endTime: toTimeString(endMinutes),
          startMinutes,
          endMinutes,
          slotType: armed.slotType,
          subjectId: armed.subjectId,
          subjectCode: subjects.find((subject) => subject.subjectId === armed.subjectId)?.code ?? null,
          subjectName: subjects.find((subject) => subject.subjectId === armed.subjectId)?.name ?? null,
          title: armed.slotType === "subject" || armed.slotType === "revision" ? null : armed.label,
          colour: armed.colour,
        },
      ]);

      setNotice(`${armed.label} added on ${DAYS.find((day) => day.value === dayOfWeek)?.short} at ${toTimeString(startMinutes)}.`);
    });
  };

  const removeSlot = (slot: TimetableSlot) => {
    setSlots((current) => current.filter((entry) => entry.id !== slot.id));
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await deleteSlotAction(slot.id);
      if (!result.ok) {
        setSlots((current) => [...current, slot]);
        setError(result.error ?? "That block could not be removed.");
      }
    });
  };

  const onPointerDown = (event: React.PointerEvent, slot: TimetableSlot, mode: "move" | "resize") => {
    if (event.button !== 0) return;
    event.preventDefault();
    setDrag({
      id: slot.id,
      mode,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startMinutes: slot.startMinutes,
      endMinutes: slot.endMinutes,
      dayOfWeek: slot.dayOfWeek,
    });
    setPreview({ id: slot.id, dayOfWeek: slot.dayOfWeek, startMinutes: slot.startMinutes, endMinutes: slot.endMinutes });
  };

  /**
   * Drag lives on the window, not the block.
   *
   * Pointer capture on a small element loses the gesture as soon as the pointer
   * leaves it, and the same listener has to serve a 20px block and a 2px resize
   * handle. Window listeners keep one gesture alive from press to release.
   */
  useEffect(() => {
    if (!drag) return;

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = drag.mode === "resize" ? "ns-resize" : "grabbing";
    let latest: { dayOfWeek: number; startMinutes: number; endMinutes: number } | null = null;

    const move = (event: PointerEvent) => {
      const deltaMinutes = snap((event.clientY - drag.originY) / PX_PER_MINUTE);

      if (drag.mode === "resize") {
        const endMinutes = clamp(drag.endMinutes + deltaMinutes, drag.startMinutes + SNAP, schoolEnd);
        latest = { dayOfWeek: drag.dayOfWeek, startMinutes: drag.startMinutes, endMinutes };
      } else {
        const duration = drag.endMinutes - drag.startMinutes;
        const startMinutes = clamp(drag.startMinutes + deltaMinutes, schoolStart, schoolEnd - duration);
        const dayOfWeek = dayFromPointer(event.clientX) ?? drag.dayOfWeek;
        latest = { dayOfWeek, startMinutes, endMinutes: startMinutes + duration };
      }

      setPreview({ id: drag.id, ...latest });
    };

    const up = () => {
      document.body.style.cursor = previousCursor;
      const slot = slots.find((entry) => entry.id === drag.id);

      if (slot && latest) {
        const changed =
          latest.startMinutes !== slot.startMinutes ||
          latest.endMinutes !== slot.endMinutes ||
          latest.dayOfWeek !== slot.dayOfWeek;

        if (changed) commit(slot, latest.startMinutes, latest.endMinutes, latest.dayOfWeek);
      }

      setDrag(null);
      setPreview(null);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

    return () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, slots, commit, schoolStart, schoolEnd]);

  /** Columns are equal fractions of the grid width, so the pointer x maps to one. */
  const dayFromPointer = (clientX: number) => {
    const node = gridRef.current;
    if (!node) return null;

    const rect = node.getBoundingClientRect();
    const gutter = 44;
    const columnWidth = (rect.width - gutter) / DAYS.length;
    const index = Math.floor((clientX - rect.left - gutter) / columnWidth);

    return index >= 0 && index < DAYS.length ? (index + 1) : null;
  };

  const onKeyDown = (event: React.KeyboardEvent, slot: TimetableSlot) => {
    const step = event.shiftKey ? SNAP : SNAP;
    const duration = slot.endMinutes - slot.startMinutes;

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? -step : step;

      if (event.shiftKey) {
        const endMinutes = clamp(slot.endMinutes + direction, slot.startMinutes + SNAP, schoolEnd);
        if (endMinutes !== slot.endMinutes) commit(slot, slot.startMinutes, endMinutes, slot.dayOfWeek);
        return;
      }

      const startMinutes = clamp(slot.startMinutes + direction, schoolStart, schoolEnd - duration);
      if (startMinutes !== slot.startMinutes) commit(slot, startMinutes, startMinutes + duration, slot.dayOfWeek);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const nextDay = clamp(slot.dayOfWeek + (event.key === "ArrowLeft" ? -1 : 1), 1, 7);
      if (nextDay !== slot.dayOfWeek) commit(slot, slot.startMinutes, slot.endMinutes, nextDay);
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSlot(slot);
    }
  };

  const [busy, setBusy] = useState<"copy" | "plan" | "clear" | null>(null);

  const runWeekAction = (kind: "copy" | "plan" | "clear") => {
    setBusy(kind);
    setError(null);
    setNotice(null);

    const task =
      kind === "copy" ? copyMondayAction() : kind === "plan" ? generatePlanAction(today) : clearWeekAction();

    void task
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? "That did not save.");
          return;
        }

        if (kind === "copy") {
          setNotice(`Copied Monday onto ${"copied" in result ? result.copied : 0} weekday slots.`);
        } else if (kind === "plan") {
          setNotice(
            "created" in result && result.created > 0
              ? `Built today's plan: ${result.created} period(s)${result.carriedOver ? `, ${result.carriedOver} carried over` : ""}.`
              : "Today's plan was already built, so nothing changed.",
          );
        } else {
          setNotice(`Cleared ${"cleared" in result ? result.cleared : 0} blocks from the week.`);
        }

        // The page is a server component; reloading it is the honest way to show
        // rows that were just written from several actions in a row.
        window.location.reload();
      })
      .finally(() => setBusy(null));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Add</span>
        {subjects.map((subject) => (
          <button
            key={subject.subjectId}
            type="button"
            onClick={() =>
              setArmed(
                armed?.subjectId === subject.subjectId
                  ? null
                  : { slotType: "subject", subjectId: subject.subjectId, label: subject.name, colour: subject.colour },
              )
            }
            aria-pressed={armed?.subjectId === subject.subjectId}
            className={cn(
              "pressable touch-target rounded-full border px-2.5 py-1 text-caption font-medium",
              armed?.subjectId === subject.subjectId
                ? "border-accent-line bg-accent-soft text-accent-text"
                : "border-subtle bg-card text-secondary",
            )}
          >
            {subject.code} {subject.name}
          </button>
        ))}

        {(["revision", "break", "free_study", "assessment"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() =>
              setArmed(armed?.slotType === type && !armed.subjectId ? null : { slotType: type, subjectId: null, label: LABEL[type], colour: null })
            }
            aria-pressed={armed?.slotType === type && !armed.subjectId}
            className={cn(
              "pressable touch-target rounded-full border px-2.5 py-1 text-caption font-medium",
              armed?.slotType === type && !armed.subjectId
                ? "border-accent-line bg-accent-soft text-accent-text"
                : "border-subtle bg-card text-secondary",
            )}
          >
            {LABEL[type]}
          </button>
        ))}
      </div>

      <p className="text-caption text-muted" aria-live="polite">
        {armed
          ? `${armed.label} is ready. Click a column to place a 30-minute block.`
          : "Pick something to add, or drag a block to move it. Arrow keys move a focused block; Shift+arrows resize it; Delete removes it."}
      </p>

      <div className="hidden md:block">
        <div ref={gridRef} className="surface overflow-hidden">
          <div className="flex border-b border-subtle bg-sunken" style={{ paddingLeft: 44 }}>
            {DAYS.map((day) => (
              <div key={day.value} className="flex-1 border-l border-subtle px-2 py-2 text-caption font-medium text-secondary first:border-l-0">
                {day.short}
              </div>
            ))}
          </div>

          <div className="relative flex" style={{ height }}>
            <div className="w-11 shrink-0 border-r border-subtle">
              {hours.map((minute) => (
                <div
                  key={minute}
                  className="absolute -translate-y-1/2 pr-1.5 text-right text-[0.625rem] text-muted tabular"
                  style={{ top: (minute - schoolStart) * PX_PER_MINUTE + 8, width: 40 }}
                >
                  {toTimeString(minute)}
                </div>
              ))}
            </div>

            {DAYS.map((day) => (
              <div key={day.value} className="relative flex-1 border-l border-subtle first:border-l-0">
                {hours.map((minute) => (
                  <button
                    key={minute}
                    type="button"
                    onClick={() => addSlot(day.value, minute)}
                    disabled={!armed}
                    aria-label={`Add ${armed?.label ?? "block"} on ${day.label} at ${toTimeString(minute)}`}
                    className={cn(
                      "absolute inset-x-0 h-[1.2rem] border-b border-subtle/60",
                      armed ? "cursor-copy hover:bg-accent-soft/60" : "cursor-default",
                    )}
                    style={{ top: (minute - schoolStart) * PX_PER_MINUTE }}
                  />
                ))}

                {slots
                  .filter((slot) => slot.dayOfWeek === day.value)
                  .map((slot) => {
                    const view = preview?.id === slot.id ? { ...slot, ...preview } : slot;
                    const top = (view.startMinutes - schoolStart) * PX_PER_MINUTE;
                    const blockHeight = Math.max(18, (view.endMinutes - view.startMinutes) * PX_PER_MINUTE);

                    return (
                      <div
                        key={slot.id}
                        className={cn(
                          "absolute inset-x-1 overflow-hidden rounded-panel border bg-card text-left shadow-sm",
                          overlaps.has(slot.id) ? "border-warning" : "border-subtle",
                          drag?.id === slot.id && "z-10 shadow-overlay",
                        )}
                        style={{ top, height: blockHeight }}
                      >
                        <button
                          type="button"
                          onPointerDown={(event) => onPointerDown(event, slot, "move")}
                          onKeyDown={(event) => onKeyDown(event, slot)}
                          aria-label={`${slotLabel(slot)} on ${DAYS.find((entry) => entry.value === slot.dayOfWeek)?.label} from ${slot.startTime} to ${slot.endTime}. Arrow keys move, Shift plus arrows resize, Delete removes.`}
                          className="flex h-full w-full touch-none flex-col gap-0.5 px-1.5 py-1 text-left"
                        >
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-1"
                            style={colourStyle(slot)}
                          />
                          <span className="pl-1.5 text-[0.6875rem] font-semibold leading-tight text-primary">
                            {slot.subjectCode ?? LABEL[slot.slotType]}
                          </span>
                          {blockHeight > 34 && (
                            <span className="pl-1.5 text-[0.625rem] leading-tight text-muted">
                              {slot.startTime}–{slot.endTime}
                            </span>
                          )}
                        </button>

                        <span
                          role="presentation"
                          onPointerDown={(event) => onPointerDown(event, slot, "resize")}
                          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                        />
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <div role="tablist" aria-label="Day" className="mb-3 flex gap-1 overflow-x-auto rounded-lg bg-sunken p-1">
          {DAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              role="tab"
              aria-selected={mobileDay === day.value}
              onClick={() => setMobileDay(day.value)}
              className="tab-btn pressable"
            >
              {day.short}
            </button>
          ))}
        </div>

        {slots.filter((slot) => slot.dayOfWeek === mobileDay).length === 0 ? (
          <EmptyState title="Nothing on this day">
            {armed ? "Tap an add button below to place a block." : "Pick a subject above, then add a block."}
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {slots
              .filter((slot) => slot.dayOfWeek === mobileDay)
              .map((slot) =>
                phoneEdit?.id === slot.id ? (
                  <li key={slot.id} className="surface space-y-3 p-3">
                    <p className="text-[0.875rem] font-medium text-primary">{slotLabel(slot)}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="block">
                        <span className="label">Day</span>
                        <select
                          value={phoneEdit.day}
                          onChange={(event) => setPhoneEdit({ ...phoneEdit, day: Number(event.target.value) })}
                          className="field mt-1"
                        >
                          {DAYS.map((day) => (
                            <option key={day.value} value={day.value}>
                              {day.short}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="label">Start</span>
                        <input
                          type="time"
                          step={900}
                          value={phoneEdit.start}
                          onChange={(event) => setPhoneEdit({ ...phoneEdit, start: event.target.value })}
                          className="field mt-1 tabular"
                        />
                      </label>
                      <label className="block">
                        <span className="label">End</span>
                        <input
                          type="time"
                          step={900}
                          value={phoneEdit.end}
                          onChange={(event) => setPhoneEdit({ ...phoneEdit, end: event.target.value })}
                          className="field mt-1 tabular"
                        />
                      </label>
                    </div>
                    {phoneEdit.error && (
                      <p role="alert" className="text-caption text-danger-text">
                        {phoneEdit.error}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-primary pressable" onClick={() => savePhoneEdit(slot)}>
                        Save
                      </button>
                      <button type="button" className="btn-ghost pressable" onClick={() => setPhoneEdit(null)}>
                        Cancel
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={slot.id} className="surface flex items-center gap-3 p-3">
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={colourStyle(slot)} />
                    {/* Tap, or press and hold, to change the day and times. */}
                    <button
                      type="button"
                      onClick={() => openPhoneEdit(slot)}
                      onPointerDown={() => holdToEdit(slot)}
                      onPointerUp={cancelHold}
                      onPointerLeave={cancelHold}
                      onContextMenu={(event) => event.preventDefault()}
                      className="touch-target min-w-0 flex-1 text-left"
                      aria-label={`Change ${slotLabel(slot)}, ${slot.startTime} to ${slot.endTime}`}
                    >
                      <span className="block text-[0.875rem] text-primary">{slotLabel(slot)}</span>
                      <span className="flex items-center gap-1 text-caption text-muted tabular">
                        {slot.startTime}–{slot.endTime}
                        <Pencil aria-hidden="true" className="size-3" strokeWidth={2} />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSlot(slot)}
                      className="icon-btn"
                      aria-label={`Remove ${slotLabel(slot)}`}
                    >
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={2} />
                    </button>
                  </li>
                ),
              )}
          </ul>
        )}

        {armed && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="label">Start</span>
              <input
                type="time"
                step={900}
                value={phoneAddAt}
                onChange={(event) => setPhoneAddAt(event.target.value)}
                className="field mt-1 tabular"
              />
            </label>
            <ActionButton
              type="button"
              pending={pending}
              onClick={() => {
                const [hours, minutes] = phoneAddAt.split(":").map(Number);
                const at = Number.isFinite(hours) && Number.isFinite(minutes) ? hours! * 60 + minutes! : schoolStart;
                addSlot(mobileDay, at);
              }}
              icon={<Plus aria-hidden="true" className="size-4" strokeWidth={2} />}
            >
              Add {armed.label} at {phoneAddAt || "the start"}
            </ActionButton>
          </div>
        )}
      </div>

      {overlaps.size > 0 && (
        <p role="alert" className="rounded-panel border border-warning/40 bg-warning-soft px-3 py-2 text-caption text-warning-text">
          Two blocks overlap on the same day. The learner sees them both, so pick one time and move the other.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-panel border border-danger/40 bg-danger-soft px-3 py-2 text-caption text-danger-text">
          {error}
        </p>
      )}

      {notice && !error && (
        <p role="status" className="rounded-panel border border-success/40 bg-success-soft px-3 py-2 text-caption text-success-text">
          {notice}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Weekly minutes" description="Drawn against each subject's allocation.">
          <ul className="space-y-3">
            {subjects.map((subject) => {
              const drawn = weeklyMinutes.get(subject.subjectId) ?? 0;
              const percent = subject.weeklyMinutes ? Math.min(100, Math.round((drawn / subject.weeklyMinutes) * 100)) : 0;

              return (
                <li key={subject.subjectId}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[0.8125rem] text-secondary">
                      {subject.code} {subject.name}
                    </span>
                    <span className="text-caption text-muted tabular">
                      {drawn}/{subject.weeklyMinutes} min
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-inset">
                    <div
                      className={cn("h-full rounded-full", drawn > subject.weeklyMinutes ? "bg-warning" : "bg-accent")}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Daily load" description={`Cap is ${dailyCap} minutes a day.`}>
          <ul className="divide-y divide-subtle">
            {DAYS.map((day) => {
              const minutes = dayMinutes.get(day.value) ?? 0;
              const over = minutes > dailyCap;

              return (
                <li key={day.value} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="text-[0.8125rem] text-secondary">{day.label}</span>
                  <Status tone={over ? "warning" : "neutral"}>
                    {minutes} min{over ? " over cap" : ""}
                  </Status>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          type="button"
          pending={busy === "copy"}
          pendingLabel="Copying"
          variant="secondary"
          onClick={() => runWeekAction("copy")}
          icon={<Copy aria-hidden="true" className="size-4" strokeWidth={2} />}
        >
          Copy Monday to weekdays
        </ActionButton>

        <ActionButton
          type="button"
          pending={busy === "plan"}
          pendingLabel="Building"
          onClick={() => runWeekAction("plan")}
          icon={<CalendarPlus aria-hidden="true" className="size-4" strokeWidth={2} />}
        >
          Build today&apos;s plan
        </ActionButton>

        <ActionButton
          type="button"
          pending={busy === "clear"}
          pendingLabel="Clearing"
          variant="danger"
          onClick={() => runWeekAction("clear")}
        >
          Clear week
        </ActionButton>

        {pending && (
          <span className="flex items-center gap-1.5 text-caption text-muted">
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" strokeWidth={2} />
            Saving
          </span>
        )}
      </div>
    </div>
  );
}

const LABEL: Record<SlotType, string> = {
  subject: "Lesson",
  revision: "Revision",
  assessment: "Assessment",
  break: "Break",
  free_study: "Free study",
};

function slotLabel(slot: TimetableSlot) {
  if (slot.subjectCode && slot.subjectName) return `${slot.subjectCode} ${slot.subjectName}`;
  return slot.title ?? LABEL[slot.slotType];
}

/**
 * Faculty colour, read from the CSS tokens the subject chips already use, so a
 * block and its chip in the sidebar are the same colour without a second map.
 */
function colourStyle(slot: TimetableSlot) {
  const key = slot.colour ?? "stem";
  const token = ["biology", "physics", "humanities", "languages"].includes(key) ? key : "stem";
  return { backgroundColor: `oklch(var(--subject-${token}))` };
}

function snap(minutes: number) {
  return Math.round(minutes / SNAP) * SNAP;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function todayDayNumber(date: string) {
  const value = new Date(`${date}T00:00:00Z`).getUTCDay();
  return value === 0 ? 7 : value;
}
