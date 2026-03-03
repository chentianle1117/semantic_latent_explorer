"""patch11: Add Quotes/Transcript tab with interactive speech bubbles"""
PATH = r"w:/CMU_Academics/2025 Fall/Thesis Demo/Zappos50K_semantic_explorer/analysis/user_test_benson_s1.html"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

orig = src

# ─── PATCH 1: Add CSS for quotes view ───────────────────────────────────────
OLD_CSS = ".time-axis-track .tick line, .time-axis-track .domain { stroke: rgba(48,54,61,0.6); }"

NEW_CSS = OLD_CSS + """
/* ── Quotes / Transcript view ─────────────────────────────── */
#quotes-view { display:none; padding:0 0 24px; }
.qaxis-row { position:relative; }
.qbubbles-area { position:relative; width:100%; overflow:visible; }
.qbubble {
  position:absolute; cursor:pointer;
  background:rgba(22,27,34,0.92); border:1px solid rgba(48,54,61,0.6);
  border-radius:10px; padding:7px 10px 6px;
  max-width:240px; min-width:110px;
  transition:box-shadow 0.15s, border-color 0.15s, z-index 0s;
  z-index:1; box-sizing:border-box;
}
.qbubble:hover { z-index:10; box-shadow:0 4px 20px rgba(0,0,0,0.55); }
.qbubble.active { z-index:20; border-color:rgba(255,255,255,0.35);
  box-shadow:0 6px 28px rgba(0,0,0,0.7); }
.qbubble.speaker-beichen { border-left:3px solid var(--qclr); }
.qbubble.speaker-david   { border-left:3px solid rgba(139,148,158,0.5);
  opacity:0.72; }
.qbubble-head { display:flex; align-items:center; gap:5px; margin-bottom:3px; }
.qbubble-who  { font-size:8px; font-weight:700; letter-spacing:0.5px;
  text-transform:uppercase; color:var(--qclr); }
.qbubble-who.david { color:#8b949e; }
.qcat-dot { width:6px; height:6px; border-radius:50%;
  background:var(--qclr); flex-shrink:0; }
.qcat-dot.david { background:#484f58; }
.qcat-label { font-size:8px; color:#484f58; margin-left:auto; }
.qbubble-text { font-size:10px; line-height:1.4; color:#c9d1d9;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  overflow:hidden; }
.qbubble.active .qbubble-text { -webkit-line-clamp:unset; overflow:visible; }
.qbubble-ts { font-size:8px; color:#484f58; margin-top:3px; }
.qstem { position:absolute; bottom:-8px; left:18px;
  width:0; height:0;
  border-left:6px solid transparent; border-right:6px solid transparent;
  border-top:8px solid rgba(48,54,61,0.6); pointer-events:none; }
.qstem::after { content:''; position:absolute; top:-9px; left:-5px;
  width:0; height:0;
  border-left:5px solid transparent; border-right:5px solid transparent;
  border-top:7px solid rgba(22,27,34,0.92); }
/* Detail panel */
#qdetail {
  position:fixed; right:20px; top:50%; transform:translateY(-50%);
  width:300px; background:rgba(13,17,23,0.97);
  border:1px solid rgba(48,54,61,0.8); border-radius:12px;
  padding:16px 18px; z-index:1000; display:none;
  box-shadow:0 8px 40px rgba(0,0,0,0.7);
  backdrop-filter:blur(12px);
}
#qdetail.visible { display:block; }
#qdetail-close { float:right; background:none; border:none; color:#6e7681;
  cursor:pointer; font-size:16px; line-height:1; padding:0; }
#qdetail-close:hover { color:#c9d1d9; }
#qdetail-cat  { font-size:9px; font-weight:700; text-transform:uppercase;
  letter-spacing:0.6px; margin-bottom:8px; }
#qdetail-who  { font-size:10px; color:#8b949e; margin-bottom:4px; }
#qdetail-ts   { font-size:10px; color:#58a6ff; margin-bottom:10px; }
#qdetail-text { font-size:12px; line-height:1.6; color:#e6edf3;
  font-style:italic; border-left:3px solid; padding-left:10px; }
/* Category legend for quotes view */
.qlegend { display:flex; flex-wrap:wrap; gap:10px; padding:10px 0 6px; }
.qleg-item { display:flex; align-items:center; gap:4px;
  font-size:9px; color:#8b949e; cursor:pointer; }
.qleg-dot { width:7px; height:7px; border-radius:50%; }
.qleg-item.dimmed { opacity:0.3; }
/* Debrief zone */
.qdebrief-band { fill:rgba(245,158,11,0.05); }
.qsection-label { font-size:9px; fill:#6e7681; letter-spacing:0.5px; }"""

