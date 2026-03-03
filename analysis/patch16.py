"""patch16: Full redesign of Quotes view — vertical card list + bottom timeline strip"""
PATH = r"w:/CMU_Academics/2025 Fall/Thesis Demo/Zappos50K_semantic_explorer/analysis/user_test_benson_s1.html"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

orig = src

# ─── P1: Replace quotes CSS ───────────────────────────────────────────────────
OLD_CSS = """/* ── Quotes / Transcript view ─────────────────────────────── */
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

NEW_CSS = """/* ── Quotes / Transcript view ─────────────────────────────── */
#quotes-view { display:none; padding:0 0 0; }
/* Filter pill row */
.qv-filter { display:flex; flex-wrap:wrap; gap:6px; padding:10px 0 10px; align-items:center; }
.qv-filter-label { font-size:9px; color:#6e7681; text-transform:uppercase;
  letter-spacing:0.5px; margin-right:4px; }
.qv-pill { display:flex; align-items:center; gap:5px; padding:4px 11px;
  border-radius:20px; cursor:pointer; font-size:9px; font-weight:700;
  letter-spacing:0.4px; text-transform:uppercase;
  border:1px solid var(--pc, #8b949e); color:var(--pc, #8b949e);
  background:transparent; transition:opacity 0.15s; white-space:nowrap; }
.qv-pill::before { content:''; width:5px; height:5px; border-radius:50%;
  background:var(--pc, #8b949e); flex-shrink:0; }
.qv-pill.off { opacity:0.2; }
/* Cards area */
.qv-area { padding:4px 0 80px; }
.qv-section { margin-bottom:20px; }
.qv-sec-hdr { font-size:9px; font-weight:700; letter-spacing:0.7px;
  text-transform:uppercase; color:var(--phclr, #6e7681);
  display:flex; align-items:center; gap:8px; margin:0 0 8px; }
.qv-sec-hdr::before { content:''; width:4px; height:4px; border-radius:50%;
  background:currentColor; flex-shrink:0; }
.qv-sec-hdr::after { content:''; flex:1; height:1px;
  background:var(--phclr, #6e7681); opacity:0.25; }
/* 2-column grid */
.qv-grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; }
/* Quote card */
.qv-card { background:rgba(22,27,34,0.88); border:1px solid rgba(48,54,61,0.45);
  border-left:3px solid var(--cc, #8b949e); border-radius:0 8px 8px 0;
  padding:10px 14px; cursor:pointer;
  transition:background 0.12s, box-shadow 0.12s; }
.qv-card:hover { background:rgba(30,37,48,0.98);
  box-shadow:0 2px 14px rgba(0,0,0,0.45); }
.qv-card.qv-david { opacity:0.6; border-left-color:rgba(139,148,158,0.4); }
.qv-card.qv-hidden { display:none; }
.qv-card.expanded .qv-text { -webkit-line-clamp:unset; overflow:visible; }
/* Card meta row */
.qv-meta { display:flex; align-items:center; gap:6px; margin-bottom:7px; }
.qv-who { font-size:9px; font-weight:700; letter-spacing:0.4px;
  text-transform:uppercase; color:var(--cc, #8b949e); }
.qv-ts { font-size:9px; color:#6e7681; margin-left:4px; }
.qv-cat { font-size:8px; font-weight:600; padding:2px 7px; border-radius:10px;
  border:1px solid; background:rgba(0,0,0,0.25); margin-left:auto; }
/* Quote text */
.qv-text { font-size:11px; line-height:1.55; color:#c9d1d9; font-style:italic;
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;
  overflow:hidden; }
.qv-expand-hint { font-size:9px; color:#484f58; margin-top:4px; }
.qv-card.expanded .qv-expand-hint { display:none; }
/* Timeline strip — sticky at bottom */
.qv-timeline { position:sticky; bottom:0; z-index:10;
  background:rgba(13,17,23,0.96); border-top:1px solid rgba(48,54,61,0.5);
  backdrop-filter:blur(6px); margin:0 -20px; padding:0; }
/* qdetail hidden — no longer used */
#qdetail { display:none !important; }"""

assert OLD_CSS in src, "p16-css"
src = src.replace(OLD_CSS, NEW_CSS)

# ─── P2: Replace renderQuotes function ────────────────────────────────────────
OLD_FUNC = r"""function renderQuotes() {
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
}"""

NEW_FUNC = r"""function renderQuotes() {
  const container = d3.select('#quotes-view');
  container.html('');

  const maxT = Math.max(DUR + 300, ...QUOTES.map(q => q.sec)) + 240;
  const xQ = d => ML + (d / maxT) * plotW;
  const sorted = [...QUOTES].sort((a, b) => a.sec - b.sec);

  // Helper: assign phase label by time
  const getPhase = sec => {
    if (sec > DUR) return 'Post-Session Interview';
    for (const p of PHASES) { if (sec >= p.start && sec < p.end) return p.label; }
    return PHASES[PHASES.length - 1].label;
  };

  // Group quotes by phase (preserving phase order)
  const groups = {};
  sorted.forEach(q => { const ph = getPhase(q.sec); if (!groups[ph]) groups[ph] = []; groups[ph].push(q); });
  const phaseOrder = [...PHASES.map(p => p.label), 'Post-Session Interview'].filter(ph => groups[ph]);

  // Active filter set
  const activeCats = new Set(Object.keys(CAT_COLORS));

  // ── Filter bar ──────────────────────────────────────────────────
  const filterBar = container.append('div').attr('class', 'qv-filter');
  filterBar.append('span').attr('class', 'qv-filter-label').text('Filter');
  const usedCats = Object.keys(CAT_COLORS).filter(c => sorted.some(q => q.cat === c));
  usedCats.forEach(cat => {
    const clr = CAT_COLORS[cat];
    filterBar.append('div').attr('class', 'qv-pill').attr('data-cat', cat)
      .style('--pc', clr)
      .on('click', function() {
        const el = d3.select(this);
        const wasOn = !el.classed('off');
        el.classed('off', wasOn);
        if (wasOn) activeCats.delete(cat); else activeCats.add(cat);
        d3.selectAll('.qv-card').each(function(d) {
          d3.select(this).classed('qv-hidden', !activeCats.has(d.cat));
        });
      })
      .append('span').text(cat);
  });

  // Speaker separator + key
  filterBar.append('span').style('width','1px').style('height','14px')
    .style('background','rgba(48,54,61,0.5)').style('margin','0 6px').style('display','inline-block');
  [{who:'Beichen',clr:'#c9d1d9'},{who:'David',clr:'#484f58'}].forEach(s => {
    filterBar.append('span').style('font-size','9px').style('color',s.clr)
      .style('font-weight','700').style('letter-spacing','0.4px')
      .style('text-transform','uppercase').style('padding','0 4px').text(s.who);
  });

  // ── Scrollable cards area ────────────────────────────────────────
  const cardsArea = container.append('div').attr('class', 'qv-area');

  phaseOrder.forEach(ph => {
    if (!groups[ph]) return;
    const sec = cardsArea.append('div').attr('class', 'qv-section');

    // Section header
    const phData = PHASES.find(p => p.label === ph);
    const phClr = phData ? phData.color : 'rgba(245,158,11,0.65)';
    const phLabelText = phData
      ? ph + '  ' + fmt(phData.start) + '\u2013' + fmt(phData.end)
      : 'Post-Session Interview  58:55+';
    sec.append('div').attr('class', 'qv-sec-hdr')
      .style('--phclr', phClr).text(phLabelText);

    const grid = sec.append('div').attr('class', 'qv-grid');

    groups[ph].forEach(q => {
      const isBeichen = q.speaker === 'Beichen';
      const clr = isBeichen ? (CAT_COLORS[q.cat] || '#8b949e') : '#6e7681';
      const cardId = 'qcard-' + q.sec + '-' + q.cat.replace(/\W/g, '');

      const card = grid.append('div').datum(q)
        .attr('class', 'qv-card' + (isBeichen ? '' : ' qv-david'))
        .attr('id', cardId)
        .style('--cc', clr)
        .on('click', function(ev) {
          ev.stopPropagation();
          const el = d3.select(this);
          el.classed('expanded', !el.classed('expanded'));
        });

      // Meta: speaker · timestamp · [category badge]
      const meta = card.append('div').attr('class', 'qv-meta');
      meta.append('span').attr('class', 'qv-who').text(isBeichen ? 'Beichen' : 'David');
      meta.append('span').attr('class', 'qv-ts').text(q.ts);
      meta.append('span').attr('class', 'qv-cat')
        .style('color', clr).style('border-color', clr + '66').text(q.cat);

      // Quote text (clamped to 3 lines, click card to expand)
      card.append('div').attr('class', 'qv-text')
        .text('\u201C' + q.text + '\u201D');
      if (q.text.length > 120)
        card.append('div').attr('class', 'qv-expand-hint').text('Click to expand');
    });
  });

  // ── Timeline strip at bottom (sticky) ───────────────────────────
  const tlH = 72;
  const tl = container.append('div').attr('class', 'qv-timeline');
  const tlSvg = tl.append('svg')
    .attr('width', '100%').attr('height', tlH)
    .attr('viewBox', '0 0 ' + W + ' ' + tlH)
    .attr('preserveAspectRatio', 'none');

  // Phase bands + labels
  PHASES.forEach(p => {
    tlSvg.append('rect')
      .attr('x', xQ(p.start)).attr('y', 0)
      .attr('width', xQ(p.end) - xQ(p.start)).attr('height', tlH)
      .attr('fill', p.color).attr('opacity', 0.08);
    tlSvg.append('text')
      .attr('x', (xQ(p.start) + xQ(p.end)) / 2).attr('y', 13)
      .attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', p.color)
      .attr('opacity', 0.7).text(p.label.toUpperCase());
  });

  // Post-session band
  tlSvg.append('rect')
    .attr('x', xQ(DUR)).attr('y', 0)
    .attr('width', xQ(maxT) - xQ(DUR)).attr('height', tlH)
    .attr('fill', 'rgba(245,158,11,0.06)');
  tlSvg.append('text')
    .attr('x', (xQ(DUR) + xQ(maxT)) / 2).attr('y', 13)
    .attr('text-anchor', 'middle').attr('font-size', 9)
    .attr('fill', 'rgba(245,158,11,0.6)').text('POST-SESSION');

  // Session-end dashed line
  tlSvg.append('line')
    .attr('x1', xQ(DUR)).attr('x2', xQ(DUR)).attr('y1', 16).attr('y2', tlH - 22)
    .attr('stroke', '#6e7681').attr('stroke-width', 1).attr('stroke-dasharray', '4 3');

  // Time axis ticks
  const tlScale = d3.scaleLinear().domain([0, maxT]).range([ML, ML + plotW]);
  const tlAxis = d3.axisBottom(tlScale)
    .tickValues(d3.range(0, maxT, 10 * 60))
    .tickFormat(d => fmt(d)).tickSize(4);
  tlSvg.append('g').attr('transform', 'translate(0,' + (tlH - 18) + ')').call(tlAxis)
    .selectAll('text').attr('fill', '#6e7681').attr('font-size', 9);
  tlSvg.select('.domain').attr('stroke', 'rgba(48,54,61,0.4)');
  tlSvg.selectAll('.tick line').attr('stroke', 'rgba(48,54,61,0.4)');

  // Quote dots — clickable, scroll to card
  sorted.forEach(q => {
    const clr = q.speaker === 'Beichen' ? (CAT_COLORS[q.cat] || '#8b949e') : '#6e7681';
    const dotX = xQ(Math.min(q.sec, maxT - 20));
    const cardId = 'qcard-' + q.sec + '-' + q.cat.replace(/\W/g, '');
    const dotG = tlSvg.append('g').style('cursor', 'pointer')
      .on('click', () => {
        const el = document.getElementById(cardId);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          d3.select('#' + cardId).classed('expanded', true); }
      })
      .on('mouseenter', ev => showTip(ev, {
        time: q.sec <= DUR ? q.sec : null,
        title: q.speaker + '  \u00B7  ' + q.ts,
        detail: q.text.slice(0, 80) + (q.text.length > 80 ? '\u2026' : '')
      }))
      .on('mousemove', moveTip).on('mouseleave', hideTip);
    dotG.append('circle')
      .attr('cx', dotX).attr('cy', tlH - 34).attr('r', 4.5)
      .attr('fill', clr).attr('opacity', 0.82)
      .attr('stroke', '#0d1117').attr('stroke-width', 1);
  });
}"""

assert OLD_FUNC in src, "p16-func"
src = src.replace(OLD_FUNC, NEW_FUNC)

assert src != orig, "No changes made!"
with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print("patch16 OK — Quotes redesign: vertical cards + category filter + sticky bottom timeline")
