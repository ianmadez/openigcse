import type { Config } from "tailwindcss";

/**
 * Colour tokens are declared as raw oklch channels in globals.css, so every
 * semantic colour keeps Tailwind's opacity modifiers. Components reference the
 * semantic names below and never a raw ramp step.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        page: "oklch(var(--surface-page) / <alpha-value>)",
        card: "oklch(var(--surface-card) / <alpha-value>)",
        muted: "oklch(var(--text-muted) / <alpha-value>)",
        sunken: "oklch(var(--surface-muted) / <alpha-value>)",
        inset: "oklch(var(--surface-inset) / <alpha-value>)",
        subtle: "oklch(var(--border-subtle) / <alpha-value>)",
        strong: "oklch(var(--border-strong) / <alpha-value>)",
        primary: "oklch(var(--text-primary) / <alpha-value>)",
        secondary: "oklch(var(--text-secondary) / <alpha-value>)",
        accent: {
          DEFAULT: "oklch(var(--accent-solid) / <alpha-value>)",
          hover: "oklch(var(--accent-solid-hover) / <alpha-value>)",
          soft: "oklch(var(--accent-surface) / <alpha-value>)",
          "soft-strong": "oklch(var(--accent-surface-strong) / <alpha-value>)",
          line: "oklch(var(--accent-border) / <alpha-value>)",
          text: "oklch(var(--accent-text) / <alpha-value>)",
        },
        "on-accent": "oklch(var(--on-accent) / <alpha-value>)",
        success: {
          DEFAULT: "oklch(var(--success-solid) / <alpha-value>)",
          soft: "oklch(var(--success-surface) / <alpha-value>)",
          text: "oklch(var(--success-text) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "oklch(var(--danger-solid) / <alpha-value>)",
          soft: "oklch(var(--danger-surface) / <alpha-value>)",
          text: "oklch(var(--danger-text) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "oklch(var(--warning-solid) / <alpha-value>)",
          soft: "oklch(var(--warning-surface) / <alpha-value>)",
          text: "oklch(var(--warning-text) / <alpha-value>)",
        },
        info: {
          DEFAULT: "oklch(var(--info-solid) / <alpha-value>)",
          soft: "oklch(var(--info-surface) / <alpha-value>)",
          text: "oklch(var(--info-text) / <alpha-value>)",
        },
        scrim: "oklch(var(--overlay-scrim) / 0.45)",
        subject: {
          stem: "oklch(var(--subject-stem) / <alpha-value>)",
          "stem-surface": "oklch(var(--subject-stem-surface) / <alpha-value>)",
          biology: "oklch(var(--subject-biology) / <alpha-value>)",
          "biology-surface": "oklch(var(--subject-biology-surface) / <alpha-value>)",
          physics: "oklch(var(--subject-physics) / <alpha-value>)",
          "physics-surface": "oklch(var(--subject-physics-surface) / <alpha-value>)",
          humanities: "oklch(var(--subject-humanities) / <alpha-value>)",
          "humanities-surface": "oklch(var(--subject-humanities-surface) / <alpha-value>)",
          languages: "oklch(var(--subject-languages) / <alpha-value>)",
          "languages-surface": "oklch(var(--subject-languages-surface) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        caption: ["0.8125rem", { lineHeight: "1.45" }],
        body: ["1rem", { lineHeight: "1.6" }],
        heading: ["1.125rem", { lineHeight: "1.35", letterSpacing: "-0.006em" }],
        title: ["1.5rem", { lineHeight: "1.25", letterSpacing: "-0.012em" }],
        display: ["2rem", { lineHeight: "1.15", letterSpacing: "-0.018em" }],
      },
      borderRadius: {
        card: "1rem",
        panel: "0.625rem",
      },
      boxShadow: {
        overlay: "0 24px 48px -24px oklch(var(--shadow-color) / 0.35)",
        card: "0 1px 2px 0 oklch(var(--shadow-color) / 0.06)",
      },
      transitionTimingFunction: {
        tactile: "cubic-bezier(0.2, 0, 0, 1)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)", filter: "blur(4px)" },
          to: { opacity: "1", transform: "translateY(0)", filter: "blur(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms cubic-bezier(0.2, 0, 0, 1) both",
        "rise-in": "rise-in 260ms cubic-bezier(0.2, 0, 0, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