assert OLD_CSS in src, "CSS anchor not found"
src = src.replace(OLD_CSS, NEW_CSS)

# ─── PATCH 2: Add "Quotes" button to view toggle ────────────────────────────
OLD_BTN = '<button class="view-btn" id="btn-thumbnail">Thumbnail</button>'
NEW_BTN = ('<button class="view-btn" id="btn-thumbnail">Thumbnail</button>'
           '\n          <button class="view-btn" id="btn-quotes">Quotes</button>')
assert OLD_BTN in src, "btn-thumbnail not found"
src = src.replace(OLD_BTN, NEW_BTN)

# ─── PATCH 3: Add #quotes-view div + #qdetail panel after #tracks ─────────
OLD_DIV = '<div class="insights-row">'
NEW_DIV = """<div id="quotes-view"></div>
  <div id="qdetail">
    <button id="qdetail-close" title="Close">&times;</button>
    <div id="qdetail-cat"></div>
    <div id="qdetail-who"></div>
    <div id="qdetail-ts"></div>
    <div id="qdetail-text"></div>
  </div>
  <div class="insights-row">"""
assert OLD_DIV in src, "#tracks/insights anchor not found"
src = src.replace(OLD_DIV, NEW_DIV, 1)

# ─── PATCH 4: Add QUOTES data constant (after CANVAS const) ─────────────────
OLD_QUOTES_ANCHOR = "// ═══════════════════════════════════════════════════════════════════\nfunction renderAll() {"
NEW_QUOTES_ANCHOR = """const QUOTES = [
  // ── Design Exploration ──────────────────────────────────────────
  {"speaker":"Beichen","ts":"17:35","sec":1055,"text":"Is there a way that I can choose like a shoe that's already here? I want to, like, reference an existing shoe.","cat":"Navigation"},
  {"speaker":"Beichen","ts":"20:54","sec":1254,"text":"This feels a little bit confusing to me.","cat":"Frustration"},
  {"speaker":"Beichen","ts":"22:52","sec":1372,"text":"I really… I don't like any of this.","cat":"Frustration"},
  {"speaker":"David","ts":"22:23","sec":1343,"text":"It's trying to give you unexpected generation, but still within the realm of your design prompt — to help you explore the space.","cat":"Tool Reaction"},
  {"speaker":"Beichen","ts":"23:34","sec":1414,"text":"The parameters, like, is it generated from the AI agent context, or, like, how does it affect the generation, essentially?","cat":"Agent Reaction"},
  {"speaker":"Beichen","ts":"23:47","sec":1427,"text":"So will it impact the prompt? Will it be in the back, helping me to generate?","cat":"Agent Reaction"},
  {"speaker":"Beichen","ts":"27:20","sec":1640,"text":"It's really fine, like, it's always, like, simplify what I asked.","cat":"Frustration"},
  {"speaker":"Beichen","ts":"32:17","sec":1937,"text":"I'm hoping, like, some… let me see if I can just try the color. I just want to apply this. Maybe light proper… Yeah, these are… these are so weird.","cat":"Discovery"},
  {"speaker":"Beichen","ts":"37:28","sec":2248,"text":"I don't know what's going on, but it just looks like a 5G. Hmm, I kinda like it. Oh, this is nice!","cat":"Discovery"},
  {"speaker":"Beichen","ts":"39:59","sec":2399,"text":"It's really a great ideation process for me to get inspiration from. With only prompting, I was able to get some treatment that I really like.","cat":"Insight"},
  {"speaker":"Beichen","ts":"41:20","sec":2480,"text":"Right now, I have this really vague prompt, but I don't know which direction I want to go. I hope this pop-up helps me — I can have something that looks interesting.","cat":"Design Thinking"},
  {"speaker":"Beichen","ts":"41:36","sec":2496,"text":"I feel like for this one, I would want to still try the furry texture because I think that's for now it expresses the meme.","cat":"Design Thinking"},
  {"speaker":"Beichen","ts":"44:02","sec":2642,"text":"The concept of retro and futuristic can be subtle, and it can be subjective to the designer. Right now, it almost feels like it's just trying to create certain noises as I explore.","cat":"Axis/Semantic"},
  {"speaker":"Beichen","ts":"44:02","sec":2642,"text":"It feels to me like the more I explore, I think the tree structure might be more helpful to look at where it's coming from.","cat":"Navigation"},
  {"speaker":"Beichen","ts":"47:54","sec":2874,"text":"Somehow this is affecting how it's suggesting my design, you know, I would say…","cat":"Axis/Semantic"},
  {"speaker":"Beichen","ts":"50:01","sec":3001,"text":"Is there a way I can compare the shoes? I'm so lost.","cat":"Navigation"},
  {"speaker":"Beichen","ts":"54:23","sec":3263,"text":"I almost have enough idea of where to go based on this design. I wish I had masking — somewhere I can mark and allow generative AI to change specific areas.","cat":"Frustration"},
  {"speaker":"Beichen","ts":"55:30","sec":3330,"text":"I have a lot of different ideas I want to explore, but I just need more finer controls over really specific areas without hallucinating details I don't want.","cat":"Frustration"},
  {"speaker":"Beichen","ts":"56:16","sec":3376,"text":"This one gives me really good inspiration. I like the lacing system — it's like an opera silhouette. I realize the potential of a string-lacing system as a more futuristic feature.","cat":"Insight"},
  // ── Post-Session Interview ──────────────────────────────────────
  {"speaker":"Beichen","ts":"75:44","sec":4544,"text":"As a non-English native speaker, sometimes vocabulary I can think of to steer the design through AI can be limited. I feel like I have support of this intelligence helping me with wording I could use.","cat":"Insight"},
  {"speaker":"Beichen","ts":"76:29","sec":4589,"text":"The auto generation is trying to help me by providing additional possibilities that help me think through different problems. But I have concern it might limit creativity — good inspiration, but then you're drawn to that direction rather than originated from your thinking.","cat":"Agent Reaction"},
  {"speaker":"Beichen","ts":"78:20","sec":4700,"text":"I feel like the canvas could be helpful along with AI auto generation. When I focus on the design, I would forget about the canvas. I hardly zoomed out to look at the axis again. The value was the fact that the agent is aware of the axes.","cat":"Axis/Semantic"},
  {"speaker":"Beichen","ts":"79:48","sec":4788,"text":"I'm approaching design based on visuals. But the agent is approaching design based on the axis. So if I want to get reasonable output from the agent, I need to define the axes pretty well. And that requires a mental shift.","cat":"Design Thinking"},
  {"speaker":"Beichen","ts":"81:27","sec":4887,"text":"It would be like a really early concept stage where you're just trying to look for inspiration and see what are the possibilities. For inline designers, it might be helpful to iterate on an existing shoe.","cat":"Design Thinking"},
];

const CAT_COLORS = {
  "Discovery":      "#22c55e",
  "Frustration":    "#f85149",
  "Insight":        "#a855f7",
  "Tool Reaction":  "#58a6ff",
  "Design Thinking":"#f97316",
  "Agent Reaction": "#fbbf24",
  "Axis/Semantic":  "#0ea5e9",
  "Navigation":     "#8b949e",
  "Workflow":       "#6e7681",
};

// ═══════════════════════════════════════════════════════════════════
function renderAll() {"""
assert OLD_QUOTES_ANCHOR in src, "renderAll anchor not found"
src = src.replace(OLD_QUOTES_ANCHOR, NEW_QUOTES_ANCHOR)

