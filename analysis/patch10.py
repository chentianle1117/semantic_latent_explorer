"""patch10: secondary edges arc above the tree — two-pass sort+draw, rainbow nesting"""
PATH = r"w:/CMU_Academics/2025 Fall/Thesis Demo/Zappos50K_semantic_explorer/analysis/user_test_benson_s1.html"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

orig = src

# ─── PATCH 1: Increase topPad in tree mode to give vertical room for arcs ───
OLD1 = "    const topPad = 40;"
NEW1 = "    const topPad = useTree ? 180 : 40;"
assert OLD1 in src, "p10-1 not found"
src = src.replace(OLD1, NEW1)

# ─── PATCH 2: Replace edge loop with two-pass: collect → sort secondary by span → draw ───
OLD2 = r"""    // Edges
    const edgeG = g.append("g");
    N.forEach(n => {
      if (!n.par.length) return;
      n.par.forEach(pid => {
        if (pos[pid] === undefined) return;
        const px = pos[pid].x, py = pos[pid].y;
        const nx = pos[n.id].x, ny = pos[n.id].y;
        const mx = (px + nx) / 2;
        const isPrim = !useTree || primaryPar[n.id] === pid;
        const pNode   = N.find(x => x.id === pid);
        const edgeColor   = !useTree ? C.edge : isPrim ? nodeColor(n) : nodeColor(pNode || n);
        const edgeOpacity = !useTree ? 1 : isPrim ? 0.65 : 0.3; // secondary: faint parent color
        const edgeWidth   = !useTree ? 1.1 : isPrim ? 2.0 : 0.9;
        // Primary straight: H-V-H fold at midpoint-x; secondary straight: H-V fold at target-x (no overlap)
        const pathD = edgeStyle === "straight"
          ? (isPrim
              ? `M${px},${py} L${mx},${py} L${mx},${ny} L${nx},${ny}`
              : `M${px},${py} L${nx},${py} L${nx},${ny}`)
          : `M${px},${py} C${mx},${py} ${mx},${ny} ${nx},${ny}`;
        const path = edgeG.append("path")
          .attr("d", pathD)
          .attr("stroke", edgeColor)
          .attr("stroke-width", edgeWidth)
          .attr("opacity", edgeOpacity)
          .attr("fill","none");
        if (useTree && !isPrim) path.attr("stroke-dasharray", "4 3");
      });
    });"""

NEW2 = r"""    // Edges: two-pass — collect, sort secondary by span, draw above-tree arcs
    const edgeG = g.append("g");
    const primEdges = [], secEdges = [];
    N.forEach(n => {
      if (!n.par.length) return;
      n.par.forEach(pid => {
        if (pos[pid] === undefined) return;
        const px = pos[pid].x, py = pos[pid].y;
        const nx = pos[n.id].x, ny = pos[n.id].y;
        const isPrim = !useTree || primaryPar[n.id] === pid;
        const pNode = N.find(x => x.id === pid);
        (isPrim ? primEdges : secEdges).push({ px, py, nx, ny, n, pNode, isPrim });
      });
    });
    // Sort secondary by span desc: widest span → outermost arc (lowest arcY = highest position)
    secEdges.sort((a, b) => Math.abs(b.nx - b.px) - Math.abs(a.nx - a.px));
    const secRailBase = 8, secRailGap = 8;
    function drawEdge(e, secIdx) {
      const mx = (e.px + e.nx) / 2;
      let pathD;
      if (!e.isPrim) {
        // Arc above the tree — stacked rails, wider span = higher arc (smaller arcY)
        const arcY = secRailBase + secIdx * secRailGap;
        pathD = edgeStyle === "straight"
          ? `M${e.px},${e.py} L${e.px},${arcY} L${e.nx},${arcY} L${e.nx},${e.ny}`
          : `M${e.px},${e.py} C${e.px},${arcY} ${e.nx},${arcY} ${e.nx},${e.ny}`;
      } else if (edgeStyle === "straight" && useTree) {
        pathD = `M${e.px},${e.py} L${mx},${e.py} L${mx},${e.ny} L${e.nx},${e.ny}`;
      } else {
        pathD = `M${e.px},${e.py} C${mx},${e.py} ${mx},${e.ny} ${e.nx},${e.ny}`;
      }
      const edgeColor   = !useTree ? C.edge : e.isPrim ? nodeColor(e.n) : nodeColor(e.pNode || e.n);
      const edgeOpacity = !useTree ? 1 : e.isPrim ? 0.65 : 0.3;
      const edgeWidth   = !useTree ? 1.1 : e.isPrim ? 2.0 : 0.9;
      const path = edgeG.append("path")
        .attr("d", pathD)
        .attr("stroke", edgeColor)
        .attr("stroke-width", edgeWidth)
        .attr("opacity", edgeOpacity)
        .attr("fill", "none");
      if (useTree && !e.isPrim) path.attr("stroke-dasharray", "4 3");
    }
    primEdges.forEach(e => drawEdge(e, 0));
    secEdges.forEach((e, i) => drawEdge(e, i));"""

assert OLD2 in src, "p10-2 not found"
src = src.replace(OLD2, NEW2)

assert src != orig, "No changes made!"
with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)
print("patch10 OK — secondary arcs above tree + topPad=180 in tree mode")
