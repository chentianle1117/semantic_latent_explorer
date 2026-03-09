/**
 * Semantic Canvas Component - D3-based interactive visualization
 * Optimized to prevent canvas shifting on selection changes
 */

import React, { useEffect, useRef, useMemo, useState } from "react";
import * as d3 from "d3";
import { useAppStore } from "../../store/appStore";
import { useProgressStore } from "../../store/progressStore";
import { AxisEditor } from "../AxisEditor/AxisEditor";
import { AxisScaleSlider } from "../AxisScaleSlider/AxisScaleSlider";
import { DeletedImagesPanel } from "../DeletedImagesPanel/DeletedImagesPanel";
import { Minimap } from "../Minimap/Minimap";
import { apiClient } from "../../api/client";
import { getDisplayCategory } from "../../utils/generationCategories";


// ─── Ghost node rendering helper ─────────────────────────────────────────────
// Extracted so it can be called from BOTH the full rebuild path and the
// ghost-only fast path without triggering a complete SVG wipe.
function _renderGhostNodes(
  ghostGroup: d3.Selection<any, any, any, any>,
  ghostParentLinesGroup: d3.Selection<any, any, any, any>,
  ghostNodes: any[],
  coordOffset: number[],
  coordScale: number,
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  toStretched: (bx: number, by: number) => number[],
  ghostSize: number,
  images: any[],
) {
  if (ghostNodes.length === 0) return;

  const ghostNodeElements = ghostGroup
    .selectAll(".ghost-node")
    .data(ghostNodes, (d: any) => d.id)
    .join("g")
    .attr("class", "ghost-node")
    .attr("id", (d: any) => `ghost-${d.id}`)
    .attr("transform", (d: any) => {
      const bx = (d.coordinates[0] + coordOffset[0]) * coordScale;
      const by = (d.coordinates[1] + coordOffset[1]) * coordScale;
      const [sx, sy] = toStretched(bx, by);
      return `translate(${xScale(sx)}, ${yScale(sy)})`;
    })
    .attr("opacity", 1.0)
    .style("cursor", "pointer");

  ghostNodeElements.each(function(d: any) {
    const el = d3.select(this);
    const haloColor = d.source === 'concurrent' ? '#a855f7' : '#14b8a6';

    // ── Scale all sizes relative to ghostSize ────────────────────────────
    const s = ghostSize;
    const sc = Math.max(s / 80, 0.5);
    const fs = {
      label: Math.max(5.5 * sc, 3.5),
      title: Math.max(7 * sc, 4.5),
      body:  Math.max(6 * sc, 4),
      shift: Math.max(5.5 * sc, 3.5),
      btn:   Math.max(7.5 * sc, 5),
    };
    const labelH = Math.max(11 * sc, 7);
    const btnH = Math.max(18 * sc, 11), btnW = Math.max(40 * sc, 24), gap = 4 * sc;

    // ── Text wrapping helper — splits text into lines that fit maxW ────
    const wrapLines = (text: string, fontSize: number, maxW: number): string[] => {
      const charW = fontSize * 0.52;
      const maxChars = Math.max(Math.floor(maxW / charW), 10);
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const word = w.length > maxChars ? w.slice(0, maxChars - 1) + '…' : w;
        const test = cur ? `${cur} ${word}` : word;
        if (test.length > maxChars && cur) { lines.push(cur); cur = word; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      return lines.length > 0 ? lines : [text.slice(0, maxChars)];
    };

    // ── Build info card rows (with pre-computed wrapping) ─────────────
    type WrapRow = { type: 'title' | 'body' | 'shift'; lines: string[]; lineH: number; totalH: number };
    const cardMaxW = Math.max(s * 1.3, 90 * sc);
    const ttPad = 4 * sc;
    const innerW = cardMaxW - ttPad * 2;
    const cardRows: WrapRow[] = [];

    if (d.source === 'concurrent' && d.this_explores) {
      const lines = wrapLines(d.this_explores, fs.title, innerW);
      const lh = fs.title * 1.25;
      cardRows.push({ type: 'title', lines, lineH: lh, totalH: lines.length * lh });
      if (d.key_shifts?.length) {
        (d.key_shifts as string[]).slice(0, 2).forEach((sh: string) => {
          const sLines = wrapLines(`› ${sh}`, fs.shift, innerW);
          const slh = fs.shift * 1.25;
          cardRows.push({ type: 'shift', lines: sLines, lineH: slh, totalH: sLines.length * slh });
        });
      }
    } else if (d.source === 'exploration') {
      if (d.target_region) {
        const lines = wrapLines(d.target_region, fs.title, innerW);
        const lh = fs.title * 1.25;
        cardRows.push({ type: 'title', lines, lineH: lh, totalH: lines.length * lh });
      }
      if (d.contrasts_with) {
        const lines = wrapLines(d.contrasts_with, fs.body, innerW);
        const lh = fs.body * 1.25;
        cardRows.push({ type: 'body', lines, lineH: lh, totalH: lines.length * lh });
      }
    } else {
      const txt = d.reasoning || d.prompt || '';
      if (txt) {
        const lines = wrapLines(txt, fs.body, innerW);
        const lh = fs.body * 1.25;
        cardRows.push({ type: 'body', lines, lineH: lh, totalH: lines.length * lh });
      }
    }

    const ttH = cardRows.length > 0
      ? cardRows.reduce((a, r) => a + r.totalH + 2 * sc, 0) + ttPad * 2
      : 0;

    // ── Vertical layout: shoe → label → parent → card → buttons ──────
    const hasParents = d.parents && d.parents.length > 0;
    let curY = s / 2 + 2 * sc;
    const labelY = curY;
    curY += labelH + 2 * sc;
    const parentY = curY;
    if (hasParents) curY += labelH + 2 * sc;
    const cardY = curY;
    if (ttH > 0) curY += ttH + 2 * sc;
    const btnY = curY;

    // ── Hit area ──────────────────────────────────────────────────────
    const hitWidth = Math.max(cardMaxW, s + 8 * sc, btnW * 2 + gap + 8 * sc);
    const hitTop = -s / 2 - s * 0.3;
    const hitBottom = btnY + btnH + 4 * sc;
    el.append("rect")
      .attr("class", "ghost-hit")
      .attr("x", -hitWidth / 2).attr("y", hitTop)
      .attr("width", hitWidth).attr("height", hitBottom - hitTop)
      .attr("rx", 6 * sc).attr("fill", "transparent")
      .attr("pointer-events", "all");

    // ── Soft radial glow BEHIND shoe (circle + CSS blur) ──────────────
    // Subtle halo at rest; brightens on hover to reveal info/actions
    el.append("circle")
      .attr("class", "ghost-glow-bg")
      .attr("cx", 0).attr("cy", 0)
      .attr("r", s * 0.55)
      .attr("fill", haloColor)
      .attr("opacity", 0.12)
      .style("filter", `blur(${Math.max(s * 0.2, 8)}px)`)
      .style("pointer-events", "none");

    // ── Shoe image — same opacity as regular canvas shoes ───────────
    // Ghost sits quietly alongside real shoes; labels/buttons hidden until hover
    el.append("image")
      .attr("class", "ghost-shoe-img")
      .attr("x", -s / 2).attr("y", -s / 2)
      .attr("width", s).attr("height", s)
      .attr("href", d.base64_image)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("opacity", 0.8).style("pointer-events", "none");

    // ── Info group (hidden at rest, shown on hover) ───────────────────
    // All labels, parent strips, cards, and action buttons live here
    // so the ghost is just a subtle image+halo until the user hovers
    const infoGroup = el.append("g").attr("class", "ghost-info").attr("display", "none");

    // ── Label pill ──────────────────────────────────────────────────
    const isExploration = d.source === 'exploration' && d.target_region;
    const labelMaxW = s * 0.95;
    const labelCharW = fs.label * 0.52;
    const labelMaxChars = Math.max(Math.floor(labelMaxW / labelCharW), 8);
    const rawLabel = isExploration ? d.target_region : (d.prompt || 'AI suggestion');
    const shortLabel = rawLabel.length > labelMaxChars
      ? rawLabel.slice(0, labelMaxChars - 1) + '…'
      : rawLabel;

    infoGroup.append("rect")
      .attr("x", -labelMaxW / 2).attr("y", labelY)
      .attr("width", labelMaxW).attr("height", labelH)
      .attr("rx", labelH / 2)
      .attr("fill", isExploration ? `${haloColor}22` : "rgba(13,17,23,0.85)")
      .attr("stroke", `${haloColor}44`).attr("stroke-width", 0.6)
      .style("pointer-events", "none");
    infoGroup.append("text")
      .attr("x", 0).attr("y", labelY + labelH * 0.72)
      .attr("text-anchor", "middle").attr("font-size", fs.label)
      .attr("fill", isExploration ? haloColor : "rgba(200,210,220,0.9)")
      .style("pointer-events", "none")
      .text(shortLabel);

    // ── Parent reference strip ────────────────────────────────────────
    if (hasParents) {
      const parentLabel = `← ref ${d.parents.map((id: number) => `#${id}`).join(', ')}`;
      infoGroup.append("rect")
        .attr("x", -labelMaxW / 2).attr("y", parentY)
        .attr("width", labelMaxW).attr("height", labelH)
        .attr("rx", labelH / 2)
        .attr("fill", `${haloColor}15`)
        .attr("stroke", `${haloColor}44`).attr("stroke-width", 0.6)
        .style("pointer-events", "none");
      infoGroup.append("text")
        .attr("x", 0).attr("y", parentY + labelH * 0.72)
        .attr("text-anchor", "middle").attr("font-size", fs.shift)
        .attr("fill", haloColor).style("pointer-events", "none")
        .text(parentLabel);

      // Dashed line to parent shoes (also hidden at rest via ghost-parent-lines group)
      const gbx = (d.coordinates[0] + coordOffset[0]) * coordScale;
      const gby = (d.coordinates[1] + coordOffset[1]) * coordScale;
      const [gsx, gsy] = toStretched(gbx, gby);
      const gx = xScale(gsx), gy = yScale(gsy);
      d.parents.forEach((parentId: number) => {
        const parentImg = images.find((img: any) => img.id === parentId);
        if (!parentImg?.coordinates) return;
        const pbx = (parentImg.coordinates[0] + coordOffset[0]) * coordScale;
        const pby = (parentImg.coordinates[1] + coordOffset[1]) * coordScale;
        const [psx, psy] = toStretched(pbx, pby);
        const px2 = xScale(psx), py2 = yScale(psy);
        const cmx = (gx + px2) / 2;
        const cmy = (gy + py2) / 2 - Math.abs(gy - py2) * 0.25 - 15;
        ghostParentLinesGroup.append("path")
          .attr("d", `M ${gx},${gy} Q ${cmx},${cmy} ${px2},${py2}`)
          .attr("fill", "none").attr("stroke", haloColor)
          .attr("stroke-width", 1.2).attr("stroke-dasharray", "4,3")
          .attr("opacity", 0.45).style("pointer-events", "none");
      });
    }

    // ── Action buttons (Keep / Skip) ────────────────────────────────
    const actionGroup = infoGroup.append("g").attr("class", "ghost-actions");

    if (cardRows.length > 0) {
      actionGroup.append("rect")
        .attr("x", -cardMaxW / 2).attr("y", cardY)
        .attr("width", cardMaxW).attr("height", ttH)
        .attr("rx", 4 * sc).attr("fill", "rgba(13,17,23,0.92)")
        .attr("stroke", `${haloColor}44`).attr("stroke-width", Math.max(0.6 * sc, 0.4))
        .style("pointer-events", "none");
      let ty = cardY + ttPad;
      cardRows.forEach((row) => {
        const rowFs = fs[row.type] || fs.body;
        const rowFill = row.type === 'title' ? haloColor
          : row.type === 'shift' ? `${haloColor}cc`
          : 'rgba(200,215,230,0.85)';
        const textEl = actionGroup.append("text")
          .attr("x", -cardMaxW / 2 + ttPad).attr("y", ty + rowFs)
          .attr("font-size", rowFs).attr("fill", rowFill)
          .style("pointer-events", "none");
        if (row.type === 'title') textEl.attr("font-weight", "700");
        row.lines.forEach((line, i) => {
          textEl.append("tspan")
            .attr("x", -cardMaxW / 2 + ttPad)
            .attr("dy", i === 0 ? 0 : row.lineH)
            .text(line);
        });
        ty += row.totalH + 2 * sc;
      });
    }

    // Keep / Skip buttons
    const keepX = -(btnW + gap / 2), skipX = gap / 2;
    const acceptBg = actionGroup.append("rect")
      .attr("x", keepX).attr("y", btnY).attr("width", btnW).attr("height", btnH)
      .attr("rx", btnH / 2).attr("fill", "rgba(34,197,94,0.88)").style("cursor", "pointer");
    actionGroup.append("text")
      .attr("x", keepX + btnW / 2).attr("y", btnY + btnH * 0.68)
      .attr("text-anchor", "middle").attr("font-size", fs.btn).attr("font-weight", "700")
      .attr("fill", "#0d1117").style("pointer-events", "none").text("✓ Keep");
    const discardBg = actionGroup.append("rect")
      .attr("x", skipX).attr("y", btnY).attr("width", btnW).attr("height", btnH)
      .attr("rx", btnH / 2).attr("fill", "rgba(239,68,68,0.88)").style("cursor", "pointer");
    actionGroup.append("text")
      .attr("x", skipX + btnW / 2).attr("y", btnY + btnH * 0.68)
      .attr("text-anchor", "middle").attr("font-size", fs.btn).attr("font-weight", "700")
      .attr("fill", "white").style("pointer-events", "none").text("✕ Skip");

    acceptBg.on("click", async function(event: any) {
      event.stopPropagation();
      el.style("pointer-events", "none");

      // Optimistic: remove ghost immediately so the canvas feels instantaneous
      useAppStore.getState().removeGhostNode(d.id);

      const ps = useProgressStore.getState();
      const taskId = ps.showProgress("loading", "Accepting suggestion…", true);
      // Immediately minimize — this is a background task
      ps.minimizeTask?.(taskId);
      try {
        const result = await apiClient.addExternalImages({
          images: [{ url: d.base64_image }],
          prompt: d.prompt || 'AI suggested shoe',
          generation_method: 'agent',
          remove_background: true,
          parent_ids: d.parents || [],
          // Pass ghost's precomputed coordinates to skip re-projection (no camera jump)
          precomputed_coordinates: d.coordinates as [number, number],
        });
        if (result?.images?.length > 0) {
          // Override coordinates with ghost's precomputed position to prevent canvas shift
          const imagesWithGhostCoords = result.images.map((img: any) => ({
            ...img,
            coordinates: d.coordinates,
          }));
          const newIds = imagesWithGhostCoords.map((img: any) => img.id);
          useAppStore.getState().mergeImages(imagesWithGhostCoords);
          if (result.history_group) useAppStore.getState().addHistoryGroup(result.history_group);
          useAppStore.getState().setImagesLayer(newIds, 'default');
          const curIsolated = useAppStore.getState().isolatedImageIds;
          if (curIsolated !== null) {
            useAppStore.getState().setIsolatedImageIds([...curIsolated, ...newIds]);
          }
        }
      } catch (err) {
        console.error('[Ghost accept] Failed to add image:', err);
      } finally {
        ps.completeTask?.(taskId);
      }
    });

    discardBg.on("click", function(event: any) {
      event.stopPropagation();
      useAppStore.getState().removeGhostNode(d.id);
    });

  });

  ghostNodeElements
    .on("mouseenter.ghost", function() {
      const node = d3.select(this);
      // Brighten glow on hover; image already at full opacity
      node.select(".ghost-glow-bg")
        .attr("opacity", 0.32)
        .style("filter", `blur(${Math.max(ghostSize * 0.25, 10)}px)`);
      // Show label, info card, and action buttons
      node.select(".ghost-info").attr("display", null);
    })
    .on("mouseleave.ghost", function() {
      const node = d3.select(this);
      // Return glow to subtle resting state
      node.select(".ghost-glow-bg")
        .attr("opacity", 0.12)
        .style("filter", `blur(${Math.max(ghostSize * 0.2, 8)}px)`);
      // Hide label, info card, and action buttons
      node.select(".ghost-info").attr("display", "none");
    });

  ghostNodeElements.on("click", function(event: any) { event.stopPropagation(); });
}

interface SemanticCanvasProps {
  onSelectionChange: (x: number, y: number, count: number) => void;
  onMiddleClick?: (x: number, y: number) => void;
}

export const SemanticCanvas: React.FC<SemanticCanvasProps> = ({
  onSelectionChange,
  onMiddleClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
  const yScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null);
  const gridStretchRef = useRef<SVGGElement | null>(null);
  const dataCenterXRef = useRef(0);  // centerX in DATA space (data centroid)
  const dataCenterYRef = useRef(0);  // centerY in DATA space (data centroid)
  const coordScaleRef = useRef(1.0);
  const coordOffsetRef = useRef<number[]>([0, 0, 0]);
  const stretchPivotXRef = useRef(0);  // viewport-center pivot used for last stretch (data space)
  const stretchPivotYRef = useRef(0);

  // Tab-cycling state for overlapping shoes
  const cursorPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const overlapCycleRef = useRef<{ ids: number[]; index: number }>({ ids: [], index: -1 });

  // Subscribe only to the specific state we need
  const allImages = useAppStore((state) => state.images);
  const visualSettings = useAppStore((state) => state.visualSettings);
  const selectedImageIds = useAppStore((state) => state.selectedImageIds);
  const hoveredGroupId = useAppStore((state) => state.hoveredGroupId);
  const hoveredImageId = useAppStore((state) => state.hoveredImageId);
  const axisLabels = useAppStore((state) => state.axisLabels);
  const axisHistory = useAppStore((state) => state.axisHistory);
  const hiddenImageIds = useAppStore((state) => state.hiddenImageIds);
  const expandedConcepts = useAppStore((state) => state.expandedConcepts);
  const canvasBounds = useAppStore((state) => state.canvasBounds);
  const ghostNodes = useAppStore((state) => state.ghostNodes);
  const layers = useAppStore((state) => state.layers);
  const imageLayerMap = useAppStore((state) => state.imageLayerMap);
  const isolatedImageIds = useAppStore((state) => state.isolatedImageIds);
  const starFilter = useAppStore((state) => state.starFilter);
  const imageRatings = useAppStore((state) => state.imageRatings);
  const studyMode = useAppStore((state) => state.studyMode);
  const hiddenBatchIds = useAppStore((state) => state.hiddenBatchIds);
  const historyGroups = useAppStore((state) => state.historyGroups);
  const imageSizeOverrides = useAppStore((state) => state.imageSizeOverrides);
  const imageOpacityOverrides = useAppStore((state) => state.imageOpacityOverrides);
  // Always-current refs so render closures never see stale overrides
  const imageSizeOverridesRef = React.useRef<Record<number, number>>({});
  imageSizeOverridesRef.current = imageSizeOverrides;
  const imageOpacityOverridesRef = React.useRef<Record<number, number>>({});
  imageOpacityOverridesRef.current = imageOpacityOverrides;
  const imageLayerMapRef = React.useRef<Record<number, string>>({});
  imageLayerMapRef.current = imageLayerMap;

  // Memoize filtered images — respects both individual visibility and layer visibility
  // Sorted so lower layers (higher index in layers array) render first = below in SVG stack
  // layers[0] = Shoes = topmost → rendered last (on top)
  // layers[1] = References = bottom → rendered first (behind shoes)
  // Build reverse map: imageId → batchId (for batch visibility filtering)
  const batchHiddenImageIds = useMemo(() => {
    if (hiddenBatchIds.size === 0) return new Set<number>();
    const hidden = new Set<number>();
    for (const group of historyGroups) {
      if (hiddenBatchIds.has(group.id)) {
        for (const id of group.image_ids) hidden.add(id);
      }
    }
    return hidden;
  }, [hiddenBatchIds, historyGroups]);

  const images = useMemo(() => {
    const layerVisMap: Record<string, boolean> = {};
    const layerOrder: Record<string, number> = {};
    layers.forEach((l, i) => { layerVisMap[l.id] = l.visible; layerOrder[l.id] = i; });
    const hiddenSet = new Set(hiddenImageIds);
    const filtered = allImages.filter((img) => {
      if (!img.visible) return false;
      if (hiddenSet.has(img.id)) return false;
      // Hide images belonging to hidden batches
      if (batchHiddenImageIds.has(img.id)) return false;
      const lid = imageLayerMap[img.id] ?? "default";
      if (!(layerVisMap[lid] ?? true)) return false;
      // Hide mood boards when studyMode (no multi-view) is active
      if (studyMode && img.realm === 'mood-board') return false;
      // Only show side views on the semantic canvas — satellites are shown in the inspector
      const view = img.shoe_view ?? 'side';
      if (view !== 'side') return false;
      return true;
    });
    // Sort: higher layer index (deeper in stack) → render first; within same layer, lower ID first (older behind newer)
    return filtered.sort((a, b) => {
      const aIdx = layerOrder[imageLayerMap[a.id] ?? "default"] ?? 0;
      const bIdx = layerOrder[imageLayerMap[b.id] ?? "default"] ?? 0;
      if (bIdx !== aIdx) return bIdx - aIdx; // descending layer index: references first, shoes last
      return a.id - b.id; // ascending ID within layer: older images render first (behind newer)
    });
  }, [allImages, layers, imageLayerMap, hiddenImageIds, batchHiddenImageIds, studyMode]);

  // Rubber-band selection state
  // mode: 'window'   (drag →, solid blue)   = must fully contain the shoe
  //        'crossing' (drag ←, dashed green)  = selects any shoe the brush touches
  const [brush, setBrush] = useState<{ x: number; y: number; w: number; h: number; mode: 'window' | 'crossing' } | null>(null);
  const brushActiveRef = useRef(false);
  const brushRectRef = useRef<{ x: number; y: number; w: number; h: number; mode: 'window' | 'crossing' } | null>(null);
  const brushStartXRef = useRef<number | null>(null); // raw start X for direction detection
  const minimapThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null); // throttle minimap viewport updates

  // Get functions directly from store without subscribing to state changes
  const toggleImageSelection = React.useCallback(
    (id: number, ctrlKey: boolean) => {
      useAppStore.getState().toggleImageSelection(id, ctrlKey);
    },
    []
  );

  // Don't call setHoveredImageId - it causes unnecessary store updates and re-renders
  // We handle hover state locally through D3 DOM manipulation

  // Always-current ref for onMiddleClick callback (so native handler closure stays fresh)
  const onMiddleClickRef = React.useRef(onMiddleClick);
  React.useEffect(() => { onMiddleClickRef.current = onMiddleClick; }, [onMiddleClick]);

  // Mouse-event brush + context-menu prevention (separate from D3 zoom)
  // Uses mousedown/document-mousemove/mouseup to avoid D3 pointer event interference.
  // D3 zoom only handles right-click (button===2) so left-click is fully ours.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Prevent right-click context menu
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    svg.addEventListener("contextmenu", preventContextMenu);

    // ── Rubber-band brush (mouse events — no pointer capture conflicts) ──
    let brushStart: { x: number; y: number } | null = null;
    let isBrushDragging = false;
    let cleanupDocListeners: (() => void) | null = null;

    const svgCoords = (e: MouseEvent) => {
      const r = svg.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onMouseDown = (e: MouseEvent) => {
      // Middle-click → radial dial
      if (e.button === 1) {
        e.preventDefault();
        onMiddleClickRef.current?.(e.clientX, e.clientY);
        return;
      }
      // Right-click → D3 handles pan
      if (e.button !== 0) return;

      // Only brush on background, not on image/ghost nodes
      const target = e.target as Element;
      if (target.closest(".image-node") || target.closest(".ghost-node") || target.closest(".pending-image")) return;

      // Prevent native browser drag (shows forbidden cursor without this)
      e.preventDefault();

      const coords = svgCoords(e);
      brushStart = coords;
      brushStartXRef.current = coords.x; // save raw start X for direction detection
      isBrushDragging = true;
      brushActiveRef.current = true;
      brushRectRef.current = null;
      setBrush(null);

      const onDocMouseMove = (ev: MouseEvent) => {
        if (!isBrushDragging || !brushStart) return;
        const { x: ex, y: ey } = svgCoords(ev);
        const { x: sx, y: sy } = brushStart;
        // CAD-style: drag → (ex >= sx) = window/solid/contain; drag ← = crossing/dashed/touch
        const mode: 'window' | 'crossing' = ex >= sx ? 'window' : 'crossing';
        const rect = { x: Math.min(sx, ex), y: Math.min(sy, ey), w: Math.abs(ex - sx), h: Math.abs(ey - sy), mode };
        brushRectRef.current = rect;
        setBrush(rect);
      };

      const onDocMouseUp = (ev: MouseEvent) => {
        if (!isBrushDragging) return;
        isBrushDragging = false;
        brushActiveRef.current = false;
        if (cleanupDocListeners) { cleanupDocListeners(); cleanupDocListeners = null; }

        const currentBrush = brushRectRef.current;
        const savedStart = brushStart;
        brushRectRef.current = null;
        setBrush(null);
        brushStart = null;
        brushStartXRef.current = null;

        if (!currentBrush || currentBrush.w < 4 || currentBrush.h < 4) return;

        // DOM-based hit detection: use actual rendered positions
        const svgEl = svgRef.current;
        if (!svgEl) return;
        const svgRect = svgEl.getBoundingClientRect();
        const bx1 = currentBrush.x, bx2 = currentBrush.x + currentBrush.w;
        const by1 = currentBrush.y, by2 = currentBrush.y + currentBrush.h;
        const selMode = currentBrush.mode;

        const state = useAppStore.getState();
        const layerVisMap: Record<string, boolean> = {};
        state.layers.forEach((l) => { layerVisMap[l.id] = l.visible; });
        const isolateSet = state.isolatedImageIds !== null ? new Set(state.isolatedImageIds) : null;
        const hiddenSet = new Set(state.hiddenImageIds);
        const visibleIdSet = new Set<number>();
        state.images.forEach((img) => {
          if (!img.visible) return;
          if (hiddenSet.has(img.id)) return;
          const lid = state.imageLayerMap[img.id] ?? "default";
          if (!(layerVisMap[lid] ?? true)) return;
          if (isolateSet !== null && !isolateSet.has(img.id)) return;
          visibleIdSet.add(img.id);
        });

        const inside: number[] = [];
        svgEl.querySelectorAll("[data-image-id]").forEach((el: Element) => {
          const id = parseInt(el.getAttribute("data-image-id") || "-1");
          if (isNaN(id) || !visibleIdSet.has(id)) return;
          const r = el.getBoundingClientRect();
          const nx1 = r.left - svgRect.left, nx2 = r.right - svgRect.left;
          const ny1 = r.top - svgRect.top,  ny2 = r.bottom - svgRect.top;
          let hit = false;
          if (selMode === 'window') {
            // Window: node fully inside brush
            hit = nx1 >= bx1 && nx2 <= bx2 && ny1 >= by1 && ny2 <= by2;
          } else {
            // Crossing: node bounding box intersects brush (any overlap)
            hit = nx2 > bx1 && nx1 < bx2 && ny2 > by1 && ny1 < by2;
          }
          if (hit) inside.push(id);
        });

        if (inside.length > 0) {
          // Suppress the pending "click" event that follows mouseup — otherwise D3's
          // svg.on("click") handler would immediately call clearSelection().
          const suppressNextClick = (e: MouseEvent) => {
            e.stopPropagation();
            document.removeEventListener("click", suppressNextClick, true);
          };
          document.addEventListener("click", suppressNextClick, true);

          const current = new Set(state.selectedImageIds);
          if (ev.shiftKey) {
            // Shift: ADD brushed items to existing selection
            const next = new Set(current);
            inside.forEach((id) => next.add(id));
            state.setSelectedImageIds([...next]);
          } else if (ev.ctrlKey || ev.metaKey) {
            // Ctrl/Cmd: REMOVE brushed items from existing selection
            const next = new Set(current);
            inside.forEach((id) => next.delete(id));
            state.setSelectedImageIds([...next]);
          } else {
            // No modifier: REPLACE selection with brushed set (fresh start)
            state.setSelectedImageIds(inside);
          }
        }
      };

      document.addEventListener("mousemove", onDocMouseMove);
      document.addEventListener("mouseup", onDocMouseUp);
      cleanupDocListeners = () => {
        document.removeEventListener("mousemove", onDocMouseMove);
        document.removeEventListener("mouseup", onDocMouseUp);
      };
    };

    svg.addEventListener("mousedown", onMouseDown);

    return () => {
      svg.removeEventListener("contextmenu", preventContextMenu);
      svg.removeEventListener("mousedown", onMouseDown);
      if (cleanupDocListeners) cleanupDocListeners();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // Intentionally no deps — uses refs for all mutable data

  // Always-current ref for visualSettings (used by native event handlers that can't read React state)
  const visualSettingsRef = React.useRef(visualSettings);
  React.useEffect(() => { visualSettingsRef.current = visualSettings; }, [visualSettings]);

  // Axis history dropdown
  const [axisHistoryOpen, setAxisHistoryOpen] = React.useState(false);

  // ResizeObserver: force a re-render when the SVG container gains non-zero size.
  // This recovers the canvas if the initial render fired while the container had width=0.
  const [resizeTick, setResizeTick] = React.useState(0);
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setResizeTick(t => t + 1);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Track previous values to see what changed
  const prevImagesRef = React.useRef(images);
  const prevVisualSettingsRef = React.useRef(visualSettings);
  const prevLayoutPaddingRef = React.useRef(visualSettings.layoutPadding);
  const prevGhostNodesRef = React.useRef(ghostNodes);
  const prevAxisLabelsRef = React.useRef(axisLabels);
  const prevCanvasBoundsRef = React.useRef(canvasBounds);

  // Main rendering effect - ONLY for full redraws (images, visualSettings, axisLabels change)
  useEffect(() => {
    const imagesChanged = prevImagesRef.current !== images;
    const visualSettingsChanged =
      prevVisualSettingsRef.current !== visualSettings;
    const layoutPaddingChanged =
      prevLayoutPaddingRef.current !== visualSettings.layoutPadding;
    const ghostsChanged = prevGhostNodesRef.current !== ghostNodes;
    const axisLabelsChanged = prevAxisLabelsRef.current !== axisLabels;
    const canvasBoundsChanged = prevCanvasBoundsRef.current !== canvasBounds;

    // Layer-reorder / visibility fast path: if only images changed (due to layer toggle
    // or reorder), skip full rebuild — toggle SVG node display in-place to prevent camera jumps.
    if (imagesChanged && !visualSettingsChanged && !axisLabelsChanged && !canvasBoundsChanged && !ghostsChanged) {
      const prevIds = new Set(prevImagesRef.current.map(i => i.id));
      const currIds = new Set(images.map(i => i.id));
      const sameSet = prevIds.size === currIds.size && [...currIds].every(id => prevIds.has(id));
      if (sameSet) {
        // Same images, different order → update SVG stacking without rebuild
        prevImagesRef.current = images;
        if (svgRef.current) {
          const imagesGroup = d3.select(svgRef.current).select(".images");
          // Reorder DOM nodes to match new sort order
          images.forEach(img => {
            const node = imagesGroup.select(`#image-${img.id}`);
            if (!node.empty()) node.raise();
          });
        }
        return;
      }

      // Layer visibility fast path: images hidden/shown by toggling layer visibility.
      // Hide removed nodes, show re-added nodes — NO full rebuild, NO camera jump.
      if (canvasBounds !== null && svgRef.current) {
        const removedIds = [...prevIds].filter(id => !currIds.has(id));
        const addedIds = [...currIds].filter(id => !prevIds.has(id));
        // Only use fast path if this is purely a visibility change (no brand-new images)
        // Brand-new images (from generation) need the full add path below.
        const allKnown = addedIds.every(id => {
          const node = d3.select(svgRef.current!).select(`#image-${id}`);
          return !node.empty();
        });
        if (removedIds.length > 0 || (addedIds.length > 0 && allKnown)) {
          console.log(`⚡ Layer visibility fast path: hiding ${removedIds.length}, showing ${addedIds.length}`);
          prevImagesRef.current = images;
          const imagesGroup = d3.select(svgRef.current).select(".images");
          removedIds.forEach(id => {
            imagesGroup.select(`#image-${id}`).attr("display", "none");
          });
          addedIds.forEach(id => {
            imagesGroup.select(`#image-${id}`).attr("display", null);
          });
          // Update minimap dots to reflect visible images only
          if (xScaleRef.current && yScaleRef.current) {
            const co = coordOffsetRef.current;
            const cs = coordScaleRef.current;
            const xs = xScaleRef.current;
            const ys = yScaleRef.current;
            const spx = stretchPivotXRef.current;
            const spy = stretchPivotYRef.current;
            const axScX = visualSettingsRef.current.axisScaleX ?? 1;
            const axScY = visualSettingsRef.current.axisScaleY ?? 1;
            const toS = (bx: number, by: number): [number, number] => [
              spx + (bx - spx) * axScX,
              spy + (by - spy) * axScY,
            ];
            const allMinimapDots = images.map((img) => {
              const bx = (img.coordinates[0] + co[0]) * cs;
              const by = (img.coordinates[1] + co[1]) * cs;
              const [sx, sy] = toS(bx, by);
              return {
                id: img.id, x: xs(sx), y: ys(sy),
                category: getDisplayCategory(img.generation_method, img.realm),
              };
            });
            useAppStore.getState().setMinimapDots(allMinimapDots);
          }
          return;
        }
      }

      // Image-addition fast path: new images added, none removed → append only the new nodes.
      // This prevents camera jumps and visual blinks after generation completes.
      const isAddOnly = [...prevIds].every(id => currIds.has(id)) && currIds.size > prevIds.size;
      if (isAddOnly && canvasBounds !== null && svgRef.current &&
          xScaleRef.current && yScaleRef.current) {
        const newImages = images.filter(img => !prevIds.has(img.id));
        console.log(`⚡ Image-addition fast path: appending ${newImages.length} new nodes`);
        prevImagesRef.current = images;

        const svg = d3.select(svgRef.current);
        const imagesGroup = svg.select(".images");
        if (!imagesGroup.empty()) {
          const xs = xScaleRef.current!;
          const ys = yScaleRef.current!;
          const co = coordOffsetRef.current;
          const cs = coordScaleRef.current;
          const spx = stretchPivotXRef.current;
          const spy = stretchPivotYRef.current;
          const axScX = visualSettingsRef.current.axisScaleX ?? 1;
          const axScY = visualSettingsRef.current.axisScaleY ?? 1;
          const toS = (bx: number, by: number): [number, number] => [
            spx + (bx - spx) * axScX,
            spy + (by - spy) * axScY,
          ];
          const imgSize = visualSettingsRef.current.imageSize;

          for (const d of newImages) {
            const bx = (d.coordinates[0] + co[0]) * cs;
            const by = (d.coordinates[1] + co[1]) * cs;
            const [sx, sy] = toS(bx, by);
            const sz = imageSizeOverridesRef.current[d.id] ?? imgSize;
            const isMB = d.realm === 'mood-board';
            const isRef = d.generation_method === 'dataset';
            const w = isMB ? sz * 1.5 : sz;

            const gNode = imagesGroup.append("g")
              .datum(d)
              .attr("class", "image-node")
              .attr("id", `image-${d.id}`)
              .attr("data-image-id", d.id)
              .attr("transform", `translate(${xs(sx)}, ${ys(sy)})`);

            // Click area
            const rectY = (isMB || isRef) ? -sz / 2 : -sz * 0.3;
            const rectH = (isMB || isRef) ? sz : sz * 0.6;
            gNode.append("rect")
              .attr("x", -w / 2)
              .attr("y", rectY)
              .attr("width", w)
              .attr("height", rectH)
              .attr("rx", 8)
              .attr("fill", "transparent")
              .attr("pointer-events", "all")
              .style("cursor", "pointer")
              .on("click", function (event) {
                event.stopPropagation();
                // Axis tuning mode: add as anchor
                const ts = useAppStore.getState();
                if (ts.axisTuningMode && ts.axisTuningAxis) {
                  ts.addAxisTuningAnchor({ imageId: d.id, axis: ts.axisTuningAxis, position: 8 });
                  return;
                }
                // Satellite views redirect to their parent side view
                const targetId = (d.shoe_view && d.shoe_view !== 'side' && d.parent_side_id && d.parent_side_id > 0)
                  ? d.parent_side_id : d.id;
                const curIsolated = useAppStore.getState().isolatedImageIds;
                if (curIsolated !== null && !curIsolated.includes(targetId)) return;
                toggleImageSelection(targetId, event.ctrlKey);
                // Trigger selection change callback
                setTimeout(() => {
                  const newSel = useAppStore.getState().selectedImageIds;
                  onSelectionChange(newSel.length > 0 ? -1 : 0, newSel.length > 0 ? -1 : 0, newSel.length);
                }, 0);
              })
              .on("mouseenter", function () {
                const g = d3.select(this.parentNode as SVGGElement);
                if (!useAppStore.getState().selectedImageIds.includes(d.id)) {
                  g.attr("filter", "url(#hover-glow)");
                }
              })
              .on("mouseleave", function () {
                const g = d3.select(this.parentNode as SVGGElement);
                if (!useAppStore.getState().selectedImageIds.includes(d.id)) {
                  g.attr("filter", null);
                }
              });

            // Image element
            gNode.append("image")
              .attr("href", `data:image/png;base64,${d.base64_image}`)
              .attr("x", -w / 2)
              .attr("y", -sz / 2)
              .attr("width", w)
              .attr("height", sz)
              .attr("opacity", imageOpacityOverridesRef.current[d.id] ?? visualSettingsRef.current.imageOpacity)
              .style("pointer-events", "none");
          }

          // Update minimap dots
          const allMinimapDots = images.map((img) => {
            const bx2 = (img.coordinates[0] + co[0]) * cs;
            const by2 = (img.coordinates[1] + co[1]) * cs;
            const [sx2, sy2] = toS(bx2, by2);
            return {
              id: img.id, x: xs(sx2), y: ys(sy2),
              category: getDisplayCategory(img.generation_method, img.realm),
            };
          });
          useAppStore.getState().setMinimapDots(allMinimapDots);
          return;
        }
      }
    }

    // Ghost-only fast path: only ghostNodes changed → update ghost section in-place, no full rebuild
    if (
      ghostsChanged && !imagesChanged && !visualSettingsChanged &&
      !axisLabelsChanged && !canvasBoundsChanged &&
      canvasBounds !== null && svgRef.current &&
      xScaleRef.current && yScaleRef.current
    ) {
      prevGhostNodesRef.current = ghostNodes;
      const svg = d3.select(svgRef.current);
      const ghostGroup = svg.select(".ghost-nodes");
      const ghostParentLines = svg.select(".ghost-parent-lines");
      if (!ghostGroup.empty()) {
        ghostGroup.selectAll("*").remove();
        ghostParentLines.selectAll("*").remove();
        // Re-render ghost nodes using current refs (no closure capture needed)
        const co = coordOffsetRef.current;
        const cs = coordScaleRef.current;
        const xs = xScaleRef.current!;
        const ys = yScaleRef.current!;
        const spx = stretchPivotXRef.current;
        const spy = stretchPivotYRef.current;
        const axScX = visualSettingsRef.current.axisScaleX ?? 1;
        const axScY = visualSettingsRef.current.axisScaleY ?? 1;
        const toS = (bx: number, by: number) => [
          spx + (bx - spx) * axScX,
          spy + (by - spy) * axScY,
        ];
        const gSize = visualSettingsRef.current.imageSize;
        const currentImages = prevImagesRef.current;
        _renderGhostNodes(ghostGroup, ghostParentLines, ghostNodes, co, cs, xs, ys, toS, gSize, currentImages);
        ghostGroup.raise();
        return;
      }
    }

    console.log("🔄 Canvas FULL render effect triggered", {
      imagesCount: images.length,
      imagesChanged,
      visualSettingsChanged,
      layoutPaddingChanged,
      hasSvgRef: !!svgRef.current,
    });

    // Capture prev settings before updating refs (needed for fast-path scale detection)
    const prevSettings = prevVisualSettingsRef.current;

    // If layout padding changed, reset bounds to force recalculation
    if (layoutPaddingChanged && !imagesChanged) {
      console.log("📏 Layout padding changed, resetting bounds");
      useAppStore.getState().resetCanvasBounds();
    }

    prevImagesRef.current = images;
    prevVisualSettingsRef.current = visualSettings;
    prevLayoutPaddingRef.current = visualSettings.layoutPadding;
    prevGhostNodesRef.current = ghostNodes;
    prevAxisLabelsRef.current = axisLabels;
    prevCanvasBoundsRef.current = canvasBounds;

    if (!svgRef.current) {
      console.warn("⚠️ No SVG ref available");
      return;
    }

    if (images.length === 0) {
      console.log("📭 No visible images (layers filtered) — clearing image/ghost nodes only");
      const svgSel = d3.select(svgRef.current);
      // Only remove image + ghost nodes, NOT the grid or axes, so the grid stays
      // visible even when all shoes are hidden via layer toggle.
      svgSel.select(".images").selectAll(".image-node").remove();
      svgSel.select(".ghost-nodes").selectAll(".ghost-node").remove();
      svgSel.select(".genealogy-lines").selectAll("*").remove();
      // If no SVG structure exists yet (truly empty first load), do a full wipe
      if (svgSel.select(".main-group").empty()) {
        svgSel.selectAll("*").remove();
        gridStretchRef.current = null;
      }
      return;
    }

    // Fast path: only axis scale and/or image size changed → update nodes in-place, skip full SVG rebuild
    const scaleChanged = prevSettings.axisScaleX !== visualSettings.axisScaleX ||
                         prevSettings.axisScaleY !== visualSettings.axisScaleY;
    const sizeChanged = prevSettings.imageSize !== visualSettings.imageSize;
    const opacityChanged = prevSettings.imageOpacity !== visualSettings.imageOpacity;
    const nothingElseChanged =
      !opacityChanged &&
      prevSettings.coordinateScale === visualSettings.coordinateScale &&
      prevSettings.layoutPadding === visualSettings.layoutPadding;
    const canFastPath = prevSettings !== visualSettings && !imagesChanged &&
                        nothingElseChanged && canvasBounds !== null &&
                        svgRef.current &&
                        xScaleRef.current && yScaleRef.current;

    // Opacity-only fast path: update <image> element opacity in-place, no rebuild
    if (!imagesChanged && opacityChanged && !scaleChanged && !sizeChanged &&
        prevSettings.coordinateScale === visualSettings.coordinateScale &&
        canvasBounds !== null && svgRef.current) {
      const newOp = visualSettings.imageOpacity;
      d3.select(svgRef.current).select(".images").selectAll<SVGGElement, any>(".image-node")
        .each(function(d) {
          const id: number = (d as any)?.id ?? -1;
          const op = imageOpacityOverridesRef.current[id] ?? newOp;
          d3.select(this).select("image").attr("opacity", op);
        });
      return;
    }

    if (canFastPath && (scaleChanged || sizeChanged)) {
      const svg = d3.select(svgRef.current);

      if (scaleChanged) {
        const axScaleX = visualSettings.axisScaleX ?? 1;
        const axScaleY = visualSettings.axisScaleY ?? 1;
        const cs = coordScaleRef.current;
        const co = coordOffsetRef.current;
        const xs = xScaleRef.current!;
        const ys = yScaleRef.current!;

        // Compute pivot from current zoom transform so stretch centers on viewport.
        // zoomTransformRef, xScaleRef, yScaleRef are all constant during slider
        // movement, so this value is stable (no drift).
        const W = svgRef.current!.clientWidth;
        const H = svgRef.current!.clientHeight;
        let pivotX = dataCenterXRef.current;
        let pivotY = dataCenterYRef.current;
        if (zoomTransformRef.current) {
          const T = zoomTransformRef.current;
          pivotX = xs.invert((W / 2 - T.x) / T.k);
          pivotY = ys.invert((H / 2 - T.y) / T.k);
        }
        stretchPivotXRef.current = pivotX;
        stretchPivotYRef.current = pivotY;

        // Reposition each image node individually (shoes stay same size)
        svg.selectAll(".image-node").each(function(d: any) {
          const bx = (d.coordinates[0] + co[0]) * cs;
          const by = (d.coordinates[1] + co[1]) * cs;
          const sx = pivotX + (bx - pivotX) * axScaleX;
          const sy = pivotY + (by - pivotY) * axScaleY;
          d3.select(this).attr("transform", `translate(${xs(sx)}, ${ys(sy)})`);
        });

        // Reposition ghost nodes + collect updated ghost dot positions
        const fastGhostDots: { id: number; x: number; y: number; category: 'agent'; color: string }[] = [];
        svg.selectAll(".ghost-node").each(function(d: any) {
          const bx = (d.coordinates[0] + co[0]) * cs;
          const by = (d.coordinates[1] + co[1]) * cs;
          const sx = pivotX + (bx - pivotX) * axScaleX;
          const sy = pivotY + (by - pivotY) * axScaleY;
          d3.select(this).attr("transform", `translate(${xs(sx)}, ${ys(sy)})`);
          fastGhostDots.push({
            id: d.id, x: xs(sx), y: ys(sy), category: 'agent',
            color: d.source === 'concurrent' ? '#a855f7' : '#14b8a6',
          });
        });

        // Publish updated minimap dots + ghost dots for the scale change
        const fastMinimapDots = images.map((d) => {
          const bx = (d.coordinates[0] + co[0]) * cs;
          const by = (d.coordinates[1] + co[1]) * cs;
          const sx = pivotX + (bx - pivotX) * axScaleX;
          const sy = pivotY + (by - pivotY) * axScaleY;
          return { id: d.id, x: xs(sx), y: ys(sy),
            category: getDisplayCategory(d.generation_method, d.realm) };
        });
        useAppStore.getState().setMinimapDots(fastMinimapDots);
        useAppStore.getState().setMinimapGhostDots(fastGhostDots);

        // Update grid stretch group transform (pivot in screen coords)
        if (gridStretchRef.current) {
          const px_scr = xs(pivotX);
          const py_scr = ys(pivotY);
          d3.select(gridStretchRef.current).attr("transform",
            `translate(${px_scr},${py_scr}) scale(${axScaleX},${axScaleY}) translate(${-px_scr},${-py_scr})`
          );
        }
      }

      if (sizeChanged) {
        const newSize = visualSettings.imageSize;
        // Update each image node's inner rect (click area) and image
        // Respects per-image overrides and mood board aspect ratio
        svg.selectAll(".image-node").each(function(d: any) {
          const node = d3.select(this);
          const sz = imageSizeOverridesRef.current[d.id] ?? newSize;
          const isMoodBoard = d.realm === 'mood-board';
          const isRef = (d.generation_method === 'dataset');
          const w = isMoodBoard ? sz * 1.5 : sz;
          const h = sz;
          // Click area: mood boards + refs use full rect, shoes use narrower hit area
          const rectY = (isMoodBoard || isRef) ? -sz / 2 : -sz * 0.3;
          const rectH = (isMoodBoard || isRef) ? sz : sz * 0.6;
          node.select("rect")
            .attr("x", -w / 2)
            .attr("y", rectY)
            .attr("width", w)
            .attr("height", rectH);
          node.select("image")
            .attr("x", -w / 2)
            .attr("y", -h / 2)
            .attr("width", w)
            .attr("height", h);
        });

        // Resize ghost node images and hit areas
        svg.selectAll(".ghost-node").each(function() {
          const node = d3.select(this);
          node.select(".ghost-hit")
            .attr("x", -newSize / 2).attr("y", -newSize / 2)
            .attr("width", newSize).attr("height", newSize + 56);
          node.select("image")
            .attr("x", -newSize / 2).attr("y", -newSize / 2)
            .attr("width", newSize).attr("height", newSize);
          node.select("circle")
            .attr("cx", newSize / 2 - 6).attr("cy", -newSize / 2 + 6);
        });
      }

      return;
    }

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Safety guard: skip render if container has no size (e.g. during CSS layout transitions).
    // Rendering with width=0 collapses all x-positions to a single point, causing
    // shoes to "disappear" and only horizontal grid lines to remain visible.
    if (width === 0 || height === 0) {
      console.warn("⚠️ SVG has no size yet, skipping render (will retry on resize)");
      return;
    }

    console.log("🎨 Full canvas render:", {
      width,
      height,
      imageCount: images.length,
    });

    // Clear previous content ONLY on full redraw
    svg.selectAll("*").remove();

    // Create defs for arrow markers (outside zoom group)
    const defs = svg.append("defs");

    // X-axis arrow markers
    defs
      .append("marker")
      .attr("id", "arrow-x-left")
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("refX", 5)
      .attr("refY", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 10 5 L 0 0 L 0 10 Z")
      .attr("fill", "#58a6ff");

    defs
      .append("marker")
      .attr("id", "arrow-x-right")
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("refX", 5)
      .attr("refY", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 0 5 L 10 0 L 10 10 Z")
      .attr("fill", "#58a6ff");

    // Y-axis arrow markers
    defs
      .append("marker")
      .attr("id", "arrow-y-top")
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("refX", 5)
      .attr("refY", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 5 0 L 0 10 L 10 10 Z")
      .attr("fill", "#bc8cff");

    defs
      .append("marker")
      .attr("id", "arrow-y-bottom")
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("refX", 5)
      .attr("refY", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 5 10 L 0 0 L 10 0 Z")
      .attr("fill", "#bc8cff");

    // Genealogy arrow markers — tiny, subtle, directional colors
    defs.append("marker")
      .attr("id", "arrow-cyan")
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("refX", 5).attr("refY", 3)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 0 0 L 6 3 L 0 6 Z")
      .attr("fill", "#00E5FF").attr("opacity", 0.7);

    defs.append("marker")
      .attr("id", "arrow-amber")
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("refX", 5).attr("refY", 3)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 0 0 L 6 3 L 0 6 Z")
      .attr("fill", "#FFAA00").attr("opacity", 0.7);

    // Hover glow: silvery-white, subtle emission
    const hoverFilter = defs.append("filter").attr("id", "hover-glow")
      .attr("x", "-40%").attr("y", "-40%").attr("width", "180%").attr("height", "180%");
    hoverFilter.append("feDropShadow")
      .attr("dx", 0).attr("dy", 0).attr("stdDeviation", 8)
      .attr("flood-color", "#c0d0e0").attr("flood-opacity", 0.5);

    // Terrain nebula gradients
    const clusterGrad = defs.append("radialGradient").attr("id", "cluster-nebula");
    clusterGrad.append("stop").attr("offset", "0%").attr("stop-color", "#58a6ff").attr("stop-opacity", 0.25);
    clusterGrad.append("stop").attr("offset", "40%").attr("stop-color", "#58a6ff").attr("stop-opacity", 0.1);
    clusterGrad.append("stop").attr("offset", "100%").attr("stop-color", "#58a6ff").attr("stop-opacity", 0);

    const gapGrad = defs.append("radialGradient").attr("id", "gap-nebula");
    gapGrad.append("stop").attr("offset", "0%").attr("stop-color", "#ffa658").attr("stop-opacity", 0.2);
    gapGrad.append("stop").attr("offset", "35%").attr("stop-color", "#ffa658").attr("stop-opacity", 0.08);
    gapGrad.append("stop").attr("offset", "100%").attr("stop-color", "#ffa658").attr("stop-opacity", 0);

    // Haze gradient for isHaze ghost nodes (purple/violet — distinct from clusters/gaps)
    const hazeGrad = defs.append("radialGradient").attr("id", "haze-nebula");
    hazeGrad.append("stop").attr("offset", "0%").attr("stop-color", "#c084fc").attr("stop-opacity", 0.4);
    hazeGrad.append("stop").attr("offset", "55%").attr("stop-color", "#c084fc").attr("stop-opacity", 0.12);
    hazeGrad.append("stop").attr("offset", "100%").attr("stop-color", "#c084fc").attr("stop-opacity", 0);

    // Blur filter for terrain blobs
    const terrainBlur = defs.append("filter").attr("id", "terrain-blur")
      .attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
    terrainBlur.append("feGaussianBlur").attr("stdDeviation", 6);

    // Soft halo filter for ghost nodes
    const ghostHalo = defs.append("filter").attr("id", "ghost-halo")
      .attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%");
    ghostHalo.append("feGaussianBlur").attr("stdDeviation", 14).attr("in", "SourceGraphic").attr("result", "blur");

    // Create main group for zoom/pan.
    // Pre-apply saved transform immediately so there's never a "jump" frame where
    // the group sits at origin before zoom.transform() is called below.
    const g = svg.append("g").attr("class", "main-group");
    if (zoomTransformRef.current && canvasBounds !== null) {
      g.attr("transform", zoomTransformRef.current.toString());
    }

    // Zoom: scroll = zoom, right-click drag = pan; left-drag = rubber-band, middle = radial dial
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .filter((event: any) => {
        if (event.type === "wheel") return true;
        // Right-click drag pans; handle both D3 v6 (mousedown) and v7+ (pointerdown)
        if (event.type === "mousedown" || event.type === "pointerdown") return event.button === 2;
        return false;
      })
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        zoomTransformRef.current = event.transform;
        // Throttled minimap viewport update (80ms)
        if (minimapThrottleRef.current) clearTimeout(minimapThrottleRef.current);
        minimapThrottleRef.current = setTimeout(() => {
          const T = event.transform;
          const w = svgRef.current?.clientWidth ?? 800;
          const h = svgRef.current?.clientHeight ?? 600;
          useAppStore.getState().setMinimapViewport({
            x1: -T.x / T.k, y1: -T.y / T.k,
            x2: (w - T.x) / T.k, y2: (h - T.y) / T.k,
          });
        }, 80);
      });

    svg.call(zoom as any).on("dblclick.zoom", null);   // disable double-click-to-zoom
    zoomRef.current = zoom;

    // Restore previous zoom/pan state only if bounds were not reset.
    // When canvasBounds === null the view should re-fit to new data, not keep old pan/zoom.
    if (canvasBounds === null) {
      // Clear stored zoom so subsequent renders also start fresh
      zoomTransformRef.current = null;
    } else if (zoomTransformRef.current) {
      svg.call(zoom.transform as any, zoomTransformRef.current);
    }

    // Determine canvas bounds:
    // - If canvasBounds is null: Calculate from data (first generation, axis update, or manual reset)
    // - Otherwise: Use stored bounds (stable, prevents rescaling when adding images)
    let xMin, xMax, yMin, yMax;

    const coordScale = visualSettings.coordinateScale || 1.0;
    const coordOffset = visualSettings.coordinateOffset || [0, 0, 0];
    const axisScaleX = visualSettings.axisScaleX ?? 1.0;
    const axisScaleY = visualSettings.axisScaleY ?? 1.0;

    // Stretch-from-center transform: use ALL images (unfiltered by layer) so grid/pivot
    // stays stable regardless of layer visibility toggles
    const allBaseCoords = allImages.map((d) => ({
      x: (d.coordinates[0] + coordOffset[0]) * coordScale,
      y: (d.coordinates[1] + coordOffset[1]) * coordScale,
    }));
    const xExtentBase = d3.extent(allBaseCoords, (d) => d.x) as [number, number];
    const yExtentBase = d3.extent(allBaseCoords, (d) => d.y) as [number, number];
    const centerX = allImages.length ? (xExtentBase[0] + xExtentBase[1]) / 2 : 0;
    const centerY = allImages.length ? (yExtentBase[0] + yExtentBase[1]) / 2 : 0;
    if (canvasBounds === null) {
      // Calculate bounds from ALL images (stretch applied per-node via toStretched)
      console.log("📐 Calculating bounds from data extent");
      const xExtent = d3.extent(allBaseCoords, (d) => d.x) as [number, number];
      const yExtent = d3.extent(allBaseCoords, (d) => d.y) as [number, number];

      const paddingFactor = visualSettings.layoutPadding;
      const xRange = (xExtent[1] ?? 1) - (xExtent[0] ?? 0) || 1;
      const yRange = (yExtent[1] ?? 1) - (yExtent[0] ?? 0) || 1;
      const xPadding = Math.max(xRange * paddingFactor, 0.05);
      const yPadding = Math.max(yRange * paddingFactor, 0.05);

      xMin = (xExtent[0] ?? 0) - xPadding;
      xMax = (xExtent[1] ?? 1) + xPadding;
      yMin = (yExtent[0] ?? 0) - yPadding;
      yMax = (yExtent[1] ?? 1) + yPadding;

      // Save these bounds to state so future renders use them
      const newBounds = { xMin, xMax, yMin, yMax };
      useAppStore.getState().setCanvasBounds(newBounds);
      console.log(`✓ Bounds calculated with ${(paddingFactor * 100).toFixed(0)}% padding:`, newBounds);
    } else {
      // Use stored bounds
      console.log("📏 Using stored bounds:", canvasBounds);
      ({ xMin, xMax, yMin, yMax } = canvasBounds);
    }

    const xScale = d3
      .scaleLinear()
      .domain([xMin, xMax])
      .range([50, width - 50]);

    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([height - 50, 50]);

    xScaleRef.current = xScale;
    yScaleRef.current = yScale;

    // Publish canvas size + initial viewport for Minimap and DI blobs
    useAppStore.getState().setMinimapCanvasSize({ w: width, h: height });
    {
      const T0 = zoomTransformRef.current;
      if (T0) {
        useAppStore.getState().setMinimapViewport({
          x1: -T0.x / T0.k, y1: -T0.y / T0.k,
          x2: (width - T0.x) / T0.k, y2: (height - T0.y) / T0.k,
        });
      } else {
        useAppStore.getState().setMinimapViewport({ x1: 0, y1: 0, x2: width, y2: height });
      }
    }

    // Store data-space center and coord params in refs (used by fast path)
    dataCenterXRef.current = centerX;
    dataCenterYRef.current = centerY;
    coordScaleRef.current = coordScale;
    coordOffsetRef.current = coordOffset;

    // Stretch-from-center helper: pivot is viewport center if zoomed, else data centroid
    let stretchPivotX = centerX;
    let stretchPivotY = centerY;
    if (zoomTransformRef.current && canvasBounds !== null) {
      const T = zoomTransformRef.current;
      stretchPivotX = xScale.invert((width / 2 - T.x) / T.k);
      stretchPivotY = yScale.invert((height / 2 - T.y) / T.k);
    }
    stretchPivotXRef.current = stretchPivotX;
    stretchPivotYRef.current = stretchPivotY;
    const toStretched = (x: number, y: number) => [
      stretchPivotX + (x - stretchPivotX) * axisScaleX,
      stretchPivotY + (y - stretchPivotY) * axisScaleY,
    ];

    // Grid stretch group: grid lines can be scaled via group transform (no "size" to preserve)
    const px_screen = xScale(stretchPivotX);
    const py_screen = yScale(stretchPivotY);
    const gridStretch = g.append("g").attr("class", "grid-stretch");
    gridStretchRef.current = gridStretch.node();
    gridStretch.attr("transform",
      `translate(${px_screen},${py_screen}) scale(${axisScaleX},${axisScaleY}) translate(${-px_screen},${-py_screen})`
    );
    const gridGroup = gridStretch.append("g").attr("class", "grid-lines")
      .style("pointer-events", "none");
    // Generate grid lines extending far beyond visible data range for "infinite" feel
    const xStep = d3.tickStep(xMin, xMax, 10);
    const yStep = d3.tickStep(yMin, yMax, 10);
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const gridXTicks: number[] = [];
    const gridYTicks: number[] = [];
    for (let x = Math.floor((xMin - xRange * 10) / xStep) * xStep; x <= xMax + xRange * 10; x += xStep) {
      gridXTicks.push(x);
    }
    for (let y = Math.floor((yMin - yRange * 10) / yStep) * yStep; y <= yMax + yRange * 10; y += yStep) {
      gridYTicks.push(y);
    }
    gridXTicks.forEach((x) => {
      gridGroup.append("line")
        .attr("x1", xScale(x)).attr("y1", -50000)
        .attr("x2", xScale(x)).attr("y2", 50000)
        .attr("stroke", "#21262d").attr("stroke-width", 1);
    });
    gridYTicks.forEach((y) => {
      gridGroup.append("line")
        .attr("x1", -50000).attr("y1", yScale(y))
        .attr("x2", 50000).attr("y2", yScale(y))
        .attr("stroke", "#21262d").attr("stroke-width", 1);
    });

    // Group for genealogy lines (drawn in selection effect only for selected images)
    g.append("g").attr("class", "genealogy-lines");

    // Ghost parent-connection lines (behind ghost images)
    const ghostParentLinesGroup = g.append("g").attr("class", "ghost-parent-lines");

    // Group for ghost nodes (preview suggestions at low opacity)
    const ghostGroup = g.append("g").attr("class", "ghost-nodes");

    // Render ghost nodes via shared helper (also used by the ghost-only fast path)
    _renderGhostNodes(ghostGroup, ghostParentLinesGroup, ghostNodes, coordOffset, coordScale, xScale, yScale, toStretched, visualSettings.imageSize, images);

    // Group for images
    const imagesGroup = g.append("g").attr("class", "images");

    // Render images - pure CLIP semantic projection with axis stretch
    const imageSize = visualSettings.imageSize;

    const imageNodes = imagesGroup
      .selectAll(".image-node")
      .data(images, (d: any) => d.id)
      .join("g")
      .attr("class", "image-node")
      .attr("id", (d) => `image-${d.id}`)
      .attr("data-image-id", (d) => d.id)
      .attr("transform", (d) => {
        const bx = (d.coordinates[0] + coordOffset[0]) * coordScale;
        const by = (d.coordinates[1] + coordOffset[1]) * coordScale;
        const [sx, sy] = toStretched(bx, by);
        return `translate(${xScale(sx)}, ${yScale(sy)})`;
      });

    // Publish minimap dots (base screen positions, pre-zoom)
    const minimapDots = images.map((d) => {
      const bx = (d.coordinates[0] + coordOffset[0]) * coordScale;
      const by = (d.coordinates[1] + coordOffset[1]) * coordScale;
      const [sx, sy] = toStretched(bx, by);
      return {
        id: d.id,
        x: xScale(sx),
        y: yScale(sy),
        category: getDisplayCategory(d.generation_method, d.realm),
      };
    });
    useAppStore.getState().setMinimapDots(minimapDots);

    // Publish ghost dots for DI blobs (only unaccepted ghost nodes)
    const ghostDots = ghostNodes.map((g) => {
      const bx = (g.coordinates[0] + coordOffset[0]) * coordScale;
      const by = (g.coordinates[1] + coordOffset[1]) * coordScale;
      const [sx, sy] = toStretched(bx, by);
      return {
        id: g.id, x: xScale(sx), y: yScale(sy), category: 'agent' as const,
        color: g.source === 'concurrent' ? '#a855f7' : '#14b8a6',
      };
    });
    useAppStore.getState().setMinimapGhostDots(ghostDots);

    console.log("🎯 Attaching click handlers to", images.length, "image nodes");

    // Add invisible click area:
    //   - Mood boards: full 3:2 landscape rect
    //   - References layer: full square
    //   - Shoes layer: 60% vertical center crop
    imageNodes
      .append("rect")
      .attr("x", (d: any) => {
        const sz = imageSizeOverridesRef.current[d.id] ?? imageSize;
        const w = (d as any).realm === 'mood-board' ? sz * 1.5 : sz;
        return -w / 2;
      })
      .attr("y", (d: any) => {
        const sz = imageSizeOverridesRef.current[d.id] ?? imageSize;
        const isRef = (imageLayerMapRef.current[d.id] ?? "default") === "references";
        const isMoodBoard = (d as any).realm === 'mood-board';
        return isMoodBoard || isRef ? -sz / 2 : -sz * 0.3;
      })
      .attr("width", (d: any) => {
        const sz = imageSizeOverridesRef.current[d.id] ?? imageSize;
        return (d as any).realm === 'mood-board' ? sz * 1.5 : sz;
      })
      .attr("height", (d: any) => {
        const sz = imageSizeOverridesRef.current[d.id] ?? imageSize;
        const isRef = (imageLayerMapRef.current[d.id] ?? "default") === "references";
        const isMoodBoard = (d as any).realm === 'mood-board';
        return isMoodBoard || isRef ? sz : sz * 0.6;
      })
      .attr("rx", 8)
      .attr("fill", "transparent")
      .attr("pointer-events", "all")
      .style("cursor", "pointer")
      .on("click", function (event, d) {
        console.log("🖱️ Canvas click detected:", {
          imageId: d.id,
          eventType: event.type,
          button: event.button,
          ctrlKey: event.ctrlKey,
          target: event.target,
          currentTarget: event.currentTarget,
        });

        event.stopPropagation();

        // Axis tuning mode: clicking a node adds it as an anchor instead of selecting
        const tuningState = useAppStore.getState();
        if (tuningState.axisTuningMode && tuningState.axisTuningAxis) {
          tuningState.addAxisTuningAnchor({
            imageId: d.id,
            axis: tuningState.axisTuningAxis,
            position: 5, // Default to middle; user drags to reposition on rail
          });
          return;
        }

        // Block selection of non-isolated images when in isolate mode
        const curIsolated = useAppStore.getState().isolatedImageIds;
        if (curIsolated !== null && !curIsolated.includes(d.id)) return;

        const wasSelected = useAppStore.getState().selectedImageIds.includes(d.id);
        const currentCount = useAppStore.getState().selectedImageIds.length;

        console.log(
          "📝 Before toggle - selected IDs:",
          useAppStore.getState().selectedImageIds
        );

        toggleImageSelection(d.id, event.ctrlKey);

        setTimeout(() => {
          const currentSelection = useAppStore.getState().selectedImageIds;
          console.log("📝 After toggle - selected IDs:", currentSelection);
          const newCount = currentSelection.length;

          if (newCount > 0) {
            // Only update position if this is the first selection OR if we're deselecting
            // This keeps the panel in a stable position when adding to selection
            const shouldUpdatePosition = currentCount === 0 || wasSelected;

            if (shouldUpdatePosition) {
              // CRITICAL: Calculate position BEFORE state update (element still exists)
              const rect = (this as SVGRectElement).getBoundingClientRect();
              const container = svgRef.current?.parentElement;
              const containerRect = container?.getBoundingClientRect();

              if (containerRect) {
                // Convert to container-relative coordinates
                const relativeX = rect.right - containerRect.left + 10;
                const relativeY = rect.top - containerRect.top;

                console.log("📍 Position calculation:", {
                  elementRect: {
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                  },
                  containerRect: {
                    left: containerRect.left,
                    top: containerRect.top,
                  },
                  relative: { x: relativeX, y: relativeY },
                });

                onSelectionChange(relativeX, relativeY, newCount);
              } else {
                // Fallback to viewport coords
                console.warn("⚠️ No container rect, using viewport coords");
                const rect = (this as SVGRectElement).getBoundingClientRect();
                onSelectionChange(rect.right + 10, rect.top, newCount);
              }
            } else {
              // Just update the count, keep position stable
              console.log("📍 Keeping panel position, just updating count to", newCount);
              onSelectionChange(-1, -1, newCount); // -1 signals to keep existing position
            }
          } else {
            console.log("❌ No selection, closing panel");
            onSelectionChange(0, 0, 0);
          }
        }, 0);
      })
      .on("mouseenter", function () {
        const g = d3.select(this.parentNode as SVGGElement);
        const id = (g.datum() as any).id;
        // Only apply hover glow if not already selected (selection glow takes priority)
        if (!useAppStore.getState().selectedImageIds.includes(id)) {
          g.attr("filter", "url(#hover-glow)");
        }
      })
      .on("mouseleave", function () {
        const g = d3.select(this.parentNode as SVGGElement);
        const id = (g.datum() as any).id;
        // Only clear filter if not selected
        if (!useAppStore.getState().selectedImageIds.includes(id)) {
          g.attr("filter", null);
        }
      });

    // Add image (mood boards render at 3:2 landscape aspect; shoes square)
    imageNodes
      .append("image")
      .attr("href", (d) => `data:image/png;base64,${d.base64_image}`)
      .attr("x", (d: any) => {
        const sz = imageSizeOverridesRef.current[d.id] ?? imageSize;
        const w = (d as any).realm === 'mood-board' ? sz * 1.5 : sz;
        return -w / 2;
      })
      .attr("y", (d: any) => -(imageSizeOverridesRef.current[d.id] ?? imageSize) / 2)
      .attr("width", (d: any) => {
        const sz = imageSizeOverridesRef.current[d.id] ?? imageSize;
        return (d as any).realm === 'mood-board' ? sz * 1.5 : sz;
      })
      .attr("height", (d: any) => imageSizeOverridesRef.current[d.id] ?? imageSize)
      .attr("opacity", (d: any) => imageOpacityOverridesRef.current[d.id] ?? visualSettings.imageOpacity)
      .style("pointer-events", "none");

    // Selection and parent/child highlighting uses CSS drop-shadow classes
    // applied to <g> groups — pulsing cyan glow for selection

    // Click on canvas background to deselect — must NOT be on an image-node or ghost-node
    const handleBackgroundClick = (event: any) => {
      const target = event.target as Element;
      // If click landed on an image node or ghost node, ignore (those have their own handlers)
      if (target.closest(".image-node") || target.closest(".ghost-node")) return;
      // Any other click inside the SVG = background click → deselect
      useAppStore.getState().clearSelection();
      onSelectionChange(0, 0, 0);
    };
    svg.on("click", handleBackgroundClick);

    // Ghost nodes always on top of regular images (raise to last child = highest z-order)
    ghostGroup.raise();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    images,
    // imageLayerMap removed: tracked via `images` memo; click-area uses imageLayerMapRef
    visualSettings,
    axisLabels,
    canvasBounds,
    ghostNodes,
    resizeTick, // Re-fire when SVG gains non-zero size after a zero-size render
    // Note: Excluded selectedImageIds and hoveredGroupId to prevent full redraws on selection/hover changes
    // These are handled in a separate effect below
  ]);

  // Separate effect for selection/hover updates - NO full redraw!
  useEffect(() => {
    if (!svgRef.current || images.length === 0) return;

    const svg = d3.select(svgRef.current);
    const imagesGroup = svg.select(".images");

    if (imagesGroup.empty()) return;

    // Reset selection glow on all <g> groups
    imagesGroup.selectAll(".image-node")
      .classed("selected-glow", false)
      .attr("filter", null);

    // Apply selection glow ONLY to actually selected shoes (cyan glow)
    selectedImageIds.forEach((id) => {
      imagesGroup.select(`#image-${id}`).classed("selected-glow", true);
    });

    // Opacity cascade — compound: star filter + isolate + selection
    const storeSnap = useAppStore.getState();
    const starFilterVal = storeSnap.starFilter;
    const imageRatingsVal = storeSnap.imageRatings;
    const isolateSet = isolatedImageIds !== null ? new Set(isolatedImageIds) : null;

    // Build selection-related set (depth-1) for selection cascade
    const relatedSet = new Set<number>(selectedImageIds);
    if (selectedImageIds.length > 0) {
      selectedImageIds.forEach(id => {
        const img = images.find(i => i.id === id);
        if (img) {
          img.parents.forEach(parentId => relatedSet.add(parentId));
          img.children.forEach(childId => relatedSet.add(childId));
        }
      });
    }

    imagesGroup.selectAll(".image-node").each(function(d: any) {
      const starPasses = starFilterVal === null || (imageRatingsVal[d.id] ?? 0) >= starFilterVal;
      const isolatePasses = isolateSet === null || isolateSet.has(d.id);
      const el = d3.select(this);

      // Compound: if fails any active filter, dim to near-invisible
      // EXCEPTION: selected shoes always stay visible (full opacity)
      const isSelected = selectedImageIds.includes(d.id);
      if ((!starPasses || !isolatePasses) && !isSelected) {
        el.transition().duration(250).attr("opacity", 0.05);
        el.style("pointer-events", "none");
        return;
      }

      // Re-enable pointer-events for visible items
      el.style("pointer-events", null);

      // Both filters pass — apply selection cascade
      // Only selected shoes get full opacity; everything else dims equally.
      // Parent/child relationships are shown via genealogy lines, not opacity.
      if (selectedImageIds.length > 0) {
        // Selection dimming: selected=1.0, unselected=0.3 on <g>
        // The <image> element inside already carries the per-image or global imageOpacity
        const opacity = isSelected ? 1.0 : 0.3;
        el.transition().duration(200).attr("opacity", opacity);
      } else {
        // No selection: reset <g> to 1.0 (fully visible as a group)
        // Actual imageOpacity is on the <image> element set by the render/fast-path
        el.transition().duration(200).attr("opacity", 1.0);
      }
    });

    // Highlight images in hovered group (silver glow filter)
    if (hoveredGroupId) {
      imagesGroup.selectAll(".image-node").each(function (d: any) {
        if (d.group_id === hoveredGroupId && !selectedImageIds.includes(d.id)) {
          d3.select(this).attr("filter", "url(#hover-glow)");
        }
      });
    }

    // Highlight hovered image from tree modal (silver glow filter)
    if (hoveredImageId && !selectedImageIds.includes(hoveredImageId)) {
      imagesGroup.select(`#image-${hoveredImageId}`).attr("filter", "url(#hover-glow)");
    }

    // Draw directional genealogy lines ONLY for selected images
    // Use actual positions from DOM elements (works for both static and physics modes)
    const genealogyLinesGroup = svg.select(".genealogy-lines");
    genealogyLinesGroup.selectAll("*").remove();

    // Build imageMap for realm lookups
    const imageMap = new Map(images.map(img => [img.id, img]));

    // Line thickness scales with image size (thinner at small sizes, max 1.2px)
    const imgSize = useAppStore.getState().visualSettings.imageSize;
    const lineWidth = Math.max(0.5, Math.min(1.2, imgSize / 120));
    const dashScale = Math.max(0.6, Math.min(1.0, imgSize / 150));

    // ── Helper: pick genealogy line color by parent→child realm transition ──
    const getGenealogyCssColor = (fromRealm: string | undefined, toRealm: string | undefined): string => {
      const from = fromRealm ?? 'shoe';
      const to = toRealm ?? 'shoe';
      if (from === 'mood-board' && to === 'mood-board') return '#FF6B2B'; // orange: board→board
      if (from === 'shoe' && to === 'shoe') return '#8BBFD9';             // steel-blue: shoe→shoe
      if (from === 'mood-board' && to === 'shoe') return '#3fb950';        // green: consolidation
      return '#a855f7';                                                    // purple: abstraction shoe→board
    };

    const getGenealogyCssDash = (fromRealm: string | undefined, toRealm: string | undefined): string => {
      const from = fromRealm ?? 'shoe';
      const to = toRealm ?? 'shoe';
      // Dashed for same-realm boards and abstractions; solid for shoes and consolidation
      if (from === 'mood-board' && to === 'mood-board') return '5 7';
      if (from === 'shoe' && to === 'mood-board') return '3 5';
      return '6 8'; // default dashed
    };

    if (selectedImageIds.length > 0) {
      const drawnLinks = new Set<string>();

      selectedImageIds.forEach((selectedId) => {
        const selectedImg = images.find((img) => img.id === selectedId);
        if (!selectedImg) return;

        // Get actual position from DOM element
        const selectedNode = svg.select(`#image-${selectedId}`).node() as SVGGElement;
        if (!selectedNode) return;
        const selectedTransform = selectedNode.getAttribute("transform");
        const selectedMatch = selectedTransform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!selectedMatch) return;
        const sx = parseFloat(selectedMatch[1]);
        const sy = parseFloat(selectedMatch[2]);

        // Parent → Selection
        selectedImg.parents.forEach((parentId) => {
          if (isolateSet !== null && !isolateSet.has(parentId)) return;
          const key = `${parentId}->${selectedId}`;
          if (drawnLinks.has(key)) return;
          drawnLinks.add(key);

          const parentNode = svg.select(`#image-${parentId}`).node() as SVGGElement;
          if (!parentNode) return;
          const parentTransform = parentNode.getAttribute("transform");
          const parentMatch = parentTransform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
          if (!parentMatch) return;
          const px = parseFloat(parentMatch[1]);
          const py = parseFloat(parentMatch[2]);

          const cp1x = px; const cp1y = py + (sy - py) * 0.4;
          const cp2x = sx; const cp2y = sy - (sy - py) * 0.4;

          const parentImg = imageMap.get(parentId);
          const lineColor = getGenealogyCssColor(parentImg?.realm, selectedImg.realm);
          const dashArr = getGenealogyCssDash(parentImg?.realm, selectedImg.realm);

          const scaledDash = dashArr.split(' ').map(v => String(parseFloat(v) * dashScale)).join(' ');
          const pLine = genealogyLinesGroup.append("path")
            .attr("d", `M ${px} ${py} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${sx} ${sy}`)
            .attr("stroke", lineColor)
            .attr("stroke-width", lineWidth)
            .attr("fill", "none")
            .attr("opacity", 0.7)
            .attr("stroke-dasharray", scaledDash);
          pLine.append("animate")
            .attr("attributeName", "stroke-dashoffset")
            .attr("from", String(Math.round(12 * dashScale))).attr("to", "0")
            .attr("dur", "1.8s").attr("repeatCount", "indefinite");
        });

        // Selection → Child
        selectedImg.children.forEach((childId) => {
          if (isolateSet !== null && !isolateSet.has(childId)) return;
          const key = `${selectedId}->${childId}`;
          if (drawnLinks.has(key)) return;
          drawnLinks.add(key);

          const childNode = svg.select(`#image-${childId}`).node() as SVGGElement;
          if (!childNode) return;
          const childTransform = childNode.getAttribute("transform");
          const childMatch = childTransform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
          if (!childMatch) return;
          const cx = parseFloat(childMatch[1]);
          const cy = parseFloat(childMatch[2]);

          const cp1x = sx; const cp1y = sy + (cy - sy) * 0.4;
          const cp2x = cx; const cp2y = cy - (cy - sy) * 0.4;

          const childImg = imageMap.get(childId);
          const lineColor = getGenealogyCssColor(selectedImg.realm, childImg?.realm);
          const dashArr = getGenealogyCssDash(selectedImg.realm, childImg?.realm);

          const scaledDashC = dashArr.split(' ').map(v => String(parseFloat(v) * dashScale)).join(' ');
          const cLine = genealogyLinesGroup.append("path")
            .attr("d", `M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${cx} ${cy}`)
            .attr("stroke", lineColor)
            .attr("stroke-width", lineWidth)
            .attr("fill", "none")
            .attr("opacity", 0.7)
            .attr("stroke-dasharray", scaledDashC);
          cLine.append("animate")
            .attr("attributeName", "stroke-dashoffset")
            .attr("from", String(Math.round(12 * dashScale))).attr("to", "0")
            .attr("dur", "1.8s").attr("repeatCount", "indefinite");
        });

        // Satellite tether lines removed — satellites only shown in inspector
      });
    }
  // Note: full visualSettings intentionally excluded — opacity is handled by the render/fast-path on <image>,
  // not by this selection effect on <g>. Including it caused opacity compounding and slider blink.
  // However, axisScaleX/Y ARE included so genealogy lines recalculate when the user stretches axes.
  }, [selectedImageIds, hoveredGroupId, hoveredImageId, images, isolatedImageIds, starFilter, imageRatings,
      visualSettings.axisScaleX, visualSettings.axisScaleY]);

  // FlyTo effect: smoothly pan/zoom to a specific image
  const flyToImageId = useAppStore((state) => state.flyToImageId);
  useEffect(() => {
    if (
      !flyToImageId ||
      !svgRef.current ||
      !zoomRef.current ||
      !xScaleRef.current ||
      !yScaleRef.current
    )
      return;

    const img = images.find((i) => i.id === flyToImageId);
    if (!img) return;

    const coordScale = visualSettings.coordinateScale || 1.0;
    const coordOffset = visualSettings.coordinateOffset || [0, 0, 0];
    const axisScaleX = visualSettings.axisScaleX ?? 1.0;
    const axisScaleY = visualSettings.axisScaleY ?? 1.0;
    const bx = (img.coordinates[0] + coordOffset[0]) * coordScale;
    const by = (img.coordinates[1] + coordOffset[1]) * coordScale;
    // Apply stretch using the same pivot that was last used for positioning
    const pX = stretchPivotXRef.current;
    const pY = stretchPivotYRef.current;
    const sx = pX + (bx - pX) * axisScaleX;
    const sy = pY + (by - pY) * axisScaleY;
    const px = xScaleRef.current(sx);
    const py = yScaleRef.current(sy);

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Zoom to scale 2, centered on the image
    const targetScale = 2;
    const tx = width / 2 - px * targetScale;
    const ty = height / 2 - py * targetScale;
    const targetTransform = d3.zoomIdentity
      .translate(tx, ty)
      .scale(targetScale);

    svg
      .transition()
      .duration(600)
      .call(zoomRef.current.transform as any, targetTransform);

    // Clear the flyTo request
    useAppStore.getState().setFlyToImageId(null);
  }, [flyToImageId, images, visualSettings]);

  // Minimap pan effect: smoothly pan canvas so given base-coord center appears at screen center
  const minimapPanRequest = useAppStore((s) => s.minimapPanRequest);
  const prevPanReqId = useRef<number | null>(null);
  useEffect(() => {
    if (!minimapPanRequest || minimapPanRequest.id === prevPanReqId.current) return;
    if (!svgRef.current || !zoomRef.current) return;
    prevPanReqId.current = minimapPanRequest.id;

    const { centerX, centerY } = minimapPanRequest;
    const svgEl = svgRef.current;
    const w = svgEl.clientWidth;
    const h = svgEl.clientHeight;
    const t = d3.zoomTransform(svgEl as unknown as Element);
    const tx = w / 2 - centerX * t.k;
    const ty = h / 2 - centerY * t.k;
    const targetTransform = d3.zoomIdentity.translate(tx, ty).scale(t.k);

    d3.select(svgEl)
      .call(zoomRef.current.transform as any, targetTransform);
  }, [minimapPanRequest]);

  // Tab cycling: track cursor position + cycle overlapping shoes on Tab press
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = svgEl.getBoundingClientRect();
      cursorPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Reset cycle when cursor moves significantly
      overlapCycleRef.current = { ids: [], index: -1 };
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const svgRect = svgEl.getBoundingClientRect();
      const cx = cursorPosRef.current.x;
      const cy = cursorPosRef.current.y;
      // Skip if cursor is outside the SVG
      if (cx < 0 || cy < 0 || cx > svgRect.width || cy > svgRect.height) return;

      // Find all image nodes whose bounding box contains the cursor
      const nearby: number[] = [];
      svgEl.querySelectorAll('[data-image-id]').forEach((el: Element) => {
        const r = el.getBoundingClientRect();
        const ex = r.left - svgRect.left + r.width / 2;
        const ey = r.top - svgRect.top + r.height / 2;
        const dist = Math.sqrt((ex - cx) ** 2 + (ey - cy) ** 2);
        if (dist < Math.max(r.width, r.height) * 0.75) {
          const id = parseInt(el.getAttribute('data-image-id') || '-1');
          if (id >= 0) nearby.push(id);
        }
      });

      if (nearby.length < 2) return; // No overlap, let Tab do its thing

      e.preventDefault();

      // Build or continue the cycle
      const cycle = overlapCycleRef.current;
      const sameSet = cycle.ids.length === nearby.length && cycle.ids.every((id, i) => id === nearby[i]);
      if (!sameSet) {
        overlapCycleRef.current = { ids: nearby, index: 0 };
      } else {
        overlapCycleRef.current.index = (cycle.index + 1) % nearby.length;
      }

      const targetId = overlapCycleRef.current.ids[overlapCycleRef.current.index];
      // Bring the target node to front and apply hover glow
      const targetEl = svgEl.querySelector(`#image-${targetId}`);
      if (targetEl) {
        (targetEl as SVGGElement).parentNode?.appendChild(targetEl);
        // Update hover state
        useAppStore.getState().setHoveredImageId(targetId);
      }
    };

    svgEl.addEventListener('mousemove', handleMouseMove);
    svgEl.addEventListener('keydown', handleKeyDown);
    // Make SVG focusable for keydown to work
    if (!svgEl.hasAttribute('tabindex')) svgEl.setAttribute('tabindex', '0');

    return () => {
      svgEl.removeEventListener('mousemove', handleMouseMove);
      svgEl.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      ...(isolatedImageIds !== null ? {
        outline: "2px solid rgba(239,68,68,0.75)",
        outlineOffset: "-2px",
        boxShadow: "inset 0 0 0 2px rgba(239,68,68,0.4), 0 0 24px rgba(239,68,68,0.15)",
      } : starFilter !== null ? {
        outline: "2px solid rgba(240,192,64,0.65)",
        outlineOffset: "-2px",
        boxShadow: "inset 0 0 0 2px rgba(240,192,64,0.3), 0 0 20px rgba(240,192,64,0.1)",
      } : {}),
    }}>
      <svg
        ref={svgRef}
        style={{ width: "100%", height: "100%", background: "#0d1117" }}
      />
      {brush && (
        <svg
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          <rect
            x={brush.x} y={brush.y} width={brush.w} height={brush.h}
            fill={brush.mode === 'window' ? "rgba(0,210,255,0.06)" : "rgba(80,220,160,0.06)"}
            stroke={brush.mode === 'window' ? "rgba(0,210,255,0.55)" : "rgba(80,220,160,0.55)"}
            strokeWidth={1}
            strokeDasharray={brush.mode === 'crossing' ? "5 3" : undefined}
          />
        </svg>
      )}

      {/* Minimap — bottom-left corner */}
      <Minimap />

      {/* Star Filter — top-right corner */}
      <div data-tour="star-filter" style={{
        position: "absolute",
        top: 12,
        right: 16,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        background: "rgba(13, 17, 23, 0.82)",
        backdropFilter: "blur(8px)",
        border: `1px solid ${starFilter !== null ? "rgba(240,192,64,0.55)" : "rgba(48,54,61,0.5)"}`,
        borderRadius: 8,
        pointerEvents: "auto",
        transition: "border-color 0.2s",
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(150,165,180,0.55)", textTransform: "uppercase", flexShrink: 0 }}>
          Filter
        </span>
        {[1, 2, 3, 4, 5].map((n) => {
          const isActive = starFilter !== null && n <= starFilter;
          return (
          <button
            key={n}
            onClick={() => {
              const newFilter = starFilter === n ? null : n;
              apiClient.logEvent('star_filter_toggle', { filterLevel: newFilter, previousLevel: starFilter });
              useAppStore.getState().setStarFilter(newFilter);
            }}
            title={starFilter === n ? "Clear filter" : `Show ${n}+ star shoes`}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              width: 22,
              textAlign: "center" as const,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              color: isActive ? "#f0c040" : "rgba(150,165,180,0.3)",
              textShadow: isActive ? "0 0 8px rgba(240,192,64,0.6)" : "none",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#f0c040"; }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = isActive ? "#f0c040" : "rgba(150,165,180,0.3)";
            }}
          >
            {isActive ? "★" : "☆"}
          </button>
          );
        })}
        {starFilter !== null && (
          <button
            onClick={() => {
              apiClient.logEvent('star_filter_toggle', { filterLevel: null, previousLevel: starFilter });
              useAppStore.getState().setStarFilter(null);
            }}
            title="Clear star filter"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(150,165,180,0.55)",
              fontSize: 13,
              padding: "0 2px",
              lineHeight: 1,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#fca5a5"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(150,165,180,0.55)"; }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Hidden images indicator */}
      {hiddenImageIds.length > 0 && (
        <div style={{
          position: "absolute",
          top: 52,
          right: 16,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: "rgba(13, 17, 23, 0.82)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(180,140,255,0.35)",
          borderRadius: 8,
          pointerEvents: "auto",
          fontSize: 11,
          color: "rgba(200,180,255,0.85)",
        }}>
          <span>Hidden: {hiddenImageIds.length}</span>
          <button
            onClick={() => useAppStore.getState().unhideAll()}
            title="Unhide all hidden images"
            style={{
              background: "rgba(180,140,255,0.15)",
              border: "1px solid rgba(180,140,255,0.3)",
              borderRadius: 4,
              color: "rgba(200,180,255,0.9)",
              fontSize: 10,
              padding: "1px 6px",
              cursor: "pointer",
            }}
          >
            Unhide All
          </button>
        </div>
      )}

      {/* View filter panel removed — only side views shown on canvas */}

      {/* X-Axis: label centred at bottom edge, slider directly below */}
      <div data-tour="axis-x" style={{
        position: "absolute",
        bottom: 12,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        pointerEvents: "auto",
      }}>
        <AxisEditor
          axis="x"
          negativeLabel={axisLabels.x[0]}
          positiveLabel={axisLabels.x[1]}
          onUpdate={async (negative, positive) => {
            try {
              useAppStore.getState().pushAxisHistory();
              useProgressStore.getState().showProgress("reprojecting", "Computing embeddings & reprojecting...", false);
              await apiClient.updateAxes({
                x_negative: negative,
                x_positive: positive,
                y_negative: axisLabels.y[0],
                y_positive: axisLabels.y[1],
              });
              useProgressStore.getState().updateProgress(70, "Updating canvas...");
              const state = await apiClient.getState();
              // Reset bounds + set new data in same batch so bounds recalculate from NEW coordinates
              useAppStore.getState().resetCanvasBounds();
              useAppStore.setState({ axisLabels: { ...axisLabels, x: [negative, positive] as [string, string] } });
              useAppStore.getState().setImages(state.images);
              if (state.expanded_concepts) useAppStore.getState().setExpandedConcepts(state.expanded_concepts);
              useProgressStore.getState().updateProgress(100);
              useProgressStore.getState().hideProgress();
            } catch (error) {
              useProgressStore.getState().hideProgress();
              alert(`Failed to update X-axis: ${error}`);
            }
          }}
          expandedNegative={expandedConcepts?.x_negative}
          expandedPositive={expandedConcepts?.x_positive}
        />
        <div data-tour="axis-scale-x">
          <AxisScaleSlider
            axis="x"
            value={visualSettings.axisScaleX ?? 1}
            onChange={(v) => useAppStore.getState().updateVisualSettings({ axisScaleX: v })}
          />
        </div>
      </div>

      {/* Axis history dropdown — bottom-left near axis intersection */}
      {axisHistory.length > 0 && (
        <div style={{
          position: "absolute",
          bottom: 12,
          left: 86,
          pointerEvents: "auto",
          zIndex: 5,
        }}>
          <button
            onClick={() => setAxisHistoryOpen(!axisHistoryOpen)}
            title="Axis history"
            style={{
              background: axisHistoryOpen ? 'rgba(140,180,255,0.2)' : 'rgba(30,35,50,0.7)',
              border: '1px solid rgba(140,180,255,0.3)',
              borderRadius: 6,
              color: 'rgba(200,215,230,0.85)',
              fontSize: 11,
              padding: '3px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 13 }}>&#x21BA;</span>
            Axes ({axisHistory.length})
          </button>
          {axisHistoryOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: 4,
                background: 'rgba(22,26,35,0.95)',
                border: '1px solid rgba(140,180,255,0.25)',
                borderRadius: 8,
                padding: 6,
                minWidth: 220,
                maxHeight: 260,
                overflowY: 'auto',
                backdropFilter: 'blur(12px)',
              }}
              onMouseLeave={() => setAxisHistoryOpen(false)}
            >
              <div style={{ fontSize: 10, color: 'rgba(160,175,195,0.7)', padding: '2px 6px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
                Previous axis configurations
              </div>
              {axisHistory.map((entry) => {
                const ago = Math.round((Date.now() - entry.timestamp) / 60000);
                const timeLabel = ago < 1 ? 'just now' : ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
                return (
                  <button
                    key={entry.timestamp}
                    onClick={async () => {
                      setAxisHistoryOpen(false);
                      try {
                        useAppStore.getState().pushAxisHistory(); // snapshot current before restoring
                        const labels = entry.labels;
                        useProgressStore.getState().showProgress("reprojecting", "Restoring axes...", false);
                        await apiClient.updateAxes({
                          x_negative: labels.x[0],
                          x_positive: labels.x[1],
                          y_negative: labels.y[0],
                          y_positive: labels.y[1],
                        });
                        useProgressStore.getState().updateProgress(70, "Updating canvas...");
                        const state = await apiClient.getState();
                        useAppStore.getState().resetCanvasBounds();
                        useAppStore.getState().setAxisLabels(state.axis_labels);
                        useAppStore.getState().setImages(state.images);
                        if (state.expanded_concepts) useAppStore.getState().setExpandedConcepts(state.expanded_concepts);
                        useProgressStore.getState().updateProgress(100);
                        useProgressStore.getState().hideProgress();
                      } catch (err) {
                        useProgressStore.getState().hideProgress();
                        alert(`Failed to restore axes: ${err}`);
                      }
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 5,
                      padding: '5px 8px',
                      cursor: 'pointer',
                      color: 'rgba(200,215,230,0.9)',
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(140,180,255,0.12)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      X: {entry.labels.x[0]} — {entry.labels.x[1]}
                    </div>
                    <div style={{ fontWeight: 500 }}>
                      Y: {entry.labels.y[0]} — {entry.labels.y[1]}
                    </div>
                    <div style={{ fontSize: 9, color: 'rgba(160,175,195,0.5)', marginTop: 1 }}>{timeLabel}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Y-Axis scale slider: same fixed-size pattern as right-edge size slider, mirrored to left */}
      <div data-tour="axis-scale-y" style={{
        position: "absolute",
        left: 12,
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 140,
        pointerEvents: "auto",
      }}>
        <div style={{ transform: "rotate(-90deg)", width: 140, flexShrink: 0 }}>
          <AxisScaleSlider
            axis="y"
            value={visualSettings.axisScaleY ?? 1}
            onChange={(v) => useAppStore.getState().updateVisualSettings({ axisScaleY: v })}
            compact
          />
        </div>
      </div>

      {/* Y-Axis label: independent container just right of the slider, same fixed-box rotation pattern */}
      <div style={{
        position: "absolute",
        left: 44,
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 260,
        overflow: "visible",
        pointerEvents: "auto",
      }}>
        <div style={{ transform: "rotate(-90deg)", whiteSpace: "nowrap", flexShrink: 0 }}>
          <AxisEditor
            axis="y"
            negativeLabel={axisLabels.y[0]}
            positiveLabel={axisLabels.y[1]}
            onUpdate={async (negative, positive) => {
              try {
                useAppStore.getState().pushAxisHistory();
                useProgressStore.getState().showProgress("reprojecting", "Computing embeddings & reprojecting...", false);
                await apiClient.updateAxes({
                  x_negative: axisLabels.x[0],
                  x_positive: axisLabels.x[1],
                  y_negative: negative,
                  y_positive: positive,
                });
                useProgressStore.getState().updateProgress(70, "Updating canvas...");
                const state = await apiClient.getState();
                // Reset bounds + set new data in same batch so bounds recalculate from NEW coordinates
                useAppStore.getState().resetCanvasBounds();
                useAppStore.setState({ axisLabels: { ...axisLabels, y: [negative, positive] as [string, string] } });
                useAppStore.getState().setImages(state.images);
                if (state.expanded_concepts) useAppStore.getState().setExpandedConcepts(state.expanded_concepts);
                useProgressStore.getState().updateProgress(100);
                useProgressStore.getState().hideProgress();
              } catch (error) {
                useProgressStore.getState().hideProgress();
                alert(`Failed to update Y-axis: ${error}`);
              }
            }}
            expandedNegative={expandedConcepts?.y_negative}
            expandedPositive={expandedConcepts?.y_positive}
          />
        </div>
      </div>

      {/* Size + Opacity sliders: stacked vertically at right edge */}
      <div data-tour="canvas-sliders" style={{
        position: "absolute",
        right: 12,
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 28,
        pointerEvents: "auto",
      }}>
        {/* Size slider */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 140 }}>
          <div style={{ transform: "rotate(-90deg)", width: 140, flexShrink: 0 }}>
            <AxisScaleSlider
              axis="size"
              value={selectedImageIds.length > 0
                ? (imageSizeOverrides[selectedImageIds[0]] ?? visualSettings.imageSize)
                : visualSettings.imageSize}
              onChange={(v) => {
                const sel = useAppStore.getState().selectedImageIds;
                const sz = Math.round(v);
                if (sel.length > 0) {
                  // Direct DOM update for immediate feedback
                  const svg = d3.select(svgRef.current!);
                  sel.forEach((id) => {
                    svg.select(`[data-image-id="${id}"]`).each(function() {
                      d3.select(this).select("rect")
                        .attr("x", -sz / 2).attr("y", -sz * 0.3)
                        .attr("width", sz).attr("height", sz * 0.6);
                      d3.select(this).select("image")
                        .attr("x", -sz / 2).attr("y", -sz / 2)
                        .attr("width", sz).attr("height", sz);
                    });
                  });
                  useAppStore.getState().setImageSizeOverrides(sel, sz);
                } else {
                  useAppStore.getState().updateVisualSettings({ imageSize: sz });
                }
              }}
              compact
              minVal={40}
              maxVal={500}
              isLinear
              unit="px"
            />
          </div>
        </div>
        {/* Opacity slider */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 140 }}>
          <div style={{ transform: "rotate(-90deg)", width: 140, flexShrink: 0 }}>
            <AxisScaleSlider
              axis="opacity"
              value={(selectedImageIds.length > 0
                ? (imageOpacityOverrides[selectedImageIds[0]] ?? visualSettings.imageOpacity)
                : visualSettings.imageOpacity) * 100}
              onChange={(v) => {
                const sel = useAppStore.getState().selectedImageIds;
                const op = Math.round(v) / 100;
                if (sel.length > 0) {
                  const svg = d3.select(svgRef.current!);
                  sel.forEach((id) => {
                    svg.select(`[data-image-id="${id}"]`).select("image").attr("opacity", op);
                  });
                  useAppStore.getState().setImageOpacityOverrides(sel, op);
                } else {
                  useAppStore.getState().updateVisualSettings({ imageOpacity: op });
                }
              }}
              compact
              minVal={10}
              maxVal={100}
              isLinear
              unit="%"
            />
          </div>
        </div>
      </div>

      {/* Bottom-right buttons: Unhide (isolate) + Visual Reset + Recenter */}
      <div data-tour="canvas-reset-buttons" style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        display: "flex",
        gap: 8,
        pointerEvents: "auto",
      }}>
        {/* Unhide — only shown in isolate mode */}
        {isolatedImageIds !== null && (
          <button
            data-tour="unhide-all-btn"
            style={{
              background: "rgba(239,68,68,0.18)",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(239,68,68,0.7)",
              borderRadius: 6,
              color: "#fca5a5",
              fontSize: 12,
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 600,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.35)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.18)"; }}
            onClick={() => useAppStore.getState().setIsolatedImageIds(null)}
            title="Exit isolate mode — show all images"
          >
            ⊙ Unhide All
          </button>
        )}
        {/* Deleted Images undo panel — shows restore button when items are soft-deleted */}
        <DeletedImagesPanel />
        {/* Visual Reset: clear per-image size/opacity overrides */}
        <button
          data-tour="visual-reset-btn"
          style={{
            background: "rgba(22, 27, 34, 0.85)",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(48, 54, 61, 0.6)",
            borderRadius: 6,
            color: "#c9d1d9",
            fontSize: 12,
            padding: "6px 12px",
            cursor: "pointer",
            opacity: 0.7,
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
          onClick={() => {
            useAppStore.getState().clearImageOverrides();
            useAppStore.getState().updateVisualSettings({ imageSize: 120, imageOpacity: 1.0 });
          }}
          title="Reset all image sizes and opacities to default"
        >
          Visual Reset
        </button>
        {/* Recenter / fit-all button */}
        <button
          data-tour="recenter-btn"
          style={{
            background: "rgba(22, 27, 34, 0.85)",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(48, 54, 61, 0.6)",
            borderRadius: 6,
            color: "#c9d1d9",
            fontSize: 12,
            padding: "6px 12px",
            cursor: "pointer",
            opacity: 0.7,
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
          onClick={() => {
            zoomTransformRef.current = null;
            useAppStore.getState().resetCanvasBounds();
            useAppStore.getState().updateVisualSettings({ axisScaleX: 1.0, axisScaleY: 1.0 });
          }}
          title="Recenter canvas to fit all shoes"
        >
          Recenter
        </button>
      </div>

    </div>
  );
};
