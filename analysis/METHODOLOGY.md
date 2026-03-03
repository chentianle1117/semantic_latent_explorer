# User Study Analysis — Infographic Methodology

**Tool**: Zappos50K Semantic Explorer
**Output**: Multi-track swimlane timeline HTML infographic
**Template**: `analysis/user_test_benson_s1.html` (Benson, Session 1)

---

## Overview

Each user study session produces a standalone HTML infographic with 5 parallel tracks:

| Track | What it shows | Auto-extracted? |
|-------|--------------|-----------------|
| **Design Genealogy** | Image nodes, parent→child tree, batch timeline | ✓ Mostly auto |
| **Prompts** | When user wrote prompts + mode (tags/mixed/freetext) | ✓ Times, ⚠️ modes |
| **Axes** | Which semantic axis pair was active + when it changed | ⚠️ Manual |
| **Canvas Events** | Isolate, delete, recenter, zoom attempts | ⚠️ Manual |
| **Time Axis** | Shared time baseline | ✓ Auto |

---

## Raw Materials Needed

For each session, collect:

| Material | Where | Notes |
|----------|--------|-------|
| Session JSON | `backend/data/<participant>/sessions/<slug>.json` | Contains images, timestamps, axis labels |
| Screen recording | Study recording folder | For canvas events, axis changes |
| Transcript | Auto-transcribed or manual | For key quotes, prompt modes, phase boundaries |
| Observer notes | Your annotation notes | Star ratings, key moments |

---

## Step-by-Step Workflow

### Step 1 — Automatic extraction

Run the extraction script against the session JSON:

```bash
cd "w:/CMU_Academics/2025 Fall/Thesis Demo/Zappos50K_semantic_explorer"

python analysis/extract_session.py \
  backend/data/<ParticipantId>/sessions/<slug>.json \
  --out analysis/session_data_<participant>_s<N>.js \
  --thumbs-dir analysis/thumbs \
  --annotation analysis/<participant>_s<N>_annotation.md
```

This produces:
- **`session_data_*.js`** — JavaScript const block (`N[]`, `BATCHES[]`, `PROMPTS[]` skeleton)
- **`thumbs/`** — resized 120×120 PNG thumbnails for each generated image
- **`thumbs_b64.json`** — base64-encoded thumbnails ready for embedding
- **`*_annotation.md`** — checklist of items requiring manual annotation

> Requires `Pillow` for thumbnails: `pip install Pillow`

---

### Step 2 — Manual annotation

Open `*_annotation.md` and work through each section:

#### 2a. Star Ratings
Star ratings are **not saved to session JSON** (frontend-only Zustand state).
Find rated images from observer notes or screen recording. Set `star:true` for those `id` values.

#### 2b. Axis Change Timestamps
The session JSON only records the **final** axis state.
Review the transcript or recording to find every time the user changed the X/Y axis labels.

Fill in `AXES[]` — one entry per contiguous period:
```javascript
const AXES = [
  { start: 0,        end: 24.15*60, left: "Formal",  right: "Sporty"    },
  { start: 24.15*60, end: DUR,      left: "Retro",   right: "Futuristic" },
];
```

#### 2c. Canvas Events
Record from screen recording into `CANVAS[]`:
```javascript
const CANVAS = [
  { t: 10.6*60,  label: "Isolate"    },
  { t: 10.8*60,  label: "Unhide All" },
  { t: 11.8*60,  label: "Recenter"   },
  { t: 50.0*60,  label: "Delete"     },
];
```

#### 2d. Session Phases
Define 2–4 meaningful phases from your transcript analysis.
Adjust `PHASES[]`:
```javascript
const PHASES = [
  { start: 0,       end: 10*60,  label: "Onboarding",   color: "#58a6ff" },
  { start: 10*60,   end: 40*60,  label: "Exploration",  color: "#a855f7" },
  { start: 40*60,   end: DUR,    label: "Evaluation",   color: "#22c55e" },
];
```

#### 2e. Prompt Modes
For each entry in `PROMPTS[]`, set `mode` to one of:
- `"tags"` — user only selected pre-suggested tags (no freetext)
- `"mixed"` — user combined tags + their own freetext
- `"freetext"` — user wrote the prompt entirely from scratch

#### 2f. Lane Assignments
In timeline mode, `lane` (0/1/2) determines vertical position (top/mid/bot).
The script auto-assigns lanes per batch. Review and override as needed for visual clarity
(e.g., agent-generated nodes always get lane 1 = center).

#### 2g. Key Quotes
Add notable participant quotes as `label` overrides or tooltip `quote` fields.
Format: add a `quote` property to any node in `N[]` — the tooltip renderer will display it.

---

### Step 3 — Assemble the HTML

Copy the template and inject the data:

```bash
# Option A: Build from template + thumbs_b64.json (recommended)
cp analysis/user_test_benson_s1.html analysis/<participant>_s<N>.html

# Then manually replace the const block at the top of the <script> section:
# - Replace N[], BATCHES[], PROMPTS[], AXES[], CANVAS[], PHASES[], DUR
# - The visualization logic (D3 tracks, edge routing, tooltips) needs no changes
```

