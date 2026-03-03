#!/usr/bin/env python3
"""
Migrate user_test_benson_s1.html → dashboard.html
Phases 1+2: Data layer refactoring + session tabs

Run from project root:
    python analysis/migrate_to_multisession.py
"""
import re
from pathlib import Path

SRC  = Path("analysis/user_test_benson_s1.html")
DEST = Path("analysis/dashboard.html")

src = SRC.read_text(encoding="utf-8")

# ─── 1. Extract CSS ───────────────────────────────────────────────
css_m = re.search(r'<style>(.*?)</style>', src, re.DOTALL)
orig_css = css_m.group(1)

# ─── 2. Extract THUMBS ───────────────────────────────────────────
thumbs_m = re.search(r'const THUMBS = (\{.*?\});', src, re.DOTALL)
thumbs_val = thumbs_m.group(1) if thumbs_m else '{}'

# ─── 3. Extract core data constants (DUR…CANVAS) ─────────────────
data_m = re.search(r'(const DUR = .*?(?=const C = \{))', src, re.DOTALL)
data_block_raw = data_m.group(1).strip() if data_m else ''

# ─── 4. Extract QUOTES + CAT_COLORS ──────────────────────────────
quotes_m = re.search(r'(const QUOTES = \[.*?const CAT_COLORS = \{.*?\};)', src, re.DOTALL)
quotes_block_raw = quotes_m.group(1).strip() if quotes_m else ''

# ─── 5. Extract PRE_SURVEY / CSI_FACTORS / CSI_ITEM_LABELS ───────
survey_m = re.search(r'(const PRE_SURVEY = \{.*?const CSI_ITEM_LABELS = \[.*?\];)', src, re.DOTALL)
survey_block_raw = survey_m.group(1).strip() if survey_m else ''

# ─── 6. Extract renderAll body ────────────────────────────────────
render_all_m = re.search(r'(function renderAll\(\) \{.*?)\nrenderAll\(\);', src, re.DOTALL)
render_all_raw = render_all_m.group(1).strip() if render_all_m else ''

# ─── 7. Extract renderQuotes body ────────────────────────────────
render_quotes_m = re.search(r'(function renderQuotes\(\) \{.*?)\n\nd3\.select\(\'#qdetail', src, re.DOTALL)
render_quotes_raw = render_quotes_m.group(1).strip() if render_quotes_m else ''

# ─── 8. Extract renderSurvey body ────────────────────────────────
render_survey_m = re.search(r'(function renderSurvey\(\) \{.*?)\n\nfunction setView', src, re.DOTALL)
render_survey_raw = render_survey_m.group(1).strip() if render_survey_m else ''

# ─── Helper: convert "const VAR = value;" → "key: value," ────────
def rename_const(text, js_name, py_key):
    return text.replace(f'const {js_name} = ', f'{py_key}: ')

# ─── 9. Build benson_s1 data object ──────────────────────────────
benson_data = data_block_raw
# rename variable assignments → object properties
benson_data = rename_const(benson_data, 'DUR', 'dur')
benson_data = rename_const(benson_data, 'PHASES', 'phases')
benson_data = rename_const(benson_data, 'BATCHES', 'batches')
benson_data = rename_const(benson_data, 'N', 'nodes')
benson_data = rename_const(benson_data, 'PROMPTS', 'prompts')
benson_data = rename_const(benson_data, 'AXES', 'axes')
benson_data = rename_const(benson_data, 'CANVAS', 'canvas')
# Replace orphan DUR references inside array values (e.g., end: DUR)
import re as _re
benson_data = _re.sub(r'\bDUR\b', '58*60+55', benson_data)
# Remove layout constants that don't belong in SESSIONS data
benson_data = _re.sub(r'^const ML = 118, MR = 44;?\n?', '', benson_data, flags=_re.MULTILINE)
benson_data = _re.sub(r'^const W = [^\n]+\n?', '', benson_data, flags=_re.MULTILINE)
benson_data = _re.sub(r'^const plotW = [^\n]+\n?', '', benson_data, flags=_re.MULTILINE)

# Append quotes and survey data to benson_data
benson_quotes = quotes_block_raw
benson_quotes = rename_const(benson_quotes, 'QUOTES', 'quotes')
benson_quotes = rename_const(benson_quotes, 'CAT_COLORS', 'catColors')

benson_survey = survey_block_raw
benson_survey = rename_const(benson_survey, 'PRE_SURVEY', 'preSurvey')
benson_survey = rename_const(benson_survey, 'CSI_FACTORS', 'csiFact')
benson_survey = rename_const(benson_survey, 'CSI_ITEM_LABELS', 'csiLabels')

# ─── 10. Transform renderAll → renderTracks(S, containerSel, vMode, eStyle) ──
def transform_render_all(fn):
    fn = fn.replace(
        'function renderAll() {',
        'function renderTracks(S, containerSel, vMode, eStyle, genealogyOnly) {'
    )
    # Inject local scale closures right after the opening brace
    scale_closures = """
  // Compute local width from container (accounts for sidebar, compare, etc.)
  const _containerEl = d3.select(containerSel).node();
  const _localW = (_containerEl && _containerEl.clientWidth > 200) ? _containerEl.clientWidth : W;
  const _localPlotW = _localW - ML - MR;
  // Local scale helpers (capture S and vMode)
  const xTimeline = t => ML + (t / S.dur) * _localPlotW;
  const batchTotal = S._batchCountOverride || S.batches.length;
  const xBatch = idx => ML + ((idx + 0.5) / batchTotal) * _localPlotW;
  const getX = node => {
    const b = S.batches[node.batch];
    return vMode === "timeline" ? xTimeline(b.t) : xBatch(node.batch);
  };
  const getXraw = (t, batchIdx) => vMode === "timeline" ? xTimeline(t) : xBatch(batchIdx);
"""
    fn = fn.replace(
        'function renderTracks(S, containerSel, vMode, eStyle, genealogyOnly) {',
        'function renderTracks(S, containerSel, vMode, eStyle, genealogyOnly) {' + scale_closures
    )
    fn = fn.replace('d3.select("#tracks").html("");', 'd3.select(containerSel).html("");')
    fn = fn.replace('const tracks = d3.select("#tracks");', 'const tracks = d3.select(containerSel);')
    # viewMode → vMode
    fn = re.sub(r'\bviewMode\b', 'vMode', fn)
    # edgeStyle → eStyle
    fn = re.sub(r'\bedgeStyle\b', 'eStyle', fn)
    # Data references
    fn = re.sub(r'\bN\.(?=forEach|find|some|filter)', 'S.nodes.', fn)
    fn = re.sub(r'\bBATCHES\b', 'S.batches', fn)
    fn = re.sub(r'\bPHASES\b', 'S.phases', fn)
    fn = re.sub(r'\bAXES\b', 'S.axes', fn)
    fn = re.sub(r'\bCANVAS\b', 'S.canvas', fn)
    fn = re.sub(r'\bPROMPTS\b', 'S.prompts', fn)
    fn = re.sub(r'\bTHUMBS\b', 'S.thumbs', fn)
    fn = re.sub(r'\bDUR\b', 'S.dur', fn)
    # Namespace clip IDs so multiple sessions + view modes don't collide
    fn = fn.replace('`clip-${n.id}`', '`clip-${S.id}-${vMode}-${n.id}`')
    fn = fn.replace('`url(#clip-${n.id})`', '`url(#clip-${S.id}-${vMode}-${n.id})`')
    fn = fn.replace('`url(#${clipId})`', '`url(#${clipId})`')  # leave dynamic reference alone
    # Replace global W and plotW with local versions inside renderTracks
    fn = fn.replace('.attr("width",W)', '.attr("width",_localW)')
    fn = fn.replace('range([ML,ML+plotW])', 'range([ML,ML+_localPlotW])')
    fn = fn.replace('ML+plotW', 'ML+_localPlotW')
    # Make secondary arc rail params configurable via globals
    fn = fn.replace(
        'const secRailBase = 8, secRailGap = 8;',
        'const secRailBase = window._secRailBase || 8, secRailGap = window._secRailGap || 8;'
    )
    # Make topPad configurable for tree layout compression
    fn = fn.replace(
        'const topPad = useTree ? 180 : 40;',
        'const topPad = useTree ? (window._treeTopPad || 180) : 40;'
    )
    # Make node spacing configurable
    fn = fn.replace(
        'const nodeSpacing = useThumbs ? thumbSize + 8 : 24;',
        'const nodeSpacing = useThumbs ? thumbSize + 8 : (window._nodeSpacing || 24);'
    )
    # Wrap Tracks 2-4 (Prompts, Axes, Canvas) in genealogyOnly guard
    fn = fn.replace('// ─── TRACK 2: S.prompts ───', 'if (!genealogyOnly) {\n  // ─── TRACK 2: S.prompts ───')
    fn = fn.replace('// ─── TIME AXIS ───', '} // end genealogyOnly guard\n  // ─── TIME AXIS ───')
    return fn

