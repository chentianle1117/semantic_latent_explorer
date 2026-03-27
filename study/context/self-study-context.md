# Agentic Systems Self-Study Context

> Drop this file in your thesis repo root. Any Claude Code session will read it and understand both your codebase AND your learning goals.

---

## Who I Am
David Chen — CMU MSCD '26 (Computational Design), ML Engineer at HILOS (footwear design AI startup). Starting full-time June 8, 2026. Manager: Beichen. CEO: Elias. My background is design + computational, not traditional CS. I use Claude Code extensively for implementation and have strong system thinking / product sense. I'm self-studying agentic AI and production ML concepts using my thesis as a testbed.

---

## Thesis System Architecture: "Designing with Latent Space"

**Stack**: React/D3.js frontend, FastAPI/PyTorch backend, CLIP embeddings, Google Gemini 2.5 Flash

### Semantic Canvas
- Phase 1 (Image Embedding): Raw Image -> CLIP Encoder -> Image Vector
- Phase 2 (Axis Construction): Axis Labels (e.g., Sporty vs Formal) -> LLM Expansion -> Detailed Prompts -> CLIP Encoder + Average -> Axis Vector
- Phase 3 (Projection & UI): Compute Match (Dot Product of Image Vector x Axis Vector) -> Raw Score -> 2D Semantic Canvas

### Brief-Aware Agent (Agentic System)
**4 Phases, 5 Agentic Loops**

**Phase 1: Observe** (Context & Triggers)
- Free-Text Brief & Structured Params
- User Generation Prompt & Tags
- Canvas State (Axes, Clusters, Gaps)

**Phase 2: Reason**
- Brief-Aware Agent (LLM Context Engine) -- processes all 3 context sources via Gemini 2.5 Flash

**Phase 3: Produce** (5 Agentic Loops)
- Loop 1: Intent Interpretation (Extract <-> Synthesize) -- **extraction/synthesis pattern**
- Loop 2: Divergent Suggestion (Alternative Prompt) -- **creativity/exploration pattern**
- Loop 3: Prompt Refinement (Rewrite & Clarify) -- **Reflection/Critic pattern** (ReAct-style)
- Loop 4: Axis Reframing (New Semantic Pairs) -- **creative reframing**
- Loop 5: Gap Detection (Ghost Nodes @ Coordinates) -- **Plan-and-Execute pattern**

**Phase 4: Agency & Feedback**
- User Decision (Accept / Edit / Reject) -- **human-in-the-loop** design
- Parallel Generation (Runs Alongside User) -- adds 2nd shoe to canvas
- Canvas / Pipeline Updates

---

## Self-Study Plan (CMU 94-815 Agentic Technologies + MLiP)

### Source Materials
- **Canvas**: canvas.cmu.edu/courses/53289 (slides, PDFs, videos -- I have access)
- **Anthropic Guide**: anthropic.com/research/building-effective-agents
- **Hello-Agents**: datawhalechina.github.io/hello-agents/ (Ch 4, 9, 10, 12 most relevant)
- **MCP Docs**: modelcontextprotocol.io
- **MLiP Textbook**: mlip-cmu.github.io/book/ (Ch 15, Ch 19)
- **MAST Paper**: arxiv.org/abs/2503.13657 -- 14 failure modes for multi-agent systems
- **MAST GitHub**: github.com/multi-agent-systems-failure-taxonomy/MAST
- **Microsoft Agent Failure Taxonomy**: microsoft.com/en-us/security/blog/2025/04/24/new-whitepaper-outlines-the-taxonomy-of-failure-modes-in-ai-agents/
- **NIST AI 600-1**: GenAI risk profile (free gov doc)
- **MCP Python SDK**: github.com/modelcontextprotocol/python-sdk

### Canvas Lecture Materials (94-815, Spring 2026)

