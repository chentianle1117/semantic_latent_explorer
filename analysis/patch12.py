"""patch12: Add Survey tab (pre-study profile + post-study CSI breakdown)"""
PATH = r"w:/CMU_Academics/2025 Fall/Thesis Demo/Zappos50K_semantic_explorer/analysis/user_test_benson_s1.html"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

orig = src

# ─── PATCH 1: Add CSS for survey view ───────────────────────────────────────
OLD_CSS = '/* Debrief zone */\n.qdebrief-band { fill:rgba(245,158,11,0.05); }\n.qsection-label { font-size:9px; fill:#6e7681; letter-spacing:0.5px; }'

NEW_CSS = OLD_CSS + r"""
/* ── Survey view ─────────────────────────────────────────── */
#survey-view { display:none; padding:0 0 24px; }
.sv-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; max-width:1400px; margin:0 auto; }
.sv-card { background:rgba(22,27,34,0.88); border:1px solid rgba(48,54,61,0.7);
  border-radius:10px; padding:18px 22px; }
.sv-card-title { font-size:13px; font-weight:700; color:#e6edf3; margin-bottom:12px;
  border-bottom:1px solid rgba(48,54,61,0.5); padding-bottom:8px; letter-spacing:0.3px; }
.sv-card-title span { font-size:10px; font-weight:400; color:#6e7681; margin-left:8px; }
/* Pre-study */
.sv-label { font-size:10px; color:#6e7681; text-transform:uppercase; letter-spacing:0.5px;
  margin:10px 0 4px; }
.sv-value { font-size:12px; color:#c9d1d9; margin-bottom:6px; }
.sv-chips { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:6px; }
.sv-chip { font-size:9px; padding:3px 8px; border-radius:12px;
  background:rgba(88,166,255,0.12); color:#58a6ff; border:1px solid rgba(88,166,255,0.25); }
.sv-chip.warn { background:rgba(248,81,73,0.1); color:#f85149; border-color:rgba(248,81,73,0.25); }
.sv-likert-row { display:flex; align-items:center; gap:8px; margin:5px 0; }
.sv-likert-label { font-size:10px; color:#8b949e; width:160px; flex-shrink:0; line-height:1.3; }
.sv-likert-bar { flex:1; height:14px; background:rgba(48,54,61,0.5); border-radius:7px;
  position:relative; overflow:hidden; }
.sv-likert-fill { height:100%; border-radius:7px; transition:width 0.5s ease; }
.sv-likert-val { font-size:10px; font-weight:700; color:#c9d1d9; width:28px; text-align:right; }
/* CSI */
.sv-csi-big { text-align:center; margin:8px 0 16px; }
.sv-csi-score { font-size:52px; font-weight:800; color:#e6edf3; line-height:1; }
.sv-csi-label { font-size:10px; color:#6e7681; margin-top:2px; letter-spacing:0.5px; text-transform:uppercase; }
.sv-csi-grade { font-size:14px; font-weight:700; margin-left:8px; }
.sv-csi-formula { font-size:10px; color:#484f58; font-family:monospace; text-align:center;
  margin:4px 0 14px; }
.sv-factor-table { width:100%; border-collapse:collapse; font-size:10px; }
.sv-factor-table th { text-align:left; color:#6e7681; font-weight:600;
  padding:4px 6px; border-bottom:1px solid rgba(48,54,61,0.5); text-transform:uppercase;
  font-size:9px; letter-spacing:0.3px; }
.sv-factor-table td { padding:5px 6px; border-bottom:1px solid rgba(48,54,61,0.2); color:#c9d1d9; }
.sv-factor-table tr:last-child td { border-bottom:none; font-weight:700; color:#e6edf3; }
.sv-bar-cell { position:relative; }
.sv-factor-bar { height:10px; border-radius:5px; display:inline-block; vertical-align:middle;
  min-width:2px; transition:width 0.5s ease; }
.sv-count-dot { display:inline-block; width:14px; height:14px; border-radius:50%;
  text-align:center; line-height:14px; font-size:8px; font-weight:700; color:#0d1117; }
.sv-radar { margin:16px auto 0; display:block; }
/* Full-width bottom card */
.sv-full { grid-column:1 / -1; }"""

assert OLD_CSS in src, "CSS anchor not found"
src = src.replace(OLD_CSS, NEW_CSS)

# ─── PATCH 2: Add "Survey" button to view toggle ───────────────────────────
OLD_BTN = '<button class="view-btn" id="btn-quotes">Quotes</button>'
NEW_BTN = OLD_BTN + '\n          <button class="view-btn" id="btn-survey">Survey</button>'
assert OLD_BTN in src, "btn-quotes not found"
src = src.replace(OLD_BTN, NEW_BTN)