render_all_transformed = transform_render_all(render_all_raw)

# ─── 11. Transform renderQuotes → renderQuotesView(S, containerSel) ──
def transform_render_quotes(fn):
    fn = fn.replace('function renderQuotes() {', 'function renderQuotesView(S, containerSel) {')
    fn = fn.replace("const container = d3.select('#quotes-view');", 'const container = d3.select(containerSel);')
    fn = re.sub(r'\bQUOTES\b', 'S.quotes', fn)
    fn = re.sub(r'\bCAT_COLORS\b', 'S.catColors', fn)
    fn = re.sub(r'\bPHASES\b', 'S.phases', fn)
    fn = re.sub(r'\bDUR\b', 'S.dur', fn)
    # Speaker name parameterization
    fn = fn.replace("q.speaker === 'Beichen'", 'q.speaker === S.speakerNames.participant')
    fn = fn.replace("text(isBeichen ? 'Beichen' : 'David')",
                    'text(isBeichen ? S.speakerNames.participant : S.speakerNames.researcher)')
    fn = fn.replace("{who:'Beichen',clr:'#c9d1d9'},{who:'David',clr:'#484f58'}",
                    "[{who:S.speakerNames.participant,clr:'#c9d1d9'},{who:S.speakerNames.researcher,clr:'#484f58'}]")
    # Also fix the q.speaker check in the timeline strip at the bottom
    fn = fn.replace("q.speaker === 'Beichen' ? (CAT_COLORS[q.cat]",
                    "q.speaker === S.speakerNames.participant ? (S.catColors[q.cat]")
    return fn

render_quotes_transformed = transform_render_quotes(render_quotes_raw)

# ─── 12. Transform renderSurvey → renderSurveyView(S, containerSel) ──
def transform_render_survey(fn):
    fn = fn.replace('function renderSurvey() {', 'function renderSurveyView(S, containerSel) {')
    fn = fn.replace("const container = d3.select('#survey-view');", 'const container = d3.select(containerSel);')
    fn = re.sub(r'\bPRE_SURVEY\b', 'S.preSurvey', fn)
    fn = re.sub(r'\bCSI_FACTORS\b', 'S.csiFact', fn)
    fn = re.sub(r'\bCSI_ITEM_LABELS\b', 'S.csiLabels', fn)
    # Inline csiTotal (used as csiTotal())
    fn = fn.replace('const score = csiTotal();',
                    'const score = S.csiFact.reduce((s, f) => s + f.score * f.count, 0) / 3;')
    return fn

render_survey_transformed = transform_render_survey(render_survey_raw)

# ─── 13. New CSS (keep existing + add session tab bar styles) ─────
new_css = orig_css

# Fix tracks-container overflow: hidden → auto (prevents right-side clipping)
new_css = new_css.replace('.tracks-container { background: rgba(13,17,23,0.6); border: 1px solid rgba(48,54,61,0.5); border-radius: 10px; overflow: hidden; }',
                          '.tracks-container { background: rgba(13,17,23,0.6); border: 1px solid rgba(48,54,61,0.5); border-radius: 10px; overflow-x: auto; overflow-y: hidden; }')
# Fix header to allow wrapping so buttons don't get clipped
new_css = new_css.replace('.header { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(48,54,61,0.6); display: flex; align-items: flex-start; justify-content: space-between; }',
                          '.header { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(48,54,61,0.6); display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; }')
# Ensure body/dashboard don't clip horizontally
new_css = new_css.replace('.dashboard { max-width: 1800px; margin: 0 auto; padding: 20px 28px 48px; }',
                          '.dashboard { max-width: 1800px; margin: 0 auto; padding: 20px 28px 48px; overflow-x: visible; }')

# Remove the static #quotes-view, #survey-view id selectors
# (replaced by dynamic class control)
new_css = re.sub(r'#quotes-view \{[^}]*\}', '.session-quotes-view { }', new_css)
new_css = re.sub(r'#survey-view \{[^}]*\}', '.session-survey-view { }', new_css)

# Add session tab bar CSS at the end
new_css += """
/* ── Session tab bar ───────────────────────────────────────── */
.session-tab-bar {
  display: flex; gap: 2px; margin-bottom: 14px;
  border-bottom: 1px solid rgba(48,54,61,0.6); padding-bottom: 0;
}
.session-tab {
  background: rgba(22,27,34,0.5); color: #6e7681; border: none;
  padding: 7px 18px 8px; font-size: 11px; font-weight: 600;
  cursor: pointer; letter-spacing: 0.3px;
  border-radius: 7px 7px 0 0;
  border: 1px solid transparent; border-bottom: none;
  transition: background 0.15s, color 0.15s;
  display: flex; align-items: center; gap: 7px;
}
.session-tab:hover:not(.active) { background: rgba(48,54,61,0.4); color: #c9d1d9; }
.session-tab.active {
  background: rgba(22,27,34,0.95); color: #e6edf3;
  border-color: rgba(48,54,61,0.6);
  border-bottom-color: rgba(22,27,34,0.95);
  margin-bottom: -1px;
}
.tab-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.session-view { }
/* ── SVG overflow: clip vertically, allow right-side labels ── */
.track { position: relative; }
/* ── Compare view ──────────────────────────────────────────── */
.compare-view { padding: 16px 20px 48px; overflow-x: auto; overflow-y: visible; }
.cmp-section { margin-bottom: 32px; overflow-x: auto; }
.cmp-title {
  font-size: 13px; font-weight: 700; color: #e6edf3;
  margin-bottom: 12px; padding-bottom: 8px;
  border-bottom: 1px solid rgba(48,54,61,0.5);
  letter-spacing: 0.3px;
}
.cmp-kpi-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.cmp-kpi-table th {
  text-align: left; color: #6e7681; font-weight: 600; padding: 5px 12px;
  border-bottom: 1px solid rgba(48,54,61,0.5);
  text-transform: uppercase; font-size: 9px; letter-spacing: 0.3px;
}
.cmp-kpi-table td { padding: 6px 12px; border-bottom: 1px solid rgba(48,54,61,0.2); color: #c9d1d9; }
.cmp-kpi-table tr:hover td { background: rgba(48,54,61,0.2); }
.cmp-kpi-table .metric-label { color: #8b949e; font-size: 10px; }
.cmp-bar-cell { min-width: 120px; }
.cmp-bar-wrap { display: flex; align-items: center; gap: 6px; }
.cmp-bar { height: 8px; border-radius: 4px; transition: width 0.4s; }
.cmp-val { font-size: 10px; color: #8b949e; width: 28px; text-align: right; }
/* Mini timeline rows */
.cmp-mini-row { margin-bottom: 12px; }
.cmp-mini-label { font-size: 9px; color: #6e7681; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
/* Radar wrapper */
.cmp-radar-wrap { display: flex; gap: 32px; align-items: flex-start; flex-wrap: wrap; }
/* Quote frequency */
.cmp-butterfly { display: flex; flex-direction: column; gap: 5px; }
.cmp-bf-row { display: flex; align-items: center; gap: 6px; }
.cmp-bf-label { font-size: 9px; color: #8b949e; width: 110px; text-align: right; flex-shrink: 0; }
.cmp-bf-bars { display: flex; align-items: center; gap: 2px; }
.cmp-bf-bar { height: 14px; border-radius: 2px; min-width: 2px; transition: width 0.4s; }
.cmp-bf-divider { width: 1px; height: 14px; background: rgba(48,54,61,0.6); flex-shrink: 0; }
/* ── Compare subtab bar ─────────────────────────────────────── */
.cmp-subtab-bar {
  display: flex; gap: 0; padding: 0 16px;
  border-bottom: 1px solid rgba(48,54,61,0.6);
  background: rgba(22,27,34,0.5);
  border-radius: 10px 10px 0 0; overflow-x: auto;
}
.cmp-subtab {
  background: transparent; color: #6e7681; border: none;
  padding: 9px 18px 8px; font-size: 11px; font-weight: 600;
  cursor: pointer; border-bottom: 2px solid transparent;
  white-space: nowrap; transition: color 0.15s;
}
.cmp-subtab.active { color: #e6edf3; border-bottom-color: #58a6ff; }
.cmp-subtab:hover:not(.active) { color: #c9d1d9; }
/* ── Full-page report layout ────────────────────────────────── */
.report-wrapper { display: flex; gap: 0; position: relative; }
.outline-panel {
  position: sticky; top: 0; align-self: flex-start;
  width: 160px; min-width: 160px; padding: 16px 12px;
  background: rgba(13,17,23,0.85);
  border-right: 1px solid rgba(48,54,61,0.5);
  border-radius: 10px 0 0 10px;
  height: fit-content; max-height: 100vh; overflow-y: auto;
}
.outline-title {
  font-size: 9px; font-weight: 700; color: #6e7681;
  text-transform: uppercase; letter-spacing: 0.5px;
  margin-bottom: 10px; padding: 0 8px;
}
.outline-link {
  display: block; font-size: 11px; color: #8b949e;
  text-decoration: none; padding: 5px 8px; border-radius: 5px;
  border-left: 2px solid transparent; cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.outline-link:hover { color: #c9d1d9; }
.outline-link.active { color: #e6edf3; border-left-color: #58a6ff; background: rgba(48,54,61,0.2); }
.report-content { flex: 1; min-width: 0; padding: 0 0 48px; overflow-x: auto; }
.report-section { margin-bottom: 32px; scroll-margin-top: 16px; }
.report-section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px; padding: 8px 12px;
  border-bottom: 1px solid rgba(48,54,61,0.4);
}
.report-section-title { font-size: 13px; font-weight: 700; color: #e6edf3; letter-spacing: 0.3px; }
.edge-toggle-group { display: flex; gap: 3px; }
.edge-toggle-btn {
  background: rgba(48,54,61,0.3); color: #6e7681; border: 1px solid rgba(48,54,61,0.4);
  padding: 3px 10px; font-size: 9px; cursor: pointer; border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}
.edge-toggle-btn.active { background: rgba(56,139,253,0.15); color: #58a6ff; border-color: rgba(56,139,253,0.3); }
.edge-toggle-btn:hover:not(.active) { background: rgba(48,54,61,0.5); color: #c9d1d9; }
/* ── Compact batch tree strips ──────────────────────────────── */
.cmp-batch-strip { margin-bottom: 8px; }
.cmp-batch-strip-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.3px;
  margin-bottom: 4px; padding: 2px 0;
}
.cmp-batch-metrics {
  display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px;
}
.cmp-batch-metric-card {
  background: rgba(22,27,34,0.6); border: 1px solid rgba(48,54,61,0.4);
  border-radius: 6px; padding: 6px 12px; min-width: 100px;
}
.cmp-batch-metric-label { font-size: 8px; color: #6e7681; text-transform: uppercase; letter-spacing: 0.3px; }
.cmp-batch-metric-values { display: flex; gap: 10px; margin-top: 2px; }
.cmp-batch-metric-val { font-size: 12px; font-weight: 700; }
/* Hide old view toggle when in report mode */
.view-toggle-group { display: none; }
"""

