"use client";

import { Volume2, VolumeX } from "lucide-react";

import { useSound } from "@/components/sound/SoundProvider";

export function SoundToggle() {
  const { enabled, toggle } = useSound();

  return (
    <button
      type="button"
      onClick={toggle}
      className="icon-btn"
      aria-label={enabled ? "Mute interface sounds" : "Turn interface sounds on"}
      aria-pressed={enabled}
      title={enabled ? "Interface sounds on" : "Interface sounds muted"}
    >
      {enabled ? (
        <Volume2 aria-hidden="true" className="size-[18px]" strokeWidth={2} />
      ) : (
        <VolumeX aria-hidden="true" className="size-[18px]" strokeWidth={2} />
      )}
    </button>
  );
}
