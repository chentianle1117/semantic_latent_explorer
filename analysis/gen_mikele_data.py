#!/usr/bin/env python3
"""Generate real Mikele session data for dashboard.html.

All data sourced from:
- Session JSON: backend/data/Mikele/sessions/031826_tasks_84c642c3-6bab-4fd0-b67e-c8f762d42c54.json
- Event log: backend/data/Mikele/events/tasks_2026-03-18_1734_eventlog.jsonl
- Pre-study survey: Pre-Study Survey CSV row 5 (3/18/2026)
- CSI survey: CSI CSV row 5 (3/18/2026 18:13:55)
- VTT transcript: GMT20260318-210202_Recording.transcript.vtt
  VTT offset: session_sec = vtt_sec - 1922
  (recording started 21:02:02 UTC; session t0 = 17:34:04 EDT = 21:34:04 UTC → diff 1922s)
"""
import json, re, base64, io
from pathlib import Path
from datetime import datetime

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("PIL not available -- thumbnails will use full base64 (may be large)")

ROOT = Path(__file__).parent.parent
SESSION_PATH = ROOT / 'backend/data/Mikele/sessions/031826_tasks_84c642c3-6bab-4fd0-b67e-c8f762d42c54.json'
EVENTLOG_PATH = ROOT / 'backend/data/Mikele/events/tasks_2026-03-18_1734_eventlog.jsonl'

data = json.load(open(SESSION_PATH, encoding='utf-8'))
events = [json.loads(line) for line in open(EVENTLOG_PATH, encoding='utf-8')]

# Session start timestamp (from first event in 1734 log)
t0 = datetime.fromisoformat('2026-03-18T17:34:04.000000')
groups = data['historyGroups']

def elapsed_sec(ts_str):
    if not ts_str: return 0
    t = datetime.fromisoformat(ts_str)
    s = (t - t0).total_seconds()
    return max(0, int(s))

def short_prompt(p, n=80):
    if not p: return ''
    p = p.replace('\n', ' ')
    p = p.replace('"', "'")
    p = re.sub(r"'s ", ' ', p)
    p = p[:n].rstrip()
    return p + ('...' if len(p) >= n else '')

# -- Build event lookup maps --------------------------------------------------
deleted_ids = set()
star_ratings = {}  # imageId -> latest star rating

for ev in events:
    etype = ev['type']
    if etype == 'delete':
        for iid in ev['data'].get('deletedIds', []):
            deleted_ids.add(iid)
    elif etype == 'star_rating':
        rating = ev['data']['rating']
        for iid in ev['data']['imageIds']:
            star_ratings[iid] = rating

print(f"Deleted IDs: {deleted_ids}")
print(f"Star ratings: {star_ratings}")
print(f"Total images: {len(data['images'])}")
print(f"Total groups: {len(groups)}")

# -- Axis changes -------------------------------------------------------------
axis_events = [ev for ev in events if ev['type'] == 'axis_change']
print(f"Axis change events: {len(axis_events)}")
for ax in axis_events:
    t_sec = elapsed_sec(ax['timestamp'])
    print(f"  Axis change at {t_sec}s: {ax['data']['axisLabels']}")

# -- Print group info ----------------------------------------------------------
print("\n--- History Groups ---")
for i, g in enumerate(groups):
    t_sec = elapsed_sec(g.get('timestamp', ''))
    imgs = [img for img in data['images'] if img.get('group_id') == g['id']]
    img_ids = [img['id'] for img in imgs]
    print(f"  [{i}] {g['id']} type={g['type']} t={t_sec}s imgs={img_ids} prompt={short_prompt(g.get('prompt',''), 60)}")

# -- Batch labels (researcher-curated from transcript + event analysis) --------
# Build group_id -> idx mapping first
group_to_idx = {g['id']: i for i, g in enumerate(groups)}