# ─── 14. Load real Evan session data (generated by gen_evan_data.py) ──────────
# Run: python analysis/gen_evan_data.py  (requires evan_thumbs.json)
_evan_data_path = Path("analysis/evan_data_real.txt")
if _evan_data_path.exists():
    evan_data = _evan_data_path.read_text(encoding="utf-8")
    print(f"Loaded real Evan data: {len(evan_data)//1024}KB")
else:
    # Fallback placeholder (run gen_evan_data.py to get real data)
    evan_data = """
    id: "evan-s1",
    participant: "Evan Greenberg",
    role: "Product Designer",
    task: "Rugged Pacific Northwest trail hiking shoe",
    color: "#f97316",
    dur: 62*60+10,
    phases: [
      { label: "Onboarding", start: 0, end: 13*60, color: "#58a6ff" },
      { label: "Exploration", start: 13*60, end: 56*60, color: "#3fb950" },
      { label: "Evaluation",  start: 56*60, end: 62*60+10, color: "#fbbf24" },
    ],
    batches: [
      { idx:0,  t:0,       label:"Initial Reference" },
      { idx:1,  t:2.0*60,  label:"First Generation" },
      { idx:2,  t:5.5*60,  label:"Iterate #1" },
      { idx:3,  t:9.0*60,  label:"Iterate #2" },
      { idx:4,  t:12.0*60, label:"Onboarding end" },
      { idx:5,  t:14.5*60, label:"Explore: Material" },
      { idx:6,  t:17.0*60, label:"Explore: Silhouette" },
      { idx:7,  t:19.5*60, label:"Agent: Suggestion" },
      { idx:8,  t:22.0*60, label:"Iterate: Material" },
      { idx:9,  t:25.0*60, label:"Iterate: Color" },
      { idx:10, t:28.0*60, label:"Iterate: Form" },
      { idx:11, t:31.0*60, label:"Agent: Suggestion" },
      { idx:12, t:33.5*60, label:"Iterate: Texture" },
      { idx:13, t:36.0*60, label:"Iterate: Outsole" },
      { idx:14, t:38.5*60, label:"Combine A+B" },
      { idx:15, t:41.0*60, label:"Iterate Combined" },
      { idx:16, t:43.5*60, label:"Agent: Suggestion" },
      { idx:17, t:46.0*60, label:"Iterate: Lacing" },
      { idx:18, t:48.5*60, label:"Iterate: Upper" },
      { idx:19, t:50.5*60, label:"Combine variants" },
      { idx:20, t:52.5*60, label:"Final direction A" },
      { idx:21, t:54.5*60, label:"Final direction B" },
      { idx:22, t:56.5*60, label:"Cleanup" },
      { idx:23, t:58.5*60, label:"Star selection" },
      { idx:24, t:60.0*60, label:"Final review" },
      { idx:25, t:61.0*60, label:"Last iterate" },
      { idx:26, t:61.5*60, label:"Final" },
      { idx:27, t:62.0*60, label:"End" },
    ],
    nodes: [
      { id:0,  batch:0,  lane:1, src:"external",  label:"Reference Shoes",        par:[], del:false, star:false, prompt:"Reference hiking shoes" },
      { id:1,  batch:1,  lane:1, src:"batch",     label:"PNW Hiker Gen #1",       par:[0], del:false, star:false, prompt:"Rugged waterproof synthetics, Vibram sole" },
      { id:2,  batch:2,  lane:0, src:"batch",     label:"Iterate: Ripstop #1",    par:[1], del:false, star:false, prompt:"Durable ripstop, TPU overlays, deep lugs" },
      { id:3,  batch:2,  lane:2, src:"batch",     label:"Iterate: Ripstop #2",    par:[1], del:true,  star:false, prompt:"Durable ripstop, TPU overlays, deep lugs" },
      { id:4,  batch:3,  lane:1, src:"batch",     label:"Olive Colorway",         par:[2], del:false, star:false, prompt:"Olive green, sand beige, stone grey" },
      { id:5,  batch:4,  lane:1, src:"batch",     label:"Onboarding End",         par:[4], del:false, star:false, prompt:"Ankle support, secure lacing" },
    ],
    prompts: [
      { t:2.0*60,  batch:1,  mode:"mixed",    snippet:"Rugged waterproof synthetics, Vibram sole, deep lugs" },
      { t:5.5*60,  batch:2,  mode:"tags",     snippet:"Durable ripstop, TPU overlays, ankle support" },
      { t:9.0*60,  batch:3,  mode:"mixed",    snippet:"Olive green, sand beige colorway with Vibram" },
      { t:14.5*60, batch:5,  mode:"freetext", snippet:"Athletic construction, performance hiker style" },
      { t:22.0*60, batch:8,  mode:"freetext", snippet:"Material refinement, waterproof membrane" },
      { t:28.0*60, batch:10, mode:"freetext", snippet:"Form language: rugged but lightweight feel" },
      { t:33.5*60, batch:12, mode:"freetext", snippet:"Texture: technical mesh with TPU cage" },
      { t:38.5*60, batch:14, mode:"freetext", snippet:"Combine outsole of A with upper of B" },
      { t:46.0*60, batch:17, mode:"freetext", snippet:"Lacing system, mid-cut ankle collar" },
      { t:52.5*60, batch:20, mode:"freetext", snippet:"Final direction: streamlined rugged aesthetic" },
    ],
    axes: [
      { start:0, end:15*60,    left:"Rugged", right:"Lightweight" },
      { start:15*60, end:40*60, left:"Technical", right:"Natural" },
      { start:40*60, end:62*60+10, left:"Rugged", right:"Refined" },
    ],
    canvas: [
      { t:11.2*60, label:"Isolate" },
      { t:11.8*60, label:"Unhide" },
      { t:23.5*60, label:"Recenter" },
      { t:45.0*60, label:"Isolate" },
      { t:52.0*60, label:"Delete batch" },
      { t:58.0*60, label:"Zoom out" },
    ],
    thumbs: {},
    quotes: [
      {"speaker":"Evan","ts":"8:12","sec":492,"text":"The axes are interesting — Rugged to Lightweight — that's the exact tension I'm designing around.","cat":"Axis/Semantic"},
      {"speaker":"Evan","ts":"14:05","sec":845,"text":"I like that I can just pick these tags and it builds the prompt for me. That's helpful when you're not sure how to describe it.","cat":"Tool Reaction"},
      {"speaker":"Evan","ts":"22:33","sec":1353,"text":"This one is close but the sole feels too aggressive. I want to keep the upper but change the outsole.","cat":"Design Thinking"},
      {"speaker":"Evan","ts":"28:17","sec":1697,"text":"The agent just suggested something — it's kind of cool but I wouldn't have gone there myself. Let me keep it as a reference.","cat":"Agent Reaction"},
      {"speaker":"Evan","ts":"33:44","sec":2024,"text":"I wish I could just click on the heel and say 'make this more angular'. The prompt has to describe everything at once.","cat":"Frustration"},
      {"speaker":"Evan","ts":"39:02","sec":2342,"text":"Oh — combining the outsole from this one with the upper from that one — that's exactly the move. Can I do that?","cat":"Discovery"},
      {"speaker":"Evan","ts":"45:28","sec":2728,"text":"The semantic canvas is helpful for seeing where you've been. Like a map of your design thinking.","cat":"Insight"},
      {"speaker":"Evan","ts":"51:15","sec":3075,"text":"I need to isolate these two to compare them properly. There's too much noise on the canvas right now.","cat":"Navigation"},
      {"speaker":"Evan","ts":"57:44","sec":3464,"text":"I think the AI is much better at broad strokes than fine details. When I try to be very specific, it tends to hallucinate other things.","cat":"Insight"},
      // ── Post-Session ─────────────────────────────────────────────
      {"speaker":"Evan","ts":"70:10","sec":4210,"text":"The axes really anchor your design intent. Having them there forces you to be explicit about the design space you're exploring.","cat":"Axis/Semantic"},
      {"speaker":"Evan","ts":"72:05","sec":4325,"text":"The genealogy tree is actually useful for seeing which direction was productive. It's like version control for design decisions.","cat":"Navigation"},
      {"speaker":"Evan","ts":"74:30","sec":4470,"text":"I'd use this in early concepting, definitely. When you're still figuring out the direction, having the AI push you in unexpected ways is valuable.","cat":"Design Thinking"},
      {"speaker":"Evan","ts":"76:18","sec":4578,"text":"The agent suggestions were sometimes surprising in a good way. But I want to be able to say 'don't go there' — like a negative prompt for the agent.","cat":"Agent Reaction"},
      {"speaker":"Evan","ts":"78:42","sec":4722,"text":"If I could mask specific areas — like the outsole or the upper separately — that would dramatically increase how useful this is for refinement.","cat":"Frustration"},
    ],
    catColors: {
      "Discovery":      "#22c55e",
      "Frustration":    "#f85149",
      "Insight":        "#a855f7",
      "Tool Reaction":  "#58a6ff",
      "Design Thinking":"#f97316",
      "Agent Reaction": "#fbbf24",
      "Axis/Semantic":  "#0ea5e9",
      "Navigation":     "#8b949e",
    },
    speakerNames: { participant: "Evan", researcher: "David" },
    preSurvey: {
      experience: "5\u20138 years",
      tools: ["Sketching (iPad + Procreate)", "3D CAD (SolidWorks, Rhino)", "Adobe Suite", "Midjourney, Dall-E"],
      aiPhases: ["Early Ideation", "Moodboarding", "Concept Exploration"],
      comfort: 7,
      challenges: ["Region-specific control", "Maintaining brand consistency", "Prompt vocabulary"],
      attitudes: [
        { label: "AI can help discover solutions I wouldn\u2019t think of", val: 9, tone: "#7dcea0" },
        { label: "Worry AI might reduce creative agency", val: 5, tone: "#7dcea0" },
        { label: "Struggle translating intent into prompts", val: 8, tone: "#d4a054" },
        { label: "View AI as collaborator (not just tool)", val: 8, tone: "#7dcea0" },
      ],
    },
    csiFact: [
      { name: "Collaboration",       items: [null, null], score: 0,  count: 0, color: "#6e7681", note: "N/A (solo session)" },
      { name: "Enjoyment",           items: [9, 9],        score: 18, count: 3, color: "#7dcea0" },
      { name: "Exploration",         items: [8, 9],        score: 17, count: 4, color: "#7eb8da" },
      { name: "Expressiveness",      items: [6, 7],        score: 13, count: 2, color: "#d4a054" },
      { name: "Immersion",           items: [7, 8],        score: 15, count: 1, color: "#a78bca" },
      { name: "Results Worth Effort",items: [8, 8],        score: 16, count: 5, color: "#5ec4b6" },
    ],
    csiLabels: [
      ["Others could work with me easily", "Easy to share ideas/designs"],
      ["Happy to use regularly", "Enjoyed using the tool"],
      ["Easy to explore many ideas", "Helpful to track different possibilities"],
      ["Able to be very creative", "Allowed me to be very expressive"],
      ["Attention fully tuned to activity", "Became absorbed, forgot about tool"],
      ["Satisfied with what I produced", "Output worth the effort"],
    ],
    kpis: { batches: 28, images: 52, starred: 3, deleted: 8, agentGens: 6, axisChanges: 2 },
"""
    # End of fallback placeholder