# ─── PATCH 5: Add renderQuotes() function before setView ────────────────────
OLD_SETVIEW = """renderAll();

function setView(mode) {
  viewMode = mode;
  ["timeline","batch","thumbnail"].forEach(m => {
    d3.select(`#btn-${m}`).classed("active", m === mode);
  });
  renderAll();
}
d3.select("#btn-timeline").on("click", () => setView("timeline"));
d3.select("#btn-batch").on("click", () => setView("batch"));
d3.select("#btn-thumbnail").on("click", () => setView("thumbnail"));"""

NEW_SETVIEW = """renderAll();

// ═══════════════════════════════════════════════════════════════════
// Quotes / Transcript view
// ═══════════════════════════════════════════════════════════════════
function renderQuotes() {
  const container = d3.select('#quotes-view');
  container.html('');

  const maxT = Math.max(DUR + 300, ...QUOTES.map(q => q.sec) ) + 240;
  const xQ   = d => ML + (d / maxT) * plotW;

  // ── Legend row ──────────────────────────────────────────────────
  const cats = [...new Set(QUOTES.map(q => q.cat))];
  const legRow = container.append('div').attr('class','qlegend')
    .style('padding-left', ML + 'px');
  cats.forEach(cat => {
    const item = legRow.append('div').attr('class','qleg-item')
      .attr('data-cat', cat)
      .on('click', function() {
        const el = d3.select(this);
        const dimmed = el.classed('dimmed');
        el.classed('dimmed', !dimmed);
        const active = cats.filter(c =>
          !d3.select(`.qleg-item[data-cat="${c}"]`).classed('dimmed'));
        d3.selectAll('.qbubble').each(function(d) {
          d3.select(this).style('opacity', active.includes(d.cat) ? null : 0.12);
        });
      });
    item.append('div').attr('class','qleg-dot')
      .style('background', CAT_COLORS[cat] || '#8b949e');
    item.append('span').text(cat);
  });
  // Speaker key
  legRow.append('div').style('margin-left','16px').style('border-left','1px solid rgba(48,54,61,0.5)').style('padding-left','16px');
  [{who:'Beichen',clr:'#c9d1d9'},{who:'David',clr:'#484f58'}].forEach(s => {
    const si = legRow.append('div').attr('class','qleg-item');
    si.append('div').style('width','10px').style('height','4px').style('border-radius','2px')
      .style('background', s.clr);
    si.append('span').style('color', s.clr).text(s.who);
  });

  // ── Time axis SVG ────────────────────────────────────────────────
  const axH = 32;
  const svg = container.append('svg').attr('width', W).attr('height', axH)
    .attr('class','qaxis-row');
  const g = svg.append('g');

  // Phase bands
  PHASES.forEach(p => {
    g.append('rect').attr('x', xQ(p.start)).attr('y', 0)
      .attr('width', xQ(p.end) - xQ(p.start)).attr('height', axH)
      .attr('fill', p.color).attr('opacity', 0.06);
    g.append('text').attr('class','qsection-label')
      .attr('x', (xQ(p.start) + xQ(p.end)) / 2).attr('y', 12)
      .attr('text-anchor','middle').text(p.label);
  });

  // Debrief band (after DUR)
  g.append('rect').attr('class','qdebrief-band')
    .attr('x', xQ(DUR)).attr('y', 0)
    .attr('width', xQ(maxT) - xQ(DUR)).attr('height', axH)
    .attr('fill','rgba(245,158,11,0.06)');
  g.append('text').attr('class','qsection-label')
    .attr('x', (xQ(DUR) + xQ(maxT)) / 2).attr('y', 12)
    .attr('text-anchor','middle').text('Post-Session Interview');

  // Session-end marker
  g.append('line')
    .attr('x1', xQ(DUR)).attr('x2', xQ(DUR)).attr('y1', 0).attr('y2', axH)
    .attr('stroke','#8b949e').attr('stroke-width',1.5).attr('stroke-dasharray','4 3');

  // Time ticks
  const scale = d3.scaleLinear().domain([0, maxT]).range([ML, ML + plotW]);
  const axis = d3.axisBottom(scale).ticks(14)
    .tickFormat(d => fmt(d));
  svg.append('g').attr('transform',`translate(0,${axH-14})`).call(axis)
    .selectAll('text').attr('fill','#6e7681').attr('font-size',9);
  svg.select('.domain').attr('stroke','rgba(48,54,61,0.4)');
  svg.selectAll('.tick line').attr('stroke','rgba(48,54,61,0.4)');

  // ── Bubble layout ────────────────────────────────────────────────
  const BMIN_W  = 130, BMAX_W = 250;
  const BUBBLE_H = 62;
  const ROW_GAP  = 70;
  const PAD      = 6;

  // Sort by time, then compute staggered rows per speaker group
  const sorted = [...QUOTES].sort((a,b) => a.sec - b.sec);
  const beichenRows = []; // each row: last right edge x
  const davidRows   = [];

  sorted.forEach(q => {
    q._cx  = xQ(q.sec);
    q._bw  = Math.min(BMAX_W, Math.max(BMIN_W, q.text.length * 4.8 + 40));
    const rows = q.speaker === 'Beichen' ? beichenRows : davidRows;
    let ri = rows.findIndex(end => end + PAD <= q._cx);
    if (ri === -1) { ri = rows.length; rows.push(0); }
    rows[ri] = q._cx + q._bw;
    q._row = ri;
    q._isBeichen = q.speaker === 'Beichen';
  });

  const beichenDepth = beichenRows.length;
  const totalH = (beichenDepth + davidRows.length) * ROW_GAP + BUBBLE_H + 20;

  const area = container.append('div').attr('id','qbubbles')
    .style('position','relative').style('width', W + 'px')
    .style('height', totalH + 'px').style('margin-bottom','20px');

  let activeBubble = null;

  sorted.forEach(q => {
    const rowOffset = q._isBeichen
      ? q._row * ROW_GAP + 10
      : (beichenDepth + q._row) * ROW_GAP + 10;

    const clr = q.speaker === 'Beichen' ? (CAT_COLORS[q.cat] || '#8b949e') : '#484f58';

    const bub = area.append('div')
      .datum(q)
      .attr('class', `qbubble speaker-${q.speaker.toLowerCase()}`)
      .style('left', q._cx + 'px')
      .style('top',  rowOffset + 'px')
      .style('width', q._bw + 'px')
      .style('--qclr', clr);

    // Header
    const head = bub.append('div').attr('class','qbubble-head');
    head.append('div').attr('class', `qcat-dot${q._isBeichen ? '' : ' david'}`);
    head.append('span').attr('class', `qbubble-who${q._isBeichen ? '' : ' david'}`)
      .text(q.speaker === 'Beichen' ? 'Beichen' : 'David');
    head.append('span').attr('class','qcat-label').text(q.cat);

    bub.append('div').attr('class','qbubble-text').text('"' + q.text + '"');
    bub.append('div').attr('class','qbubble-ts').text(q.ts);

    // Stem pointer
    bub.append('div').attr('class','qstem');

    // Click → detail panel
    bub.on('click', function(event) {
      event.stopPropagation();
      if (activeBubble) activeBubble.classed('active', false);
      if (activeBubble && activeBubble.node() === this) {
        activeBubble = null;
        d3.select('#qdetail').classed('visible', false);
        return;
      }
      activeBubble = d3.select(this).classed('active', true);
      const detailColor = clr;
      d3.select('#qdetail-cat').style('color', detailColor).text(q.cat);
      d3.select('#qdetail-who').text(q.speaker + ' · ' + q.ts);
      d3.select('#qdetail-ts').html(
        q.sec <= DUR
          ? `${fmt(q.sec)} into session`
          : `Post-session interview (${q.ts})`
      );
      d3.select('#qdetail-text')
        .style('border-color', detailColor)
        .text(q.text);
      d3.select('#qdetail').classed('visible', true);
    });
  });

  // Stem connector lines: SVG overlay connecting bubble to timeline position
  const stemSvg = container.insert('svg', '#qbubbles')
    .style('position','absolute').style('top', axH + 'px').style('left','0')
    .style('pointer-events','none')
    .attr('width', W).attr('height', totalH);

  sorted.forEach(q => {
    const rowOffset = q._isBeichen
      ? q._row * ROW_GAP + 10
      : (beichenDepth + q._row) * ROW_GAP + 10;
    const clr = q.speaker === 'Beichen' ? (CAT_COLORS[q.cat] || '#8b949e') : '#484f58';
    stemSvg.append('line')
      .attr('x1', q._cx + 6).attr('y1', 0)
      .attr('x2', q._cx + 6).attr('y2', rowOffset + BUBBLE_H - 8)
      .attr('stroke', clr).attr('stroke-width', 1).attr('opacity', 0.22)
      .attr('stroke-dasharray', '2 3');
  });

  // Close detail panel on background click
  d3.select('body').on('click.qdetail', () => {
    if (activeBubble) activeBubble.classed('active', false);
    activeBubble = null;
    d3.select('#qdetail').classed('visible', false);
  });
}

d3.select('#qdetail-close').on('click', function(e) {
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

assert OLD_SETVIEW in src, "setView anchor not found"
src = src.replace(OLD_SETVIEW, NEW_SETVIEW)

assert src != orig, "No changes made!"
with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print("patch11 OK — Quotes tab added (QUOTES data, renderQuotes, CSS, button, setView)")
