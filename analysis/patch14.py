"""patch14: Meaningful semantic color — 3-tone palette (green/amber/blue) instead of monochrome"""
PATH = r"w:/CMU_Academics/2025 Fall/Thesis Demo/Zappos50K_semantic_explorer/analysis/user_test_benson_s1.html"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

orig = src

# ─── P1: CSI factor colors — assign by meaning, not rainbow ─────────────────
# Green #3fb950 = strong positive (Results Worth Effort=90, Enjoyment=20)
# Amber #d29922 = tension/concern (Expressiveness — high priority but tool limited it)
# Blue  #58a6ff = capability/neutral (Exploration, Immersion)
# Gray  #6e7681 = N/A (Collaboration)
OLD1 = r"""const CSI_FACTORS = [
  { name: "Collaboration",      items: [8, null], score: 8,  count: 0, color: "#6e7681", note: "N/A (solo session)" },
  { name: "Enjoyment",          items: [10, 10],  score: 20, count: 1, color: "#22c55e" },
  { name: "Exploration",        items: [7, 10],   score: 17, count: 3, color: "#58a6ff" },
  { name: "Expressiveness",     items: [6, 7],    score: 13, count: 4, color: "#f97316" },
  { name: "Immersion",          items: [7, 7],    score: 14, count: 2, color: "#a855f7" },
  { name: "Results Worth Effort",items:[8, 10],   score: 18, count: 5, color: "#fbbf24" },
];"""
NEW1 = r"""const CSI_FACTORS = [
  { name: "Collaboration",      items: [8, null], score: 8,  count: 0, color: "#6e7681", note: "N/A (solo session)" },
  { name: "Enjoyment",          items: [10, 10],  score: 20, count: 1, color: "#3fb950" },
  { name: "Exploration",        items: [7, 10],   score: 17, count: 3, color: "#58a6ff" },
  { name: "Expressiveness",     items: [6, 7],    score: 13, count: 4, color: "#d29922" },
  { name: "Immersion",          items: [7, 7],    score: 14, count: 2, color: "#58a6ff" },
  { name: "Results Worth Effort",items:[8, 10],   score: 18, count: 5, color: "#3fb950" },
];"""
assert OLD1 in src, "p14-1"
src = src.replace(OLD1, NEW1)

# ─── P2: Factor table — use f.color for factor names (meaningful, not uniform) ──
OLD2 = r"""    tr.append('td').style('color', '#c9d1d9').style('font-weight', 600).text(f.name);
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
      .style('background', '#58a6ff').style('opacity', 0.85);"""
NEW2 = r"""    tr.append('td').style('color', f.color).style('font-weight', 600).text(f.name);
    tr.append('td').text(f.items[0] !== null ? f.items[0] : '\u2014');
    tr.append('td').text(f.items[1] !== null ? f.items[1] : 'N/A');
    tr.append('td').style('font-weight', 600).text(f.score);
    const cd = tr.append('td');
    cd.append('span').attr('class', 'sv-count-dot')
      .style('background', f.count > 0 ? f.color : 'rgba(48,54,61,0.5)')
      .text(f.count);
    tr.append('td').style('font-weight', 600).text(weighted);
    const barTd = tr.append('td').attr('class', 'sv-bar-cell').style('width', '120px');
    barTd.append('span').attr('class', 'sv-factor-bar')
      .style('width', (maxWeighted > 0 ? (weighted / maxWeighted) * 100 : 0) + 'px')
      .style('background', f.color).style('opacity', 0.85);"""
assert OLD2 in src, "p14-2"
src = src.replace(OLD2, NEW2)

# ─── P3: Radar labels — use f.color (meaningful per factor) ──────────────────
OLD3 = r"""      .attr('font-size', 8).attr('fill', '#8b949e').attr('font-weight', 600)"""
NEW3 = r"""      .attr('font-size', 8).attr('fill', f.color).attr('font-weight', 600)"""
assert OLD3 in src, "p14-3"
src = src.replace(OLD3, NEW3)

# ─── P4: Radar dots — use f.color ────────────────────────────────────────────
OLD4 = r"""    radarSvg.append('circle').attr('cx', p[0]).attr('cy', p[1]).attr('r', 3)
      .attr('fill', '#58a6ff').attr('stroke', '#0d1117').attr('stroke-width', 1);"""
NEW4 = r"""    radarSvg.append('circle').attr('cx', p[0]).attr('cy', p[1]).attr('r', 3)
      .attr('fill', factors6[i].color).attr('stroke', '#0d1117').attr('stroke-width', 1);"""
assert OLD4 in src, "p14-4"
src = src.replace(OLD4, NEW4)

