"""patch17: Remove insights cards + visual consistency across tabs"""
PATH = r"w:/CMU_Academics/2025 Fall/Thesis Demo/Zappos50K_semantic_explorer/analysis/user_test_benson_s1.html"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

orig = src

# ─── P1: Remove insights CSS ──────────────────────────────────────────────────
OLD1 = """.insights-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
.insight-card { background: rgba(22,27,34,0.6); border: 1px solid rgba(48,54,61,0.45); border-radius: 9px; padding: 12px 14px; }
.insight-card-title { font-size: 12px; font-weight: 700; color: #c9d1d9; margin-bottom: 5px; }
.insight-card-body { font-size: 11px; color: #6e7681; line-height: 1.5; }
.insight-card-quote { margin-top: 6px; padding: 6px 9px; background: rgba(139,148,158,0.04); border-left: 2px solid rgba(139,148,158,0.3); border-radius: 0 4px 4px 0; font-style: italic; color: #8b949e; font-size: 10px; }"""
NEW1 = ""
assert OLD1 in src, "p17-1"
src = src.replace(OLD1, NEW1)

# ─── P2: Remove insights HTML block ──────────────────────────────────────────
OLD2 = """  <div class="insights-row">
    <div class="insight-card">
      <div class="insight-card-title">The Axis Blind Spot</div>
      <div class="insight-card-body">Axes changed only once (min 24: Retro/Futuristic), then untouched for 35 min. Agent was axis-driven, creating a disconnect.</div>
      <div class="insight-card-quote">"I'm approaching design based on visuals, but the agent is approaching design based on the axis."</div>
    </div>
    <div class="insight-card">
      <div class="insight-card-title">Branch &amp; Merge Pattern</div>
      <div class="insight-card-body">Generate broad &rarr; find one element &rarr; iterate &rarr; hit control ceiling &rarr; merge with another favorite. Three merge points visible in the tree.</div>
      <div class="insight-card-quote">"I like the upper silhouette of this one... wanted to apply B's form to A's details."</div>
    </div>
    <div class="insight-card">
      <div class="insight-card-title">The Refinement Gap</div>
      <div class="insight-card-body">After ~40 min, user wanted regional editing repeatedly. Late generations were fine-tuning attempts the tool couldn't support.</div>
      <div class="insight-card-quote">"I almost feel like I need masking, somewhere I can mark and allow AI to change."</div>
    </div>
  </div>"""
NEW2 = ""
assert OLD2 in src, "p17-2"
src = src.replace(OLD2, NEW2)

# ─── P3: Make quotes-view + survey-view match the panel container style ───────
# Give them same border/bg/radius/margin as .tracks-container
OLD3 = """/* ── Quotes / Transcript view ─────────────────────────────── */
#quotes-view { display:none; padding:0 0 0; }"""
NEW3 = """/* ── Quotes / Transcript view ─────────────────────────────── */
#quotes-view { display:none; padding:16px 20px 0;
  background:rgba(13,17,23,0.6); border:1px solid rgba(48,54,61,0.5);
  border-radius:10px; margin-top:0; }"""
assert OLD3 in src, "p17-3"
src = src.replace(OLD3, NEW3)

OLD4 = """/* ── Survey view ─────────────────────────────────────────── */
#survey-view { display:none; padding:0 0 24px; }"""
NEW4 = """/* ── Survey view ─────────────────────────────────────────── */
#survey-view { display:none; padding:16px 20px 24px;
  background:rgba(13,17,23,0.6); border:1px solid rgba(48,54,61,0.5);
  border-radius:10px; margin-top:0; }"""
assert OLD4 in src, "p17-4"
src = src.replace(OLD4, NEW4)

# ─── P4: survey-view grid — remove max-width/margin since panel already constrains ──
OLD5 = """.sv-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; max-width:1400px; margin:0 auto; }"""
NEW5 = """.sv-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }"""
assert OLD5 in src, "p17-5"
src = src.replace(OLD5, NEW5)

# ─── P5: Hide Curved/Straight edge toggle on Quotes + Survey tabs ────────────
OLD6 = r"""  const isQuotes = mode === "quotes";
  const isSurvey = mode === "survey";
  const isTrack  = !isQuotes && !isSurvey;
  d3.select("#tracks").style("display", isTrack ? null : "none");
  d3.select("#quotes-view").style("display", isQuotes ? "block" : "none");
  d3.select("#survey-view").style("display", isSurvey ? "block" : "none");
  d3.select("#legend").style("display", isTrack ? null : "none");"""
NEW6 = r"""  const isQuotes = mode === "quotes";
  const isSurvey = mode === "survey";
  const isTrack  = !isQuotes && !isSurvey;
  d3.select("#tracks").style("display", isTrack ? null : "none");
  d3.select("#quotes-view").style("display", isQuotes ? "block" : "none");
  d3.select("#survey-view").style("display", isSurvey ? "block" : "none");
  d3.select("#legend").style("display", isTrack ? null : "none");
  // Hide edge-style toggle on non-track views
  d3.selectAll(".view-toggle").filter((d, i) => i === 1)
    .style("display", isTrack ? null : "none");"""
assert OLD6 in src, "p17-6"
src = src.replace(OLD6, NEW6)

# ─── P6: Unify the dashboard container — use flex-column with consistent gap ─
OLD7 = """  <div class="tracks-container" id="tracks"></div>
  <div id="quotes-view"></div>
  <div id="survey-view"></div>"""
NEW7 = """  <div style="margin-top:0">
    <div class="tracks-container" id="tracks"></div>
    <div id="quotes-view"></div>
    <div id="survey-view"></div>
  </div>"""
assert OLD7 in src, "p17-7"
src = src.replace(OLD7, NEW7)

assert src != orig, "No changes made!"
with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print("patch17 OK — removed insights cards, unified panel style across all tabs, hid edge toggle on non-track views")
