"use client";

import { Play } from "lucide-react";
import { useState } from "react";

type SandboxedVideoPlayerProps = {
  videoId: string;
  title: string;
  startSeconds?: number | null;
  endSeconds?: number | null;
  className?: string;
};

/**
 * Loads the privacy-enhanced embed only after a deliberate press, so a lesson
 * page stays quiet and no third-party frame mounts while the learner is reading.
 */
export function SandboxedVideoPlayer({
  videoId,
  title,
  startSeconds = 0,
  endSeconds = null,
  className,
}: SandboxedVideoPlayerProps) {
  const [playing, setPlaying] = useState(false);

  const params = new URLSearchParams({
    rel: "0",
    iv_load_policy: "3",
    playsinline: "1",
    color: "white",
    autoplay: "1",
    start: String(startSeconds ?? 0),
  });

  if (endSeconds) params.set("end", String(endSeconds));

  if (!playing) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group flex size-full flex-col items-center justify-center gap-2.5 bg-sunken px-4 text-center"
        >
          <span className="flex size-11 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-accent-text">
            <Play aria-hidden="true" className="size-4 translate-x-px fill-current" strokeWidth={0} />
          </span>
          <span className="text-[0.875rem] font-medium text-primary">Play lesson</span>
          <span className="max-w-[34ch] text-caption text-muted">{title}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`}
        title={title}
        className="size-full border-0"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

/**
 * YouTube API Services require apps that embed the player to link YouTube's Terms of Service and
 * Google's Privacy Policy (Developer Policies III.A, checked 2026-11-28). Shown under every player.
 */
export function YouTubeNotice({ className }: { className?: string }) {
  return (
    <p className={className ?? "mt-1.5 text-caption text-muted"}>
      Videos play through YouTube. Watching means agreeing to the{" "}
      <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" className="underline">
        YouTube Terms of Service
      </a>
      ; see the{" "}
      <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="underline">
        Google Privacy Policy
      </a>
      .
    </p>
  );
}