# ─── P5: CSI detail card — factor heading uses f.color, bars use f.color ─────
OLD5 = r"""    row.append('span').style('font-size', '11px').style('font-weight', 700)
      .style('color', '#c9d1d9').text(f.name);"""
NEW5 = r"""    row.append('span').style('font-size', '11px').style('font-weight', 700)
      .style('color', f.color).text(f.name);"""
assert OLD5 in src, "p14-5"
src = src.replace(OLD5, NEW5)

OLD5b = r"""      bar.append('div').attr('class', 'sv-likert-fill')
        .style('width', val !== null ? (val * 10) + '%' : '0%')
        .style('background', '#58a6ff').style('opacity', 0.85);"""
NEW5b = r"""      bar.append('div').attr('class', 'sv-likert-fill')
        .style('width', val !== null ? (val * 10) + '%' : '0%')
        .style('background', f.color).style('opacity', 0.8);"""
assert OLD5b in src, "p14-5b"
src = src.replace(OLD5b, NEW5b)

# ─── P6: Paired comparison chips — use f.color for border, subtle bg tint ────
OLD6 = r"""    const chip = compRow.append('div').style('display', 'flex').style('align-items', 'center').style('gap', '4px')
      .style('padding', '4px 10px').style('border-radius', '14px')
      .style('background', f.count > 0 ? 'rgba(88,166,255,0.08)' : 'transparent')
      .style('border', '1px solid ' + (f.count > 0 ? 'rgba(88,166,255,0.3)' : 'rgba(48,54,61,0.3)'));
    chip.append('span').style('font-size', '10px').style('color', f.count > 0 ? '#8b949e' : '#484f58')
      .style('font-weight', 600).text(f.name);"""
NEW6 = r"""    const chipBg = f.count > 0 ? f.color + '14' : 'transparent';
    const chipBdr = f.count > 0 ? f.color + '55' : 'rgba(48,54,61,0.3)';
    const chip = compRow.append('div').style('display', 'flex').style('align-items', 'center').style('gap', '4px')
      .style('padding', '4px 10px').style('border-radius', '14px')
      .style('background', chipBg)
      .style('border', '1px solid ' + chipBdr);
    chip.append('span').style('font-size', '10px').style('color', f.count > 0 ? f.color : '#484f58')
      .style('font-weight', 600).text(f.name);"""
assert OLD6 in src, "p14-6"
src = src.replace(OLD6, NEW6)

# ─── P7: Pre-study attitude bars — green for positive, amber for concerns ────
OLD7 = r"""  attitudes: [
    { label: "AI can help discover solutions I wouldn\u2019t think of", val: 10 },
    { label: "Worry AI might reduce creative agency", val: 8 },
    { label: "Struggle translating intent into prompts", val: 7 },
    { label: "View AI as collaborator (not just tool)", val: 10 },
  ],"""
NEW7 = r"""  attitudes: [
    { label: "AI can help discover solutions I wouldn\u2019t think of", val: 10, tone: "#3fb950" },
    { label: "Worry AI might reduce creative agency", val: 8, tone: "#d29922" },
    { label: "Struggle translating intent into prompts", val: 7, tone: "#d29922" },
    { label: "View AI as collaborator (not just tool)", val: 10, tone: "#3fb950" },
  ],"""
assert OLD7 in src, "p14-7"
src = src.replace(OLD7, NEW7)

# ─── P8: Attitude bar rendering — use a.tone color ──────────────────────────
OLD8 = r"""    bar.append('div').attr('class', 'sv-likert-fill')
      .style('width', (a.val * 10) + '%')
      .style('background', '#58a6ff').style('opacity', 0.8);"""
NEW8 = r"""    bar.append('div').attr('class', 'sv-likert-fill')
      .style('width', (a.val * 10) + '%')
      .style('background', a.tone || '#58a6ff').style('opacity', 0.8);"""
assert OLD8 in src, "p14-8"
src = src.replace(OLD8, NEW8)

# ─── P9: Challenge chips — warm amber instead of muted gray ──────────────────
OLD9 = ".sv-chip.warn { background:rgba(139,148,158,0.08); color:#8b949e; border-color:rgba(139,148,158,0.25); }"
NEW9 = ".sv-chip.warn { background:rgba(210,153,34,0.08); color:#d29922; border-color:rgba(210,153,34,0.25); }"
assert OLD9 in src, "p14-9"
src = src.replace(OLD9, NEW9)

assert src != orig, "No changes made!"
with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print("patch14 OK — semantic 3-tone: green=strength, amber=tension, blue=capability, gray=N/A")
