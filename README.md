# Pune Plate Agent

An agentic food planner for Pune built on the Qloo Taste AI API. Give it a few places you love; it resolves them to Qloo entities, queries the taste graph (`/v2/insights` with entity signals and a Pune location filter), re-ranks for area, diet, budget and craving, and returns a three-stop food crawl with reasons.

Without Qloo this would be a generic top-restaurants list. The ranking signal is taste affinity to your anchors.

## Run
    cp .env.example .env   # add your Qloo hackathon key
    npm start              # http://localhost:3000
    npm test

No dependencies. Node 18+. License: MIT.

## v9 (Oct 29)
- Food-serving isolation: lodging venues (by name or Qloo tags) are dropped unless Qloo data also marks them food-serving; addresses/descriptions never used for lodging detection.
- Query-fit: craving evidence from Qloo tags/keywords ranks picks; picks without evidence are labelled taste-match-only and the note discloses the evidence count.
- Offline fixture tests (test-queryfit.mjs); QLOO_STUB injection for offline plan() tests.
