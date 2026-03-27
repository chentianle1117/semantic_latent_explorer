# Self-Study: Agentic AI & Production ML

Self-study workspace using the Semantic Latent Explorer thesis system as a testbed for CMU 94-815 (Agentic Technologies) and MLiP concepts.

## Folder Structure

```
study/
├── context/              # Background docs, course context, learning goals
│   └── self-study-context.md   # Master context doc (read this first)
├── experiments/          # Code experiments, JSON outputs, analysis
│   └── (e.g., competing-agents/, mcp-server/, eval-harness/)
└── notes/                # Reflections, thesis paragraphs, concept maps
    └── (e.g., L4-tool-use.md, L5-memory-rag.md)
```

## Branch Info

- **Branch**: `self-study` (forked from `deploy`)
- Changes here don't affect the production study deployment
- Experiments can import from the main codebase (`backend/`, `frontend/`)
- If an experiment is valuable, cherry-pick it back to `deploy`

## How to Use

1. Start a Claude Code session in this repo on the `self-study` branch
2. It reads `study/context/self-study-context.md` for full learning context
3. Ask about concepts, implement experiments, write reflections
4. Experiment outputs go in `study/experiments/` as JSON for thesis analysis