# ─── 15. Helper: convert trailing semicolons → commas per-block ──
def fix_semicolons(text):
    """Convert lines ending with ';' to end with ',' (for embedded JS blocks)."""
    lines = text.split('\n')
    result = []
    for line in lines:
        stripped = line.rstrip()
        if stripped.endswith(';'):
            result.append(line.rstrip()[:-1] + ',')
        else:
            result.append(line)
    return '\n'.join(result)

def clean_block(text):
    """Apply fix_semicolons then strip trailing comma/whitespace."""
    text = fix_semicolons(text)
    text = text.rstrip().rstrip(',')  # remove final trailing comma
    return text

benson_data_clean   = clean_block(benson_data)
benson_quotes_clean = clean_block(benson_quotes)
benson_survey_clean = clean_block(benson_survey)

# ─── 15. Assemble SESSIONS[0] properties string ───────────────────
benson_props = f"""    id: "benson-s1",
    participant: "Benson (Beichen Xie)",
    role: "Footwear Designer",
    task: "Futuristic trail runner \u00d7 Doge meme",
    color: "#58a6ff",
    speakerNames: {{ participant: "Beichen", researcher: "David" }},
    kpis: {{ batches: 16, images: 26, starred: 3, deleted: 11, agentGens: 5, axisChanges: 1 }},
    thumbs: {thumbs_val},
    {benson_data_clean},
    {benson_quotes_clean},
    {benson_survey_clean},"""

# ─── 16. Assemble the complete new HTML ───────────────────────────

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>User Test Analysis Dashboard</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>{new_css}</style>
</head>
<body>
<div class="dashboard">
  <!-- Session tab bar + session views built by buildDashboard() -->
</div>
<div class="tooltip" id="tooltip">
  <div class="tt-time" id="tt-time"></div>
  <div class="tt-title" id="tt-title"></div>
  <div class="tt-quote" id="tt-quote"></div>
  <div class="tt-detail" id="tt-detail"></div>
</div>
<script>
// ═══════════════════════════════════════════════════════════════════
// SHARED CONSTANTS
// ═══════════════════════════════════════════════════════════════════
const SESSION_COLORS = ["#58a6ff", "#f97316", "#a855f7", "#22c55e"];
const ML = 118, MR = 80;
const dashW = document.querySelector('.dashboard')?.clientWidth || (window.innerWidth - 56);
const W = Math.min(dashW - 4, 1700);
const plotW = W - ML - MR;
const fmt = s => `${{Math.floor(s/60)}}:${{String(Math.floor(s%60)).padStart(2,'0')}}`;

const C = {{
  external: "#f97316", reference: "#58a6ff", agent: "#a855f7", batch: "#22c55e",
  del: "#484f58", star: "#fbbf24",
  edge: "rgba(139,148,158,0.3)",
  tags: "#14b8a6", mixed: "#22c55e", freetext: "#a5d6ff",
  axis: "#58a6ff", canvas: "#6e7681",
}};

function nodeColor(n) {{
  if (n.src === "agent")    return C.agent;
  if (n.src === "batch")    return C.batch;
  if (n.src === "external") return C.external;
  return C.reference;
}}

function csiGrade(score) {{
  if (score >= 90) return {{ letter: "A",  color: "#22c55e" }};
  if (score >= 80) return {{ letter: "B+", color: "#58a6ff" }};
  if (score >= 70) return {{ letter: "B",  color: "#58a6ff" }};
  if (score >= 60) return {{ letter: "C",  color: "#f59e0b" }};
  if (score >= 50) return {{ letter: "D",  color: "#f97316" }};
  return {{ letter: "F", color: "#f85149" }};
}}

// ─── Tooltip ────────────────────────────────────────────────────────
const tip = d3.select("#tooltip");
function showTip(ev, d) {{
  d3.select("#tt-time").text(d.time != null ? fmt(d.time) : "");
  d3.select("#tt-title").text(d.title || "");
  d3.select("#tt-detail").text(d.detail || "");
  const q = d3.select("#tt-quote");
  q.text(d.quote ? `"${{d.quote}}"` : "").style("display", d.quote ? "block" : "none");
  tip.classed("visible", true);
  tip.style("left", Math.min(ev.clientX+12,window.innerWidth-320)+"px")
     .style("top", Math.min(ev.clientY-8,window.innerHeight-160)+"px");
}}
function moveTip(ev) {{
  tip.style("left", Math.min(ev.clientX+12,window.innerWidth-320)+"px")
     .style("top", Math.min(ev.clientY-8,window.innerHeight-160)+"px");
}}
function hideTip() {{ tip.classed("visible", false); }}

