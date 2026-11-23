# Source of truth

These files describe how OpenIGCSE is built today and how work on it is done. Where they disagree with
`ARCHITECTURE_MAP.txt` (a 2026-10-20 snapshot), these files win. Where they disagree with the code, the code wins, and
the file gets fixed in the same commit.

| File                                   | Answers                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| [architecture.md](architecture.md)     | Layers, where code goes, how a request reaches Postgres         |
| [data-model.md](data-model.md)         | Every table, who can read and write it, key functions           |
| [workflow.md](workflow.md)             | How a phase is planned, built, verified, documented and merged  |
| [unhardcoding.md](unhardcoding.md)     | Every hard-coded example or duplicated constant, and its fix    |

Status lives elsewhere: [../done-work.md](../done-work.md) is the roadmap checklist,
[../progress.md](../progress.md) the honest gap list, and [../phases/](../phases/) the record of each merged phase.
