#!/usr/bin/env python3
"""Generate real Ty session data for dashboard.html.

All data sourced from:
- Session JSON: backend/data/Ty/sessions/030926_ty-tasks_dfbb6e15-e225-4daf-bee5-acbfd59f6db5.json
- Event log: backend/data/Ty/events/030926_ty-tasks_2026-03-09_2246_eventlog.jsonl
- Pre-study survey: Pre-Study Survey CSV row 4 (3/9/2026)
- VTT transcript: GMT20260309-201527_Recording.transcript.vtt
  VTT offset: session_sec = vtt_sec - 1850
  (recording started ~20:15 UTC; session start 22:46:27 UTC -> ~1850s diff)
- CSI survey: NOT YET AVAILABLE for Ty — marked TBD
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
SESSION_PATH = ROOT / 'backend/data/Ty/sessions/030926_ty-tasks_dfbb6e15-e225-4daf-bee5-acbfd59f6db5.json'
EVENTLOG_PATH = ROOT / 'backend/data/Ty/events/030926_ty-tasks_2026-03-09_2246_eventlog.jsonl'

data = json.load(open(SESSION_PATH, encoding='utf-8'))
events = [json.loads(line) for line in open(EVENTLOG_PATH, encoding='utf-8')]

# Session start timestamp
t0 = datetime.fromisoformat('2026-03-09T22:46:27.801695')
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

# -- Axis changes -------------------------------------------------------------
axis_events = [ev for ev in events if ev['type'] == 'axis_change']
print(f"Axis change events: {len(axis_events)}")
for ax in axis_events:
    t_sec = elapsed_sec(ax['timestamp'])
    print(f"  Axis change at {t_sec}s: {ax['data']['axisLabels']}")

# -- Batch labels (researcher-curated) ----------------------------------------
BATCH_LABELS = {
    'external_0':   'Reference Images',
    'reference_1':  'Trail: Rugged + Lightweight',
    'reference_2':  'Biteline Refinement',
    'reference_3':  'Geometric Color Transfer',
    'reference_4':  'Outsole Combination',
    'reference_5':  'White Upper + Orange Rand',
    'dataset_6':    'Uploaded Sketch',
    'reference_7':  'Architectural Styling',
    'reference_8':  'Slide: Wavy Trail Texture',
    'reference_9':  'Slide: Streamlined Orange',
}

group_to_idx = {g['id']: i for i, g in enumerate(groups)}

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
FREETEXT_GROUPS = {
    'reference_2',   # "modify the biteline" pure text
    'reference_5',   # "white upper, modern collar" pure text
    'reference_9',   # "minimize sole height" pure text
}

prompts_lines = []
for i, g in enumerate(groups):
    if g['type'] in ('external', 'dataset'): continue
    t_sec = elapsed_sec(g.get('timestamp', ''))
    gtype = g['type']
    if gtype == 'agent':
        mode = 'agent'
    elif gtype == 'batch':
        mode = 'tags'
    elif g['id'] in FREETEXT_GROUPS:
        mode = 'freetext'
    else:
        mode = 'mixed'
    snippet = short_prompt(g.get('prompt', ''), n=70)
    prompts_lines.append(f'      {{ t:{t_sec}, batch:{i}, mode:"{mode}", snippet:"{snippet}" }}')
prompts_js = ',\n'.join(prompts_lines)

# -- thumbnails ----------------------------------------------------------------
def resize_b64(b64_str, max_px=120):
    """Resize base64 image to max_px wide, return new base64 string."""
    if not HAS_PIL:
        return b64_str[:200]  # truncate if no PIL
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
thumbs_path = ROOT / 'analysis/ty_thumbs.json'
json.dump(thumbs, open(thumbs_path, 'w', encoding='utf-8'), ensure_ascii=False)
print(f"Saved {thumbs_path}: {thumbs_path.stat().st_size//1024}KB")

thumbs_parts = []
for k, v in thumbs.items():
    thumbs_parts.append(f'    {k}: "{v}"')
thumbs_js = '{\n' + ',\n'.join(thumbs_parts) + '\n  }'

# -- quotes (from VTT, offset = 1850s) ----------------------------------------
# VTT offset: session_sec = vtt_sec - 1850
# Recording started ~20:15 UTC; session start 22:46:27 UTC -> ~1850s diff
# Verified: star_rating at 1686s session = VTT 3534s (58:54), 3534-1850=1684 (match)
quotes_js = '''[
      {"speaker":"Ty","ts":"50:37","sec":1187,"text":"I'm having a lot of fun on this, David.","cat":"Tool Reaction"},
      {"speaker":"Ty","ts":"51:17","sec":1227,"text":"Am struggling to semantically get what's in my mind onto the canvas right now. I'm continually excited about the things that I'm seeing, but I'm not actually describing what I want to change very well.","cat":"Frustration"},
      {"speaker":"Ty","ts":"51:53","sec":1263,"text":"I keep saying, like, eliminate the swoop in the heel, and really what I want to do is create, like, a straight line right now with the rand.","cat":"Frustration"},
      {"speaker":"Ty","ts":"52:57","sec":1327,"text":"I've not used anything within footwear that I'm able to just generate so many ideas.","cat":"Tool Reaction"},
      {"speaker":"Ty","ts":"53:08","sec":1338,"text":"This is how my brain thinks. And this is how I want to be able to talk about it, which is really cool.","cat":"Insight"},
      {"speaker":"Ty","ts":"61:57","sec":1867,"text":"Dude, being able to change this whole system prompt thing for whatever I'm trying to generate next is really sweet.","cat":"Tool Reaction"},
      {"speaker":"Ty","ts":"62:12","sec":1882,"text":"It feels like I'm operating kind of in two different control points, like, one's very iterative, and one's, like, more program language, but knowing that I can change the program at any point is pretty sweet.","cat":"Insight"},
      {"speaker":"Ty","ts":"65:26","sec":2076,"text":"It felt more like the design process that I have built for myself, where an idea can sit anywhere.","cat":"Design Thinking"},
      {"speaker":"Ty","ts":"67:14","sec":2184,"text":"I've never been able to think quite that eccentrically at one time.","cat":"Insight"},
      {"speaker":"Ty","ts":"67:48","sec":2218,"text":"Flipping that immediately and just going, this is my linear process -- I forgot that I really liked that middle idea. I should just go jump back there. That's the design process, so I loved feeling like that.","cat":"Design Thinking"},
      {"speaker":"Ty","ts":"68:04","sec":2234,"text":"It felt like I was designing, like I did get lost in it for a sec.","cat":"Immersion"},
      {"speaker":"Ty","ts":"68:20","sec":2250,"text":"There was no order or process that I felt like was right or wrong.","cat":"Discovery"},
      {"speaker":"Ty","ts":"68:33","sec":2263,"text":"Working with off-the-shelf AI tools, the process is very linear, it's very binary. It's like input, output, input, output. It gets very long.","cat":"Insight"},
      {"speaker":"Ty","ts":"68:55","sec":2285,"text":"The continual awareness of where I was -- I think I trusted what I would continue to do, because it was referencing something else.","cat":"Tool Reaction"},
      {"speaker":"Ty","ts":"69:27","sec":2317,"text":"I started to notice how focused I got very quickly.","cat":"Immersion"},
      {"speaker":"Ty","ts":"70:04","sec":2354,"text":"I think it's extremely important to get results that are different, but similar in like, they could sit in the same family, but they are solved a different way.","cat":"Design Thinking"},
      {"speaker":"Ty","ts":"71:27","sec":2437,"text":"Linear tree was fantastic. I wouldn't only use the linear tree, though, but it's a great supplemental tool to understand how things fit together.","cat":"Tool Reaction"},
      {"speaker":"Ty","ts":"72:18","sec":2488,"text":"It felt intuitive. I liked the AI context. It's like a canvas trainer before you even start something.","cat":"Agent Reaction"},
      {"speaker":"Ty","ts":"73:25","sec":2555,"text":"Unexpected suggestions in the AI prompts, like, hey, you said minimal -- what if we did maximum? That would be cool.","cat":"Agent Reaction"},
      {"speaker":"Ty","ts":"75:46","sec":2696,"text":"It's drastically helpful, because you're able to track related ideas or unrelated ideas.","cat":"Axis/Semantic"},
      {"speaker":"Ty","ts":"77:33","sec":2803,"text":"What's cool about being able to see everything just based on semantics is you see where your bias popped up and where it didn't.","cat":"Axis/Semantic"},
      {"speaker":"Ty","ts":"78:43","sec":2873,"text":"In early concept iteration right now, knowing that it's only in lateral views.","cat":"Design Thinking"},
      {"speaker":"Ty","ts":"79:17","sec":2907,"text":"To have an entire catalog in a canvas, and being able to call on certain moments would be extremely powerful.","cat":"Discovery"},
      {"speaker":"Ty","ts":"79:59","sec":2949,"text":"It's like a library, but it's not like the Dewey Decimal System.","cat":"Insight"},
      {"speaker":"Ty","ts":"84:46","sec":3236,"text":"I thought the UI was very good, David. This was super slick.","cat":"Tool Reaction"},
      {"speaker":"Ty","ts":"85:48","sec":3298,"text":"Felt like AI was not an AI at that, like, when I was using this. It just felt like a tool.","cat":"Insight"}
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

# -- Full data string ----------------------------------------------------------
# Duration: ~2030s (last star rating at 23:20:17, 2030s from session start)
# No axis changes in event log -- axes remained preloaded defaults
# Phases from design_brief_change events:
#   - Setup & Refs: 0->477 (exploring preloaded references)
#   - Trail Shoe Exploration: 477->1809 (generating, iterating trail shoes)
#   - Slide Spin-off: 1809->2030 (pool slide generation)
# KPIs: 10 batches, 28 images, 6 starred, 0 deleted, 0 agent gens, 0 axis changes
# CSI data from csi_responses.csv row 4 (3/9/2026 17:27:52):
#   Collaboration: N/A, N/A -> score=0, count=0
#   Enjoyment: 8, 10 -> score=18, count=3 (paired items 6,10,12)
#   Exploration: 7, 10 -> score=17, count=3 (paired items 3,7,14)
#   Expressiveness: 8, 8 -> score=16, count=2 (paired items 2,5)
#   Immersion: 8, 9 -> score=17, count=2 (paired items 1,9)
#   Results Worth Effort: 10, 7 -> score=17, count=5 (paired items 4,8,11,13,15)
# Pre-study: 10+ years, 2D Sketch + Vector + AI Tools, comfort 6
out = f'''    id: "ty-s1",
    participant: "Ty DeHaven",
    role: "Senior Footwear Designer",
    task: "Rugged + lightweight trail shoe & performance runner \u00d7 slide spin-off",
    color: "#22c55e",
    dur: 2030,
    speakerNames: {{ participant: "Ty", researcher: "David" }},
    kpis: {{ batches: {len(groups)}, images: {len(data['images'])}, starred: {len(star_ratings)}, deleted: {len(deleted_ids)}, agentGens: 0, axisChanges: {len(axis_events)} }},
    thumbs: {thumbs_js},
    phases: [
      {{ label: "Setup & Refs",              start: 0,    end: 477,  color: "#58a6ff" }},
      {{ label: "Trail Shoe Exploration",    start: 477,  end: 1809, color: "#3fb950" }},
      {{ label: "Slide Spin-off",            start: 1809, end: 2030, color: "#fbbf24" }},
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
      {{ start:0, end:2030, left:"Lightweight", right:"Rugged" }},
    ],
    canvas: [],
    quotes: {quotes_js},
    catColors: {catColors_js},
    preSurvey: {{
      experience: "10+ years",
      tools: ["2D Sketching (Procreate, Photoshop)", "Vector/Layout (Illustrator)", "AI/Generative Tools (NanoBanana, Midjourney, Firefly, Vizcom)"],
      aiPhases: ["Moodboarding", "Early Ideation", "Refinement"],
      comfort: 6,
      challenges: ["Lineage/Traceability", "Fixation (stuck on early results)", "Control (editing specific parts)"],
      attitudes: [
        {{ label: "AI can help discover solutions I wouldn\u2019t think of", val: 7, tone: "#22c55e" }},
        {{ label: "Worry AI might reduce creative agency", val: 7, tone: "#22c55e" }},
        {{ label: "Struggle translating intent into prompts", val: 7, tone: "#22c55e" }},
        {{ label: "View AI as collaborator (not just tool)", val: 7, tone: "#22c55e" }},
      ],
    }},
    csiFact: [
      {{ name: "Collaboration",       items: [null, null], score: 0,  count: 0, color: "#6e7681", note: "N/A (solo session)" }},
      {{ name: "Enjoyment",           items: [8, 10],      score: 18, count: 3, color: "#7dcea0" }},
      {{ name: "Exploration",         items: [7, 10],      score: 17, count: 3, color: "#7eb8da" }},
      {{ name: "Expressiveness",      items: [8, 8],       score: 16, count: 2, color: "#d4a054" }},
      {{ name: "Immersion",           items: [8, 9],       score: 17, count: 2, color: "#a78bca" }},
      {{ name: "Results Worth Effort",items: [10, 7],      score: 17, count: 5, color: "#5ec4b6" }},
    ],
    csiLabels: [
      ["Others could work with me easily", "Easy to share ideas/designs"],
      ["Happy to use regularly", "Enjoyed using the tool"],
      ["Easy to explore many ideas", "Helpful to track different possibilities"],
      ["Able to be very creative", "Allowed me to be very expressive"],
      ["Attention fully tuned to activity", "Became absorbed, forgot about tool"],
      ["Satisfied with what I produced", "Output worth the effort"],
    ],'''

out_path = Path('analysis/ty_data_real.txt')
out_path.write_text(out, encoding='utf-8')
print(f'Generated ty_data_real.txt: {len(out)/1024:.1f}KB')
