# Thesis System → Pattern Catalogue Ecosystem Mapping

Based on Figure 2 from Liu et al. (2024) "Agent Design Pattern Catalogue" (arXiv 2405.10467).
This maps all 18 patterns to the Semantic Latent Explorer system.

## Ecosystem Diagram (text representation for figure creation)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│         ┌──────────┐    prompt (brief, tags,     ┌──────────────────┐           │
│         │          │◄── axis labels, prompt) ────►│                  │           │
│         │   User   │                              │  Semantic Canvas │           │
│         │(Designer)│◄── response (positioned ────►│   (D3.js UI)     │           │
│         │          │    images, insights,          │                  │           │
│         └────┬─────┘    ghost nodes)               └──────────────────┘           │
│              │                                                                   │
│   ┌──────────────────┐                           ┌──────────────────────┐        │
│   │ 4.11 Human       │                           │ 4.15 Multimodal      │        │
│   │ Reflection       │                           │ Guardrails           │        │
│   │                  │                           │                      │        │
│   │ • Accept/Reject  │                           │ • Brief constraint   │        │
│   │   ghost nodes    │                           │   enforcement        │        │
│   │ • Star ratings   │                           │ • Shoe-type lock     │        │
│   │ • Edit prompts   │                           │   (brief → prompt)   │        │
│   │ • Axis tuning    │                           │ • NOT YET: safety    │        │
│   └──────────────────┘                           │   filtering          │        │
│                                                  └──────────────────────┘        │
│   ┌──────────────────┐                                                           │
│   │ 4.18 Agent       │                                                           │
│   │ Evaluator        │                                                           │
│   │                  │                                                           │
│   │ • NOT YET        │                                                           │
│   │ • Opportunity:   │                                                           │
│   │   eval harness   │                                                           │
│   │   for L7 topic   │                                                           │
│   └──────────────────┘                                                           │
│                                                                                  │
│  ════════════════════════════════════════════════════════════════════════════     │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐      │
│  │              BRIEF-AWARE AGENT (Gemini 2.5 Flash Lite)                │      │
│  │              ═══════════════════════════════════════                   │      │
│  │              Agent-as-a-Coordinator (single agent)                    │      │
│  │                                                                       │      │
│  │  ┌─────────────────────┐    ┌──────────────────────┐                  │      │
│  │  │ Context Engineering │    │ Memory               │                  │      │
│  │  │                     │    │                      │                  │      │
│  │  │ • Design Brief      │    │ • Session JSONs      │                  │      │
│  │  │ • Canvas State      │    │ • Event Logs (JSONL) │                  │      │
│  │  │ • Recent Gens       │    │ • Embedding Cache    │                  │      │
│  │  │ • Selection Context │    │ • Per-participant     │                  │      │
│  │  └─────────────────────┘    └──────────────────────┘                  │      │
│  │                                                                       │      │
│  │  ┌─────────────────────┐    ┌──────────────────────┐                  │      │
│  │  │ 4.3 Prompt/Response │    │ Execution Engine     │  invoke  ──────►│─ ─ ─ │
│  │  │ Optimiser           │    │                      │                  │      │
│  │  │                     │    │ • Loop 1: Intent     │◄─outcome ──────►│─ ─ ─ │
│  │  │ • Loop 3: Prompt    │    │   Interpretation     │                  │      │
│  │  │   Refinement        │    │ • Loop 2: Divergent  │                  │      │
│  │  │ • Gemini compose/   │    │   Suggestion         │                  │      │
│  │  │   refine pipeline   │    │ • Loop 4: Axis       │                  │      │
│  │  │ • Tag suggestion    │    │   Reframing          │                  │      │
│  │  │   generation        │    │ • Loop 5: Gap        │                  │      │
│  │  └─────────────────────┘    │   Detection          │                  │      │
│  │                              └──────────────────────┘                  │      │
│  │  ┌─────────────────────┐    ┌──────────────────────┐                  │      │
│  │  │ 4.5 One-Shot Model  │    │ Plan Generation      │                  │      │
│  │  │ Querying            │    │                      │                  │      │
│  │  │                     │    │ • 4.7 Single-Path    │                  │      │
│  │  │ • Each loop = one   │    │   (Loop 5: scan →    │                  │      │
│  │  │   Gemini call       │    │    detect gaps →     │                  │      │
│  │  │ • No chain-of-      │    │    place ghosts)     │                  │      │
│  │  │   thought yet       │    │ • NOT YET: 4.8      │                  │      │
│  │  │ • Opportunity:      │    │   Multi-Path         │                  │      │
│  │  │   4.6 Incremental   │    │                      │                  │      │
│  │  └─────────────────────┘    └──────────────────────┘                  │      │
│  │                                                                       │      │
│  │  ┌─────────────────────────────────────────────┐                      │      │
│  │  │ 4.1 Passive Goal Creator                    │                      │      │
│  │  │ • Design Brief (user-written free text)     │                      │      │
│  │  │ • Generation prompt (user tags + freetext)  │                      │      │
│  │  │                                              │                      │      │
│  │  │ 4.2 Proactive Goal Creator                  │                      │      │
│  │  │ • Loop 2: Suggests prompts user didn't ask  │                      │      │
│  │  │ • Loop 4: Suggests new axes                 │                      │      │
│  │  │ • Loop 5: Ghost nodes in unexplored regions │                      │      │
│  │  └─────────────────────────────────────────────┘                      │      │
│  │                                                                       │      │
│  └────────────────────────────────────────────────────────────────────────┘      │
│                                                                                  │
│  ════════════════════════════════════════════════════════════════════════════     │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐      │
│  │              EXTERNAL SYSTEMS                                          │      │
│  │                                                                       │      │
│  │  ┌──────────────────────────────────────┐   ┌──────────────────────┐  │      │
│  │  │ 4.17 Agent Adapter (Backend BFF)     │   │ Datastore            │  │      │
│  │  │                                      │   │                      │  │      │
│  │  │ FastAPI proxies ALL external calls:  │   │ • Session JSONs      │  │      │
│  │  │ • /api/fal/run → fal.ai             │   │ • Embedding cache    │  │      │
│  │  │ • Jina API → embeddings             │   │   (.pkl files)       │  │      │
│  │  │ • Gemini API → agent reasoning      │   │ • Event logs         │  │      │
│  │  │                                      │   │   (.jsonl files)     │  │      │
│  │  │ Adapts: auth headers, retry logic,  │   │ • Participant data   │  │      │
│  │  │ data URI conversion, rate limiting  │   │   (per-user dirs)    │  │      │
│  │  └──────────────────────────────────────┘   └──────────────────────┘  │      │
│  │                                                                       │      │
│  │  ┌──────────────────────────────────────┐                             │      │
│  │  │ 4.16 Tool/Agent Registry             │                             │      │
│  │  │                                      │                             │      │
│  │  │ IMPLICIT (not dynamic):              │                             │      │
│  │  │ • fal.ai nano-banana (generation)    │                             │      │
│  │  │ • fal.ai nano-banana-2 (sheets)      │                             │      │
│  │  │ • Jina CLIP v2 (embeddings)          │                             │      │
│  │  │ • Gemini 2.5 Flash Lite (reasoning)  │                             │      │
│  │  │                                      │                             │      │
│  │  │ Opportunity: MCP server would make   │                             │      │
│  │  │ this a true dynamic registry         │                             │      │
│  │  └──────────────────────────────────────┘                             │      │
│  │                                                                       │      │
│  │  ┌──────────────────────────────────────┐                             │      │
│  │  │ 4.4 RAG                              │                             │      │
│  │  │                                      │                             │      │
│  │  │ PARTIAL:                             │                             │      │
│  │  │ • Canvas state = "retrieved" context │                             │      │
│  │  │ • Embedding cache = vector store     │                             │      │
│  │  │ • NOT a true RAG pipeline yet        │                             │      │
│  │  │ • Opportunity: RAG over past briefs  │                             │      │
│  │  │   and design sessions (L5 topic)     │                             │      │
│  │  └──────────────────────────────────────┘                             │      │
│  └────────────────────────────────────────────────────────────────────────┘      │
│                                                                                  │
│  ════════════════════════════════════════════════════════════════════════════     │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐      │
│  │              WORKER AGENTS (NOT YET IMPLEMENTED)                       │      │
│  │                                                                       │      │
│  │  Currently: No sub-agents. Single coordinator handles everything.     │      │
│  │                                                                       │      │
│  │  Proposed — Competing Agents Experiment:                              │      │
│  │                                                                       │      │
│  │  ┌─────────────┐  4.14 Debate  ┌──────────────┐                      │      │
│  │  │ Agent A:     │◄────────────►│ Agent B:      │                      │      │
│  │  │ Conservative │  4.10 Cross- │ Experimental  │                      │      │
│  │  │ Designer     │  Reflection  │ Designer      │                      │      │
│  │  │              │              │               │                      │      │
│  │  │ • Brief-     │              │ • Boundary-   │                      │      │
│  │  │   adherent   │              │   pushing     │                      │      │
│  │  │ • Incremental│              │ • Unexpected  │                      │      │
│  │  │ • High       │              │ • High        │                      │      │
│  │  │   fidelity   │              │   novelty     │                      │      │
│  │  └──────┬───────┘              └──────┬────────┘                      │      │
│  │         │        ┌──────────┐         │                               │      │
│  │         └───────►│Evaluator │◄────────┘                               │      │
│  │                  │(4.12 Vote│                                          │      │
│  │                  │ or 4.9   │                                          │      │
│  │                  │ Self-Ref)│                                          │      │
│  │                  └──────────┘                                          │      │
│  └────────────────────────────────────────────────────────────────────────┘      │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Pattern Coverage Summary

