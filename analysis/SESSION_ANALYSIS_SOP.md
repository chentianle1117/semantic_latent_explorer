# Session Analysis Dashboard — Standard Operating Procedure

> **Purpose**: This document tells Claude Code exactly how to process a new user test session into the multi-session analysis dashboard. Follow it literally. **Never fabricate data.**

---

## 1. Required Input Files Per Session

Every session MUST have these files before processing:

### A. Session JSON (required)
- **Path**: `backend/data/{Participant}/sessions/{session_name}_{uuid}.json`
- **Contains**: `images[]` (with id, generation_method, parents[], coordinates, timestamp, prompt, base64_image), `historyGroups[]` (batches with timestamps), `axisLabels` (final axis state)
- **Used for**: Node genealogy tree, batch structure, thumbnails, image metadata

### B. Event Log JSONL (required)
- **Path**: `backend/data/{Participant}/events/{session_name}_{date}_{time}_eventlog.jsonl`
- **Contains**: One JSON object per line with `event_type`, `timestamp`, `data`
- **Event types currently logged**:
  - `session_start`, `session_end`
  - `generation` (imageIds, count, prompt)
  - `axis_change` (axisLabels)
  - `selection` (selectedIds, count)
  - `design_brief_change` (brief text)
  - `image_hide` / `image_restore` (imageIds, count)
  - `layer_visibility_change` (layers with visibility)
  - `star_rating` (imageIds, rating, previousRating)
  - `delete` (deletedIds, count)
  - `file_upload` (shoeCount, referenceCount)
  - `prompt_submit` (prompt, model, shoeType, count, generationMode, realm)
  - `suggestion_click` (tag, category, action)
  - `canvas_switch` (fromCanvasId, toCanvasId)
- **Used for**: Axis change timeline, phase boundaries (from design_brief_change), star ratings, generation counts

### C. CSI Survey CSV (required)
- **Path**: `analysis/csi_responses.csv`
- **Format**: One row per participant. 12 Likert items (1-10) for 6 CSI factors, 15 paired comparison items
- **CSI factors**: Collaboration, Enjoyment, Exploration, Expressiveness, Immersion, Results Worth Effort
- **Scoring**: Factor score = average of 2 items. Factor count = number of times selected in paired comparisons. CSI = sum(score * count) / 3
- **Used for**: Survey & CSI section, radar chart in comparison

### D. Pre-Study Survey CSV (required)
- **Path**: `analysis/prestudy_responses.csv`
- **Format**: One row per participant. Professional background, tools, AI comfort, challenges
- **Used for**: Participant metadata (role, experience)

### E. Video Transcript VTT (required for quotes)
- **Path**: User must provide the `.vtt` file path
- **Format**: WebVTT with timestamps and speaker labels
- **Used for**: Quotes section — extract participant quotes with timestamps
- **IMPORTANT**: VTT timestamps are wall-clock time. Must compute offset: `quote_session_time = vtt_timestamp - session_start_timestamp`

### F. Design Brief Notes (required for phases)
- **Source**: `design_brief_change` events in the event log
- **Used for**: Phase labels and boundaries (each brief change = new phase)
- **IMPORTANT**: Phase labels come from the brief text content. The researcher must verify/name phases.

---

## 2. What is Real vs. What Needs Manual Curation

### Fully Automated (extract directly from files)
| Data | Source | How |
|------|--------|-----|
| Image nodes (id, parents, generation_method) | Session JSON `images[]` | Direct extraction |
| Batch structure & timestamps | Session JSON `historyGroups[]` | Direct extraction |
| Thumbnails (base64) | Session JSON `images[].base64_image` | Resize to 120px, convert to base64 |
| Axis change events & timestamps | Event log `axis_change` events | Direct extraction |
| Star ratings | Event log `star_rating` events | Direct extraction |
| Image deletion events | Event log `delete` events | Direct extraction |
| Generation count & timing | Event log `generation` events | Direct extraction |
| Design brief changes | Event log `design_brief_change` events | Direct extraction |
| CSI scores | `csi_responses.csv` | Formula: score * count / 3 |
| Session duration | Event log first/last timestamp | Direct calculation |
| File upload count | Event log `file_upload` events | Direct extraction |

