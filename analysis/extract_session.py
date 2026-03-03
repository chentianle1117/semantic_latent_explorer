#!/usr/bin/env python3
"""extract_session.py — Session JSON → infographic data block + thumbnails

Usage:
    python analysis/extract_session.py <session.json> [options]

Options:
    --out <path>            Write JS data block to file instead of stdout
    --thumbs-dir <path>     Thumbnail output directory (default: analysis/thumbs)
    --no-thumbs             Skip thumbnail extraction (useful if already done)
    --annotation <path>     Write annotation checklist to this path
                            (default: <session>_annotation.md beside the JSON)

What this extracts automatically:
    N[]           image nodes (id, batch, lane, src, parents, deleted, prompt, timestamp)
    BATCHES[]     generation batches with timestamps
    PROMPTS[]     per-batch prompts (timestamps from historyGroups)
    AXES[]        SKELETON ONLY — final axis labels from JSON; timestamps must be annotated
    CANVAS[]      SKELETON ONLY — must be annotated from screen recording
    PHASES[]      SKELETON ONLY — must be annotated

What needs manual annotation (see annotation checklist output):
    - star ratings (frontend-only state, not saved to JSON)
    - axis change timestamps (JSON only records final state)
    - canvas events (isolate/unhide/delete/recenter)
    - session phase boundaries
    - prompt mode tags vs freetext vs mixed
    - lane assignments (auto-guessed, may need tweaking)
    - key quotes for tooltips
"""

import json, sys, os, base64, argparse
from datetime import datetime, timezone
from pathlib import Path


# ─── Helpers ───────────────────────────────────────────────────────────────

def load_session(path: str) -> dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def parse_ts(ts_str: str) -> datetime:
    """Parse ISO timestamp, handle both Z-suffix and +00:00."""
    s = ts_str.replace('Z', '+00:00') if ts_str.endswith('Z') else ts_str
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        # Fallback: strip timezone info
        return datetime.fromisoformat(s[:19])


def elapsed_seconds(ts_str: str, session_start: str) -> float:
    """Return seconds elapsed from session_start to ts_str."""
    try:
        t = parse_ts(ts_str)
        s = parse_ts(session_start)
        return (t - s).total_seconds()
    except Exception:
        return 0.0


def map_src(method: str) -> str:
    """Map generation_method to infographic src category."""
    return {
        'dataset':        'external',    # loaded from Zappos catalog
        'external':       'external',    # user-uploaded reference image
        'reference':      'reference',   # iterated from parent(s)
        'interpolation':  'reference',   # iterpolated from parents
        'batch':          'batch',       # text-to-image from scratch
        'auto-variation': 'agent',       # agent-generated suggestion
        'agent':          'agent',
    }.get(method, 'reference')


# ─── Core extraction ────────────────────────────────────────────────────────

def build_arrays(session: dict) -> tuple:
    """Return (nodes, batches) ready for JS rendering."""
    images = session.get('images', [])
    groups = session.get('historyGroups', [])
    start  = session.get('createdAt', '2026-01-01T00:00:00')

    # Sort groups by timestamp → assign sequential batch indices
    groups_sorted = sorted(groups, key=lambda g: g.get('timestamp', start))
    batch_idx = {g['id']: i for i, g in enumerate(groups_sorted)}
    group_map  = {g['id']: g for g in groups_sorted}

    # Lane counter per group: cycles 0→2→1→0… for non-agent images
    lane_cycle = {}
    LANE_MAP = {0: 0, 1: 2, 2: 1}  # visually spread top/bot/mid

    nodes = []
    for img in sorted(images, key=lambda x: x.get('timestamp', start)):
        img_id   = img['id']
        group_id = img.get('group_id', '')
        batch    = batch_idx.get(group_id, 0)
        method   = img.get('generation_method', 'reference')
        src      = map_src(method)

        # Agent images always get center lane; others cycle
        if src == 'agent':
            lane = 1
        else:
            cnt = lane_cycle.get(group_id, 0)
            lane = LANE_MAP[cnt % 3]
            lane_cycle[group_id] = cnt + 1

        # Batch timestamp → elapsed seconds from session start
        grp_ts = group_map.get(group_id, {}).get('timestamp', start)
        t_sec  = elapsed_seconds(grp_ts, start)

        label = (img.get('prompt', '') or f'Image {img_id}')[:32].strip()
        prompt = (img.get('prompt', '') or '').strip()

        nodes.append({
            'id':      img_id,
            'batch':   batch,
            'lane':    lane,
            'src':     src,
            'label':   label,
            'par':     img.get('parents', []),
            'del':     not img.get('visible', True),
            'star':    False,   # NOT in session JSON — annotate manually
            'prompt':  prompt,
            # Meta (for annotation reference, not in output HTML)
            '_t_sec':  round(t_sec),
            '_method': method,
        })

    batches = []
    for g in groups_sorted:
        grp_ts = g.get('timestamp', start)
        t_sec  = elapsed_seconds(grp_ts, start)
        label  = (g.get('prompt', '') or f'Batch {len(batches)}')[:24].strip()
        batches.append({
            'id':    g['id'][:8],
            'label': label,
            't':     round(t_sec),
        })

    return nodes, batches