**L1: Introduction & Evolution of ABM** -- slides + book chapters + videos (skip -- ABM foundations)
**L2: Emergence, Feedback, Complex Systems** -- Predator-Prey dynamics (skip -- ABM focus)
**L3: LLMs to AI Agents** -- DONE
- Book: Ch 2 Designing Agent Systems (Albada)
- Required: Seizing the Agentic AI Advantage (45m), LLM-Based Autonomous Agents arXiv 2308.11432 (100m)
- Optional: Architecture Taxonomy (30m), Working Limitations of LLMs (35m), Exploring LLM Agents (90m)
- Videos: Andrew Ng on AI Agents, Agentic AI enterprise impact

**L4: Designing Single Agents -- Patterns, Protocols, Policy Controls** -- IN PROGRESS
- Book: Ch 4 Tool Use (Albada), Ch 4 Tool Usage, Learning, Protocols (Grootendorst/Alammar)
- Required: Agent-Design-Pattern-Catalogue arXiv 2405.10467 (45m), Tool-Learning-LLM-Survey arXiv 2405.17935 (90m)
- Optional: Building Effective AI Agents - Anthropic (15m), Agentic Design Patterns System-Theoretic Framework (90m), Top 4 Agentic AI Design Patterns (30m), Agentic RAG Survey (60m)
- Videos: Tips for building AI agents, Barry Zhang Anthropic, MCP Workshop Mahesh Murag

**L5: Memory, RAG, Agent State** -- not yet posted on Canvas
**L6: Multi-Agent Systems in Practice** -- not yet posted
**L7: Evaluating and Benchmarking Agents** -- not yet posted
**L8: Computer Use, Web, Embodied Agents** -- not yet posted (optional/skip)
**L9: Coding Agents & AI Scientists** -- not yet posted (optional/skip)
**L10: Agent Safety, Security, Governance** -- not yet posted
**L11: AgentOps: Prototype to Production** -- not yet posted

### Completed
- L3: Agent architecture patterns -- read Anthropic guide, mapped 5 loops to formal pattern vocabulary
- Understand ReAct, Plan-and-Solve, Reflection, Supervisor+Specialists patterns

### In Progress / Next Topics

**L4: Tool Use, MCP, Interoperability**
- Key concepts: MCP architecture (hosts/clients/servers), least-privilege tool design, "policies outside the reasoning loop", tool allowlists
- Thesis experiment: Could Semantic Canvas expose an MCP tool server? (get_canvas_state, get_gaps, suggest_axis)

**L5: Memory, RAG, Agent State**
- 4 memory types: in-context, RAG, long-term/semantic, episodic
- Context engineering: how to manage brief + prompt + canvas state without staleness
- Failure modes: context poisoning, stale retrieval, cross-user leakage
- Thesis experiment: Add staleness checks to context management. Prototype simple RAG for past design briefs.

**L7: Evaluating Agents**
- Eval harnesses: measure task success + cost + latency together
- Confidence intervals, repeated trials, noisy ties
- LLM-as-judge: rubric design, calibration
- Thesis experiment: Build eval framework for HILOS Studio user study. Create test set of 5-10 design briefs.

**MLiP Ch 15: Model Quality**
- Behavioral testing, invariance tests, directional expectation tests, slicing
- Thesis experiment: Test CLIP embedding stability. Do similar shoes cluster? Are axis projections meaningful?

**MLiP Ch 19: Monitoring & Testing in Production**
- Drift detection, A/B testing, canary deployments, monitoring telemetry
- Thesis experiment: How would you detect if CLIP embeddings degrade over time at HILOS?

**L10: Safety, Security, Governance**
- InjecAgent taxonomy, prompt injection attack chains
- Trust boundaries, tool allowlists, audit trails
- NIST AI 600-1, EU AI Act implications
- Thesis experiment: Prompt injection audit -- can malicious briefs cause unintended agent outputs?

**L11: AgentOps -- Prototype to Production**
- Observability: traces, logs, metrics via OpenTelemetry
- Monitoring, alerting, rollback, lifecycle controls
- Thesis experiment: Add logging to each agent loop. Trace a full run end-to-end. Write deployment checklist for HILOS.

---

## Adapted Assignment: Competing Agent Configurations (from CO2 StockTrader)

The 94-815 CO2 assignment builds two competing LLM agents analyzing the same stock data with different behavioral philosophies. Adapted for thesis:

**Agent A: Conservative Designer**
- Sticks close to brief, incremental refinements, high fidelity
- System prompt emphasizes: brand consistency, brief adherence, minimal divergence

**Agent B: Experimental Designer**
- Pushes boundaries, unexpected combinations, high novelty
- System prompt emphasizes: creative surprise, material exploration, maximum divergence

**Evaluator**
- Compares outputs for same brief, identifies agreement vs disagreement, explains why
- Agreement = core design intent both agents captured
- Disagreement = where creative philosophy matters most

**Implementation steps:**
1. Create 2 different system prompts for Brief-Aware Agent
2. Feed same design brief + canvas state to both
3. Compare Loop 1 (Intent Interpretation) outputs -- do they interpret the brief differently?
4. Compare Loop 2 (Divergent Suggestion) outputs -- how different are the creative suggestions?
5. Build evaluator that scores agreement/disagreement
6. Save outputs as JSON for thesis analysis

**What this tests:**
- Agent behavior emerges from design choices (system prompt, not code changes)
- Same data + different philosophy = different outputs
- Architecture supports multiple creative strategies
- Great interview talking point

---

## Course Assignment Strategy

**Skipped entirely:**
- NC 1: AI Workforce Adaptation (policy essay)
- CO 1: AI Workforce Odyssey (NetLogo ABM simulation)
- NC 2: OpenConstruct Data Center (policy analysis, due Apr 12)
- Team Project Phases 1-3 (requires team, 45% of grade)
- Quizzes (closed-book, no AI allowed)

**Adapted for thesis:**
- CO 2: Building StockTrader (due Apr 12) -> Competing Agent Configurations experiment

---

## How Claude Code Should Help Me

### When I ask about agentic concepts:
1. **Always explain in context of MY thesis system** -- map concepts to Brief-Aware Agent, Semantic Canvas, CLIP embeddings
2. **Suggest concrete experiments** I can run in this codebase right now
3. **Use formal vocabulary** -- help me articulate findings for thesis chapter + interviews
4. **Point out relevant failure modes** from the MAST taxonomy (14 modes in 3 categories: system design, inter-agent misalignment, task verification)
5. **Connect to HILOS production** -- how does this concept apply when I go full-time?

### When I ask to implement something:
1. Look at the existing codebase first -- understand the current architecture before suggesting changes
2. Keep changes modular -- experiments shouldn't break the existing thesis system
3. Save experiment outputs as JSON for thesis analysis
4. Add comments explaining which agentic pattern/concept the code demonstrates

### When I want to reflect/write:
1. Help me write thesis-quality paragraphs connecting my implementation to formal agentic AI literature
2. Help me prepare interview answers: "Describe your agent architecture" -> formal pattern names + failure modes + design rationale
3. Help me articulate what I learned to Beichen for HILOS roadmap discussions

### Key vocabulary I'm building:
- ReAct, Plan-and-Execute, Reflection/Critic patterns
- Context engineering, memory scoping, staleness detection
- MCP (Model Context Protocol), tool schemas, least-privilege
- MAST failure taxonomy (step repetition, premature termination, inter-agent misalignment)
- Behavioral testing, invariance tests, evaluation harnesses
- Prompt injection, trust boundaries, policy gating
- AgentOps, observability, traces, monitoring

---

## Quick Reference: My Agent Loops -> Formal Patterns

| My Loop | Formal Pattern | What It Does | Potential Failure Modes |
|---------|---------------|-------------|----------------------|
| Loop 1: Intent Interpretation | Extraction/Synthesis | Parses brief into structured design intent | Misinterpretation cascades to all other loops |
| Loop 2: Divergent Suggestion | Creativity/Exploration | Generates alternative prompt beyond brief | May diverge too far from user intent |
| Loop 3: Prompt Refinement | Reflection/Critic | Rewrites and clarifies generation prompt | Could over-refine and lose creative edge |
| Loop 4: Axis Reframing | Creative Reframing | Suggests new semantic axis pairs | May suggest axes that don't separate well in CLIP space |
| Loop 5: Gap Detection | Plan-and-Execute | Identifies unexplored canvas regions | Ghost nodes may land in meaningless CLIP regions |