### Requires Manual Curation (researcher must provide or verify)
| Data | Current Status | What to Do |
|------|---------------|------------|
| **Batch labels** | Manually written descriptions | Researcher reviews each batch's prompts and writes a short label |
| **Prompt mode classification** | Heuristic (batch→tags, reference→mixed, agent→agent) | Use heuristic as default, researcher verifies edge cases |
| **Lane assignments** | Y-coordinate quartile binning | Keep as-is (layout-only, not semantic) |
| **Phase names & boundaries** | From design_brief_change events | Researcher names each phase from brief content |
| **Quote categorization** | Manual 9-category coding | Researcher classifies each quote |
| **Quote selection** | Manual from VTT transcript | Researcher selects relevant quotes from transcript |
| **Canvas interaction events** | Not logged | Must annotate from screen recording (if needed) |
| **Participant role & task** | From pre-study survey + briefing | Researcher provides |

---

## 3. Processing Pipeline

### Step 1: Generate Session Data Block
Run `gen_evan_data.py` as a template. For each new participant, create a similar script:

```bash
python analysis/gen_{participant}_data.py
```

**The script must**:
1. Load the session JSON
2. Extract nodes from `images[]`:
   - `id`, `batch` (index into historyGroups), `par` (parent IDs from `parents[]`)
   - `gen` = generation_method mapping: "dataset"→"external", "reference"→"reference", "batch"→"batch", "agent"→"agent"
   - `del` = true if image was deleted (check event log for `delete` events)
   - `star` = star rating (check event log for `star_rating` events, use latest rating)
   - `lane` = Y-coordinate quartile (0-3)
   - `title` = image label (e.g., "Reference #3", "Agent #12")
3. Extract batches from `historyGroups[]`:
   - `idx`, `t` (seconds from session start), `label` (MUST BE PROVIDED BY RESEARCHER)
4. Extract prompts from `historyGroups[]`:
   - `t` (start time), `end` (end time or session end), `mode` (tags/mixed/freetext/agent)
5. Extract axes from event log `axis_change` events:
   - `start`, `end`, `left`, `right` labels
6. Extract phases from event log `design_brief_change` events:
   - `label` (MUST BE PROVIDED BY RESEARCHER), `start`, `end`, `color`
7. Load thumbnails (resize to 120px, base64 encode)
8. Load CSI data from `csi_responses.csv`
9. Load quotes from VTT (RESEARCHER MUST SELECT AND CATEGORIZE)
10. Compute KPIs: batches, images, starred, deleted, agentGens, axisChanges
11. Output as JavaScript data block to `{participant}_data_real.txt`

### Step 2: Build Dashboard
```bash
python analysis/migrate_to_multisession.py
```

This script:
1. Reads the source template (`user_test_benson_s1.html`)
2. Extracts CSS, render functions, survey view
3. Transforms `renderAll()` → `renderTracks(S, containerSel, vMode, eStyle, genealogyOnly)`
4. Loads each participant's data block
5. Injects into the SESSIONS array
6. Outputs `analysis/dashboard.html`

### Step 3: Verify
1. Open `dashboard.html` in browser
2. Check each participant tab — all 5 sections should render
3. Check Compare tab — all 6 subtabs should work
4. Verify JS balance: braces, parens, brackets all matched

---

## 4. Adding a New Session

### Checklist
- [ ] Session JSON file in `backend/data/{Name}/sessions/`
- [ ] Event log JSONL in `backend/data/{Name}/events/`
- [ ] CSI survey row added to `analysis/csi_responses.csv`
- [ ] Pre-study survey row added to `analysis/prestudy_responses.csv`
- [ ] VTT transcript file available
- [ ] Researcher has reviewed and provided:
  - [ ] Batch labels (short descriptions for each historyGroup)
  - [ ] Phase names and boundaries
  - [ ] Selected quotes with categories
  - [ ] Participant role and task description

### Code Changes in `migrate_to_multisession.py`
1. Add data loading block (like `_evan_data_path` at line ~300):
```python
_new_data_path = Path("analysis/{name}_data_real.txt")
if _new_data_path.exists():
    new_data = _new_data_path.read_text(encoding="utf-8")
```
2. Add to SESSIONS array in the HTML template
3. Session colors auto-assigned from `SESSION_COLORS` array (supports up to 4)

---

## 5. Data Schema Reference

### Node Object (per image)
```javascript
{
  id: 0,           // integer, from images[].id
  batch: 3,        // integer, index into batches[]
  par: [1, 5],     // integer[], parent image IDs
  gen: "reference", // "external"|"reference"|"batch"|"agent"
  del: false,      // boolean, was this image deleted?
  star: 0,         // 0-5, star rating (0 = unrated)
  lane: 1,         // 0-3, Y-coordinate quartile
  title: "Reference #3" // string, display label
}
```