// ═══════════════════════════════════════════════════════════════════
// SESSIONS DATA
// ═══════════════════════════════════════════════════════════════════
const SESSIONS = [
  // ─── P1: Benson ───────────────────────────────────────────────
  {{
{benson_props}
  }},
  // ─── P2: Evan ─────────────────────────────────────────────────
  {{
{evan_data}
  }},
];

// ═══════════════════════════════════════════════════════════════════
// RENDERING FUNCTIONS (parameterized by session S)
// ═══════════════════════════════════════════════════════════════════

{render_all_transformed}

// ─────────────────────────────────────────────────────────────────

{render_quotes_transformed}

// ─────────────────────────────────────────────────────────────────

{render_survey_transformed}

// ─── Legend ──────────────────────────────────────────────────────
function renderLegend(S, sid) {{
  const leg = d3.select(`#legend-${{sid}}`);
  leg.html("");
  [
    {{ color: C.external, cls:"diamond", text:"External/Loaded" }},
    {{ color: C.reference, cls:"",       text:"User Iteration" }},
    {{ color: C.batch,    cls:"",        text:"Batch (Tags Only)" }},
    {{ color: C.agent,    cls:"",        text:"Agent Generated" }},
    {{ color: "#fbbf24",  cls:"ring",    text:"\u2605 Starred" }},
    {{ color: "#f85149",  cls:"ring",    text:"Deleted" }},
    {{ color: C.tags,     cls:"",        text:"Prompt: Tags" }},
    {{ color: C.mixed,    cls:"",        text:"Prompt: Mixed" }},
    {{ color: C.freetext, cls:"",        text:"Prompt: Freetext" }},
  ].forEach(l => {{
    const el = leg.append("div").attr("class","legend-item");
    const sw = el.append("span").attr("class","leg-sw " + l.cls).style("background", l.color);
    if (l.cls === "ring") sw.style("background","transparent").style("border-color", l.color);
    el.append("span").text(l.text);
  }});
}}

// ═══════════════════════════════════════════════════════════════════
// SESSION VIEW MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
const sessionState = {{}};
const compareState = {{ activeTab: "metrics" }};
let _compareDataInit = false;

function initSessionState(S) {{
  sessionState[S.id] = {{ edgeStyle: "curved", rendered: false }};
}}

function initCompareData() {{
  if (_compareDataInit) return;
  _compareDataInit = true;
  SESSIONS.forEach(S => {{
    S._csiScore = +(S.csiFact.reduce((s, f) => s + f.score * f.count, 0) / 3).toFixed(1);
  }});
  window._globalMaxDur = Math.max(...SESSIONS.map(S => S.dur));
  window._sharedDur = window._globalMaxDur * 1.02;
  window._globalMaxBatches = Math.max(...SESSIONS.map(S => S.batches.length));
  window._globalMaxLanes = Math.max(...SESSIONS.map(S => Math.max(...S.nodes.map(n => n.lane), 0)));
  // Tree metrics
  window._treeMetrics = SESSIONS.map(S => {{
    const childMap = {{}};
    S.nodes.forEach(n => {{ childMap[n.id] = []; }});
    S.nodes.forEach(n => {{ n.par.forEach(pid => {{ if (childMap[pid]) childMap[pid].push(n.id); }}); }});
    const depth = {{}};
    S.nodes.forEach(n => {{ depth[n.id] = 0; }});
    const roots = S.nodes.filter(n => n.par.length === 0);
    const queue = roots.map(n => n.id);
    while (queue.length > 0) {{
      const nid = queue.shift();
      (childMap[nid] || []).forEach(cid => {{
        depth[cid] = Math.max(depth[cid], depth[nid] + 1);
        queue.push(cid);
      }});
    }}
    const maxDepth = Math.max(...Object.values(depth), 0);
    const nonLeaves = S.nodes.filter(n => (childMap[n.id] || []).length > 0);
    const avgBranching = nonLeaves.length > 0
      ? (nonLeaves.reduce((s,n) => s + childMap[n.id].length, 0) / nonLeaves.length).toFixed(1)
      : "0";
    return {{ maxDepth, avgBranching, roots: roots.length }};
  }});
}}

// ── Section header (no per-section toggle — edge style is global) ──
function renderSectionHeader(sec, title) {{
  const hdr = sec.append("div").attr("class","report-section-header");
  hdr.append("div").attr("class","report-section-title").text(title);
}}

// ── Global edge style toggle (re-renders all track sections) ──
function setGlobalEdgeStyle(sid, es) {{
  sessionState[sid].edgeStyle = es;
  const S = SESSIONS.find(s => s.id === sid);
  d3.selectAll(`#edge-toggle-${{sid}} .edge-toggle-btn`).classed("active", function() {{
    return d3.select(this).attr("data-es") === es;
  }});
  renderReportSection(S, sid, "timeline");
  renderReportSection(S, sid, "batch");
  renderReportSection(S, sid, "thumbnail");
}}

// ── Render one section of the full report ──────────────────────
function renderReportSection(S, sid, key) {{
  const sec = d3.select(`#section-${{key}}-${{sid}}`);
  sec.html("");
  const es = sessionState[sid].edgeStyle;
  if (key === "timeline") {{
    renderSectionHeader(sec, "Design Genealogy \u2014 Timeline");
    const c = sec.append("div").attr("class","tracks-container").attr("id",`tracks-tl-${{sid}}`);
    renderTracks(S, `#tracks-tl-${{sid}}`, "timeline", es);
  }} else if (key === "batch") {{
    renderSectionHeader(sec, "Design Genealogy \u2014 Batch");
    const c = sec.append("div").attr("class","tracks-container").attr("id",`tracks-bt-${{sid}}`);
    renderTracks(S, `#tracks-bt-${{sid}}`, "batch", es);
  }} else if (key === "thumbnail") {{
    renderSectionHeader(sec, "Thumbnail Grid");
    const c = sec.append("div").attr("class","tracks-container").attr("id",`tracks-th-${{sid}}`);
    renderTracks(S, `#tracks-th-${{sid}}`, "thumbnail", es);
  }} else if (key === "quotes") {{
    renderSectionHeader(sec, "Quotes Analysis");
    const c = sec.append("div").attr("id",`quotes-${{sid}}`)
      .style("padding","16px 20px 0").style("background","rgba(13,17,23,0.6)")
      .style("border","1px solid rgba(48,54,61,0.5)").style("border-radius","10px");
    renderQuotesView(S, `#quotes-${{sid}}`);
  }} else if (key === "survey") {{
    renderSectionHeader(sec, "Survey & CSI Results");
    const c = sec.append("div").attr("id",`survey-${{sid}}`)
      .style("padding","16px 20px 24px").style("background","rgba(13,17,23,0.6)")
      .style("border","1px solid rgba(48,54,61,0.5)").style("border-radius","10px");
    renderSurveyView(S, `#survey-${{sid}}`);
  }}
}}

// ── Render all sections of the full report ─────────────────────
function renderFullReport(S) {{
  const sid = S.id;
  if (sessionState[sid].rendered) return;
  sessionState[sid].rendered = true;
  ["timeline","batch","thumbnail","quotes","survey"].forEach(key => {{
    renderReportSection(S, sid, key);
  }});
}}

// ═══════════════════════════════════════════════════════════════════
// COMPARISON SUBTAB FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

