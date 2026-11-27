"use client";

import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { deletePushSubscriptionAction, markNotificationsReadAction, notificationsAction, savePushSubscriptionAction } from "@/app/shell-actions";
import type { AppNotification } from "@/lib/data/notifications";
import { useRealtime } from "@/lib/live/useRealtime";
import { cn } from "@/lib/utils/cn";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * The in-app notification centre (Step 5.3), with the switch that registers this device for Web
 * Push. Push is optional: everything a push says is also here.
 */
export function NotificationBell({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const result = await notificationsAction().catch(() => null);
    if (result?.ok) setItems(result.items);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(`notifications:${profileId}`, "notifications", `recipient_profile_id=eq.${profileId}`, () => load(), "INSERT");

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !panel.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const unread = items.filter((item) => !item.readAt).length;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      const result = await markNotificationsReadAction().catch(() => ({ ok: false as const, error: "The server could not be reached." }));
      if (result.ok) setItems((list) => list.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      else setError(`Could not mark as read: ${result.error}`);
    }
  };

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={toggle}
        className="icon-btn relative"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
      >
        <Bell aria-hidden="true" className="size-4" strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[1.1rem] items-center justify-center rounded-full bg-danger px-1 text-[0.6875rem] font-semibold leading-[1.1rem] text-on-accent tabular">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="surface fixed inset-x-4 top-16 z-40 p-3 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[22rem]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[0.875rem] font-semibold text-primary">Notifications</p>
            <PushToggle />
          </div>
          {error && (
            <p role="alert" className="mb-2 text-caption text-danger-text">
              {error}
            </p>
          )}
          {items.length === 0 ? (
            <p className="py-4 text-center text-caption text-muted">Nothing yet.</p>
          ) : (
            <ul className="scroll-contain max-h-[60vh] space-y-1.5 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.linkUrl ?? "#"}
                    onClick={() => setOpen(false)}
                    className={cn("row-hover block rounded-panel border border-subtle p-2.5", !item.readAt && "bg-accent-soft")}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[0.8125rem] font-medium text-primary">{item.title}</span>
                      <span className="shrink-0 text-caption text-muted tabular">{timeFormat.format(new Date(item.createdAt))}</span>
                    </span>
                    <span className="mt-0.5 block text-caption text-secondary">{item.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/** Registers this browser for Web Push. iOS only delivers push to an app added to the home screen. */
function PushToggle() {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied" | "busy">("busy");
  const [error, setError] = useState<string | null>(null);
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!key || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? "on" : "off"))
      .catch(() => setState("off"));
  }, [key]);

  const enable = async () => {
    setState("busy");
    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key!),
      });
      const json = subscription.toJSON();
      const saved = await savePushSubscriptionAction({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent.slice(0, 300),
      });
      if (!saved.ok) {
        await subscription.unsubscribe();
        setError(`Not saved: ${saved.error}`);
        setState("off");
        return;
      }
      setState("on");
    } catch (cause) {
      setError(`Push could not be turned on: ${(cause as Error).message}`);
      setState("off");
    }
  };

  const disable = async () => {
    setState("busy");
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await deletePushSubscriptionAction(subscription.endpoint).catch(() => null);
      await subscription.unsubscribe();
    }
    setState("off");
  };

  if (state === "unsupported") return <span className="text-caption text-muted">Push not available here</span>;
  if (state === "denied") {
    return (
      <span className="flex items-center gap-1 text-caption text-muted">
        <BellOff aria-hidden="true" className="size-3.5" strokeWidth={2} />
        Blocked in browser settings
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={state === "on" ? disable : enable}
        disabled={state === "busy"}
        aria-busy={state === "busy"}
        className="btn-ghost pressable px-2 py-1 text-caption"
      >
        {state === "busy" ? (
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" strokeWidth={2.2} />
        ) : (
          <BellRing aria-hidden="true" className="size-3.5" strokeWidth={2} />
        )}
        {state === "on" ? "Push on" : state === "busy" ? "Working" : "Turn on push"}
      </button>
      {error && (
        <span role="alert" className="text-caption text-danger-text">
          {error}
        </span>
      )}
    </span>
  );
}