### Batch Object
```javascript
{
  idx: 0,          // integer, sequential index
  t: 180,          // number, seconds from session start
  label: "Initial Reference"  // string, RESEARCHER-PROVIDED
}
```

### Phase Object
```javascript
{
  label: "Exploration",  // string, RESEARCHER-PROVIDED
  start: 0,             // seconds from session start
  end: 1200,            // seconds
  color: "#58a6ff"      // hex color
}
```

### Axis Object
```javascript
{
  start: 0,        // seconds from session start
  end: 1506,       // seconds
  left: "Rugged",  // string, from axis_change event
  right: "Lightweight"
}
```

### Quote Object
```javascript
{
  sec: 245,        // seconds from session start
  speaker: "Evan", // must match speakerNames.participant
  cat: "Insight",  // RESEARCHER-PROVIDED category
  text: "Oh this is interesting, it picked up on the..."
}
```

### CSI Factor Object
```javascript
{
  name: "Exploration",
  items: [8, 9],    // two Likert scores (1-10)
  score: 17,        // sum of items
  count: 4,         // paired comparison count
  color: "#7eb8da",
  note: ""          // optional note (e.g., "N/A (solo session)" for Collaboration)
}
```

### KPIs Object
```javascript
{
  batches: 28,      // historyGroups.length
  images: 52,       // images.length
  starred: 3,       // count where star > 0
  deleted: 8,       // count of delete events
  agentGens: 6,     // count where gen === "agent"
  axisChanges: 2    // count of axis_change events
}
```

---

## 6. Event Logging Gaps (Frontend)

These interactions are **NOT currently logged** but would be valuable:

### High Priority (add before next study)
- **Star filter toggle**: Which star levels the user filters by
- **3/4 view toggle**: When user shows/hides satellite views
- **Mood board vs shoe generation**: Distinguish realm in generation events (already in prompt_submit but not in reactive generation event)
- **Axis suggestion acceptance**: When user picks an AI-suggested axis pair
- **Genealogy navigation**: When user clicks parent/child in tree to fly-to

### Medium Priority
- **Canvas zoom level**: Track viewport changes for attention analysis
- **Brush selection**: Distinguish single-click vs area selection
- **Dialog open/close**: Track which tools users spend time in
- **Unhide all**: Track when user resets hidden images

### Low Priority
- **Background removal toggle**: Preprocessing preference
- **Agent insight dismissal**: Whether user reads/ignores AI suggestions

---

## 7. Key Constraints

1. **NEVER fabricate data**. If a data source doesn't exist, leave the field empty or mark it as "N/A"
2. **All batch labels must come from researcher review** of actual prompts
3. **All quote categories must come from researcher coding** of actual speech
4. **Phase names must come from researcher interpretation** of design brief changes
5. **Lane assignments are purely for layout** — they are computed from Y-coordinates, not user-meaningful
6. **Prompt mode classification is heuristic** — researcher should verify edge cases
7. **The VTT transcript offset must be computed**: `offset = first_event_timestamp - vtt_start_time`
8. **Session duration** = time from first to last event in the main event log (exclude survey/debrief if separate)

---

## 8. File Inventory

```
analysis/
├── SESSION_ANALYSIS_SOP.md          ← THIS FILE
├── migrate_to_multisession.py       ← Main build script (HTML generation)
├── gen_evan_data.py                 ← Evan data extraction script
├── evan_data_real.txt               ← Generated Evan data block
├── evan_thumbs.json                 ← Evan thumbnails (base64)
├── csi_responses.csv                ← CSI survey (all participants)
├── prestudy_responses.csv           ← Pre-study survey (all participants)
├── user_test_benson_s1.html         ← Source template (Benson original)
├── dashboard.html                   ← OUTPUT: multi-session dashboard
└── thumbs/                          ← Thumbnail PNGs

backend/data/{Participant}/
├── sessions/{name}_{uuid}.json      ← Session state (images, genealogy)
└── events/{name}_{date}_{time}_eventlog.jsonl  ← Interaction events
```

---

## 9. Quick Start (for new Claude Code session)

Tell Claude:
> "Read `analysis/SESSION_ANALYSIS_SOP.md` for the data processing pipeline. I need to add session data for participant {Name}. Here are the files: {list}. Follow the SOP exactly — do not fabricate any data. Ask me for any researcher-curated data (batch labels, phase names, quote categories)."