// ── Metrics ────────────────────────────────────────────────────
function renderCmpMetrics(container) {{
  container.html("");
  const sec = container.append("div").attr("class","cmp-section");
  sec.append("div").attr("class","cmp-title").text("Key Metrics Comparison");
  const tbl = sec.append("table").attr("class","cmp-kpi-table");
  const th = tbl.append("thead").append("tr");
  const kpiDefs = [
    {{ key:"batches", label:"Batches" }}, {{ key:"images", label:"Images Generated" }},
    {{ key:"starred", label:"Starred (\u2605)" }}, {{ key:"deleted", label:"Deleted" }},
    {{ key:"agentGens", label:"Agent Generations" }}, {{ key:"axisChanges", label:"Axis Changes" }},
  ];
  th.append("th").text("Metric").attr("class","metric-label");
  SESSIONS.forEach((S, i) => th.append("th").style("color",SESSION_COLORS[i]).text(`P${{i+1}}: ${{S.participant.split(" ")[0]}}`));
  th.append("th").text("Bar (relative)");
  const tbody = tbl.append("tbody");
  const durRow = tbody.append("tr");
  durRow.append("td").attr("class","metric-label").text("Duration");
  SESSIONS.forEach(S => durRow.append("td").text(`${{Math.floor(S.dur/60)}}m ${{S.dur%60}}s`));
  durRow.append("td");
  kpiDefs.forEach(kd => {{
    const vals = SESSIONS.map(S => S.kpis[kd.key]);
    const maxVal = Math.max(...vals, 1);
    const row = tbody.append("tr");
    row.append("td").attr("class","metric-label").text(kd.label);
    vals.forEach(v => row.append("td").style("font-weight",600).text(v));
    const bw = row.append("td").attr("class","cmp-bar-cell").append("div").attr("class","cmp-bar-wrap");
    vals.forEach((v,i) => {{
      bw.append("div").attr("class","cmp-bar").style("width",(v/maxVal*100)+"px")
        .style("background",SESSION_COLORS[i]).style("opacity",0.75);
      bw.append("div").attr("class","cmp-val").text(v);
    }});
  }});
  const csiRow = tbody.append("tr");
  csiRow.append("td").attr("class","metric-label").text("CSI Score (/100)");
  SESSIONS.forEach((S,i) => csiRow.append("td").style("font-weight",600).style("color",SESSION_COLORS[i]).text(S._csiScore));
  const csiWrap = csiRow.append("td").attr("class","cmp-bar-cell").append("div").attr("class","cmp-bar-wrap");
  SESSIONS.forEach((S,i) => {{
    csiWrap.append("div").attr("class","cmp-bar").style("width",S._csiScore+"px")
      .style("background",SESSION_COLORS[i]).style("opacity",0.75);
    csiWrap.append("div").attr("class","cmp-val").text(S._csiScore);
  }});
}}

// ── Timeline ──────────────────────────────────────────────────
function renderCmpTimeline(container) {{
  container.html("");
  const sec = container.append("div").attr("class","cmp-section");
  sec.append("div").attr("class","cmp-title").text("Design Genealogy: Timeline Comparison");
  const miniW = W, miniH = 160;
  const sharedDur = _sharedDur, globalMaxDur = _globalMaxDur;
  SESSIONS.forEach((S, si) => {{
    const miniRow = sec.append("div").attr("class","cmp-mini-row");
    miniRow.append("div").attr("class","cmp-mini-label").style("color",SESSION_COLORS[si])
      .text(`P${{si+1}}: ${{S.participant}} — ${{Math.floor(S.dur/60)}}m`);
    const svg = miniRow.append("svg").attr("width",miniW).attr("height",miniH)
      .style("display","block").style("background","rgba(22,27,34,0.5)")
      .style("border-radius","6px").style("border","1px solid rgba(48,54,61,0.4)");
    const mxT = t => ML + (t/sharedDur)*plotW;
    if (S.dur < globalMaxDur) {{
      svg.append("line").attr("x1",mxT(S.dur)).attr("x2",mxT(S.dur)).attr("y1",0).attr("y2",miniH)
        .attr("stroke","rgba(139,148,158,0.3)").attr("stroke-width",1).attr("stroke-dasharray","3,3");
      svg.append("text").attr("x",mxT(S.dur)+4).attr("y",miniH-4)
        .attr("font-size",7).attr("fill","#484f58").text(`${{Math.floor(S.dur/60)}}m end`);
    }}
    const maxLane = Math.max(...S.nodes.map(n => n.lane), 2);
    const padTop = 18, padBot = 20;
    const laneH = (miniH - padTop - padBot) / Math.max(maxLane, 1);
    const laneY = d => padTop + Math.min(d, maxLane) * laneH;
    S.phases.forEach(p => {{
      if (p.start >= sharedDur) return;
      const x1 = mxT(p.start), x2 = mxT(Math.min(p.end, sharedDur));
      svg.append("rect").attr("x",x1).attr("y",0).attr("width",x2-x1).attr("height",miniH)
        .attr("fill",p.color).attr("opacity",0.06);
      svg.append("text").attr("x",(x1+x2)/2).attr("y",12).attr("text-anchor","middle")
        .attr("font-size",7).attr("fill",p.color).attr("opacity",0.6).attr("font-weight",600)
        .text(p.label.toUpperCase());
    }});
    S.nodes.forEach(n => {{ n.par.forEach(pid => {{
      const pn = S.nodes.find(x => x.id === pid); if (!pn) return;
      const px = mxT(S.batches[pn.batch]?.t||0), py = laneY(pn.lane);
      const nx = mxT(S.batches[n.batch]?.t||0), ny = laneY(n.lane);
      const mx = (px+nx)/2;
      svg.append("path").attr("d",`M${{px}},${{py}} C${{mx}},${{py}} ${{mx}},${{ny}} ${{nx}},${{ny}}`)
        .attr("stroke",nodeColor(n)).attr("stroke-width",0.8).attr("fill","none").attr("opacity",0.45);
    }}); }});
    S.nodes.forEach(n => {{
      const cx = mxT(S.batches[n.batch]?.t||0), cy = laneY(n.lane);
      const col = n.del ? "#484f58" : nodeColor(n);
      svg.append("circle").attr("cx",cx).attr("cy",cy).attr("r",n.star?5:3)
        .attr("fill",col).attr("opacity",n.del?0.4:0.85);
      if (n.star) svg.append("circle").attr("cx",cx).attr("cy",cy).attr("r",6)
        .attr("fill","none").attr("stroke","#fbbf24").attr("stroke-width",1);
    }});
    d3.range(0, sharedDur+1, 5*60).forEach(t => {{
      svg.append("line").attr("x1",mxT(t)).attr("x2",mxT(t)).attr("y1",miniH-14).attr("y2",miniH-8)
        .attr("stroke","rgba(48,54,61,0.6)").attr("stroke-width",0.5);
      svg.append("text").attr("x",mxT(t)).attr("y",miniH-2).attr("text-anchor","middle")
        .attr("font-size",7).attr("fill","#484f58").text(fmt(t));
    }});
  }});
}}

// ── Batch Tree (genealogy only via renderTracks, consistent scales) ──
function renderCmpBatch(container) {{
  container.html("");
  const sec = container.append("div").attr("class","cmp-section");
  sec.append("div").attr("class","cmp-title").text("Design Genealogy: Batch Tree Comparison");
  const gMB = _globalMaxBatches;
  // Metrics cards
  const metRow = sec.append("div").style("display","flex").style("gap","32px")
    .style("margin-bottom","16px").style("flex-wrap","wrap");
  SESSIONS.forEach((S, si) => {{
    const m = _treeMetrics[si];
    const card = metRow.append("div").style("flex","1").style("min-width","200px")
      .style("background","rgba(22,27,34,0.5)").style("border-radius","8px")
      .style("padding","12px 16px").style("border",`1px solid ${{SESSION_COLORS[si]}}33`);
    card.append("div").style("font-size","10px").style("color",SESSION_COLORS[si])
      .style("font-weight","700").style("text-transform","uppercase").style("letter-spacing","0.5px")
      .style("margin-bottom","8px").text(`P${{si+1}}: ${{S.participant.split(" ")[0]}}`);
    [["Batches",S.batches.length],["Images",S.nodes.length],["Max Depth",m.maxDepth+" gen"],
     ["Root Seeds",m.roots],["Avg Branching",m.avgBranching+"×"],
     ["Lanes",(Math.max(...S.nodes.map(n=>n.lane))+1)]].forEach(([l,v]) => {{
      const r = card.append("div").style("display","flex").style("justify-content","space-between").style("padding","2px 0");
      r.append("span").style("font-size","10px").style("color","#6e7681").text(l);
      r.append("span").style("font-size","10px").style("color","#e6edf3").style("font-weight","600").text(v);
    }});
  }});
  // Compressed batch tree views (genealogy only, tighter arcs)
  // Set compression overrides
  window._secRailBase = 4;
  window._secRailGap = 3;
  window._treeTopPad = 60;
  window._nodeSpacing = 18;
  SESSIONS.forEach((S, si) => {{
    const row = sec.append("div").style("margin-bottom","4px");
    row.append("div").attr("class","cmp-mini-label").style("color",SESSION_COLORS[si])
      .text(`P${{si+1}}: ${{S.participant.split(" ")[0]}} — ${{S.batches.length}} batches, ${{S.nodes.length}} images`);
    const cid = `cmp-batch-${{S.id}}`;
    row.append("div").attr("id",cid);
    const origOverride = S._batchCountOverride;
    S._batchCountOverride = gMB;
    renderTracks(S, `#${{cid}}`, "batch", "straight", true);
    S._batchCountOverride = origOverride;
    // Remove the time-axis track from this render (we'll add one shared axis)
    d3.select(`#${{cid}} .time-axis-track`).remove();
  }});
  // Reset overrides
  window._secRailBase = null;
  window._secRailGap = null;
  window._treeTopPad = null;
  window._nodeSpacing = null;
  // Shared batch axis at bottom
  const axH = 28;
  const axDiv = sec.append("div").style("margin-top","4px");
  const axSvg = axDiv.append("svg").attr("width",W).attr("height",axH).style("display","block");
  const bxScale = idx => ML + ((idx + 0.5) / gMB) * plotW;
  for (let i = 0; i < gMB; i++) {{
    const bx = bxScale(i);
    axSvg.append("text").attr("x",bx).attr("y",12).attr("text-anchor","middle")
      .attr("font-size",8).attr("fill","#6e7681").text(`B${{i}}`);
  }}
}}

