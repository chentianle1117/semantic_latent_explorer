"""patch13: Survey visual refinement — less color, better hierarchy, stronger bars"""
PATH = r"w:/CMU_Academics/2025 Fall/Thesis Demo/Zappos50K_semantic_explorer/analysis/user_test_benson_s1.html"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

orig = src

# ─── P1: Pre-study attitude bars → uniform muted blue ───────────────────────
OLD1 = r"""  attitudes: [
    { label: "AI can help discover solutions I wouldn\u2019t think of", val: 10, color: "#22c55e" },
    { label: "Worry AI might reduce creative agency", val: 8, color: "#f85149" },
    { label: "Struggle translating intent into prompts", val: 7, color: "#f59e0b" },
    { label: "View AI as collaborator (not just tool)", val: 10, color: "#a855f7" },
  ],"""
NEW1 = r"""  attitudes: [
    { label: "AI can help discover solutions I wouldn\u2019t think of", val: 10 },
    { label: "Worry AI might reduce creative agency", val: 8 },
    { label: "Struggle translating intent into prompts", val: 7 },
    { label: "View AI as collaborator (not just tool)", val: 10 },
  ],"""
assert OLD1 in src, "p13-1"
src = src.replace(OLD1, NEW1)

# ─── P2: Attitude bar rendering → single color ──────────────────────────────
OLD2 = r"""  PRE_SURVEY.attitudes.forEach(a => {
    const row = pre.append('div').attr('class', 'sv-likert-row');
    row.append('div').attr('class', 'sv-likert-label').text(a.label);
    const bar = row.append('div').attr('class', 'sv-likert-bar');
    bar.append('div').attr('class', 'sv-likert-fill')
      .style('width', (a.val * 10) + '%')
      .style('background', a.color).style('opacity', 0.7);
    row.append('div').attr('class', 'sv-likert-val').text(a.val);
  });"""
NEW2 = r"""  PRE_SURVEY.attitudes.forEach(a => {
    const row = pre.append('div').attr('class', 'sv-likert-row');
    row.append('div').attr('class', 'sv-likert-label').text(a.label);
    const bar = row.append('div').attr('class', 'sv-likert-bar');
    bar.append('div').attr('class', 'sv-likert-fill')
      .style('width', (a.val * 10) + '%')
      .style('background', '#58a6ff').style('opacity', 0.8);
    row.append('div').attr('class', 'sv-likert-val').text(a.val);
  });"""
assert OLD2 in src, "p13-2"
src = src.replace(OLD2, NEW2)

# ─── P3: Comfort bar → simpler single blue ──────────────────────────────────
OLD3 = ".style('background', 'linear-gradient(90deg, #58a6ff, #22c55e)');"
NEW3 = ".style('background', '#58a6ff').style('opacity', 0.85);"
assert OLD3 in src, "p13-3"
src = src.replace(OLD3, NEW3)

# ─── P4: Factor table — uniform text, single accent bar, neutral dots ───────
OLD4 = r"""  CSI_FACTORS.forEach((f, i) => {
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
  });"""
NEW4 = r"""  CSI_FACTORS.forEach((f, i) => {
    const weighted = f.score * f.count;
    const tr = tbody.append('tr');
    tr.append('td').style('color', '#c9d1d9').style('font-weight', 600).text(f.name);
    tr.append('td').text(f.items[0] !== null ? f.items[0] : '\u2014');
    tr.append('td').text(f.items[1] !== null ? f.items[1] : 'N/A');
    tr.append('td').style('font-weight', 600).text(f.score);
    const cd = tr.append('td');
    cd.append('span').attr('class', 'sv-count-dot')
      .style('background', f.count > 0 ? '#58a6ff' : 'rgba(48,54,61,0.5)')
      .text(f.count);
    tr.append('td').style('font-weight', 600).text(weighted);
    const barTd = tr.append('td').attr('class', 'sv-bar-cell').style('width', '120px');
    barTd.append('span').attr('class', 'sv-factor-bar')
      .style('width', (maxWeighted > 0 ? (weighted / maxWeighted) * 100 : 0) + 'px')
      .style('background', '#58a6ff').style('opacity', 0.85);
    if (f.note) tr.select('td:nth-child(3)').style('color', '#484f58').style('font-style', 'italic');
  });"""
assert OLD4 in src, "p13-4"
src = src.replace(OLD4, NEW4)

# ─── P5: Radar labels → neutral gray, dots → uniform accent ─────────────────
OLD5 = r"""    radarSvg.append('text').attr('x', lx).attr('y', ly)
      .attr('text-anchor', Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 8).attr('fill', f.color).attr('font-weight', 600)
      .text(f.name.replace('Results Worth Effort', 'Results'));"""
NEW5 = r"""    radarSvg.append('text').attr('x', lx).attr('y', ly)
      .attr('text-anchor', Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 8).attr('fill', '#8b949e').attr('font-weight', 600)
      .text(f.name.replace('Results Worth Effort', 'Results'));"""
assert OLD5 in src, "p13-5"
src = src.replace(OLD5, NEW5)

OLD5b = r"""    radarSvg.append('circle').attr('cx', p[0]).attr('cy', p[1]).attr('r', 3)
      .attr('fill', factors6[i].color).attr('stroke', '#0d1117').attr('stroke-width', 1);"""
NEW5b = r"""    radarSvg.append('circle').attr('cx', p[0]).attr('cy', p[1]).attr('r', 3)
      .attr('fill', '#58a6ff').attr('stroke', '#0d1117').attr('stroke-width', 1);"""