| Pattern | Status in Thesis System | Where |
|---------|------------------------|-------|
| 4.1 Passive Goal Creator | ✅ Active | Design Brief, generation prompt |
| 4.2 Proactive Goal Creator | ✅ Active | Loops 2, 4, 5 (suggestions, axes, ghosts) |
| 4.3 Prompt/Response Optimiser | ✅ Active | Loop 3 (Gemini compose/refine) |
| 4.4 RAG | ⚠️ Partial | Canvas state as context; not true vector retrieval |
| 4.5 One-Shot Model Querying | ✅ Active | Each Gemini call is one-shot |
| 4.6 Incremental Model Querying | ❌ Not yet | Opportunity: chain-of-thought reasoning |
| 4.7 Single-Path Plan Generator | ✅ Active | Loop 5 (scan → detect → place) |
| 4.8 Multi-Path Plan Generator | ❌ Not yet | Opportunity: generate multiple gap-fill strategies |
| 4.9 Self-Reflection | ❌ Not yet | Opportunity: agent evaluates own suggestions |
| 4.10 Cross-Reflection | ❌ Not yet | → Competing Agents experiment |
| 4.11 Human Reflection | ✅ Active | Accept/Reject ghosts, star ratings, edit prompts |
| 4.12 Voting-based Cooperation | ❌ Not yet | → Could score competing suggestions by CLIP similarity |
| 4.13 Role-based Cooperation | ❌ Not yet | → Conservative vs Experimental = role assignment |
| 4.14 Debate-based Cooperation | ❌ Not yet | → Competing Agents arguing over design direction |
| 4.15 Multimodal Guardrails | ⚠️ Partial | Brief constraint enforcement; no safety filtering |
| 4.16 Tool/Agent Registry | ⚠️ Implicit | Hardcoded tool list; not dynamic discovery |
| 4.17 Agent Adapter | ✅ Active | FastAPI BFF proxies all external APIs |
| 4.18 Agent Evaluator | ❌ Not yet | → L7 eval harness topic |

**Score: 7 active + 3 partial + 8 not yet = good foundation for a single-agent creative system**

## Cross-References

- **Thesis Chapter 4.5** (Brief-Aware Agent) → maps to patterns 4.1, 4.2, 4.3, 4.5, 4.7, 4.11
- **Thesis Chapter 4.2** (Architecture) → maps to patterns 4.16, 4.17, 4.4
- **Competing Agents Experiment** → maps to patterns 4.10, 4.13, 4.14, 4.12
- **Future Work (L5, L7, L10)** → maps to patterns 4.4, 4.6, 4.9, 4.15, 4.18
