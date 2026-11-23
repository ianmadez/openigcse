import "katex/dist/katex.min.css";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import { cn } from "@/lib/utils/cn";

/**
 * Question text: Markdown with $inline$ and $$display$$ maths. Raw HTML is not
 * rendered (no rehype-raw), and images come only from uploaded files, never
 * from links typed into the text.
 */
export function MathMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("math-markdown text-[0.875rem] leading-relaxed text-primary", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
        disallowedElements={["img"]}
        unwrapDisallowed
        components={{
          a: ({ href, children: label }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent-text underline">
              {label}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
