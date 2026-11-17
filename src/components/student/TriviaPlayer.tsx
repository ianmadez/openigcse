"use client";

import { Check, Clapperboard, Play } from "lucide-react";
import { useState } from "react";

import { Status } from "@/components/ui/primitives";
import type { TriviaModule } from "@/lib/data/trivia";
import { cn } from "@/lib/utils/cn";

/** Plays a module and reveals its checkpoints at the timestamps recorded. */
export function TriviaPlayer({ module }: { module: TriviaModule }) {
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const params = new URLSearchParams({
    modestbranding: "1",
    rel: "0",
    iv_load_policy: "3",
    playsinline: "1",
    autoplay: "1",
  });

  return (
    <div className="space-y-4">
      <div className="aspect-video w-full overflow-hidden rounded-card border border-subtle bg-black">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${module.youtubeVideoId}?${params.toString()}`}
            title={module.title}
            className="size-full border-0"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group flex size-full flex-col items-center justify-center gap-3 bg-sunken px-6 text-center"
          >
            <span className="pressable flex size-14 items-center justify-center rounded-full border-b-[3px] border-accent-hover bg-accent text-on-accent group-hover:scale-105">
              <Play aria-hidden="true" className="size-5 translate-x-px fill-current" strokeWidth={0} />
            </span>
            <span className="text-[0.9375rem] font-semibold text-primary">Play the documentary</span>
            <span className="max-w-[42ch] text-caption text-secondary">{module.description}</span>
          </button>
        )}
      </div>

      <div className="space-y-2">
        {module.questions.map((question, index) => {
          const isOpen = revealed.includes(index);
          const chosen = answers[index];

          return (
            <div key={question.prompt} className="surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.875rem] font-medium text-primary">{question.prompt}</p>
                <Status tone="neutral">
                  <Clapperboard aria-hidden="true" className="size-3" strokeWidth={2} />
                  {formatTime(question.atSeconds)}
                </Status>
              </div>

              {isOpen ? (
                <>
                  <div role="radiogroup" aria-label={question.prompt} className="mt-2.5 space-y-1.5">
                    {question.options.map((option) => {
                      const selected = chosen === option.letter;
                      const correct = option.letter === question.correctLetter;
                      return (
                        <button
                          key={option.letter}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setAnswers((current) => ({ ...current, [index]: option.letter }))}
                          className={cn(
                            "flex w-full items-start gap-2.5 rounded-panel border-b-[3px] px-3 py-2 text-left text-[0.8125rem] leading-snug pressable",
                            chosen && correct && "border-success/50 bg-success-soft text-success-text",
                            chosen && !correct && "border-danger/40 bg-danger-soft text-danger-text",
                            !chosen && "border-subtle bg-card text-secondary",
                          )}
                        >
                          <span aria-hidden="true" className="font-semibold tabular">
                            {option.letter}
                          </span>
                          <span>{option.text}</span>
                          {chosen && correct && (
                            <Check aria-hidden="true" className="ml-auto size-4 shrink-0" strokeWidth={2.4} />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {chosen && (
                    <p className="mt-2 text-caption text-muted" role="status">
                      {question.explanation}
                    </p>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setRevealed((items) => [...items, index])}
                  className="btn-secondary pressable mt-2.5"
                >
                  Reveal checkpoint
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