# Auto-generate labels based on known analysis
BATCH_LABELS = {}
for i, g in enumerate(groups):
    gid = g['id']
    gtype = g['type']
    prompt = g.get('prompt', '')
    if gtype == 'external':
        BATCH_LABELS[gid] = 'Reference Images'
    elif gtype == 'agent':
        BATCH_LABELS[gid] = f'Agent Suggestion'
    elif 'trail' in prompt.lower():
        BATCH_LABELS[gid] = 'Trail Shoe'
    elif 'performance runner' in prompt.lower() or 'performance' in prompt.lower():
        BATCH_LABELS[gid] = 'Performance Runner'
    elif 'lifestyle' in prompt.lower():
        BATCH_LABELS[gid] = 'Lifestyle Sneaker'
    elif 'geometric' in prompt.lower() or 'topographic' in prompt.lower() and 'slide' not in prompt.lower():
        if 'merge' in prompt.lower() or 'mesh' in prompt.lower():
            BATCH_LABELS[gid] = 'Topographic Print Shoe'
        else:
            BATCH_LABELS[gid] = 'Geometric Hiking Shoe'
    elif 'cork' in prompt.lower() or 'natural texture' in prompt.lower():
        BATCH_LABELS[gid] = 'Cork & Natural Texture'
    elif 'daily slide' in prompt.lower() or 'everyday slide' in prompt.lower():
        BATCH_LABELS[gid] = 'Daily Slide'
    elif 'stage slide' in prompt.lower() or 'sculptural' in prompt.lower():
        BATCH_LABELS[gid] = 'Stage Slide'
    else:
        # Fallback: use group type + index
        BATCH_LABELS[gid] = f'{gtype.capitalize()} #{i}'

# Manual overrides for accuracy (from transcript analysis)
# Override any that the auto-detection may have missed
for i, g in enumerate(groups):
    gid = g['id']
    imgs = [img for img in data['images'] if img.get('group_id') == gid]
    img_ids = sorted([img['id'] for img in imgs])
    # Groups with IDs 15-17 (geometric/topo hiking shoe from external refs)
    if img_ids and min(img_ids) == 15 and max(img_ids) == 17:
        BATCH_LABELS[gid] = 'Geometric Hiking Shoe'
    # Groups with IDs 18-19 (cork natural)
    elif img_ids and min(img_ids) == 18 and max(img_ids) == 19:
        BATCH_LABELS[gid] = 'Cork & Natural Texture'
    # Groups with IDs 20-21 (topo print)
    elif img_ids and min(img_ids) == 20 and max(img_ids) == 21:
        BATCH_LABELS[gid] = 'Topographic Print Shoe'
    # Groups with IDs 23-25 (daily slide)
    elif img_ids and min(img_ids) == 23 and max(img_ids) == 25:
        BATCH_LABELS[gid] = 'Daily Slide'
    # Groups with IDs 26-28 (stage slide)
    elif img_ids and min(img_ids) == 26 and max(img_ids) == 28:
        BATCH_LABELS[gid] = 'Stage Slide'

print("\n--- Batch Labels ---")
for gid, label in BATCH_LABELS.items():
    print(f"  {gid}: {label}")

# -- batches -------------------------------------------------------------------
batches_lines = []
for i, g in enumerate(groups):
    t_sec = elapsed_sec(g.get('timestamp', ''))
    label = BATCH_LABELS.get(g['id'], g['id'])
    batches_lines.append(f'      {{ idx:{i}, t:{t_sec}, label:"{label}" }}')
batches_js = ',\n'.join(batches_lines)