Or, longer term, add the data as an external `<script src="session_data_*.js">` include
so the HTML template can be shared without modification.

---

### Step 4 — Rebuild with embedded thumbnails

```bash
# Update build_html.py to point to the right target file, then:
python analysis/build_html.py
```

Or manually embed `thumbs_b64.json` by replacing the `const THUMBS = {...}` block.

---

### Step 5 — Verify & annotate insights

Open the HTML in a browser. Check:
- [ ] All nodes render in the genealogy tree
- [ ] Secondary edges arc above the tree (not cutting through primary lines)
- [ ] Axis track shows correct color-coded periods
- [ ] Division line appears at axis change time
- [ ] Deleted nodes show faint X cross (no red border)
- [ ] Starred nodes have gold ring + star

Then fill in the 3 **Key Insights cards** at the bottom of the HTML.
These should reflect the most striking cross-track patterns visible in the visualization.

---

## Data Schema Reference

### Session JSON (auto-extracted by `extract_session.py`)

```
backend/data/<participantId>/sessions/<slug>_<canvasId>.json
```

| Field | Type | Notes |
|-------|------|-------|
| `images[].id` | int | Unique within session |
| `images[].generation_method` | str | `batch` `reference` `interpolation` `dataset` `agent` |
| `images[].parents` | int[] | Parent image IDs |
| `images[].visible` | bool | `false` = soft-deleted by user |
| `images[].prompt` | str | Text prompt |
| `images[].timestamp` | ISO str | When image was added to canvas |
| `images[].base64_image` | str | Full image data (can be large) |
| `historyGroups[].id` | str | Batch UUID |
| `historyGroups[].timestamp` | ISO str | When batch was generated |
| `historyGroups[].prompt` | str | Shared batch prompt |
| `axisLabels.x` | [str, str] | [negative, positive] labels — FINAL STATE ONLY |

**Not in JSON (must annotate manually):**
- `imageRatings` — star ratings (frontend-only Zustand state)
- axis change history — only final state saved
- canvas interaction events (isolate/hide/zoom)

### Infographic Data Arrays

```javascript
// N[] — one entry per generated/loaded image
{ id, batch, lane, src, label, par[], del, star, prompt }
//   src: 'external' | 'reference' | 'batch' | 'agent'
//   lane: 0=top, 1=mid, 2=bot  (timeline Y position)
//   del: true if user deleted the image
//   star: true if user rated 5★

// BATCHES[] — one entry per generation group
{ id, label, t }   // t = seconds from session start

// PROMPTS[] — one entry per batch (deduped)
{ t, batch, mode, snippet }   // mode: 'tags' | 'mixed' | 'freetext'

// AXES[] — one entry per axis configuration period
{ start, end, left, right }   // start/end in seconds

// CANVAS[] — canvas interaction events
{ t, label }   // label: 'Isolate' | 'Unhide All' | 'Recenter' | 'Delete' | ...

// PHASES[] — session phase bands (background shading)
{ start, end, label, color }
```

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `analysis/extract_session.py` | Session JSON → JS data block + thumbnails + annotation checklist |
| `analysis/build_html.py` | Assemble HTML template + thumbs_b64.json → standalone file |
| `analysis/patch*.py` | Historical patches applied to the Benson template (for reference) |

---

## Starting a New Chat for a New Session

When the analysis chat runs out of context, start a new chat and provide:

1. **This file** (`analysis/METHODOLOGY.md`) — as the workflow reference
2. **The session JSON** — for extraction
3. **The annotation checklist** (`*_annotation.md`) — already filled in
4. **The transcript** — for qualitative context
5. **Reference to the template** (`analysis/user_test_benson_s1.html`) — for the visualization logic

Prompt to use:
> "I'm creating a user study infographic using the Zappos50K Semantic Explorer analysis pipeline
> (see METHODOLOGY.md). I have the session JSON, filled-in annotation checklist, and transcript
> for participant [NAME], session [N]. Please help me assemble the infographic HTML."

The new chat can then:
1. Run `extract_session.py` to get the auto-extracted data block
2. Layer in the manually annotated fields from the checklist
3. Copy the visualization logic from the Benson template (no changes needed)
4. Generate the new HTML

---

## Visual Design Decisions (for consistency)

| Element | Style |
|---------|-------|
| Background | `#0d1117` (GitHub dark) |
| Primary text | `#c9d1d9` |
| External/loaded nodes | Orange `#f97316` |
| User iteration nodes | Blue `#58a6ff` |
| Agent-generated nodes | Purple `#a855f7` |
| Starred nodes | Gold ring `#fbbf24` |
| Deleted nodes | Muted gray border + faint red X cross |
| Secondary edges | Dashed, parent color at 0.3 opacity, arced above tree |
| Primary edges | Solid, child color at 0.65 opacity, H-V-H elbow (straight) or bezier (curved) |
| Axis Period 1 | Blue `#58a6ff` band |
| Axis Period 2 | Amber `#f59e0b` band |
| Axis change line | Solid white `#e6edf3`, runs through all tracks |
