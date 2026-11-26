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

## Deferred minors

- Maths notation is lossy in the PDF text layer (superscripts, vectors and matrices appear as stray tokens, e.g.
  "J N x K O"). Left for the 6.3 review screen to correct by hand.