# -- nodes ---------------------------------------------------------------------
ys = [img['coordinates'][1] for img in data['images']]
ys_sorted = sorted(ys)
n_img = len(ys_sorted)
q25 = ys_sorted[n_img//4]
q50 = ys_sorted[n_img//2]
q75 = ys_sorted[3*n_img//4]

def get_lane(img):
    y = img['coordinates'][1]
    if y < q25: return 0
    if y < q50: return 1
    if y < q75: return 2
    return 3

nodes_lines = []
for img in data['images']:
    batch_idx = group_to_idx.get(img['group_id'], 0)
    lane = get_lane(img)
    src = img['generation_method']
    parents = img.get('parents', [])
    par_js = '[' + ','.join(str(p) for p in parents) + ']'
    prompt = short_prompt(img.get('prompt', ''))
    is_del = 'true' if img['id'] in deleted_ids else 'false'
    star_val = star_ratings.get(img['id'], 0)
    nodes_lines.append(
        f'      {{ id:{img["id"]}, batch:{batch_idx}, lane:{lane}, src:"{src}", '
        f'label:"{src.capitalize()} #{img["id"]}", par:{par_js}, del:{is_del}, star:{star_val}, prompt:"{prompt}" }}'
    )
nodes_js = ',\n'.join(nodes_lines)

# -- prompts -------------------------------------------------------------------
prompts_lines = []
for i, g in enumerate(groups):
    if g['type'] in ('external', 'dataset'): continue
    t_sec = elapsed_sec(g.get('timestamp', ''))
    gtype = g['type']
    if gtype == 'agent':
        mode = 'agent'
    elif gtype == 'batch':
        mode = 'tags'
    else:
        mode = 'mixed'
    snippet = short_prompt(g.get('prompt', ''), n=70)
    prompts_lines.append(f'      {{ t:{t_sec}, batch:{i}, mode:"{mode}", snippet:"{snippet}" }}')
prompts_js = ',\n'.join(prompts_lines)

# -- thumbnails ----------------------------------------------------------------
def resize_b64(b64_str, max_px=120):
    """Resize base64 image to max_px wide, return new base64 string."""
    if not HAS_PIL:
        return b64_str[:200]
    try:
        if ',' in b64_str:
            b64_str = b64_str.split(',', 1)[1]
        raw = base64.b64decode(b64_str)
        img = Image.open(io.BytesIO(raw)).convert('RGBA')
        w, h = img.size
        if w > max_px:
            new_h = int(h * max_px / w)
            img = img.resize((max_px, new_h), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format='PNG', optimize=True)
        return 'data:image/png;base64,' + base64.b64encode(out.getvalue()).decode()
    except Exception as e:
        print(f"  Thumb error: {e}")
        return ''

thumbs = {}
for img in data['images']:
    iid = img['id']
    b64 = img.get('base64_image', '')
    if b64:
        print(f"  Processing thumb {iid}...")
        thumbs[iid] = resize_b64(b64)
    else:
        thumbs[iid] = ''

# Save thumbs json
thumbs_path = ROOT / 'analysis/mikele_thumbs.json'
json.dump(thumbs, open(thumbs_path, 'w', encoding='utf-8'), ensure_ascii=False)
print(f"Saved {thumbs_path}: {thumbs_path.stat().st_size//1024}KB")

thumbs_parts = []
for k, v in thumbs.items():
    thumbs_parts.append(f'    {k}: "{v}"')
thumbs_js = '{\n' + ',\n'.join(thumbs_parts) + '\n  }'

# -- quotes (from VTT, offset = 1922s) ----------------------------------------
# VTT offset: session_sec = vtt_sec - 1922
# Recording started 21:02:02 UTC; session 17:34:04 EDT = 21:34:04 UTC → 1922s diff
# Quote imageRef field: array of image IDs this quote relates to (for overlay feature)
quotes_js = '''[
      {"speaker":"Mikele","ts":"37:57","sec":355,"text":"The dark colors usually make it look good for terrain, like, aggressive. Too much of it make them look heavy.","cat":"Design Thinking","imageRef":[8,9,10,11]},
      {"speaker":"Mikele","ts":"38:40","sec":398,"text":"Trying to lighten it up, see what happens. And then I think I added some... a bit lower top, making them more casual.","cat":"Design Thinking","imageRef":[10,11]},
      {"speaker":"Mikele","ts":"42:22","sec":620,"text":"Does it know that this is the shoe and this is the textures?","cat":"Tool Reaction","imageRef":[12,13]},
      {"speaker":"Mikele","ts":"43:19","sec":677,"text":"Every time I generate, does it pop up the next line in this, like, view?","cat":"Navigation"},
      {"speaker":"Mikele","ts":"44:28","sec":746,"text":"Trying to make it even more natural materials.","cat":"Design Thinking","imageRef":[15,16,17]},
      {"speaker":"Mikele","ts":"46:26","sec":864,"text":"In this view, it's just harder for me to know what came before, what's the history. If I work for an hour, it might become a different thing, so I really like this lineage thing.","cat":"Insight"},
      {"speaker":"Mikele","ts":"47:11","sec":909,"text":"Trying to, like, make it more of mesh and breathable.","cat":"Design Thinking","imageRef":[18,19]},
      {"speaker":"Mikele","ts":"48:22","sec":980,"text":"The textures were before these, so... Ideally, these were up there.","cat":"Frustration"},
      {"speaker":"Mikele","ts":"50:30","sec":1108,"text":"I think there's a bit of back and forth, just on the details. The variations... I don't think I was prompting to do each step at a time.","cat":"Design Thinking","imageRef":[20,21]},
      {"speaker":"Mikele","ts":"51:39","sec":1177,"text":"I'm not really sure how it works, because, like, it's using two other shoes that are not close.","cat":"Navigation"},
      {"speaker":"Mikele","ts":"55:04","sec":1382,"text":"If every stage it'll be like, hey, what's going on... I don't think I would ever notice that. Unless it auto reads what I'm doing and just populates itself.","cat":"Agent Reaction"},
      {"speaker":"Mikele","ts":"55:31","sec":1409,"text":"As designer, I'll just keep iterating, keep designing.","cat":"Immersion"},
      {"speaker":"Mikele","ts":"55:46","sec":1424,"text":"There's a lot of effort on tuning before generating. In companies, because they can't just have an open, you know, whatever.","cat":"Design Thinking"},
      {"speaker":"Mikele","ts":"56:28","sec":1466,"text":"That's a cool one. Dramatic.","cat":"Discovery","imageRef":[23,24,25]},
      {"speaker":"Mikele","ts":"57:15","sec":1513,"text":"Wow, it's generating, it's good to see. How far can Bidai go?","cat":"Tool Reaction","imageRef":[26,27,28]},
      {"speaker":"Mikele","ts":"58:32","sec":1590,"text":"If there was a way to show they're different, because this is top rated, this is lower.","cat":"Tool Reaction"},
      {"speaker":"Mikele","ts":"59:13","sec":1631,"text":"Oh, they're down here, because I took from this shoe. Cool. Oh man, this is sick.","cat":"Discovery","imageRef":[26,27,28]},
      {"speaker":"Mikele","ts":"1:04:06","sec":1844,"text":"For me, it's the hardest thing is the prompting.","cat":"Frustration"},
      {"speaker":"Mikele","ts":"1:04:19","sec":1857,"text":"If I upload an image and it gives me words and suggestions how to write it... I'm not a native speaker. It's really hard to describe a vision, or find the words. So, that really helped.","cat":"Agent Reaction"},
      {"speaker":"Mikele","ts":"1:04:38","sec":1876,"text":"It really helps to see where things come from.","cat":"Insight"},
      {"speaker":"Mikele","ts":"1:04:52","sec":1890,"text":"The downside of it... it's given me so much. It feels like a shortcut in some way.","cat":"Design Thinking"},
      {"speaker":"Mikele","ts":"1:05:06","sec":1904,"text":"For me to be creative, it's weird... I think I could be more creative, the more I use it.","cat":"Insight"},
      {"speaker":"Mikele","ts":"1:07:50","sec":2068,"text":"A, B, C referencing things, but how do I apply it on a specific zone on the shoe more accurately is the biggest issue in any software.","cat":"Frustration"},
      {"speaker":"Mikele","ts":"1:08:23","sec":2101,"text":"Can these already be pre-populated into zones, or parts? Instead of writing upper, I just... there's an upper prompt.","cat":"Design Thinking"},
      {"speaker":"Mikele","ts":"1:13:40","sec":2418,"text":"I love that it's showing not just node-based, this happened and this happened, it's showing the artistic connection between them. And you can see it visually.","cat":"Insight"},
      {"speaker":"Mikele","ts":"1:14:38","sec":2476,"text":"If I click an image, it shows all the connection, it could kind of tell me what it did. Just to understand how it actually used the data.","cat":"Design Thinking"},
      {"speaker":"Mikele","ts":"1:17:20","sec":2638,"text":"What you have here is very close to a living brief. How do you make a living brief? There's a beginning, you can see where it evolved, but also keep the constraints.","cat":"Insight"},
      {"speaker":"Mikele","ts":"1:22:58","sec":2976,"text":"I was leading to the lineage view. The more organized one, just because I can see the design.","cat":"Tool Reaction"},
      {"speaker":"Mikele","ts":"1:23:20","sec":2998,"text":"Once it became... the other canvas, there's the reference images, and then the shoes. Visually, it just became, for my brain, really cluttered.","cat":"Frustration"},
      {"speaker":"Mikele","ts":"1:24:07","sec":3045,"text":"It feels very for analytics. Less for, like, hey, I want to do the next phase.","cat":"Insight"},
      {"speaker":"Mikele","ts":"1:24:43","sec":3081,"text":"They could be on the same genre, the semantics, where they are, but visually, they might be still really different.","cat":"Axis/Semantic"},
      {"speaker":"Mikele","ts":"1:27:59","sec":3277,"text":"I think it's better than most of the image, like, creative image generation ones.","cat":"Tool Reaction"}
    ]'''

# -- cat_colors ----------------------------------------------------------------
catColors_js = '''{
      "Discovery":      "#22c55e",
      "Frustration":    "#f85149",
      "Insight":        "#a855f7",
      "Tool Reaction":  "#58a6ff",
      "Design Thinking":"#f97316",
      "Agent Reaction": "#fbbf24",
      "Axis/Semantic":  "#0ea5e9",
      "Immersion":      "#d946ef",
      "Navigation":     "#8b949e"
    }'''

# -- Duration ------------------------------------------------------------------
# Last meaningful event: star_rating at ~18:01:31 = 1647s
# Session end marker at 18:03:19 = 1755s
dur = 1755

# -- Axes (from event log) ----------------------------------------------------
# Mikele had 1 axis setup at the start:
# x: lightweight ↔ rugged, y: light color ↔ dark color
axes_js = '      { start:0, end:1755, left:"Lightweight", right:"Rugged" }'

# -- CSI data (row 5 = 3/18/2026 18:13:55) ------------------------------------
# Likert items:
#   Collab: N/A, N/A
#   Enjoyment: 8, 9
#   Exploration: 8, 8
#   Expressiveness: 6, 7
#   Immersion: 8, 7
#   Results Worth Effort: 7, 8
# Paired comparisons (15 items):
#   1: Immersion, 2: Expressiveness, 3: Exploration,
#   4: Results, 5: Collaboration, 6: Immersion,
#   7: Exploration, 8: Results, 9: Collaboration,
#   10: Exploration, 11: Results, 12: Collaboration,
#   13: Results, 14: Exploration, 15: Results
# Counts: Collab=3, Enjoy=0, Explore=4, Express=1, Immerse=2, Results=5

# -- Pre-study (row 5 = 3/18/2026 16:52:21) -----------------------------------
# Experience: 2-5 years
# Tools: 2D Sketching, Vector/Layout, 3D Modeling, AI/Generative Tools
# AI phases: Moodboarding, Early Ideation, Refinement, Final Polish
# Comfort: 5
# Challenges: Lineage/Traceability, Fixation, Control
# Attitudes: 7, 7, 10, 8

# -- Agent gens ----------------------------------------------------------------
agent_gen_count = sum(1 for g in groups if g['type'] == 'agent')

# -- Full data string ----------------------------------------------------------
out = f'''    id: "mikele-s1",
    participant: "Mikele Schnitman",
    role: "Footwear Designer & 3D Artist",
    task: "Rugged + lightweight trail shoe, performance runner \\u00d7 slide spin-off",
    color: "#f97316",
    dur: {dur},
    speakerNames: {{ participant: "Mikele", researcher: "David" }},
    kpis: {{ batches: {len(groups)}, images: {len(data['images'])}, starred: {len(star_ratings)}, deleted: {len(deleted_ids)}, agentGens: {agent_gen_count}, axisChanges: {len(axis_events)} }},
    thumbs: {thumbs_js},
    phases: [
      {{ label: "Setup & Axes",               start: 0,    end: 143,  color: "#58a6ff" }},
      {{ label: "Trail/Runner Exploration",   start: 143,  end: 1020, color: "#3fb950" }},
      {{ label: "Rating & Curation",          start: 1020, end: 1380, color: "#a855f7" }},
      {{ label: "Slide Spin-off",             start: 1380, end: 1755, color: "#fbbf24" }},
    ],
    batches: [
{batches_js}
    ],
    nodes: [
{nodes_js}
    ],
    prompts: [
{prompts_js}
    ],
    axes: [
{axes_js}
    ],
    canvas: [],
    quotes: {quotes_js},
    catColors: {catColors_js},
    preSurvey: {{
      experience: "2\\u20135 years",
      tools: ["2D Sketching (Procreate, Photoshop)", "Vector/Layout (Illustrator)", "3D Modeling (Rhino, Grasshopper)", "AI/Generative Tools (NanoBanana, Midjourney, Firefly, Vizcom)"],
      aiPhases: ["Moodboarding", "Early Ideation", "Refinement", "Final Polish"],
      comfort: 5,
      challenges: ["Lineage/Traceability", "Fixation (stuck on early results)", "Control (editing specific parts)"],
      attitudes: [
        {{ label: "AI can help discover solutions I wouldn\\u2019t think of", val: 7, tone: "#22c55e" }},
        {{ label: "Worry AI might reduce creative agency", val: 7, tone: "#22c55e" }},
        {{ label: "Struggle translating intent into prompts", val: 10, tone: "#f85149" }},
        {{ label: "View AI as collaborator (not just tool)", val: 8, tone: "#22c55e" }},
      ],
    }},
    csiFact: [
      {{ name: "Collaboration",       items: [null, null], score: 0,  count: 3, color: "#6e7681", note: "N/A (solo session)" }},
      {{ name: "Enjoyment",           items: [8, 9],       score: 17, count: 0, color: "#7dcea0" }},
      {{ name: "Exploration",         items: [8, 8],       score: 16, count: 4, color: "#7eb8da" }},
      {{ name: "Expressiveness",      items: [6, 7],       score: 13, count: 1, color: "#d4a054" }},
      {{ name: "Immersion",           items: [8, 7],       score: 15, count: 2, color: "#a78bca" }},
      {{ name: "Results Worth Effort",items: [7, 8],       score: 15, count: 5, color: "#5ec4b6" }},
    ],
    csiLabels: [
      ["Others could work with me easily", "Easy to share ideas/designs"],
      ["Happy to use regularly", "Enjoyed using the tool"],
      ["Easy to explore many ideas", "Helpful to track different possibilities"],
      ["Able to be very creative", "Allowed me to be very expressive"],
      ["Attention fully tuned to activity", "Became absorbed, forgot about tool"],
      ["Satisfied with what I produced", "Output worth the effort"],
    ],'''

out_path = Path('analysis/mikele_data_real.txt')
out_path.write_text(out, encoding='utf-8')
print(f'\nGenerated mikele_data_real.txt: {len(out)/1024:.1f}KB')
