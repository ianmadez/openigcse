"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { NotificationBell } from "@/components/live/NotificationBell";
import { useRealtime } from "@/lib/live/useRealtime";

/** The guardian's top-bar shortcuts (Phase 5): messages with an unread count, and notifications. */
export function ParentDock({ profileId, householdId, unreadMessages }: { profileId: string; householdId: string; unreadMessages: number }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(unreadMessages);

  useEffect(() => setUnread(unreadMessages), [unreadMessages]);
  useEffect(() => {
    if (pathname === "/parent/messages") setUnread(0);
  }, [pathname]);

  useRealtime(`thread:${householdId}:parent-dock`, "messages", `household_id=eq.${householdId}`, (change) => {
    const row = change.new as Record<string, unknown>;
    if (row?.sender_profile_id !== profileId && pathname !== "/parent/messages") setUnread((value) => value + 1);
  }, "INSERT");

  return (
    <>
      <Link href="/parent/messages" className="icon-btn relative" aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}>
        <MessageCircle aria-hidden="true" className="size-4" strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[1.1rem] items-center justify-center rounded-full bg-danger px-1 text-[0.6875rem] font-semibold leading-[1.1rem] text-on-accent tabular">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
      <NotificationBell profileId={profileId} />
    </>
  );
}