assert OLD5b in src, "p13-5b"
src = src.replace(OLD5b, NEW5b)

# ─── P6: CSI detail card — uniform bar color ────────────────────────────────
OLD6 = r"""  CSI_FACTORS.forEach((f, fi) => {
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
  });"""
NEW6 = r"""  CSI_FACTORS.forEach((f, fi) => {
    const row = detail.append('div').style('margin-bottom', '8px');
    row.append('span').style('font-size', '11px').style('font-weight', 700)
      .style('color', '#c9d1d9').text(f.name);
    if (f.note) row.append('span').style('font-size', '9px').style('color', '#484f58')
      .style('margin-left', '8px').text('(' + f.note + ')');

    CSI_ITEM_LABELS[fi].forEach((label, ii) => {
      const val = f.items[ii];
      const lr = detail.append('div').attr('class', 'sv-likert-row').style('margin-left', '12px');
      lr.append('div').attr('class', 'sv-likert-label').style('width', '260px').text(label);
      const bar = lr.append('div').attr('class', 'sv-likert-bar');
      bar.append('div').attr('class', 'sv-likert-fill')
        .style('width', val !== null ? (val * 10) + '%' : '0%')
        .style('background', '#58a6ff').style('opacity', 0.85);
      lr.append('div').attr('class', 'sv-likert-val')
        .text(val !== null ? val : 'N/A').style('color', val === null ? '#484f58' : '#c9d1d9');
    });
  });"""
assert OLD6 in src, "p13-6"
src = src.replace(OLD6, NEW6)

# ─── P7: Paired comparison chips → uniform styling ──────────────────────────
OLD7 = r"""  CSI_FACTORS.forEach(f => {
    const chip = compRow.append('div').style('display', 'flex').style('align-items', 'center').style('gap', '4px')
      .style('padding', '4px 10px').style('border-radius', '14px')
      .style('background', f.count > 0 ? 'rgba(255,255,255,0.05)' : 'transparent')
      .style('border', '1px solid ' + (f.count > 0 ? f.color : 'rgba(48,54,61,0.3)'));
    chip.append('span').style('font-size', '10px').style('color', f.count > 0 ? f.color : '#484f58')
      .style('font-weight', 600).text(f.name);
    chip.append('span').style('font-size', '12px').style('font-weight', 800)
      .style('color', f.count > 0 ? '#e6edf3' : '#484f58').text(f.count);
  });"""
NEW7 = r"""  CSI_FACTORS.forEach(f => {
    const chip = compRow.append('div').style('display', 'flex').style('align-items', 'center').style('gap', '4px')
      .style('padding', '4px 10px').style('border-radius', '14px')
      .style('background', f.count > 0 ? 'rgba(88,166,255,0.08)' : 'transparent')
      .style('border', '1px solid ' + (f.count > 0 ? 'rgba(88,166,255,0.3)' : 'rgba(48,54,61,0.3)'));
    chip.append('span').style('font-size', '10px').style('color', f.count > 0 ? '#8b949e' : '#484f58')
      .style('font-weight', 600).text(f.name);
    chip.append('span').style('font-size', '12px').style('font-weight', 800)
      .style('color', f.count > 0 ? '#e6edf3' : '#484f58').text(f.count);
  });"""
assert OLD7 in src, "p13-7"
src = src.replace(OLD7, NEW7)

# ─── P8: Challenge chips → muted neutral instead of aggressive red ───────────
OLD8 = ".sv-chip.warn { background:rgba(248,81,73,0.1); color:#f85149; border-color:rgba(248,81,73,0.25); }"
NEW8 = ".sv-chip.warn { background:rgba(139,148,158,0.08); color:#8b949e; border-color:rgba(139,148,158,0.25); }"
assert OLD8 in src, "p13-8"
src = src.replace(OLD8, NEW8)

# ─── P9: Stronger bar track background + thicker fill ───────────────────────
OLD9 = ".sv-likert-bar { flex:1; height:14px; background:rgba(48,54,61,0.5); border-radius:7px;\n  position:relative; overflow:hidden; }"
NEW9 = ".sv-likert-bar { flex:1; height:16px; background:rgba(48,54,61,0.7); border-radius:8px;\n  position:relative; overflow:hidden; }"
assert OLD9 in src, "p13-9"
src = src.replace(OLD9, NEW9)

# ─── P10: Stronger factor bar visibility ─────────────────────────────────────
OLD10 = ".sv-factor-bar { height:10px; border-radius:5px; display:inline-block; vertical-align:middle;\n  min-width:2px; transition:width 0.5s ease; }"
NEW10 = ".sv-factor-bar { height:12px; border-radius:6px; display:inline-block; vertical-align:middle;\n  min-width:4px; transition:width 0.5s ease; }"
assert OLD10 in src, "p13-10"
src = src.replace(OLD10, NEW10)

# ─── P11: Radar grid rings stronger ─────────────────────────────────────────
OLD11 = "      .attr('fill', 'none').attr('stroke', 'rgba(48,54,61,0.4)').attr('stroke-width', 0.5);"
NEW11 = "      .attr('fill', 'none').attr('stroke', 'rgba(48,54,61,0.6)').attr('stroke-width', 0.7);"
assert OLD11 in src, "p13-11"
src = src.replace(OLD11, NEW11)

assert src != orig, "No changes made!"
with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print("patch13 OK — monochrome survey: single accent blue, stronger bars, neutral labels")