// ── CSI & Survey ──────────────────────────────────────────────
function renderCmpCSI(container) {{
  container.html("");
  const sec = container.append("div").attr("class","cmp-section");
  sec.append("div").attr("class","cmp-title").text("CSI Factor Comparison (Radar)");
  const radarWrap = sec.append("div").attr("class","cmp-radar-wrap");
  const radarW = 280, radarH = 280, radarR = 100;
  const radarCx = radarW/2, radarCy = radarH/2;
  const factorNames = SESSIONS[0].csiFact.map(f => f.name);
  const angleStep = (2*Math.PI) / factorNames.length;
  const radarSvg = radarWrap.append("svg").attr("width",radarW).attr("height",radarH).style("flex-shrink","0");
  [0.25,0.5,0.75,1.0].forEach(frac => {{
    radarSvg.append("circle").attr("cx",radarCx).attr("cy",radarCy).attr("r",radarR*frac)
      .attr("fill","none").attr("stroke","rgba(48,54,61,0.6)").attr("stroke-width",0.7);
  }});
  factorNames.forEach((name, i) => {{
    const angle = -Math.PI/2 + i*angleStep;
    radarSvg.append("line").attr("x1",radarCx).attr("y1",radarCy)
      .attr("x2",radarCx+radarR*Math.cos(angle)).attr("y2",radarCy+radarR*Math.sin(angle))
      .attr("stroke","rgba(48,54,61,0.3)").attr("stroke-width",0.5);
    radarSvg.append("text")
      .attr("x",radarCx+(radarR+22)*Math.cos(angle)).attr("y",radarCy+(radarR+22)*Math.sin(angle))
      .attr("text-anchor", Math.abs(Math.cos(angle))<0.1 ? "middle" : Math.cos(angle)>0 ? "start" : "end")
      .attr("dominant-baseline","middle").attr("font-size",8).attr("fill","#8b949e").attr("font-weight",600)
      .text(name.replace("Results Worth Effort","Results"));
  }});
  SESSIONS.forEach((S, si) => {{
    const pts = S.csiFact.map((f, i) => {{
      const angle = -Math.PI/2 + i*angleStep;
      const r = (f.score/20)*radarR;
      return [radarCx+r*Math.cos(angle), radarCy+r*Math.sin(angle)];
    }});
    radarSvg.append("polygon").attr("points",pts.map(p=>p.join(",")).join(" "))
      .attr("fill",SESSION_COLORS[si]).attr("fill-opacity",0.12)
      .attr("stroke",SESSION_COLORS[si]).attr("stroke-width",1.8).attr("opacity",0.85);
    pts.forEach(p => {{
      radarSvg.append("circle").attr("cx",p[0]).attr("cy",p[1]).attr("r",3)
        .attr("fill",SESSION_COLORS[si]).attr("stroke","#0d1117").attr("stroke-width",1);
    }});
  }});
  const radarLeg = radarWrap.append("div").style("padding-top","20px");
  SESSIONS.forEach((S, i) => {{
    const li = radarLeg.append("div").style("display","flex").style("align-items","center")
      .style("gap","7px").style("margin-bottom","7px");
    li.append("div").style("width","14px").style("height","3px").style("border-radius","2px")
      .style("background",SESSION_COLORS[i]);
    li.append("span").style("font-size","10px").style("color","#8b949e")
      .text(`P${{i+1}}: ${{S.participant.split(" ")[0]}} (CSI ${{S._csiScore}})`);
  }});
}}

// ── Quotes ────────────────────────────────────────────────────
function renderCmpQuotes(container) {{
  container.html("");
  const sec = container.append("div").attr("class","cmp-section");
  sec.append("div").attr("class","cmp-title").text("Quote Category Frequency (Participant Only)");
  const allCats = [...new Set(SESSIONS.flatMap(S => Object.keys(S.catColors)))];
  const bfWrap = sec.append("div").attr("class","cmp-butterfly");
  const paxW = 80;
  let globalMaxCount = 1;
  allCats.forEach(cat => {{ SESSIONS.forEach(S => {{
    const c = S.quotes.filter(q => q.speaker === S.speakerNames.participant && q.cat === cat).length;
    if (c > globalMaxCount) globalMaxCount = c;
  }}); }});
  allCats.forEach(cat => {{
    const counts = SESSIONS.map(S =>
      S.quotes.filter(q => q.speaker === S.speakerNames.participant && q.cat === cat).length);
    if (counts.every(c => c === 0)) return;
    const bfRow = bfWrap.append("div").attr("class","cmp-bf-row");
    const leftSide = bfRow.append("div").style("display","flex").style("justify-content","flex-end").style("width",paxW+"px");
    leftSide.append("div").attr("class","cmp-bf-bar").style("width",(counts[0]/globalMaxCount*paxW)+"px")
      .style("background",SESSION_COLORS[0]).style("opacity","0.75");
    const clr = SESSIONS[0].catColors[cat] || '#8b949e';
    bfRow.append("div").attr("class","cmp-bf-label").style("text-align","center").style("width","120px").style("color",clr).text(cat);
    const rightSide = bfRow.append("div").style("display","flex").style("gap","4px");
    SESSIONS.slice(1).forEach((S,i) => {{
      rightSide.append("div").attr("class","cmp-bf-bar").style("width",(counts[i+1]/globalMaxCount*paxW)+"px")
        .style("background",SESSION_COLORS[i+1]).style("opacity","0.75");
    }});
    bfRow.append("div").style("font-size","9px").style("color","#484f58").style("margin-left","6px").text(counts.join(" vs "));
  }});
  const bfAxis = bfWrap.append("div").attr("class","cmp-bf-row").style("margin-top","6px");
  bfAxis.append("div").style("width",paxW+"px").style("text-align","right")
    .style("font-size","9px").style("color",SESSION_COLORS[0]).text(`← P1: ${{SESSIONS[0].participant.split(" ")[0]}}`);
  bfAxis.append("div").style("width","120px");
  const rightLabel = bfAxis.append("div");
  SESSIONS.slice(1).forEach((S,i) => {{
    rightLabel.append("span").style("font-size","9px").style("color",SESSION_COLORS[i+1])
      .text(`P${{i+2}}: ${{S.participant.split(" ")[0]}} →`);
  }});
}}

// ── Generation Rate ───────────────────────────────────────────
function renderCmpRate(container) {{
  container.html("");
  const sec = container.append("div").attr("class","cmp-section");
  sec.append("div").attr("class","cmp-title").text("Cumulative Images Generated Over Time");
  const rateH = 160, rateW2 = Math.min(W - ML - MR - 40, 900);
  const maxDur = _sharedDur;
  const rateSvg = sec.append("svg").attr("width",ML+rateW2+60).attr("height",rateH+36).style("display","block");
  const rX = t => ML + (t/maxDur)*rateW2;
  const maxImgs = Math.max(...SESSIONS.map(S => S.nodes.length), 1);
  const rY = n => rateH - (n/maxImgs)*rateH + 8;
  d3.range(5*60, maxDur+1, 5*60).forEach(t => {{
    rateSvg.append("line").attr("x1",rX(t)).attr("x2",rX(t)).attr("y1",8).attr("y2",rateH)
      .attr("stroke","rgba(48,54,61,0.25)").attr("stroke-width",0.5);
  }});
  const ySteps = maxImgs <= 20 ? 5 : maxImgs <= 50 ? 10 : 20;
  d3.range(ySteps, maxImgs+1, ySteps).forEach(n => {{
    rateSvg.append("line").attr("x1",ML).attr("x2",ML+rateW2).attr("y1",rY(n)).attr("y2",rY(n))
      .attr("stroke","rgba(48,54,61,0.2)").attr("stroke-width",0.5);
    rateSvg.append("text").attr("x",ML-6).attr("y",rY(n)).attr("text-anchor","end")
      .attr("dominant-baseline","middle").attr("font-size",8).attr("fill","#484f58").text(n);
  }});
  SESSIONS.forEach((S, si) => {{
    const sorted = [...S.nodes].sort((a,b) => (S.batches[a.batch]?.t||0) - (S.batches[b.batch]?.t||0));
    let pts = [[rX(0), rY(0)]];
    sorted.forEach((n, i) => {{ pts.push([rX(S.batches[n.batch]?.t||0), rY(i+1)]); }});
    const line = d3.line().x(d=>d[0]).y(d=>d[1]).curve(d3.curveStepAfter);
    rateSvg.append("path").attr("d",line(pts)).attr("stroke",SESSION_COLORS[si])
      .attr("stroke-width",1.8).attr("fill","none").attr("opacity",0.8);
    const last = pts[pts.length-1];
    rateSvg.append("text").attr("x",last[0]+6).attr("y",last[1]).attr("font-size",9)
      .attr("fill",SESSION_COLORS[si]).attr("dominant-baseline","middle").attr("font-weight",600)
      .text(`P${{si+1}}: ${{S.participant.split(" ")[0]}} (${{S.nodes.length}})`);
  }});
  const rScale = d3.scaleLinear().domain([0,maxDur]).range([ML,ML+rateW2]);
  const rAxis = d3.axisBottom(rScale).tickValues(d3.range(0,maxDur+1,5*60)).tickFormat(d=>fmt(d)).tickSize(3);
  rateSvg.append("g").attr("transform",`translate(0,${{rateH}})`).call(rAxis)
    .selectAll("text").attr("fill","#6e7681").attr("font-size",8);
  rateSvg.select(".domain").attr("stroke","rgba(48,54,61,0.4)");
  rateSvg.selectAll(".tick line").attr("stroke","rgba(48,54,61,0.4)");
  rateSvg.append("text").attr("x",ML-32).attr("y",rateH/2).attr("text-anchor","middle")
    .attr("dominant-baseline","middle").attr("transform",`rotate(-90,${{ML-32}},${{rateH/2}})`)
    .attr("font-size",9).attr("fill","#6e7681").text("Images");
}}

