# Phase 6 ledger

Rulings (what, why, cost if wrong) and deferred minors.

## Rulings

1. **PDF fixtures stay out of git.** The roadmap asks to commit one fixture PDF per subject; CLAUDE.md and the workflow
   forbid committing `raw-syllabuses/*.pdf` (Cambridge copyright). The real-PDF tests read `raw-syllabuses/` and skip
   when a file is missing. Cost if wrong: a clone without the PDFs runs only the synthetic tests.
2. **Pinned counts are verified independently, not copied from the parser.** Decimal layouts: an independent text
   search for `N.N.N` rows gives the same 113 (0455) and 129 (0460). Column layouts: every subtopic's statement numbers
   run 1..N with no gaps (Core and Supplement share one sequence). Topic counts match each syllabus's contents list.
3. **Objective granularity follows what Cambridge numbers.** Sciences and CS: one objective per numbered statement,
   code `subtopic.N`. Maths: numbered statements where printed; an unnumbered stem becomes `subtopic.1`, and a numbered
   list under a stem ending in a colon joins that stem. Economics/Geography: one per `N.N.N` row with its bullets joined.
   History: one per specified-content bullet; depth studies print only focus points, so those are the objectives there.
   Languages: one per skill bullet.
4. **Topics without a subtopic level** (0478 topics 7, 9, 10) get an implicit subtopic `N.0` with the topic's name;
   objective codes keep Cambridge's own `N.k`. The importer keys topics and subtopics in one map, so the subtopic cannot
   reuse the topic's code.
5. **Maths topic codes carry the tier** (`C1`, `E1`) because Core and Extended reuse the numbers 1-9.
6. **0530 topic areas (A-E vocabulary contexts) are out of scope** for objectives; the skills list ends at "Topic
   areas". Cost if wrong: Spanish has no topic tree for vocabulary practice.
7. **Ingest writes `verified: false`.** It previously wrote `true`, which would have let an unreviewed extraction pass
   the exit gate.

8. **Entry routes per tier (6.2).** Tiered syllabuses get `PRIVATE-CORE` and `PRIVATE` (Extended); untiered get one
   `PRIVATE`. The Extended route keeps the old code so the real household's existing enrolment stays attached. A route
   is only built when its papers' weightings total exactly 100. Re-import now prunes papers no longer in a route.
9. **Private-candidate eligibility rules (6.2).** Coursework and portfolios: not eligible. A centre-run "Practical
   Test": not eligible (Paper 6, the Alternative to Practical, is). Speaking tests (0530 Paper 3) are internally
   assessed but run at the exam centre, so eligible, with a note. Optional, separately endorsed components (0500
   Component 4) stay out of routes. Cost if wrong: a route lists a paper the learner cannot sit; the parent sees the
   note on each paper.
10. **AO weighting ranges** (0580 prints 60-70%) store `weighting_percent: null` and keep the printed range in the
    description rather than inventing a midpoint.
11. **Manifest tiers come from the PDF**, not the registry. The registry says 0478 is Core/Extended; its papers are
    untiered.
12. **Production migrations wait for one approval.** `supabase db push --remote` needs the user's consent in agent mode,
    so 6.2's `command_words` and 6.4's lineage table are applied together near the end of the phase.

13. **Verification by spot-check, at the user's request (2026-11-26).** Six objectives per package (spread across the
    package) were found on their recorded PDF page: 60/60, three after a by-hand look because superscripts reorder
    the text. Progress links: the household's single learning event (CS 0478 1.1.2, convert between bases) was
    checked by hand and confirmed; other undecided links carry no household data, so text matches of 40% or more were
    confirmed and the rest marked "no successor". `reviewed_by` says it was a spot-check.

## Deferred minors

- Reference-data RLS lets staff of any household write shared curriculum rows (pre-existing, all curriculum tables;
  `command_words` follows the same pattern). Revisit in Phase 8 hardening.
- The registry's hand-entered `private_candidate.components` and `tiers` are now superseded by extraction for ingest;
  they remain for `ingest:list` and the UI's pre-import state.

- Maths notation is lossy in the PDF text layer (superscripts, vectors and matrices appear as stray tokens, e.g.
  "J N x K O"). Left for the 6.3 review screen to correct by hand.
