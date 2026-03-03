"""Build the analysis HTML with embedded thumbnails."""
import json, os

# Read thumbnails
with open('analysis/thumbs_b64.json', 'r') as f:
    thumbs = json.load(f)

# Build THUMBS JS
thumbs_lines = []
for k in sorted(thumbs.keys(), key=int):
    thumbs_lines.append(f'  {k}: "{thumbs[k]}",')
thumbs_js = "const THUMBS = {\n" + "\n".join(thumbs_lines) + "\n};"

# HTML template
HTML_TOP = r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>User Test Analysis — Benson Session 1</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #0d1117; color: #c9d1d9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size: 13px; line-height: 1.5;
}
.dashboard { max-width: 1800px; margin: 0 auto; padding: 20px 28px 48px; }
.header { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(48,54,61,0.6); display: flex; align-items: flex-start; justify-content: space-between; }
.header-left { flex: 1; }
.header-title { font-size: 18px; font-weight: 600; color: #e6edf3; }
.header-sub { font-size: 11px; color: #8b949e; margin-top: 3px; }
.kpi-row { display: flex; gap: 10px; margin-top: 8px; }
.kpi { background: rgba(22,27,34,0.88); border: 1px solid rgba(48,54,61,0.7); border-radius: 7px; padding: 5px 12px; text-align: center; }
.kpi-value { font-size: 16px; font-weight: 700; color: #c9d1d9; }
.kpi-label { font-size: 9px; color: #6e7681; text-transform: uppercase; letter-spacing: 0.5px; }
.view-toggle { display: flex; gap: 0; border: 1px solid rgba(48,54,61,0.7); border-radius: 7px; overflow: hidden; margin-top: 8px; }
.view-btn {
  background: rgba(22,27,34,0.7); color: #8b949e; border: none; padding: 6px 16px;
  font-size: 11px; font-weight: 600; cursor: pointer; letter-spacing: 0.3px;
  transition: background 0.15s, color 0.15s;
}
.view-btn.active { background: rgba(88,166,255,0.15); color: #c9d1d9; }
.view-btn:hover:not(.active) { background: rgba(48,54,61,0.5); }
.legend-row { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 10px; }
.legend-item { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #8b949e; }
.leg-sw { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.leg-sw.diamond { border-radius: 2px; transform: rotate(45deg); width: 8px; height: 8px; }
.leg-sw.ring { background: transparent !important; border: 2px solid; }
.tracks-container { background: rgba(13,17,23,0.6); border: 1px solid rgba(48,54,61,0.5); border-radius: 10px; overflow: hidden; }
.track { position: relative; border-bottom: 1px solid rgba(48,54,61,0.3); }
.track:last-child { border-bottom: none; }
.track-label {
  position: absolute; left: 0; top: 0; width: 110px; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(22,27,34,0.75); border-right: 1px solid rgba(48,54,61,0.4);
  font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.7px;
  color: #8b949e; text-align: center; padding: 4px; z-index: 2;
}
.track svg { display: block; width: 100%; }
.tooltip {
  position: fixed; pointer-events: none;
  background: rgba(22,27,34,0.95); backdrop-filter: blur(10px);
  border: 1px solid rgba(48,54,61,0.8); border-radius: 7px;
  padding: 8px 11px; font-size: 11px; max-width: 300px;
  z-index: 1000; opacity: 0; transition: opacity 0.12s ease;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.tooltip.visible { opacity: 1; }
.tt-time { color: #58a6ff; font-weight: 600; font-size: 10px; margin-bottom: 2px; }
.tt-title { color: #e6edf3; font-weight: 600; margin-bottom: 1px; }
.tt-quote { color: #a5d6ff; font-style: italic; margin-top: 3px; font-size: 10px; }
.tt-detail { color: #8b949e; font-size: 10px; }
.insights-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
.insight-card { background: rgba(22,27,34,0.6); border: 1px solid rgba(48,54,61,0.45); border-radius: 9px; padding: 12px 14px; }
.insight-card-title { font-size: 12px; font-weight: 700; color: #c9d1d9; margin-bottom: 5px; }
.insight-card-body { font-size: 11px; color: #6e7681; line-height: 1.5; }
.insight-card-quote { margin-top: 6px; padding: 6px 9px; background: rgba(139,148,158,0.04); border-left: 2px solid rgba(139,148,158,0.3); border-radius: 0 4px 4px 0; font-style: italic; color: #8b949e; font-size: 10px; }
.time-axis-track { background: rgba(22,27,34,0.5); }
.time-axis-track .tick text { fill: #8b949e; font-size: 10px; }
.time-axis-track .tick line, .time-axis-track .domain { stroke: rgba(48,54,61,0.6); }
.batch-label { font-size: 8px; fill: rgba(139,148,158,0.5); text-anchor: middle; }
@media print {
  body { background: #fff; color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tooltip { display: none; } .view-toggle { display: none; }
}
</style>
</head>
<body>
<div class="dashboard">
  <div class="header">
    <div class="header-left">
      <div class="header-title">User Test Analysis: Process Timeline</div>
      <div class="header-sub">
        <strong>Benson (Beichen Xie)</strong> &mdash; Footwear Designer &mdash; Session 1
        &nbsp;|&nbsp; Task: Futuristic trail runner &times; Doge meme
        &nbsp;|&nbsp; 58 min 55 sec
      </div>
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-value">16</div><div class="kpi-label">Batches</div></div>
        <div class="kpi"><div class="kpi-value">26</div><div class="kpi-label">Images</div></div>
        <div class="kpi"><div class="kpi-value">5</div><div class="kpi-label">Agent Gens</div></div>
        <div class="kpi"><div class="kpi-value">1</div><div class="kpi-label">Axis Change</div></div>
      </div>
    </div>
    <div>
      <div style="font-size:10px;color:#6e7681;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">View Mode</div>
      <div class="view-toggle">
        <button class="view-btn active" id="btn-timeline">Timeline</button>
        <button class="view-btn" id="btn-batch">Batch</button>
        <button class="view-btn" id="btn-thumbnail">Thumbnail</button>
      </div>
    </div>
  </div>
  <div class="legend-row" id="legend"></div>
  <div class="tracks-container" id="tracks"></div>
  <div class="insights-row">
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
  </div>
</div>
<div class="tooltip" id="tooltip">
  <div class="tt-time" id="tt-time"></div>
  <div class="tt-title" id="tt-title"></div>
  <div class="tt-detail" id="tt-detail"></div>
  <div class="tt-quote" id="tt-quote"></div>
</div>
<script>
'''

HTML_BOT = r'''
const DUR = 58 * 60 + 55;
const ML = 118, MR = 44;

const PHASES = [
  { label: "Onboarding", start: 0, end: 16.5*60, color: "#58a6ff" },
  { label: "Exploration", start: 16.5*60, end: 55*60, color: "#3fb950" },
  { label: "Evaluation", start: 55*60, end: DUR, color: "#fbbf24" },
];

const BATCHES = [
  { idx: 0,  t: 0,        label: "Initial Reference" },
  { idx: 1,  t: 17.5*60,  label: "Load Doge Refs" },
  { idx: 2,  t: 22.4*60,  label: "Agent: Mycelium Trail" },
  { idx: 3,  t: 25.5*60,  label: "Iterate: Ref+Agent" },
  { idx: 4,  t: 27*60,    label: "Agent: Metallic Armor" },
  { idx: 5,  t: 30*60,    label: "Iterate: Tan Leather" },
  { idx: 6,  t: 32*60,    label: "Iterate: Apply to Diff" },
  { idx: 7,  t: 34*60,    label: "Batch: Translucent TPU" },
  { idx: 8,  t: 37*60,    label: "Iterate: Doge+Translucent" },
  { idx: 9,  t: 38*60,    label: "Agent: Topographic" },
  { idx: 10, t: 39*60,    label: "Iterate: Doge Trail" },
  { idx: 11, t: 42*60,    label: "Agent: Liquid Metal" },
  { idx: 12, t: 45*60,    label: "Iterate: Furry+Sculptural" },
  { idx: 13, t: 47*60,    label: "Agent: Exoskeletal" },
  { idx: 14, t: 49*60,    label: "Iterate: Metallic Sheen" },
  { idx: 15, t: 53*60,    label: "Iterate: Final Sculptural" },
];

const N = [
  { id:0,  batch:0,  lane:1, src:"external",  label:"Reference Images",       par:[], prompt:"Reference images" },
  { id:1,  batch:1,  lane:0, src:"reference",  label:"Doge Ref #1",           par:[0], prompt:"doge meme, trail-to-street shoe" },
  { id:2,  batch:1,  lane:2, src:"reference",  label:"Doge Ref #2",           par:[0], prompt:"doge meme, trail-to-street shoe" },
  { id:3,  batch:2,  lane:1, src:"agent",      label:"Mycelium Trail Runner", par:[0], prompt:"sculpted mycelium uppers, bio-luminescent honeycomb sole" },
  { id:4,  batch:3,  lane:0, src:"reference",  label:"Doge+Mycelium #1",      par:[0,3], prompt:"Trail runner with doge, tan fur, pointed ears" },
  { id:5,  batch:3,  lane:2, src:"reference",  label:"Doge+Mycelium #2",      par:[0,3], prompt:"Trail runner with doge, tan fur, pointed ears" },
  { id:6,  batch:4,  lane:1, src:"agent",      label:"Metallic Armor",        par:[0,3], prompt:"segmented metallic armor, sharp geometric lines" },
  { id:7,  batch:5,  lane:0, src:"reference",  label:"Tan Leather #1",        par:[4,5], prompt:"tan leather, bubble sole, contrast trim" },
  { id:8,  batch:5,  lane:2, src:"reference",  label:"Tan Leather #2",        par:[4,5], prompt:"tan leather, bubble sole, contrast trim" },
  { id:9,  batch:6,  lane:0, src:"reference",  label:"Apply Style #1",        par:[2,6], prompt:"apply tan leather, bubble sole, dog motif" },
  { id:10, batch:6,  lane:2, src:"reference",  label:"Apply Style #2",        par:[2,6], prompt:"apply tan leather, bubble sole, dog motif" },
  { id:11, batch:7,  lane:0, src:"batch",      label:"Translucent TPU #1",    par:[], prompt:"translucent TPU, neon orange, fluid lines" },
  { id:12, batch:7,  lane:2, src:"batch",      label:"Translucent TPU #2",    par:[], prompt:"translucent TPU, neon orange, fluid lines" },
  { id:13, batch:8,  lane:0, src:"reference",  label:"Doge+Translucent #1",   par:[0,11], prompt:"meme dog, surprised expression, light brown fur" },
  { id:14, batch:8,  lane:2, src:"reference",  label:"Doge+Translucent #2",   par:[0,11], prompt:"meme dog, surprised expression, light brown fur" },
  { id:15, batch:9,  lane:1, src:"agent",      label:"Topographic Contours",  par:[0,11], prompt:"topographic contour lines, translucent layered upper" },
  { id:16, batch:10, lane:0, src:"reference",  label:"Doge Trail #1",         par:[0,11], prompt:"trail runner with doge, orange and white, fluffy" },
  { id:17, batch:10, lane:2, src:"reference",  label:"Doge Trail #2",         par:[0,11], prompt:"trail runner with doge, orange and white, fluffy" },
  { id:18, batch:11, lane:1, src:"agent",      label:"Liquid Metal",          par:[], prompt:"streamlined liquid-metal upper, concealed fasteners" },
  { id:19, batch:12, lane:0, src:"reference",  label:"Furry+Sculptural #1",   par:[0,18], prompt:"furry texture, sculptural sole" },
  { id:20, batch:12, lane:2, src:"reference",  label:"Furry+Sculptural #2",   par:[0,18], prompt:"furry texture, sculptural sole" },
  { id:21, batch:13, lane:1, src:"agent",      label:"Exoskeletal Plating",   par:[0,18], prompt:"adaptive exoskeletal plating, bio-luminescent" },
  { id:22, batch:14, lane:0, src:"reference",  label:"Metallic Sheen #1",     par:[11,19], prompt:"metallic sheen, sculptural sole, futuristic" },
  { id:23, batch:14, lane:2, src:"reference",  label:"Metallic Sheen #2",     par:[11,19], prompt:"metallic sheen, sculptural sole, futuristic" },
  { id:24, batch:15, lane:0, src:"reference",  label:"Final Sculptural #1",   par:[21,22], prompt:"sculptural sole, organic forms, metallic silver" },
  { id:25, batch:15, lane:2, src:"reference",  label:"Final Sculptural #2",   par:[21,22], prompt:"sculptural sole, organic forms, metallic silver" },
];

const PROMPTS = [
  { t: 17.5*60,  batch:1,  mode:"freetext", snippet:"doge meme, trail-to-street shoe" },
  { t: 25.5*60,  batch:3,  mode:"freetext", snippet:"Trail runner with doge, tan fur" },
  { t: 30*60,    batch:5,  mode:"freetext", snippet:"Tan leather, bubble sole, contrast trim" },
  { t: 32*60,    batch:6,  mode:"freetext", snippet:"Apply tan leather, dog motif" },
  { t: 34*60,    batch:7,  mode:"mixed",    snippet:"Translucent TPU, neon orange, fluid lines" },
  { t: 37*60,    batch:8,  mode:"freetext", snippet:"Meme dog expression, light brown fur" },
  { t: 39*60,    batch:10, mode:"freetext", snippet:"Doge trail runner, orange, fluffy" },
  { t: 45*60,    batch:12, mode:"freetext", snippet:"Furry texture, sculptural sole" },
  { t: 49*60,    batch:14, mode:"freetext", snippet:"Metallic sheen, sculptural sole" },
  { t: 53*60,    batch:15, mode:"freetext", snippet:"Sculptural sole, organic forms, metallic silver" },
];

const AXES = [
  { start:0, end:24.15*60, left:"Formal", right:"Sporty" },
  { start:24.15*60, end:DUR, left:"Retro", right:"Futuristic" },
];

const CANVAS = [
  { t: 10.6*60,  label:"Isolate" },
  { t: 10.8*60,  label:"Unhide" },
  { t: 11.8*60,  label:"Recenter" },
  { t: 50*60,    label:"Delete batch" },
  { t: 51.2*60,  label:"Isolate" },
  { t: 51.3*60,  label:"Zoom fail" },
];

const C = {
  external: "#f97316", reference: "#58a6ff", agent: "#a855f7", batch: "#22c55e",
  del: "#484f58", star: "#fbbf24",
  edge: "rgba(139,148,158,0.3)",
  tags: "#14b8a6", mixed: "#22c55e", freetext: "#a5d6ff",
  axis: "#58a6ff", canvas: "#6e7681",
};

function nodeColor(n) {
  if (n.src === "agent") return C.agent;
  if (n.src === "external") return C.external;
  if (n.src === "batch") return C.batch;
  return C.reference;
}

const W = Math.min(1800, window.innerWidth - 56);
const plotW = W - ML - MR;
let viewMode = "timeline";

function xTimeline(t) { return ML + (t / DUR) * plotW; }
function xBatch(batchIdx) { return ML + ((batchIdx + 0.5) / BATCHES.length) * plotW; }
function getX(node) {
  const b = BATCHES[node.batch];
  return viewMode === "timeline" ? xTimeline(b.t) : xBatch(node.batch);
}
function getXraw(t, batchIdx) {
  return viewMode === "timeline" ? xTimeline(t) : xBatch(batchIdx);
}

const fmt = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

const tip = d3.select("#tooltip");
function showTip(ev, d) {
  d3.select("#tt-time").text(d.time != null ? fmt(d.time) : "");
  d3.select("#tt-title").text(d.title || "");
  d3.select("#tt-detail").text(d.detail || "");
  const q = d3.select("#tt-quote");
  q.text(d.quote ? `"${d.quote}"` : "").style("display", d.quote ? "block" : "none");
  tip.classed("visible", true);
  tip.style("left", Math.min(ev.clientX+12,window.innerWidth-320)+"px")
     .style("top", Math.min(ev.clientY-8,window.innerHeight-160)+"px");
}
function moveTip(ev) {
  tip.style("left", Math.min(ev.clientX+12,window.innerWidth-320)+"px")
     .style("top", Math.min(ev.clientY-8,window.innerHeight-160)+"px");
}
function hideTip() { tip.classed("visible", false); }

// Legend
const leg = d3.select("#legend");
[
  { color: C.external, cls:"diamond", text:"External/Loaded" },
  { color: C.reference, cls:"", text:"User Iteration" },
  { color: C.batch, cls:"", text:"Batch (Text-to-Image)" },
  { color: C.agent, cls:"", text:"Agent Generated" },
  { color: C.tags, cls:"", text:"Prompt: Tags" },
  { color: C.mixed, cls:"", text:"Prompt: Mixed" },
  { color: C.freetext, cls:"", text:"Prompt: Freetext" },
].forEach(l => {
  const el = leg.append("div").attr("class","legend-item");
  const sw = el.append("span").attr("class","leg-sw " + l.cls).style("background", l.color);
  if (l.cls === "ring") sw.style("background","transparent").style("border-color", l.color);
  el.append("span").text(l.text);
});

// ═══════════════════════════════════════════════════════════════════
function renderAll() {
  d3.select("#tracks").html("");
  const tracks = d3.select("#tracks");
  const isThumbnail = viewMode === "thumbnail";

  function drawPhases(g, h) {
    if (viewMode === "timeline") {
      PHASES.forEach(p => {
        g.append("rect").attr("x", xTimeline(p.start)).attr("y",0)
          .attr("width", xTimeline(p.end)-xTimeline(p.start)).attr("height",h)
          .attr("fill",p.color).attr("opacity",0.03);
      });
    }
  }

  function drawGrid(g, h) {
    if (viewMode === "timeline") {
      d3.range(10*60, DUR, 10*60).forEach(t => {
        g.append("line").attr("x1",xTimeline(t)).attr("x2",xTimeline(t))
          .attr("y1",0).attr("y2",h)
          .attr("stroke","rgba(48,54,61,0.2)").attr("stroke-width",0.5);
      });
    } else {
      BATCHES.forEach((b,i) => {
        g.append("line").attr("x1",xBatch(i)).attr("x2",xBatch(i))
          .attr("y1",0).attr("y2",h)
          .attr("stroke","rgba(48,54,61,0.12)").attr("stroke-width",0.5);
      });
    }
  }

  // ─── TRACK 1: GENEALOGY TREE ───
  (function() {
    const thumbSize = isThumbnail ? 64 : 0;
    const h = isThumbnail ? 520 : 320;
    const div = tracks.append("div").attr("class","track");
    div.append("div").attr("class","track-label").html("Design<br>Genealogy");
    const svg = div.append("svg").attr("width",W).attr("height",h);
    const defs = svg.append("defs");
    const g = svg.append("g");
    drawPhases(g, h);
    drawGrid(g, h);

    if (viewMode === "timeline") {
      PHASES.forEach(p => {
        g.append("text").attr("x",(xTimeline(p.start)+xTimeline(p.end))/2).attr("y",13)
          .attr("text-anchor","middle").attr("font-size",9)
          .attr("fill",p.color).attr("opacity",0.45).attr("letter-spacing","0.6px")
          .text(p.label.toUpperCase());
      });
    }

    const maxLane = 3;
    const topPad = isThumbnail ? 55 : 42;
    const botPad = isThumbnail ? 45 : 24;
    const laneY = d3.scaleLinear().domain([0, maxLane]).range([topPad, h - botPad]);

    const pos = {};
    N.forEach(n => { pos[n.id] = { x: getX(n), y: laneY(n.lane) }; });

    // Edges
    const edgeG = g.append("g");
    N.forEach(n => {
      if (!n.par.length) return;
      n.par.forEach(pid => {
        if (pos[pid] === undefined) return;
        const px = pos[pid].x, py = pos[pid].y;
        const nx = pos[n.id].x, ny = pos[n.id].y;
        const mx = (px + nx) / 2;
        edgeG.append("path")
          .attr("d", `M${px},${py} C${mx},${py} ${mx},${ny} ${nx},${ny}`)
          .attr("stroke", C.edge).attr("stroke-width", isThumbnail ? 0.7 : 1.1).attr("fill","none");
      });
    });

    // Batch columns
    if (viewMode !== "timeline") {
      BATCHES.forEach((b,i) => {
        const bx = xBatch(i);
        const colW = plotW / BATCHES.length;
        g.append("rect").attr("x", bx - colW/2).attr("y", 0)
          .attr("width", colW).attr("height", h)
          .attr("fill", i%2===0 ? "rgba(255,255,255,0.015)" : "transparent");
      });
    }

    // Nodes
    const nodeG = g.append("g");
    N.forEach(n => {
      const cx = pos[n.id].x, cy = pos[n.id].y;
      const color = nodeColor(n);

      const ng = nodeG.append("g").style("cursor","pointer")
        .on("mouseenter", ev => {
          let det = `${n.src} | ID: ${n.id}`;
          if (n.par.length) det += ` | Parents: ${n.par.join(',')}`;
          showTip(ev, { time: BATCHES[n.batch].t, title: n.label, detail: det, quote: n.prompt });
        })
        .on("mousemove", moveTip).on("mouseleave", hideTip);

      if (isThumbnail) {
        const ts = thumbSize;
        const bw = 3;
        // Border
        ng.append("rect")
          .attr("x", cx - ts/2 - bw).attr("y", cy - ts/2 - bw)
          .attr("width", ts + bw*2).attr("height", ts + bw*2)
          .attr("rx", 6).attr("fill", color);
        // Clip path for rounded corners
        const clipId = `clip-${n.id}`;
        defs.append("clipPath").attr("id", clipId)
          .append("rect").attr("x", cx - ts/2).attr("y", cy - ts/2)
          .attr("width", ts).attr("height", ts).attr("rx", 4);
        // Image
        if (THUMBS[n.id]) {
          ng.append("image")
            .attr("href", THUMBS[n.id])
            .attr("x", cx - ts/2).attr("y", cy - ts/2)
            .attr("width", ts).attr("height", ts)
            .attr("preserveAspectRatio", "xMidYMid slice")
            .attr("clip-path", `url(#${clipId})`);
        }
        // ID label below
        ng.append("text").attr("x",cx).attr("y",cy + ts/2 + 14)
          .attr("text-anchor","middle").attr("font-size",8).attr("fill","#6e7681")
          .text(`#${n.id}`);
        // Agent badge (top-right)
        if (n.src === "agent") {
          ng.append("circle").attr("cx", cx + ts/2 + bw - 2).attr("cy", cy - ts/2 - bw + 2)
            .attr("r", 7).attr("fill", "#0d1117").attr("stroke", C.agent).attr("stroke-width", 1.5);
          ng.append("text").attr("x", cx + ts/2 + bw - 2).attr("y", cy - ts/2 - bw + 3)
            .attr("text-anchor","middle").attr("dominant-baseline","central")
            .attr("font-size", 9).attr("fill", C.agent).attr("font-weight",700).text("A");
        }
      } else {
        // Circle/diamond nodes
        const r = 5.5;
        if (n.src === "external") {
          ng.append("rect").attr("x",cx-5.5).attr("y",cy-5.5).attr("width",11).attr("height",11)
            .attr("transform",`rotate(45,${cx},${cy})`).attr("fill",color).attr("rx",1.5);
        } else {
          ng.append("circle").attr("cx",cx).attr("cy",cy).attr("r",r).attr("fill",color);
        }
        if (n.src === "agent") {
          ng.append("text").attr("x",cx + r + 4).attr("y",cy + 1)
            .attr("font-size",8).attr("font-weight",700).attr("fill","rgba(168,85,247,0.7)")
            .attr("dominant-baseline","middle").text("A");
        }
        ng.append("text").attr("x",cx).attr("y",cy + 15)
          .attr("text-anchor","middle").attr("font-size",7.5).attr("fill","#6e7681")
          .text(n.label.length > 18 ? n.label.slice(0,16)+".." : n.label);
      }
    });

    if (viewMode !== "timeline") {
      BATCHES.forEach((b,i) => {
        g.append("text").attr("class","batch-label")
          .attr("x",xBatch(i)).attr("y",h-4).text(`B${i}`);
      });
    }
  })();

  // ─── TRACK 2: PROMPTS ───
  (function() {
    const h = 62;
    const div = tracks.append("div").attr("class","track");
    div.append("div").attr("class","track-label").style("color","#58a6ff").text("PROMPTS");
    const svg = div.append("svg").attr("width",W).attr("height",h);
    const g = svg.append("g");
    drawPhases(g, h);
    drawGrid(g, h);

    const lg = g.append("g").attr("transform",`translate(${ML+6},5)`);
    [{l:"Tags",c:C.tags},{l:"Mixed",c:C.mixed},{l:"Freetext",c:C.freetext}].forEach((item,i) => {
      lg.append("rect").attr("x",i*70).attr("y",0).attr("width",8).attr("height",8).attr("rx",2).attr("fill",item.c);
      lg.append("text").attr("x",i*70+11).attr("y",8).attr("font-size",9).attr("fill","#6e7681").text(item.l);
    });

    const barW = 11;
    const maxH = h - 20;

    PROMPTS.forEach(p => {
      const bx = getXraw(p.t, p.batch);
      const bh = maxH * 0.5 + (p.snippet.length / 60) * maxH * 0.5;
      const clampH = Math.min(bh, maxH);
      const color = p.mode === "tags" ? C.tags : p.mode === "mixed" ? C.mixed : C.freetext;

      const eg = g.append("g").style("cursor","pointer")
        .on("mouseenter", ev => showTip(ev, { time:p.t, title:`Prompt (${p.mode})`, detail:p.snippet }))
        .on("mousemove", moveTip).on("mouseleave", hideTip);

      eg.append("rect").attr("x",bx-barW/2).attr("y",h-6-clampH)
        .attr("width",barW).attr("height",clampH).attr("rx",3)
        .attr("fill",color).attr("opacity",0.7);
    });
  })();

  // ─── TRACK 3: AXES ───
  (function() {
    const h = 42;
    const div = tracks.append("div").attr("class","track");
    div.append("div").attr("class","track-label").style("color",C.axis).text("AXES");
    const svg = div.append("svg").attr("width",W).attr("height",h);
    const g = svg.append("g");
    drawPhases(g, h);
    drawGrid(g, h);

    const bandH = 20, bandY = (h-bandH)/2;
    AXES.forEach((a,i) => {
      let x1, x2;
      if (viewMode === "timeline") {
        x1 = xTimeline(a.start); x2 = xTimeline(a.end);
      } else {
        const startB = BATCHES.findIndex(b => b.t >= a.start);
        const endB = BATCHES.length - 1 - [...BATCHES].reverse().findIndex(b => b.t <= a.end);
        const colW = plotW / BATCHES.length;
        x1 = xBatch(Math.max(0,startB)) - colW/2;
        x2 = xBatch(Math.min(BATCHES.length-1,endB)) + colW/2;
      }
      const ag = g.append("g").style("cursor","pointer")
        .on("mouseenter", ev => showTip(ev, { time:a.start, title:`${a.left} \u2194 ${a.right}`, detail:`Duration: ${fmt(a.end-a.start)}` }))
        .on("mousemove", moveTip).on("mouseleave", hideTip);
      ag.append("rect").attr("x",x1).attr("y",bandY).attr("width",x2-x1).attr("height",bandH)
        .attr("rx",4).attr("fill",C.axis).attr("opacity",0.1);
      ag.append("rect").attr("x",x1).attr("y",bandY).attr("width",x2-x1).attr("height",bandH)
        .attr("rx",4).attr("fill","none").attr("stroke",C.axis).attr("stroke-width",1).attr("opacity",0.3);
      ag.append("text").attr("x",x1+6).attr("y",bandY+bandH/2+1)
        .attr("dominant-baseline","middle").attr("font-size",9).attr("fill",C.axis).attr("opacity",0.7)
        .text("\u25C0 " + a.left);
      ag.append("text").attr("x",x2-6).attr("y",bandY+bandH/2+1)
        .attr("dominant-baseline","middle").attr("text-anchor","end")
        .attr("font-size",9).attr("fill",C.axis).attr("opacity",0.7)
        .text(a.right + " \u25B6");
      if (i > 0) {
        g.append("line").attr("x1",x1).attr("x2",x1).attr("y1",2).attr("y2",h-2)
          .attr("stroke",C.axis).attr("stroke-width",1).attr("stroke-dasharray","3 3").attr("opacity",0.4);
      }
    });
  })();

  // ─── TRACK 4: CANVAS ───
  (function() {
    const h = 50;
    const div = tracks.append("div").attr("class","track");
    div.append("div").attr("class","track-label").text("CANVAS");
    const svg = div.append("svg").attr("width",W).attr("height",h);
    const g = svg.append("g");
    drawPhases(g, h);
    drawGrid(g, h);

    CANVAS.forEach(ev => {
      const cx = viewMode === "timeline" ? xTimeline(ev.t)
        : xBatch(BATCHES.reduce((best, b, i) => Math.abs(b.t - ev.t) < Math.abs(BATCHES[best].t - ev.t) ? i : best, 0));
      const eg = g.append("g").style("cursor","pointer")
        .on("mouseenter", e => showTip(e, { time:ev.t, title:ev.label }))
        .on("mousemove", moveTip).on("mouseleave", hideTip);
      eg.append("line").attr("x1",cx).attr("x2",cx).attr("y1",4).attr("y2",h-16)
        .attr("stroke",C.canvas).attr("stroke-width",0.8).attr("opacity",0.4);
      eg.append("text").attr("x",cx).attr("y",h-4)
        .attr("text-anchor","start").attr("transform",`rotate(-60,${cx},${h-4})`)
        .attr("font-size",8).attr("fill",C.canvas).text(ev.label);
    });
  })();

  // ─── TIME AXIS ───
  (function() {
    const h = 32;
    const div = tracks.append("div").attr("class","track time-axis-track");
    const svg = div.append("svg").attr("width",W).attr("height",h);
    if (viewMode === "timeline") {
      const scale = d3.scaleLinear().domain([0,DUR]).range([ML,ML+plotW]);
      const axis = d3.axisBottom(scale)
        .tickValues(d3.range(0, DUR+1, 5*60))
        .tickFormat(d => fmt(d)).tickSize(5);
      svg.append("g").attr("transform","translate(0,4)").call(axis);
    } else {
      const g = svg.append("g");
      BATCHES.forEach((b,i) => {
        const bx = xBatch(i);
        g.append("text").attr("x",bx).attr("y",14)
          .attr("text-anchor","middle").attr("font-size",8).attr("fill","#6e7681").text(`B${i}`);
        g.append("text").attr("x",bx).attr("y",24)
          .attr("text-anchor","middle").attr("font-size",7).attr("fill","#484f58").text(fmt(b.t));
      });
    }
  })();
}

renderAll();

function setView(mode) {
  viewMode = mode;
  ["timeline","batch","thumbnail"].forEach(m => {
    d3.select(`#btn-${m}`).classed("active", m === mode);
  });
  renderAll();
}
d3.select("#btn-timeline").on("click", () => setView("timeline"));
d3.select("#btn-batch").on("click", () => setView("batch"));
d3.select("#btn-thumbnail").on("click", () => setView("thumbnail"));
</script>
</body>
</html>
'''

# Combine
with open('analysis/user_test_benson_s1.html', 'w', encoding='utf-8') as f:
    f.write(HTML_TOP)
    f.write(thumbs_js + '\n')
    f.write(HTML_BOT)

size = os.path.getsize('analysis/user_test_benson_s1.html')
print(f'Written: {size:,} bytes ({size/1024:.0f} KB)')
