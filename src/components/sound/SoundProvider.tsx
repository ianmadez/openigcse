"use client";

import { bind, play, setEnabled, setVolume, unlock, type SoundName } from "cuelume";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * The one place interface sound is wired up.
 *
 * Clicks, hovers, typing and deleting come from cuelume's declarative binding.
 * Rather than rewriting the tree with data-cuelume-* attributes up front, which
 * fights React's hydration, each gesture tags the element it landed on in the
 * capture phase just before cuelume reads it.
 *
 * Success, warning and error cues are derived from feedback the UI already
 * announces through role="status", role="alert" or an aria-live region, so no
 * feature component has to know that sound exists.
 */

const STORAGE_KEY = "openigcse-sound";
const VOLUME = 0.5;

const CLICKABLE = "a[href], button, [role='button'], [role='radio'], [role='tab'], summary";
const EDITABLE =
  "input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):not([type='hidden']), textarea";
const CHOOSABLE = "select, input[type='checkbox'], input[type='radio'], input[type='range']";
const FEEDBACK = "[role='alert'], [role='status'], [aria-live='polite'], [aria-live='assertive']";
const GESTURES = ["pointerdown", "pointerenter", "keydown", "change", "focusin"] as const;

type SoundContextValue = { enabled: boolean; toggle: () => void };

const SoundContext = createContext<SoundContextValue | null>(null);

export function useSound() {
  const value = useContext(SoundContext);
  if (!value) throw new Error("useSound has to run inside <SoundProvider>.");
  return value;
}

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Tags whatever the gesture landed on, so cuelume knows which cue to play. */
function tagTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return;

  const clickable = target.closest(CLICKABLE);
  if (clickable) {
    clickable.setAttribute("data-cuelume-tap", "");
    clickable.setAttribute("data-cuelume-hover", "");
  }
  if (target.matches(EDITABLE)) target.setAttribute("data-cuelume-type", "");
  if (target.matches(CHOOSABLE)) target.setAttribute("data-cuelume-select", "");
}

/** Reads the tone the interface already chose for a piece of feedback. */
function cueFor(node: Element): SoundName {
  const tone = node.getAttribute("class") ?? "";
  if (/danger|error/.test(tone)) return "error";
  if (/warning/.test(tone)) return "warning";
  return "success";
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    const stored = readPreference();
    setVolume(VOLUME);
    setEnabled(stored);
    setEnabledState(stored);
    // Some browsers hold audio until a gesture; harmless when it is too early.
    if (stored) void unlock().catch(() => undefined);
  }, []);

  useEffect(() => {
    const undo = bind();

    const onGesture = (event: Event) => tagTarget(event.target);
    for (const gesture of GESTURES) window.addEventListener(gesture, onGesture, { capture: true, passive: true });

    const seen = new WeakMap<Element, string>();
    const cueFeedback = () => {
      document.querySelectorAll(FEEDBACK).forEach((node) => {
        const text = (node.textContent ?? "").trim();
        if (!text || seen.get(node) === text) return;
        seen.set(node, text);
        play(cueFor(node));
      });
    };

    // Prime the page so nothing fires on arrival.
    cueFeedback();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(cueFeedback, 60);
    };

    const observer = new MutationObserver((records) => {
      const touched = records.some(
        (record) =>
          record.type === "characterData" ||
          (record.type === "childList" &&
            [...record.addedNodes].some(
              (node) => node instanceof Element && (node.matches(FEEDBACK) || Boolean(node.querySelector(FEEDBACK))),
            )),
      );
      if (touched) schedule();
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const onFirstGesture = () => {
      void unlock().catch(() => undefined);
      window.removeEventListener("pointerdown", onFirstGesture);
    };
    window.addEventListener("pointerdown", onFirstGesture);

    return () => {
      if (timer) clearTimeout(timer);
      for (const gesture of GESTURES) window.removeEventListener(gesture, onGesture, { capture: true });
      window.removeEventListener("pointerdown", onFirstGesture);
      observer.disconnect();
      undo();
    };
  }, []);

  const toggle = useCallback(() => {
    setEnabledState((current) => {
      const next = !current;
      setEnabled(next);
      if (next) void unlock().catch(() => undefined);
      try {
        localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      } catch {
        // Storage can be blocked; the choice still holds for this page.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ enabled, toggle }), [enabled, toggle]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}