// ── Subtab switcher ───────────────────────────────────────────
const CMP_TABS = [
  {{ key:"metrics", label:"Metrics" }}, {{ key:"timeline", label:"Timeline" }},
  {{ key:"batch", label:"Batch Tree" }}, {{ key:"csi", label:"CSI & Survey" }},
  {{ key:"quotes", label:"Quotes" }}, {{ key:"rate", label:"Generation Rate" }},
];
function handleCompareSubtab(tabKey) {{
  compareState.activeTab = tabKey;
  d3.selectAll(".cmp-subtab").classed("active", function() {{
    return d3.select(this).attr("data-tab") === tabKey;
  }});
  const c = d3.select("#cmp-content");
  const map = {{ metrics:renderCmpMetrics, timeline:renderCmpTimeline, batch:renderCmpBatch,
    csi:renderCmpCSI, quotes:renderCmpQuotes, rate:renderCmpRate }};
  if (map[tabKey]) map[tabKey](c);
}}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD BUILDER
// ═══════════════════════════════════════════════════════════════════
function buildOutlinePanel(sid, wrapper) {{
  const SECS = [
    {{ key:"header", label:"Overview & KPIs", anchor:`legend-${{sid}}` }},
    {{ key:"timeline", label:"Timeline" }},
    {{ key:"batch", label:"Batch View" }},
    {{ key:"thumbnail", label:"Thumbnails" }},
    {{ key:"quotes", label:"Quotes" }},
    {{ key:"survey", label:"Survey & CSI" }},
  ];
  const outline = wrapper.append("div").attr("class","outline-panel").attr("id",`outline-${{sid}}`);
  outline.append("div").attr("class","outline-title").text("Sections");
  SECS.forEach((sec, i) => {{
    const targetId = sec.anchor || `section-${{sec.key}}-${{sid}}`;
    outline.append("a").attr("class","outline-link" + (i===0?" active":""))
      .attr("href",`#${{targetId}}`)
      .on("click", function(ev) {{
        ev.preventDefault();
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({{ behavior:"smooth", block:"start" }});
        d3.selectAll(`#outline-${{sid}} .outline-link`).classed("active", false);
        d3.select(this).classed("active", true);
      }})
      .text(sec.label);
  }});
}}

function buildSessionView(S, idx) {{
  const sid = S.id;
  const color = SESSION_COLORS[idx];
  const view = d3.select(".dashboard").append("div")
    .attr("class","session-view").attr("id","view-"+sid).style("display","none");

  // Flex wrapper: outline + content
  const wrapper = view.append("div").attr("class","report-wrapper");
  buildOutlinePanel(sid, wrapper);
  const content = wrapper.append("div").attr("class","report-content");

  // Header (no view toggle — all views shown as sections)
  const header = content.append("div").attr("class","header");
  const hl = header.append("div").attr("class","header-left");
  hl.append("div").attr("class","header-title").text("User Test Analysis: Full Report");
  hl.append("div").attr("class","header-sub").html(
    `<strong>${{S.participant}}</strong> &mdash; ${{S.role}} &mdash; ${{S.task}}`+
    ` &nbsp;|&nbsp; ${{Math.floor(S.dur/60)}} min ${{S.dur%60}} sec`);
  const kr = hl.append("div").attr("class","kpi-row");
  [{{ v:S.kpis.batches, l:"Batches" }}, {{ v:S.kpis.images, l:"Images" }},
   {{ v:S.kpis.starred, l:"Starred" }}, {{ v:S.kpis.deleted, l:"Deleted" }},
   {{ v:S.kpis.agentGens, l:"Agent Gens" }}, {{ v:S.kpis.axisChanges, l:"Axis Changes" }}
  ].forEach(k => {{
    const kpi = kr.append("div").attr("class","kpi");
    kpi.append("div").attr("class","kpi-value").text(k.v);
    kpi.append("div").attr("class","kpi-label").text(k.l);
  }});

  // Global edge style toggle
  const etg = header.append("div").attr("class","edge-toggle-group").attr("id",`edge-toggle-${{sid}}`);
  etg.append("span").style("font-size","9px").style("color","#6e7681").style("margin-right","6px").text("Edges:");
  ["curved","straight"].forEach(es => {{
    etg.append("button").attr("class","edge-toggle-btn" + (es === "curved" ? " active" : ""))
      .attr("data-es", es)
      .on("click", () => setGlobalEdgeStyle(sid, es))
      .text(es.charAt(0).toUpperCase() + es.slice(1));
  }});

  // Legend
  content.append("div").attr("class","legend-row").attr("id",`legend-${{sid}}`);

  // Report sections (all visible, rendered on first visit)
  ["timeline","batch","thumbnail","quotes","survey"].forEach(key => {{
    content.append("div").attr("class","report-section").attr("id",`section-${{key}}-${{sid}}`);
  }});

  initSessionState(S);
  renderLegend(S, sid);
}}

let activeSid = SESSIONS[0].id;

function switchSession(sid) {{
  activeSid = sid;
  d3.selectAll(".session-tab").classed("active", function() {{
    return d3.select(this).attr("data-sid") === sid;
  }});
  d3.selectAll(".session-view").style("display", "none");
  d3.select("#view-compare").style("display", "none");
  if (sid === "__compare__") {{
    d3.select("#view-compare").style("display", null);
    initCompareData();
    handleCompareSubtab(compareState.activeTab);
  }} else {{
    d3.select("#view-"+sid).style("display", null);
    const S = SESSIONS.find(s => s.id === sid);
    renderFullReport(S);
  }}
}}

function buildDashboard() {{
  const dash = d3.select(".dashboard");

  // Session tab bar
  const tabBar = dash.append("div").attr("class","session-tab-bar").attr("id","session-tabs");
  SESSIONS.forEach((S, i) => {{
    tabBar.append("button").attr("class","session-tab").attr("data-sid",S.id)
      .on("click", () => switchSession(S.id))
      .html(`<span class="tab-dot" style="background:${{SESSION_COLORS[i]}}"></span>P${{i+1}}: ${{S.participant.split(" ")[0]}}`);
  }});
  tabBar.append("button").attr("class","session-tab").attr("data-sid","__compare__")
    .on("click", () => switchSession("__compare__")).text("\u2194 Compare");

  // Per-session views (built but not rendered yet)
  SESSIONS.forEach((S, i) => buildSessionView(S, i));

  // Compare view with subtab bar
  const cmpView = dash.append("div").attr("id","view-compare").style("display","none")
    .style("background","rgba(13,17,23,0.6)").style("border","1px solid rgba(48,54,61,0.5)")
    .style("border-radius","10px");
  const cmpTabBar = cmpView.append("div").attr("class","cmp-subtab-bar");
  CMP_TABS.forEach((tab, i) => {{
    cmpTabBar.append("button").attr("class","cmp-subtab" + (i===0?" active":""))
      .attr("data-tab",tab.key).on("click", () => handleCompareSubtab(tab.key)).text(tab.label);
  }});
  cmpView.append("div").attr("id","cmp-content").attr("class","compare-view");

  // Start on first session
  d3.select("#view-"+SESSIONS[0].id).style("display", null);
  d3.select(`.session-tab[data-sid="${{SESSIONS[0].id}}"]`).classed("active", true);
  renderFullReport(SESSIONS[0]);
}}

buildDashboard();
</script>
</body>
</html>"""

DEST.write_text(html, encoding="utf-8")
print(f"Written: {DEST} ({DEST.stat().st_size // 1024} KB)")
print("Open in browser to verify.")
