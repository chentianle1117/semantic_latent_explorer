"""patch9: secondary H-V fold + deleted X cross + axis two-color bands + division line"""
import sys, re

PATH = r"w:/CMU_Academics/2025 Fall/Thesis Demo/Zappos50K_semantic_explorer/analysis/user_test_benson_s1.html"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

orig = src

# ─── PATCH 1: Secondary straight edges → H-V fold at target-x (avoids primary midpoint fold) ───
OLD1 = r"""        // Primary straight: clean H-V-H elbow; secondary straight: direct diagonal (no big rectangles)
        const pathD = edgeStyle === "straight"
          ? (isPrim
              ? `M${px},${py} L${mx},${py} L${mx},${ny} L${nx},${ny}`
              : `M${px},${py} L${nx},${ny}`)
          : `M${px},${py} C${mx},${py} ${mx},${ny} ${nx},${ny}`;"""
NEW1 = r"""        // Primary straight: H-V-H fold at midpoint-x; secondary straight: H-V fold at target-x (no overlap)
        const pathD = edgeStyle === "straight"
          ? (isPrim
              ? `M${px},${py} L${mx},${py} L${mx},${ny} L${nx},${ny}`
              : `M${px},${py} L${nx},${py} L${nx},${ny}`)
          : `M${px},${py} C${mx},${py} ${mx},${ny} ${nx},${ny}`;"""
assert OLD1 in src, "p9-1 not found"
src = src.replace(OLD1, NEW1)

# ─── PATCH 2: Deleted thumbnail border → neutral muted gray (remove red border) ───
OLD2 = r"""        ng.append("rect")
          .attr("x", cx - ts/2 - bw).attr("y", cy - ts/2 - bw)
          .attr("width", ts + bw*2).attr("height", ts + bw*2)
          .attr("rx", 5).attr("fill", "#161b22")
          .attr("stroke", isDel ? "#f85149" : n.star ? "#fbbf24" : nodeColor(n))
          .attr("stroke-opacity", isDel ? 0.75 : n.star ? 0.85 : 0.45)
          .attr("stroke-width", isDel ? 1.5 : n.star ? 1.8 : 1.2);"""
NEW2 = r"""        ng.append("rect")
          .attr("x", cx - ts/2 - bw).attr("y", cy - ts/2 - bw)
          .attr("width", ts + bw*2).attr("height", ts + bw*2)
          .attr("rx", 5).attr("fill", "#161b22")
          .attr("stroke", isDel ? "rgba(139,148,158,0.3)" : n.star ? "#fbbf24" : nodeColor(n))
          .attr("stroke-opacity", isDel ? 1 : n.star ? 0.85 : 0.45)
          .attr("stroke-width", isDel ? 1 : n.star ? 1.8 : 1.2);"""
assert OLD2 in src, "p9-2 not found"
src = src.replace(OLD2, NEW2)

# ─── PATCH 3: Add faint red X cross on deleted thumbnails (after tint/image block) ───
OLD3 = r"""        // Star overlay (top-left gold star)
        if (isStar) {"""
NEW3 = r"""        // Faint red X cross for deleted thumbnails
        if (isDel) {
          const m = 8;
          ng.append("line")
            .attr("x1", cx-ts/2+m).attr("y1", cy-ts/2+m)
            .attr("x2", cx+ts/2-m).attr("y2", cy+ts/2-m)
            .attr("stroke","#f85149").attr("stroke-width",1.5).attr("opacity",0.5);
          ng.append("line")
            .attr("x1", cx+ts/2-m).attr("y1", cy-ts/2+m)
            .attr("x2", cx-ts/2+m).attr("y2", cy+ts/2-m)
            .attr("stroke","#f85149").attr("stroke-width",1.5).attr("opacity",0.5);
        }
        // Star overlay (top-left gold star)
        if (isStar) {"""
assert OLD3 in src, "p9-3 not found"
src = src.replace(OLD3, NEW3)

# ─── PATCH 4: Axis track — two distinct band fill colors (blue P1, amber P2) ───
OLD4 = r"""      ag.append("rect").attr("x",x1).attr("y",bandY).attr("width",x2-x1).attr("height",bandH)
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
      }"""
NEW4 = r"""      const periodColor = i === 0 ? C.reference : "#f59e0b";
      ag.append("rect").attr("x",x1).attr("y",bandY).attr("width",x2-x1).attr("height",bandH)
        .attr("rx",4).attr("fill",periodColor).attr("opacity",i === 0 ? 0.15 : 0.18);
      ag.append("rect").attr("x",x1).attr("y",bandY).attr("width",x2-x1).attr("height",bandH)
        .attr("rx",4).attr("fill","none").attr("stroke",periodColor).attr("stroke-width",1).attr("opacity",0.4);
      ag.append("text").attr("x",x1+6).attr("y",bandY+bandH/2+1)
        .attr("dominant-baseline","middle").attr("font-size",9).attr("fill",periodColor).attr("opacity",0.85)
        .text("\u25C0 " + a.left);
      ag.append("text").attr("x",x2-6).attr("y",bandY+bandH/2+1)
        .attr("dominant-baseline","middle").attr("text-anchor","end")
        .attr("font-size",9).attr("fill",periodColor).attr("opacity",0.85)
        .text(a.right + " \u25B6");
      if (i > 0) {
        // Prominent solid division line in the axis track
        g.append("line").attr("x1",x1).attr("x2",x1).attr("y1",2).attr("y2",h-2)
          .attr("stroke","#e6edf3").attr("stroke-width",1.5).attr("opacity",0.65);
      }"""
assert OLD4 in src, "p9-4 not found"
src = src.replace(OLD4, NEW4)

# ─── PATCH 5: drawPhases — add faint axis-change division line through ALL tracks ───
OLD5 = r"""  function drawPhases(g, h) {
    if (viewMode === "timeline") {
      PHASES.forEach(p => {
        g.append("rect").attr("x", xTimeline(p.start)).attr("y",0)
          .attr("width", xTimeline(p.end)-xTimeline(p.start)).attr("height",h)
          .attr("fill",p.color).attr("opacity",0.03);
      });
    }
  }"""
NEW5 = r"""  function drawPhases(g, h) {
    if (viewMode === "timeline") {
      PHASES.forEach(p => {
        g.append("rect").attr("x", xTimeline(p.start)).attr("y",0)
          .attr("width", xTimeline(p.end)-xTimeline(p.start)).attr("height",h)
          .attr("fill",p.color).attr("opacity",0.03);
      });
      // Faint axis-change division line running through all tracks (Formal/Sporty → Retro/Futuristic)
      const axX = xTimeline(AXES[1].start);
      g.append("line").attr("x1",axX).attr("x2",axX).attr("y1",0).attr("y2",h)
        .attr("stroke","rgba(245,158,11,0.22)").attr("stroke-width",1.5)
        .attr("stroke-dasharray","5 3");
    }
  }"""
assert OLD5 in src, "p9-5 not found"
src = src.replace(OLD5, NEW5)

assert src != orig, "No changes made!"
with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print("patch9 applied OK — 5 changes")
