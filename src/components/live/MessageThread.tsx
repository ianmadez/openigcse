"use client";

import { Check, CheckCheck, ImagePlus, Mic, Send, Square, X, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { markThreadReadAction, sendMessageAction, threadAction } from "@/app/shell-actions";
import type { ThreadMessage } from "@/lib/data/messages";
import { browserClient, useRealtime } from "@/lib/live/useRealtime";
import { cn } from "@/lib/utils/cn";
import { ActionButton } from "@/components/ui/Button";

const timeFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
const TYPING_MS = 4000;

/**
 * The household thread (Step 5.2). New messages and read receipts arrive over Realtime; "typing"
 * travels over a broadcast channel named by the household id, which never touches the database.
 */
export function MessageThread({
  householdId,
  profileId,
  profileName,
  initial,
}: {
  householdId: string;
  profileId: string;
  profileName: string;
  initial: ThreadMessage[];
}) {
  const [messages, setMessages] = useState(initial);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const recorder = useRef<MediaRecorder | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const typingTimer = useRef<number | null>(null);
  const lastTypingSent = useRef(0);
  const channel = useRef<ReturnType<NonNullable<ReturnType<typeof browserClient>>["channel"]> | null>(null);

  const reload = useCallback(async () => {
    const result = await threadAction().catch(() => null);
    if (result?.ok) setMessages(result.messages);
  }, []);

  const markRead = useCallback(() => {
    if (document.visibilityState === "visible") markThreadReadAction().catch(() => null);
  }, []);

  useEffect(() => {
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [markRead]);

  useEffect(() => {
    // Scroll the thread, not the page, once layout has settled.
    const timer = window.setTimeout(() => {
      const list = listRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [messages.length]);

  useRealtime(`thread:${householdId}:view`, "messages", `household_id=eq.${householdId}`, (change) => {
    reload();
    if (change.eventType === "INSERT" && (change.new as Record<string, unknown>).sender_profile_id !== profileId) {
      setTyping(null);
      markRead();
    }
  });

  // Typing indicator over a broadcast channel.
  useEffect(() => {
    const client = browserClient();
    if (!client) return;
    let cancelled = false;
    let typingChannel: ReturnType<typeof client.channel> | null = null;
    // Deferred a tick so React's dev double-mount cancels the first join before it starts; both
    // people must share this exact topic, so it cannot be made unique per mount.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      typingChannel = client.channel(`typing:${householdId}`, { config: { broadcast: { self: false } } });
      typingChannel
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (payload?.profileId === profileId) return;
          setTyping(payload?.name ?? "Someone");
          if (typingTimer.current) window.clearTimeout(typingTimer.current);
          typingTimer.current = window.setTimeout(() => setTyping(null), TYPING_MS);
        })
        .subscribe();
      channel.current = typingChannel;
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (typingChannel) client.removeChannel(typingChannel);
      channel.current = null;
    };
  }, [householdId, profileId]);

  const announceTyping = () => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    channel.current?.send({ type: "broadcast", event: "typing", payload: { profileId, name: profileName } }).catch(() => null);
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream);
      media.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setVoice(new Blob(chunks, { type: media.mimeType || "audio/webm" }));
        setRecording(false);
      };
      media.start();
      recorder.current = media;
      setRecording(true);
      setFile(null);
    } catch {
      setError("The microphone is not available. Check the browser's permission.");
    }
  };

  const send = () => {
    setError(null);
    const form = new FormData();
    form.set("body", body);
    if (voice) {
      const extension = voice.type.includes("ogg") ? "ogg" : voice.type.includes("mp4") ? "m4a" : "webm";
      form.set("file", new File([voice], `voice.${extension}`, { type: voice.type }));
      form.set("kind", "voice");
    } else if (file) {
      form.set("file", file);
      form.set("kind", "image");
    }
    startTransition(async () => {
      const result = await sendMessageAction(form).catch(() => ({ ok: false as const, error: "The server could not be reached." }));
      if (!result.ok) {
        // The draft stays so nothing is lost.
        setError(`Not sent: ${result.error}`);
        return;
      }
      setBody("");
      setFile(null);
      setVoice(null);
      await reload();
    });
  };

  const lastOwn = [...messages].reverse().find((message) => message.senderId === profileId);

  return (
    <div className="surface flex h-[calc(100dvh-15rem)] min-h-[22rem] flex-col overflow-hidden">
      <ol ref={listRef} className="scroll-contain min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && <li className="py-10 text-center text-caption text-muted">No messages yet. Say hello.</li>}
        {messages.map((message) => {
          const own = message.senderId === profileId;
          return (
            <li key={message.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-card px-3.5 py-2.5", own ? "bg-accent-soft" : "border border-subtle bg-sunken")}>
                {!own && <p className="mb-0.5 text-caption font-medium text-secondary">{message.senderName}</p>}
                {message.attachmentKind === "image" && message.attachmentUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={message.attachmentUrl} alt="Photo in the message" className="mb-1.5 max-h-72 w-full rounded-panel object-contain" />
                )}
                {message.attachmentKind === "voice" && message.attachmentUrl && (
                  <audio controls src={message.attachmentUrl} className="mb-1.5 w-60 max-w-full" />
                )}
                {message.attachmentKind && !message.attachmentUrl && <p className="text-caption text-muted">Attachment unavailable</p>}
                {message.body && <p className="whitespace-pre-wrap break-words text-[0.9375rem] text-primary">{message.body}</p>}
                <p className="mt-1 flex items-center justify-end gap-1 text-[0.6875rem] text-muted tabular">
                  {timeFormat.format(new Date(message.createdAt))}
                  {own && message.id === lastOwn?.id &&
                    (message.readAt ? (
                      <span className="flex items-center gap-0.5 text-accent-text">
                        <CheckCheck aria-hidden="true" className="size-3.5" strokeWidth={2.2} /> Seen
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5">
                        <Check aria-hidden="true" className="size-3.5" strokeWidth={2.2} /> Sent
                      </span>
                    ))}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="border-t border-subtle p-3">
        <p className="mb-1 h-4 text-caption text-muted" aria-live="polite">
          {typing ? `${typing} is typing` : ""}
        </p>
        {(file || voice) && (
          <div className="mb-2 flex items-center gap-2 rounded-panel border border-subtle bg-sunken px-3 py-2 text-caption text-secondary">
            <span className="min-w-0 flex-1 truncate">{voice ? "Voice note ready" : file?.name}</span>
            <button type="button" className="icon-btn size-7" aria-label="Remove attachment" onClick={() => (setFile(null), setVoice(null))}>
              <X aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mb-2 text-caption text-danger-text">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label className="icon-btn shrink-0 cursor-pointer" aria-label="Attach a photo">
            <ImagePlus aria-hidden="true" className="size-4" strokeWidth={2} />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setVoice(null);
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={recording ? () => recorder.current?.stop() : startRecording}
            className={cn("icon-btn shrink-0", recording && "border-danger text-danger-text")}
            aria-label={recording ? "Stop recording" : "Record a voice note"}
            aria-pressed={recording}
          >
            {recording ? <Square aria-hidden="true" className="size-4" strokeWidth={2} /> : <Mic aria-hidden="true" className="size-4" strokeWidth={2} />}
          </button>
          <textarea
            value={body}
            onChange={(event) => {
              setBody(event.target.value.slice(0, 1000));
              announceTyping();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!pending) send();
              }
            }}
            rows={1}
            placeholder={recording ? "Recording" : "Write a message"}
            aria-label="Message"
            className="field min-h-[2.5rem] flex-1 resize-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={pending || recording || (!body.trim() && !file && !voice)}
            className="btn-primary pressable shrink-0 px-3"
            aria-label={pending ? "Sending" : "Send"}
            aria-busy={pending}
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={2.2} />
            ) : (
              <Send aria-hidden="true" className="size-4" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