# ─── PATCH 3: Add #survey-view div after #quotes-view ──────────────────────
OLD_SV = '<div id="quotes-view"></div>'
NEW_SV = '<div id="quotes-view"></div>\n  <div id="survey-view"></div>'
assert OLD_SV in src, "#quotes-view anchor not found"
src = src.replace(OLD_SV, NEW_SV)

# ─── PATCH 4: Add survey data + renderSurvey() + update setView ────────────
OLD_SETVIEW = """d3.select('#qdetail-close').on('click', function(e) {
  e.stopPropagation();
  d3.select('#qdetail').classed('visible', false);
  if (activeBubble) { activeBubble.classed('active', false); activeBubble = null; }
});

function setView(mode) {
  viewMode = mode;
  ["timeline","batch","thumbnail","quotes"].forEach(m => {
    d3.select(`#btn-${m}`).classed("active", m === mode);
  });
  const isQuotes = mode === "quotes";
  d3.select("#tracks").style("display", isQuotes ? "none" : null);
  d3.select("#quotes-view").style("display", isQuotes ? "block" : "none");
  d3.select("#legend").style("display", isQuotes ? "none" : null);
  if (isQuotes) {
    renderQuotes();
  } else {
    renderAll();
  }
}
d3.select("#btn-timeline").on("click", () => setView("timeline"));
d3.select("#btn-batch").on("click", () => setView("batch"));
d3.select("#btn-thumbnail").on("click", () => setView("thumbnail"));
d3.select("#btn-quotes").on("click", () => setView("quotes"));"""

