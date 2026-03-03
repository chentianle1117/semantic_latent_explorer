"""patch15: 6 distinct but desaturated factor colors — no duplicates"""
PATH = r"w:/CMU_Academics/2025 Fall/Thesis Demo/Zappos50K_semantic_explorer/analysis/user_test_benson_s1.html"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

orig = src

# ─── P1: CSI factor colors — 6 distinct muted hues ──────────────────────────
# Gray     #6e7681 — Collaboration (N/A, keep)
# Mint     #7dcea0 — Enjoyment
# Sky      #7eb8da — Exploration
# Gold     #d4a054 — Expressiveness
# Lavender #a78bca — Immersion
# Teal     #5ec4b6 — Results Worth Effort
OLD1 = r"""const CSI_FACTORS = [
  { name: "Collaboration",      items: [8, null], score: 8,  count: 0, color: "#6e7681", note: "N/A (solo session)" },
  { name: "Enjoyment",          items: [10, 10],  score: 20, count: 1, color: "#3fb950" },
  { name: "Exploration",        items: [7, 10],   score: 17, count: 3, color: "#58a6ff" },
  { name: "Expressiveness",     items: [6, 7],    score: 13, count: 4, color: "#d29922" },
  { name: "Immersion",          items: [7, 7],    score: 14, count: 2, color: "#58a6ff" },
  { name: "Results Worth Effort",items:[8, 10],   score: 18, count: 5, color: "#3fb950" },
];"""
NEW1 = r"""const CSI_FACTORS = [
  { name: "Collaboration",      items: [8, null], score: 8,  count: 0, color: "#6e7681", note: "N/A (solo session)" },
  { name: "Enjoyment",          items: [10, 10],  score: 20, count: 1, color: "#7dcea0" },
  { name: "Exploration",        items: [7, 10],   score: 17, count: 3, color: "#7eb8da" },
  { name: "Expressiveness",     items: [6, 7],    score: 13, count: 4, color: "#d4a054" },
  { name: "Immersion",          items: [7, 7],    score: 14, count: 2, color: "#a78bca" },
  { name: "Results Worth Effort",items:[8, 10],   score: 18, count: 5, color: "#5ec4b6" },
];"""
assert OLD1 in src, "p15-1"
src = src.replace(OLD1, NEW1)

# ─── P2: Pre-study attitude tones — muted green/amber (softer) ──────────────
OLD2 = r"""    { label: "AI can help discover solutions I wouldn\u2019t think of", val: 10, tone: "#3fb950" },
    { label: "Worry AI might reduce creative agency", val: 8, tone: "#d29922" },
    { label: "Struggle translating intent into prompts", val: 7, tone: "#d29922" },
    { label: "View AI as collaborator (not just tool)", val: 10, tone: "#3fb950" },"""
NEW2 = r"""    { label: "AI can help discover solutions I wouldn\u2019t think of", val: 10, tone: "#7dcea0" },
    { label: "Worry AI might reduce creative agency", val: 8, tone: "#d4a054" },
    { label: "Struggle translating intent into prompts", val: 7, tone: "#d4a054" },
    { label: "View AI as collaborator (not just tool)", val: 10, tone: "#7dcea0" },"""
assert OLD2 in src, "p15-2"
src = src.replace(OLD2, NEW2)

# ─── P3: Challenge chips — muted warm amber to match attitude concerns ───────
OLD3 = ".sv-chip.warn { background:rgba(210,153,34,0.08); color:#d29922; border-color:rgba(210,153,34,0.25); }"
NEW3 = ".sv-chip.warn { background:rgba(212,160,84,0.1); color:#d4a054; border-color:rgba(212,160,84,0.25); }"
assert OLD3 in src, "p15-3"
src = src.replace(OLD3, NEW3)

assert src != orig, "No changes made!"
with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print("patch15 OK — 6 distinct desaturated factor colors: gray/mint/sky/gold/lavender/teal")
