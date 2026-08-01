# THOTH Forensic Oracle: Refugio Identity-First Case

This repository now implements an identity-first forensic workflow for the Refugio County unidentified-woman case. The active application is no longer centered on the earlier Madison body-location ontology; instead it emphasizes restricted access handling, provenance-aware evidence, candidate-universe reasoning, ethical guardrails, and bounded reconstruction questions.

## What changed

- Replaced the old case model with an identity-first data contract centered on identity cases, candidate records, provenance, and ranked actions.
- Added a public/authorized access-mode workflow with a public-brief path that removes restricted details.
- Introduced an identity twin engine for case scoring, search-profile prioritization, outreach and forensic action ranking, and bounded reconstruction questions.
- Added regression tests for the new workflow and a server API surface for identity-oriented case and twin operations.

## Key files

- [src/data/refugioCase.ts](src/data/refugioCase.ts)
- [src/types/identityForensics.ts](src/types/identityForensics.ts)
- [src/engine/identityTwin.ts](src/engine/identityTwin.ts)
- [src/components/forensic/RefugioDashboard.tsx](src/components/forensic/RefugioDashboard.tsx)
- [server.ts](server.ts)

## Run locally

Prerequisites: Node.js 20+

1. Install dependencies:
   `npm install`
2. Start the development server:
   `npm run dev`
3. Optional: run the verification suite:
   `npm run typecheck && npm run test && npm run build`

## Guardrails

The workflow is designed to keep the system within a support role:

- it does not independently identify the woman
- visual resemblance is not identification
- demographic compatibility is not identification
- clothing similarity is not identification
- model scores are not forensic evidence
- the correct identity may lie outside the current candidate set