NEW_SETVIEW = r"""d3.select('#qdetail-close').on('click', function(e) {
  e.stopPropagation();
  d3.select('#qdetail').classed('visible', false);
  if (activeBubble) { activeBubble.classed('active', false); activeBubble = null; }
});

// ═══════════════════════════════════════════════════════════════════
// Survey view — pre-study profile + post-study CSI
// ═══════════════════════════════════════════════════════════════════

const PRE_SURVEY = {
  experience: "2\u20135 years",
  tools: ["2D Sketching (Procreate, Photoshop)", "Vector/Layout (Illustrator)", "3D Modeling (Rhino, Grasshopper)", "AI/Gen Tools (NanoBanana, Midjourney, Firefly, Vizcom)"],
  aiPhases: ["Moodboarding", "Early Ideation", "Refinement", "Final Polish"],
  comfort: 10,
  challenges: ["Lineage/Traceability", "Fixation on early results", "Control over specific regions"],
  attitudes: [
    { label: "AI can help discover solutions I wouldn\u2019t think of", val: 10, color: "#22c55e" },
    { label: "Worry AI might reduce creative agency", val: 8, color: "#f85149" },
    { label: "Struggle translating intent into prompts", val: 7, color: "#f59e0b" },
    { label: "View AI as collaborator (not just tool)", val: 10, color: "#a855f7" },
  ],
};

const CSI_FACTORS = [
  { name: "Collaboration",      items: [8, null], score: 8,  count: 0, color: "#6e7681", note: "N/A (solo session)" },
  { name: "Enjoyment",          items: [10, 10],  score: 20, count: 1, color: "#22c55e" },
  { name: "Exploration",        items: [7, 10],   score: 17, count: 3, color: "#58a6ff" },
  { name: "Expressiveness",     items: [6, 7],    score: 13, count: 4, color: "#f97316" },
  { name: "Immersion",          items: [7, 7],    score: 14, count: 2, color: "#a855f7" },
  { name: "Results Worth Effort",items:[8, 10],   score: 18, count: 5, color: "#fbbf24" },
];

const CSI_ITEM_LABELS = [
  ["Others could work with me easily", "Easy to share ideas/designs"],
  ["Happy to use regularly", "Enjoyed using the tool"],
  ["Easy to explore many ideas", "Helpful to track different possibilities"],
  ["Able to be very creative", "Allowed me to be very expressive"],
  ["Attention fully tuned to activity", "Became absorbed, forgot about tool"],
  ["Satisfied with what I produced", "Output worth the effort"],
];

function csiTotal() {
  return CSI_FACTORS.reduce((s, f) => s + f.score * f.count, 0) / 3;
}

function csiGrade(score) {
  if (score >= 90) return { letter: "A", color: "#22c55e" };
  if (score >= 80) return { letter: "B+", color: "#58a6ff" };
  if (score >= 70) return { letter: "B", color: "#58a6ff" };
  if (score >= 60) return { letter: "C", color: "#f59e0b" };
  if (score >= 50) return { letter: "D", color: "#f97316" };
  return { letter: "F", color: "#f85149" };
}

function renderSurvey() {
  const container = d3.select('#survey-view');
  container.html('');
  const grid = container.append('div').attr('class', 'sv-grid');

  // ── Card 1: Pre-Study Profile ──────────────────────────────────
  const pre = grid.append('div').attr('class', 'sv-card');
  pre.append('div').attr('class', 'sv-card-title')
    .html('Pre-Study Survey <span>Design Experience & AI Attitudes</span>');

  pre.append('div').attr('class', 'sv-label').text('Professional Experience');
  pre.append('div').attr('class', 'sv-value').text(PRE_SURVEY.experience);

  pre.append('div').attr('class', 'sv-label').text('Software Tools');
  const tc = pre.append('div').attr('class', 'sv-chips');
  PRE_SURVEY.tools.forEach(t => tc.append('span').attr('class', 'sv-chip').text(t));

  pre.append('div').attr('class', 'sv-label').text('AI Phases Used');
  const ac = pre.append('div').attr('class', 'sv-chips');
  PRE_SURVEY.aiPhases.forEach(p => ac.append('span').attr('class', 'sv-chip').text(p));

  pre.append('div').attr('class', 'sv-label').text('AI Integration Comfort');
  const comf = pre.append('div').attr('class', 'sv-likert-row');
  comf.append('div').attr('class', 'sv-likert-bar')
    .append('div').attr('class', 'sv-likert-fill')
    .style('width', (PRE_SURVEY.comfort * 10) + '%')
    .style('background', 'linear-gradient(90deg, #58a6ff, #22c55e)');
  comf.append('div').attr('class', 'sv-likert-val').text(PRE_SURVEY.comfort + '/10');

  pre.append('div').attr('class', 'sv-label').text('Top Challenges');
  const chc = pre.append('div').attr('class', 'sv-chips');
  PRE_SURVEY.challenges.forEach(c => chc.append('span').attr('class', 'sv-chip warn').text(c));

  pre.append('div').attr('class', 'sv-label').text('AI Attitude Statements (1\u201310)');
  PRE_SURVEY.attitudes.forEach(a => {
    const row = pre.append('div').attr('class', 'sv-likert-row');
    row.append('div').attr('class', 'sv-likert-label').text(a.label);
    const bar = row.append('div').attr('class', 'sv-likert-bar');
    bar.append('div').attr('class', 'sv-likert-fill')
      .style('width', (a.val * 10) + '%')
      .style('background', a.color).style('opacity', 0.7);
    row.append('div').attr('class', 'sv-likert-val').text(a.val);
  });

  // ── Card 2: Post-Study CSI Score ───────────────────────────────
  const post = grid.append('div').attr('class', 'sv-card');
  post.append('div').attr('class', 'sv-card-title')
    .html('Post-Study CSI <span>Creativity Support Index (Cherry & Latulipe, 2014)</span>');

  const score = csiTotal();
  const grade = csiGrade(score);
  const big = post.append('div').attr('class', 'sv-csi-big');
  big.append('div').attr('class', 'sv-csi-score')
    .html(score.toFixed(1) + '<span class="sv-csi-grade" style="color:' + grade.color + '">' + grade.letter + '</span>');
  big.append('div').attr('class', 'sv-csi-label').text('Overall CSI Score (0\u2013100)');

  post.append('div').attr('class', 'sv-csi-formula')
    .text('CSI = \u03A3(Factor_Score \u00D7 Factor_Count) / 3 = '
      + CSI_FACTORS.map(f => f.score + '\u00D7' + f.count).join(' + ')
      + ' = ' + (score * 3).toFixed(0) + ' / 3 = ' + score.toFixed(1));

  // Factor table
  const tbl = post.append('table').attr('class', 'sv-factor-table');
  const thead = tbl.append('thead').append('tr');
  ['Factor', 'Item 1', 'Item 2', 'Score (/20)', 'Weight', 'Weighted', 'Bar'].forEach(h =>
    thead.append('th').text(h));

  const tbody = tbl.append('tbody');
  const maxWeighted = Math.max(...CSI_FACTORS.map(f => f.score * f.count));

  CSI_FACTORS.forEach((f, i) => {
    const weighted = f.score * f.count;
    const tr = tbody.append('tr');
    tr.append('td').style('color', f.color).style('font-weight', 600).text(f.name);
    tr.append('td').text(f.items[0] !== null ? f.items[0] : '\u2014');
    tr.append('td').text(f.items[1] !== null ? f.items[1] : 'N/A');
    tr.append('td').text(f.score);
    const cd = tr.append('td');
    cd.append('span').attr('class', 'sv-count-dot')
      .style('background', f.count > 0 ? f.color : 'rgba(48,54,61,0.5)')
      .text(f.count);
    tr.append('td').text(weighted);
    const barTd = tr.append('td').attr('class', 'sv-bar-cell').style('width', '120px');
    barTd.append('span').attr('class', 'sv-factor-bar')
      .style('width', (maxWeighted > 0 ? (weighted / maxWeighted) * 100 : 0) + 'px')
      .style('background', f.color);
    if (f.note) tr.select('td:nth-child(3)').style('color', '#484f58').style('font-style', 'italic');
  });

  // Totals row
  const totR = tbody.append('tr');
  totR.append('td').text('TOTAL');
  totR.append('td');
  totR.append('td');
  const totScore = CSI_FACTORS.reduce((s, f) => s + f.score, 0);
  totR.append('td').text(totScore);
  totR.append('td').text('15');
  totR.append('td').text((score * 3).toFixed(0));
  totR.append('td').text('\u00F7 3 = ' + score.toFixed(1));

  // ── Radar chart (D3 SVG) ───────────────────────────────────────
  const radarW = 240, radarH = 240, radarR = 90;
  const radarCx = radarW / 2, radarCy = radarH / 2;
  const factors6 = CSI_FACTORS.filter(f => f.count > 0 || f.score > 0);
  const angleStep = (2 * Math.PI) / factors6.length;

  const radarSvg = post.append('svg').attr('class', 'sv-radar')
    .attr('width', radarW).attr('height', radarH);

  // Grid rings
  [0.25, 0.5, 0.75, 1.0].forEach(frac => {
    const r = radarR * frac;
    radarSvg.append('circle').attr('cx', radarCx).attr('cy', radarCy).attr('r', r)
      .attr('fill', 'none').attr('stroke', 'rgba(48,54,61,0.4)').attr('stroke-width', 0.5);
  });

  // Axes + labels
  factors6.forEach((f, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const lx = radarCx + (radarR + 18) * Math.cos(angle);
    const ly = radarCy + (radarR + 18) * Math.sin(angle);
    radarSvg.append('line')
      .attr('x1', radarCx).attr('y1', radarCy)
      .attr('x2', radarCx + radarR * Math.cos(angle))
      .attr('y2', radarCy + radarR * Math.sin(angle))
      .attr('stroke', 'rgba(48,54,61,0.3)').attr('stroke-width', 0.5);
    radarSvg.append('text').attr('x', lx).attr('y', ly)
      .attr('text-anchor', Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 8).attr('fill', f.color).attr('font-weight', 600)
      .text(f.name.replace('Results Worth Effort', 'Results'));
  });

  // Data polygon (score/20 normalized)
  const points = factors6.map((f, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const r = (f.score / 20) * radarR;
    return [radarCx + r * Math.cos(angle), radarCy + r * Math.sin(angle)];
  });
  radarSvg.append('polygon')
    .attr('points', points.map(p => p.join(',')).join(' '))
    .attr('fill', 'rgba(88,166,255,0.15)').attr('stroke', '#58a6ff')
    .attr('stroke-width', 1.5).attr('opacity', 0.8);

  // Dots
  points.forEach((p, i) => {
    radarSvg.append('circle').attr('cx', p[0]).attr('cy', p[1]).attr('r', 3)
      .attr('fill', factors6[i].color).attr('stroke', '#0d1117').attr('stroke-width', 1);
  });

  // ── Card 3: CSI Item Details (full-width) ──────────────────────
  const detail = grid.append('div').attr('class', 'sv-card sv-full');
  detail.append('div').attr('class', 'sv-card-title')
    .html('CSI Statement Responses <span>12 agreement items + 15 paired comparisons</span>');

  CSI_FACTORS.forEach((f, fi) => {
    const row = detail.append('div').style('margin-bottom', '8px');
    row.append('span').style('font-size', '11px').style('font-weight', 700)
      .style('color', f.color).text(f.name);
    if (f.note) row.append('span').style('font-size', '9px').style('color', '#484f58')
      .style('margin-left', '8px').text('(' + f.note + ')');

    CSI_ITEM_LABELS[fi].forEach((label, ii) => {
      const val = f.items[ii];
      const lr = detail.append('div').attr('class', 'sv-likert-row').style('margin-left', '12px');
      lr.append('div').attr('class', 'sv-likert-label').style('width', '260px').text(label);
      const bar = lr.append('div').attr('class', 'sv-likert-bar');
      bar.append('div').attr('class', 'sv-likert-fill')
        .style('width', val !== null ? (val * 10) + '%' : '0%')
        .style('background', f.color).style('opacity', 0.65);
      lr.append('div').attr('class', 'sv-likert-val')
        .text(val !== null ? val : 'N/A').style('color', val === null ? '#484f58' : '#c9d1d9');
    });
  });

  // Paired comparison summary
  detail.append('div').style('margin-top', '14px')
    .append('div').attr('class', 'sv-label').text('Paired Factor Comparisons (15 total)');
  const compRow = detail.append('div').style('display', 'flex').style('gap', '8px').style('flex-wrap', 'wrap').style('margin-top', '4px');
  CSI_FACTORS.forEach(f => {
    const chip = compRow.append('div').style('display', 'flex').style('align-items', 'center').style('gap', '4px')
      .style('padding', '4px 10px').style('border-radius', '14px')
      .style('background', f.count > 0 ? 'rgba(255,255,255,0.05)' : 'transparent')
      .style('border', '1px solid ' + (f.count > 0 ? f.color : 'rgba(48,54,61,0.3)'));
    chip.append('span').style('font-size', '10px').style('color', f.count > 0 ? f.color : '#484f58')
      .style('font-weight', 600).text(f.name);
    chip.append('span').style('font-size', '12px').style('font-weight', 800)
      .style('color', f.count > 0 ? '#e6edf3' : '#484f58').text(f.count);
  });

  // ── Card 4: Key Pre→Post Observations (full-width) ────────────
  const obs = grid.append('div').attr('class', 'sv-card sv-full');
  obs.append('div').attr('class', 'sv-card-title').text('Key Observations');

  const bullets = [
    { icon: "\u2B50", text: "Highest weighted factor: <b>Results Worth Effort</b> (score 18, count 5 = 90 weighted) \u2014 output quality mattered most to this designer." },
    { icon: "\uD83C\uDFA8", text: "Expressiveness had the 2nd highest count (4) but lower score (13/20) \u2014 creative freedom was valued but the tool constrained fine-grained control." },
    { icon: "\u26A0\uFE0F", text: "Pre-study concern <i>\"worry AI might reduce creative agency\"</i> (8/10) aligns with post-interview: <i>\"good inspiration, but you're drawn to that direction rather than originated from your thinking.\"</i>" },
    { icon: "\uD83D\uDD0D", text: "Exploration scored 17/20 but was chosen 3/15 times \u2014 exploring was easy, but less critical than producing quality results." },
    { icon: "\uD83E\uDD1D", text: "Collaboration was N/A (solo session) with 0 paired comparison selections. Collaboration score would only apply in multi-user setups." },
    { icon: "\uD83D\uDCA1", text: "Pre-study challenge <i>\"Lineage/Traceability\"</i> directly addressed by the genealogy tree feature; post-session rated tracking/exploration 10/10." },
  ];

  bullets.forEach(b => {
    const p = obs.append('div').style('display', 'flex').style('gap', '8px').style('margin-bottom', '6px')
      .style('align-items', 'flex-start').style('font-size', '11px').style('color', '#8b949e').style('line-height', '1.5');
    p.append('span').style('flex-shrink', 0).style('font-size', '13px').text(b.icon);
    p.append('span').html(b.text);
  });
}

function setView(mode) {
  viewMode = mode;
  ["timeline","batch","thumbnail","quotes","survey"].forEach(m => {
    d3.select(`#btn-${m}`).classed("active", m === mode);
  });
  const isQuotes = mode === "quotes";
  const isSurvey = mode === "survey";
  const isTrack  = !isQuotes && !isSurvey;
  d3.select("#tracks").style("display", isTrack ? null : "none");
  d3.select("#quotes-view").style("display", isQuotes ? "block" : "none");
  d3.select("#survey-view").style("display", isSurvey ? "block" : "none");
  d3.select("#legend").style("display", isTrack ? null : "none");
  if (isQuotes) {
    renderQuotes();
  } else if (isSurvey) {
    renderSurvey();
  } else {
    renderAll();
  }
}
d3.select("#btn-timeline").on("click", () => setView("timeline"));
d3.select("#btn-batch").on("click", () => setView("batch"));
d3.select("#btn-thumbnail").on("click", () => setView("thumbnail"));
d3.select("#btn-quotes").on("click", () => setView("quotes"));
d3.select("#btn-survey").on("click", () => setView("survey"));"""

assert OLD_SETVIEW in src, "setView anchor not found"
src = src.replace(OLD_SETVIEW, NEW_SETVIEW)

assert src != orig, "No changes made!"
with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print("patch12 OK — Survey tab added (pre-study + CSI breakdown + radar + observations)")
