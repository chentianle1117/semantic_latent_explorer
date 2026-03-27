# L4: Agent Design Pattern Catalogue — Notes & Thesis Mapping

Source: Liu et al. (2024), arXiv 2405.10467v4

## All 18 Patterns (grouped by category)

### Goal Creation
| # | Pattern | What it does |
|---|---------|-------------|
| 1 | **Passive Goal Creator** | User explicitly provides goals; agent follows instructions |
| 2 | **Proactive Goal Creator** | Agent anticipates needs from context, suggests goals proactively |

### Knowledge & Prompting
| # | Pattern | What it does |
|---|---------|-------------|
| 3 | **Prompt/Response Optimiser** | Rewrites prompts or post-processes responses for quality |
| 4 | **RAG** | Retrieves external knowledge before generating response |

### Querying Strategy
| # | Pattern | What it does |
|---|---------|-------------|
| 5 | **One-Shot Model Querying** | Single LLM call for the whole task |
| 6 | **Incremental Model Querying** | Multi-step reasoning, chain-of-thought, iterative refinement |

### Planning
| # | Pattern | What it does |
|---|---------|-------------|
| 7 | **Single-Path Plan Generator** | One linear plan, execute step by step |
| 8 | **Multi-Path Plan Generator** | Multiple candidate plans, select best |

### Reflection
| # | Pattern | What it does |
|---|---------|-------------|
| 9 | **Self-Reflection** | Agent evaluates its own output, iterates |
| 10 | **Cross-Reflection** | Another agent/model critiques the output |
| 11 | **Human Reflection** | Human reviews and provides feedback |

### Multi-Agent Cooperation
| # | Pattern | What it does |
|---|---------|-------------|
| 12 | **Voting-based Cooperation** | Multiple agents vote on best output |
| 13 | **Role-based Cooperation** | Agents have specialized roles, divide labor |
| 14 | **Debate-based Cooperation** | Agents argue/critique each other's positions |

### Safety & Infrastructure
| # | Pattern | What it does |
|---|---------|-------------|
| 15 | **Multimodal Guardrails** | Input/output filtering for safety, privacy, compliance |
| 16 | **Tool/Agent Registry** | Centralized discovery of available tools/agents |
| 17 | **Agent Adapter** | Interface translation between agent and external tools |
| 18 | **Agent Evaluator** | Systematic testing and assessment of agent performance |

## Decision Model (Section 5)

Key trade-offs when selecting patterns:
- **Efficiency vs. Explainability** — one-shot is fast but opaque; incremental is slow but traceable
- **Cost vs. Reasoning Certainty** — reflection improves quality but doubles/triples LLM calls
- **Simplicity vs. Comprehensiveness** — single-path is easy; multi-path covers more ground
- **Scalability vs. Accountability** — role-based scales; voting-based has clearer audit trail

Key insight: **Composition over single patterns** — successful systems combine multiple patterns.

## Mapping to My Thesis System

| My Loop | Patterns Used | Notes |
|---------|--------------|-------|
| Loop 1: Intent Interpretation | Passive Goal Creator + RAG | Brief = passive goal; canvas state = retrieved context |
| Loop 2: Divergent Suggestion | Proactive Goal Creator + Multi-Path Plan | Agent suggests beyond brief; generates alternatives |
| Loop 3: Prompt Refinement | Prompt/Response Optimiser + Self-Reflection | Rewrites user prompt; evaluates own output |
| Loop 4: Axis Reframing | Proactive Goal Creator | Agent suggests new axes user didn't ask for |
| Loop 5: Gap Detection | Single-Path Plan Generator | Scans canvas → identifies gaps → places ghost nodes |
| Human-in-the-loop | Human Reflection | Accept/Edit/Reject on every agent output |
| fal.ai / Jina / Gemini calls | Agent Adapter + Tool Registry | Backend proxies all external APIs |

## Patterns NOT Yet Used (Opportunities)

- **Cross-Reflection** → Could add: Agent A generates, Agent B critiques (→ Competing Agents experiment!)
- **Debate-based Cooperation** → Conservative vs Experimental agents arguing over design direction
- **Voting-based Cooperation** → Multiple prompt variants, pick best by CLIP similarity score
- **Multimodal Guardrails** → Brief compliance checking before generation
- **Agent Evaluator** → Systematic eval of agent suggestions (L7 topic)
- **Incremental Model Querying** → Current system is mostly one-shot; could add chain-of-thought reasoning

## Key Takeaways for Thesis Writing

1. My system already implements ~8 of 18 patterns (good coverage for a single-agent system)
2. The Competing Agents experiment maps to Cross-Reflection + Debate-based Cooperation
3. "Composition over single patterns" validates my multi-loop architecture
4. Human Reflection is central to my design — the paper confirms this is essential for high-stakes creative applications
5. Tool/Agent Registry + Agent Adapter map to my backend BFF pattern (fal proxy, Jina proxy, Gemini proxy)