# ─── Thumbnail extraction ────────────────────────────────────────────────────

def extract_thumbnails(images: list, thumbs_dir: str, size: int = 120) -> dict:
    """
    Extract base64 images from session → resized thumbnails.
    Returns {image_id: 'data:image/png;base64,...'} dict.
    Requires Pillow: pip install Pillow
    """
    try:
        from PIL import Image
        import io
    except ImportError:
        print("  [skip] Pillow not installed — run:  pip install Pillow", file=sys.stderr)
        return {}

    Path(thumbs_dir).mkdir(parents=True, exist_ok=True)
    thumb_map = {}

    for img in images:
        img_id = img['id']
        b64    = img.get('base64_image', '')
        if not b64:
            continue

        # Strip data URL prefix
        if ',' in b64:
            b64 = b64.split(',', 1)[1]

        try:
            raw = base64.b64decode(b64)
            pil = Image.open(__import__('io').BytesIO(raw)).convert('RGBA')

            # Center-crop to square
            w, h = pil.size
            s = min(w, h)
            pil = pil.crop(((w - s) // 2, (h - s) // 2,
                             (w + s) // 2, (h + s) // 2))

            # Resize to target size
            pil = pil.resize((size, size), Image.LANCZOS)

            # Save PNG to disk
            png_path = os.path.join(thumbs_dir, f"{img_id}.png")
            pil.save(png_path, 'PNG')

            # Re-encode as base64 for thumbs_b64.json
            buf = __import__('io').BytesIO()
            pil.save(buf, 'PNG')
            thumb_map[img_id] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

        except Exception as e:
            print(f"  [warn] Image {img_id}: {e}", file=sys.stderr)

    return thumb_map


# ─── JS block renderer ──────────────────────────────────────────────────────

def render_js_block(nodes: list, batches: list, session: dict) -> str:
    """Render the JavaScript const block for pasting into the HTML template."""
    pid       = session.get('participantId', 'unknown')
    sid       = session.get('id', 'unknown')[:8]
    start     = session.get('createdAt', '')
    axis      = session.get('axisLabels', {})
    x_axis    = axis.get('x', ['left', 'right'])

    # Session duration estimate
    max_t = max((n['_t_sec'] for n in nodes), default=3600) + 120
    dur   = round(max_t)

    lines = [
        f"// ─── AUTO-EXTRACTED from session {sid} ({pid}) ───────────────────────────",
        f"// Session start: {start}",
        f"// Generated by:  analysis/extract_session.py",
        f"// ⚠️  MANUAL ANNOTATION REQUIRED (see _annotation.md):",
        f"//    star ratings · axis change timestamps · canvas events · phases · prompt modes",
        f"",
        f"const DUR = {dur}; // seconds — verify against actual recording length",
        f"",
        f"// ─── Nodes ──────────────────────────────────────────────────────────────────",
        f"// Fields: id, batch, lane (0=top 1=mid 2=bot), src, label, par[], del, star, prompt",
        f"// ⚠️  lane: auto-guessed — review for visual clarity",
        f"// ⚠️  star: always false — annotate from observation notes",
        f"const N = [",
    ]

    for n in nodes:
        label  = n['label'].replace('"', '\\"')
        prompt = n['prompt'][:60].replace('"', '\\"')
        par    = json.dumps(n['par'])
        d      = 'true' if n['del'] else 'false'
        t_min  = n['_t_sec'] / 60
        lines.append(
            f'  {{ id:{n["id"]}, batch:{n["batch"]}, lane:{n["lane"]}, '
            f'src:"{n["src"]}", label:"{label}", '
            f'par:{par}, del:{d}, star:false, prompt:"{prompt}" }},'
            f'  // {t_min:.1f}min [{n["_method"]}]'
        )

    lines += [
        "];",
        "",
        "// ─── Batches (generation groups) ─────────────────────────────────────────────",
        "const BATCHES = [",
    ]
    for b in batches:
        label = b['label'].replace('"', '\\"')
        lines.append(f'  {{ id:"{b["id"]}", label:"{label}", t:{b["t"]} }},')

    lines += [
        "];",
        "",
        "// ─── Axes ────────────────────────────────────────────────────────────────────",
        "// ⚠️  JSON only stores final axis state. Add an entry for EACH axis change.",
        "// Format: { start: <seconds>, end: <seconds>, left: 'label', right: 'label' }",
        "const AXES = [",
        f'  // Period 1 — fill in actual end time:',
        f'  // {{ start:0, end:???*60, left:"{x_axis[0]}", right:"{x_axis[1]}" }},',
        f'  // Period 2 — if axis was changed mid-session:',
        f'  {{ start:0, end:DUR, left:"{x_axis[0]}", right:"{x_axis[1]}" }},',
        "];",
        "",
        "// ─── Prompts ─────────────────────────────────────────────────────────────────",
        "// ⚠️  mode: 'tags' | 'mixed' | 'freetext' — annotate from recording",
        "// ⚠️  t: timestamp in seconds — verify against recording, currently from batch time",
        "const PROMPTS = [",
    ]

    seen_batches = set()
    for n in nodes:
        if not n['prompt'] or n['src'] == 'external' or n['batch'] in seen_batches:
            continue
        seen_batches.add(n['batch'])
        snip = n['prompt'][:50].replace('"', '\\"')
        lines.append(
            f'  {{ t:{n["_t_sec"]}, batch:{n["batch"]}, mode:"freetext", snippet:"{snip}" }},'
            f'  // ⚠️ verify mode'
        )

    lines += [
        "];",
        "",
        "// ─── Canvas events ───────────────────────────────────────────────────────────",
        "// ⚠️  All manual — record from screen recording/transcript",
        "// Types: 'Isolate', 'Unhide All', 'Recenter', 'Delete', 'Zoom attempt'",
        "const CANVAS = [",
        "  // { t: 10.6*60, label: 'Isolate' },",
        "  // { t: 11.8*60, label: 'Recenter' },",
        "];",
        "",
        "// ─── Session phases ───────────────────────────────────────────────────────────",
        "// ⚠️  Adjust boundaries and labels from transcript analysis",
        "const PHASES = [",
        f'  {{ start:0,        end:DUR*0.25, label:"Onboarding",   color:"#58a6ff" }},',
        f'  {{ start:DUR*0.25, end:DUR*0.75, label:"Exploration",  color:"#a855f7" }},',
        f'  {{ start:DUR*0.75, end:DUR,      label:"Evaluation",   color:"#22c55e" }},',
        "];",
    ]

    return "\n".join(lines)


# ─── Annotation checklist ────────────────────────────────────────────────────

def write_annotation_checklist(nodes: list, batches: list, session: dict, out_path: str):
    pid   = session.get('participantId', 'unknown')
    sid   = session.get('id', 'unknown')
    start = session.get('createdAt', '')
    axis  = session.get('axisLabels', {})

    lines = [
        f"# Annotation Checklist — {pid}",
        f"",
        f"> Session ID: `{sid}`  ",
        f"> Session start: `{start}`  ",
        f"> Generated by: `analysis/extract_session.py`",
        f"",
        f"Use this checklist to add the qualitative information that cannot be",
        f"extracted automatically from the session JSON.",
        f"",
        f"---",
        f"",
        f"## 1. Star Ratings ⚠️",
        f"",
        f"Star ratings are **frontend-only state** and not saved to the session JSON.",
        f"Review your observation notes or screen recording to identify 5-star images.",
        f"Then set `star:true` for those `id` values in the `N[]` array in the HTML.",
        f"",
        f"| ID | Label | Batch | Star? | Notes |",
        f"|----|-------|-------|-------|-------|",
    ]
    for n in nodes:
        label = n['label'][:28]
        lines.append(f"| {n['id']} | {label} | B{n['batch']} | ☐ | |")

    lines += [
        f"",
        f"---",
        f"",
        f"## 2. Axis Change Timestamps ⚠️",
        f"",
        f"The session JSON only stores the **final** axis state: `{axis}`",
        f"Review the transcript/recording to find each axis change event.",
        f"Add one entry per period to `AXES[]` in the HTML.",
        f"",
        f"| # | Start (min) | End (min) | X Left | X Right | Notes |",
        f"|---|-------------|-----------|--------|---------|-------|",
        f"| 1 | 0           | ???       |        |         | initial axes |",
        f"| 2 | ???         | end       | {axis.get('x', ['?','?'])[0]} | {axis.get('x', ['?','?'])[1]} | final axes (from JSON) |",
        f"",
        f"---",
        f"",
        f"## 3. Canvas Events ⚠️",
        f"",
        f"Record from screen recording. Types: Isolate, Unhide All, Recenter, Delete, Zoom",
        f"",
        f"| Time (min) | Event Type | Notes |",
        f"|------------|------------|-------|",
        f"| | | |",
        f"",
        f"---",
        f"",
        f"## 4. Session Phase Boundaries ⚠️",
        f"",
        f"Adjust `PHASES[]` boundaries in the HTML based on your transcript analysis.",
        f"",
        f"| Phase | Start (min) | End (min) | Label | Color |",
        f"|-------|-------------|-----------|-------|-------|",
        f"| 1 | 0 | ? | Onboarding | #58a6ff |",
        f"| 2 | ? | ? | Exploration | #a855f7 |",
        f"| 3 | ? | end | Evaluation | #22c55e |",
        f"",
        f"---",
        f"",
        f"## 5. Prompt Modes ⚠️",
        f"",
        f"For each batch in `PROMPTS[]`, set `mode` to `'tags'`, `'mixed'`, or `'freetext'`",
        f"based on whether the user used tag selection only, added freetext, or used only freetext.",
        f"",
        f"| Batch | Time (min) | Prompt Snippet | Mode |",
        f"|-------|------------|----------------|------|",
    ]
    seen = set()
    for n in nodes:
        if not n['prompt'] or n['src'] == 'external' or n['batch'] in seen:
            continue
        seen.add(n['batch'])
        snip = n['prompt'][:40]
        lines.append(f"| B{n['batch']} | {n['_t_sec']/60:.1f} | {snip} | freetext |")

    lines += [
        f"",
        f"---",
        f"",
        f"## 6. Lane Assignments ⚠️ (optional review)",
        f"",
        f"Lanes (0=top, 1=mid, 2=bot) are auto-assigned in batches. Review for clarity.",
        f"",
        f"| ID | Auto Lane | Override | Notes |",
        f"|----|-----------|----------|-------|",
    ]
    for n in nodes:
        lines.append(f"| {n['id']} | {n['lane']} | | |")

    lines += [
        f"",
        f"---",
        f"",
        f"## 7. Key Quotes / Insights",
        f"",
        f"Notable quotes to add as tooltip text on specific nodes or events:",
        f"",
        f"| Time (min) | Node/Event | Quote |",
        f"|------------|------------|-------|",
        f"| | | |",
        f"",
        f"---",
        f"",
        f"## Node Timeline Reference",
        f"",
        f"| Time (min) | ID | Batch | Method | Parents | Visible | Prompt Snippet |",
        f"|------------|----|-------|--------|---------|---------|----------------|",
    ]
    for n in nodes:
        vis = "✓" if not n['del'] else "✗"
        snip = n['prompt'][:30] if n['prompt'] else "—"
        lines.append(
            f"| {n['_t_sec']/60:.1f} | {n['id']} | B{n['batch']} "
            f"| {n['_method']} | {n['par']} | {vis} | {snip} |"
        )

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines))
    print(f"  Annotation checklist → {out_path}")


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Extract session JSON → infographic data block",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    ap.add_argument('session_json', help='Path to session .json file')
    ap.add_argument('--out',        default=None,             help='Write JS block here (default: stdout)')
    ap.add_argument('--thumbs-dir', default='analysis/thumbs',help='Thumbnail output directory')
    ap.add_argument('--no-thumbs',  action='store_true',      help='Skip thumbnail extraction')
    ap.add_argument('--annotation', default=None,             help='Annotation checklist output path')
    args = ap.parse_args()

    print(f"Loading: {args.session_json}")
    session = load_session(args.session_json)

    pid    = session.get('participantId', 'unknown')
    n_img  = len(session.get('images', []))
    n_grp  = len(session.get('historyGroups', []))
    print(f"  Participant : {pid}")
    print(f"  Images      : {n_img}")
    print(f"  Batches     : {n_grp}")

    nodes, batches = build_arrays(session)

    # Thumbnails
    if not args.no_thumbs and n_img > 0:
        print(f"  Extracting thumbnails → {args.thumbs_dir}/")
        thumb_map = extract_thumbnails(session['images'], args.thumbs_dir)
        if thumb_map:
            b64_path = os.path.join(os.path.dirname(args.thumbs_dir) or '.', 'thumbs_b64.json')
            with open(b64_path, 'w') as f:
                json.dump({str(k): v for k, v in sorted(thumb_map.items())}, f)
            print(f"  thumbs_b64.json → {b64_path}  ({len(thumb_map)} images)")

    # JS block
    js_block = render_js_block(nodes, batches, session)
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write(js_block)
        print(f"  JS block → {args.out}")
    else:
        print("\n" + "─" * 60)
        print(js_block)
        print("─" * 60)

    # Annotation checklist
    ann_path = args.annotation or args.session_json.replace('.json', '_annotation.md')
    write_annotation_checklist(nodes, batches, session, ann_path)

    print("\nNext steps:")
    print(f"  1. Fill in the annotation checklist: {ann_path}")
    print(f"  2. Paste JS block into the HTML template (replace N[], BATCHES[], etc.)")
    print(f"  3. Set star ratings, AXES[], CANVAS[], PHASES[] manually")
    print(f"  4. Run: python analysis/build_html.py  (to embed thumbnails)")
    print(f"  5. Open: analysis/<participant>_<session>.html")


if __name__ == '__main__':
    main()
