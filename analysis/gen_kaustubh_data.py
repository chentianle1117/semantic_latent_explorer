#!/usr/bin/env python3
"""Generate real Kaustubh session data for dashboard.html.

All data sourced from:
- Session JSON: backend/data/Kaustubh/sessions/03022026_kaustubh-tasks_ad7be14f-608b-4170-bbb3-caf1798389a1.json
- Event log: backend/data/Kaustubh/events/03022026_kaustubh-tasks_2026-03-02_1648_eventlog.jsonl
- CSI survey: analysis/csi_responses.csv (row 3, 3/2/2026)
- Pre-study survey: analysis/prestudy_responses.csv (row 3, 3/2/2026)
- VTT transcript: GMT20260302-210618_Recording.transcript.vtt
  VTT offset: session_sec = vtt_sec - 2538
  (recording started 21:06:18 UTC; session start 16:48:36 EST = 21:48:36 UTC → 42m18s = 2538s)
"""
import json, re, base64, io
from pathlib import Path
from datetime import datetime

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("PIL not available — thumbnails will use full base64 (may be large)")

ROOT = Path(__file__).parent.parent
SESSION_PATH = ROOT / 'backend/data/Kaustubh/sessions/03022026_kaustubh-tasks_ad7be14f-608b-4170-bbb3-caf1798389a1.json'
EVENTLOG_PATH = ROOT / 'backend/data/Kaustubh/events/03022026_kaustubh-tasks_2026-03-02_1648_eventlog.jsonl'

data = json.load(open(SESSION_PATH, encoding='utf-8'))
events = [json.loads(line) for line in open(EVENTLOG_PATH, encoding='utf-8')]

# Session start timestamp
t0 = datetime.fromisoformat('2026-03-02T16:48:36.089467')
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

# ── Build event lookup maps ───────────────────────────────────────────────────
deleted_ids = set()
star_ratings = {}  # imageId → latest star rating

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

# ── Axis changes (4 total) ────────────────────────────────────────────────────
axis_events = [ev for ev in events if ev['type'] == 'axis_change']
for ax in axis_events:
    t_sec = elapsed_sec(ax['timestamp'])
    print(f"  Axis change at {t_sec}s: {ax['data']['axisLabels']}")

# ── Batch labels (researcher-curated) ────────────────────────────────────────
BATCH_LABELS = {
    'external_0':   'Reference Images',
    'batch_1':      'Initial Trail Generation',
    'agent_2':      'Agent: Luxury Trail Runner',
    'reference_3':  'Blend: Chunky + Classic',
    'agent_4':      'Agent: Classic Black Matte',
    'reference_5':  'Blend: Mesh + Sculptural',
    'agent_6':      'Agent: Grey Knit Runner',
    'agent_7':      'Agent: Black Ripstop',
    'agent_8':      'Agent: Lime Green Runner',
    'reference_9':  'Color + Texture Transfer',
    'agent_10':     'Agent: Rugged Suede',
    'reference_11': 'Topographic Sole Blend',
    'agent_12':     'Agent: Monochrome Elegance',
}

group_to_idx = {g['id']: i for i, g in enumerate(groups)}

# ── batches ───────────────────────────────────────────────────────────────────
batches_lines = []
for i, g in enumerate(groups):
    t_sec = elapsed_sec(g.get('timestamp', ''))
    label = BATCH_LABELS.get(g['id'], g['id'])
    batches_lines.append(f'      {{ idx:{i}, t:{t_sec}, label:"{label}" }}')
batches_js = ',\n'.join(batches_lines)

# ── nodes ─────────────────────────────────────────────────────────────────────
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

# ── prompts ───────────────────────────────────────────────────────────────────
FREETEXT_GROUPS = {
    'agent_4',    # "A modern, classic shoe with a matte black leather upper..." pure text
    'agent_10',   # "A modern, classic shoe with rugged suede..." pure text
    'agent_12',   # "A modern, classic with suede and reflective accents..." pure text
}

prompts_lines = []
for i, g in enumerate(groups):
    if g['type'] == 'external': continue
    t_sec = elapsed_sec(g.get('timestamp', ''))
    gtype = g['type']
    if gtype == 'agent':
        mode = 'agent' if g['id'] not in FREETEXT_GROUPS else 'freetext'
    elif gtype == 'batch':
        mode = 'tags'
    else:
        mode = 'mixed'
    snippet = short_prompt(g.get('prompt', ''), n=70)
    prompts_lines.append(f'      {{ t:{t_sec}, batch:{i}, mode:"{mode}", snippet:"{snippet}" }}')
prompts_js = ',\n'.join(prompts_lines)

# ── thumbnails ────────────────────────────────────────────────────────────────
def resize_b64(b64_str, max_px=120):
    """Resize base64 image to max_px wide, return new base64 string."""
    if not HAS_PIL:
        return b64_str[:200]  # truncate if no PIL
    try:
        # Strip data URI prefix if present
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
thumbs_path = ROOT / 'analysis/kaustubh_thumbs.json'
json.dump(thumbs, open(thumbs_path, 'w', encoding='utf-8'), ensure_ascii=False)
print(f"Saved {thumbs_path}: {thumbs_path.stat().st_size//1024}KB")

thumbs_parts = []
for k, v in thumbs.items():
    thumbs_parts.append(f'    {k}: "{v}"')
thumbs_js = '{\n' + ',\n'.join(thumbs_parts) + '\n  }'

# ── quotes (from VTT, offset = 2538s) ────────────────────────────────────────
# VTT offset: session_sec = vtt_sec - 2538
# Recording started 21:06:18 UTC; session start 16:48:36 EST = 21:48:36 UTC → 2538s diff
# NOTE: Mumbling/gibberish during survey section (~01:33–01:37 VTT) is excluded
quotes_js = '''[
      {"speaker":"Kaustubh","ts":"0:49","sec":404,"text":"For now, like, I'll start with whatever text was available to see, like, if it directly generates what I want.","cat":"Design Thinking"},
      {"speaker":"Kaustubh","ts":"0:56","sec":825,"text":"Rugged and lightweight should not be here, because we want them both. So instead of splitting them, I will just remove this. That is, like, a constraint we already want.","cat":"Axis/Semantic"},
      {"speaker":"Kaustubh","ts":"1:04","sec":1306,"text":"It did not understand upper and midsole that well. But, yeah, this is cool — when I say vibrant, it is understanding that axis.","cat":"Frustration"},
      {"speaker":"Kaustubh","ts":"1:06","sec":1456,"text":"When it's suggesting different colors, I can kind of go between mono color to more vibrant shoes. That is nice.","cat":"Axis/Semantic"},
      {"speaker":"Kaustubh","ts":"1:07","sec":1492,"text":"Yeah, this is way better than what I started with.","cat":"Tool Reaction"},
      {"speaker":"Kaustubh","ts":"1:08","sec":1566,"text":"The chunky shoe should be more towards trail shoe, less towards runner. And then I'll use the other one, which is the black — yeah, this I was expecting to be a bit more runner-type.","cat":"Axis/Semantic"},
      {"speaker":"Kaustubh","ts":"1:14","sec":1906,"text":"I think the suggestions are way better than what I'm thinking.","cat":"Agent Reaction"},
      {"speaker":"Kaustubh","ts":"1:16","sec":2046,"text":"Yeah, this is a better trail shoe, I would say, because it's a bit more water-resistant as well.","cat":"Design Thinking"},
      {"speaker":"Kaustubh","ts":"1:25","sec":2592,"text":"Yeah, sometimes, like, if there is, like, an easy toggle to switch on and off all the content — it's very difficult to see, like, think through. Too many options were, like, sometimes overwhelming me.","cat":"Frustration"},
      {"speaker":"Kaustubh","ts":"1:35","sec":3220,"text":"I would say, like, it's way more intuitive. And overall, the idea of having different axes and then, like, separating, scaling these axes — that was really intuitive, like, projecting it along a particular axis.","cat":"Tool Reaction"},
      {"speaker":"Kaustubh","ts":"1:36","sec":3246,"text":"The suggestion part was, like, one of the best, because, like, I was doing something which was, like, something weird, and then, like, what it suggested was actually something which I wanted to do. So that was cool.","cat":"Agent Reaction"},
      {"speaker":"Kaustubh","ts":"1:38","sec":3392,"text":"People often don't have exactly the idea, like, what they want to choose, but if they have a variation out of which they can choose — that was nice. That's also, like, a very key feature.","cat":"Discovery"},
      {"speaker":"Kaustubh","ts":"1:39","sec":3457,"text":"The one thing I felt like I was not able to use effectively was, like, how to target the upper and midsole specifically.","cat":"Frustration"},
      {"speaker":"Kaustubh","ts":"1:40","sec":3475,"text":"I was also constantly feeling, like, biased if the axes were correct or not. Instead of thinking about what I want to design, I was constantly thinking, did it generate correctly or not? Because now I have a ground truth to compare.","cat":"Insight"},
      {"speaker":"Kaustubh","ts":"1:41","sec":3536,"text":"I kind of start feeling like I need to get it right. It just becomes, like, a test — am I prompting it correctly or not?","cat":"Frustration"},
      {"speaker":"Kaustubh","ts":"1:41","sec":3556,"text":"I was not able to get completely inside, like, immersed into what I was thinking. It was constantly, like, bringing me out of that flow.","cat":"Immersion"},
      {"speaker":"Kaustubh","ts":"1:43","sec":3646,"text":"If I'm able to track from where I started, it will help me to, kind of, start a new branch at a particular point instead of saying, no, I want this, and then I want to start from here. I can basically tap into a place.","cat":"Discovery"},
      {"speaker":"Kaustubh","ts":"1:47","sec":3897,"text":"Usually when I'm using just NanoBanana, I use Gemini to refine the prompt before I pass it to NanoBanana. So that was kind of nice — it was able to do it automatically.","cat":"Agent Reaction"},
      {"speaker":"Kaustubh","ts":"1:48","sec":3960,"text":"I would say like, in two stages — one in the initial part, where I'm thinking of some ideas, but then even at fine-tuning, if I had some option which was very fine along a particular axis where rest of the things stay as it is.","cat":"Insight"}
    ]'''

# ── cat_colors ────────────────────────────────────────────────────────────────
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

# ── Full data string ──────────────────────────────────────────────────────────
# Duration: 2793s (last star rating event at 17:34:55)
# Session start: 16:48:36, last star: 17:34:55 = 2779s (using 2793 from last rating batch at 17:35:09)
# Axis changes: 4 total
# Phases derived from design_brief_change events + axis changes:
#   - Setup & Brief: 0→640 (first 3 brief changes, refining trail shoe context)
#   - Trail Shoe Exploration: 640→1607 (refined trail brief to Trail shoe/Perf Runner axis change)
#   - Performance Runner: 1607→2355 (axis change to slide brief)
#   - Slide Spin-off: 2355→2793 (slide brief to last star rating)
# CSI row (3/2/2026 17:43:41):
#   Collaboration: N/A, N/A → score=0, count=0
#   Enjoyment: 9, 9 → score=18, count=4
#   Exploration: 10, 8 → score=18, count=4
#   Expressiveness: 7, 10 → score=17, count=2
#   Immersion: 9, 9 → score=18, count=1
#   Results Worth Effort: 5, 6 → score=11, count=4
# Pre-study: <2 years, AI tools only, comfort=8
out = f'''    id: "kaustubh-s1",
    participant: "Kaustubh Sadekar",
    role: "AI/ML Researcher",
    task: "Rugged + lightweight trail shoe & performance runner \u00d7 slide spin-off",
    color: "#a855f7",
    dur: 2793,
    speakerNames: {{ participant: "Kaustubh", researcher: "David" }},
    kpis: {{ batches: 13, images: 26, starred: 9, deleted: 2, agentGens: 7, axisChanges: 4 }},
    thumbs: {thumbs_js},
    phases: [
      {{ label: "Setup & Brief",           start: 0,    end: 640,  color: "#58a6ff" }},
      {{ label: "Trail Shoe Exploration",  start: 640,  end: 1607, color: "#3fb950" }},
      {{ label: "Performance Runner",      start: 1607, end: 2355, color: "#d2a8ff" }},
      {{ label: "Slide Spin-off",          start: 2355, end: 2793, color: "#fbbf24" }},
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
      {{ start:0,    end:882,  left:"(Default)",       right:"(Default)" }},
      {{ start:882,  end:1607, left:"Trail Running",   right:"Performance" }},
      {{ start:1607, end:2417, left:"Trail Shoe",      right:"Performance Runner" }},
      {{ start:2417, end:2793, left:"Daily Slides",    right:"Stage Slides" }},
    ],
    canvas: [],
    quotes: {quotes_js},
    catColors: {catColors_js},
    preSurvey: {{
      experience: "Less than 2 years",
      tools: ["AI/Generative Tools (NanoBanana, Midjourney, Firefly, Vizcom)"],
      aiPhases: ["Moodboarding", "Early Ideation"],
      comfort: 8,
      challenges: ["Lineage/Traceability", "Fixation (stuck on early results)", "Control (editing specific parts)"],
      attitudes: [
        {{ label: "AI can help discover solutions I wouldn\u2019t think of", val: 9, tone: "#a855f7" }},
        {{ label: "Worry AI might reduce creative agency", val: 7, tone: "#a855f7" }},
        {{ label: "Struggle translating intent into prompts", val: 10, tone: "#a855f7" }},
        {{ label: "View AI as collaborator (not just tool)", val: 10, tone: "#a855f7" }},
      ],
    }},
    csiFact: [
      {{ name: "Collaboration",       items: [null, null], score: 0,  count: 0, color: "#6e7681", note: "N/A (solo session)" }},
      {{ name: "Enjoyment",           items: [9, 9],       score: 18, count: 4, color: "#7dcea0" }},
      {{ name: "Exploration",         items: [10, 8],      score: 18, count: 4, color: "#7eb8da" }},
      {{ name: "Expressiveness",      items: [7, 10],      score: 17, count: 2, color: "#d4a054" }},
      {{ name: "Immersion",           items: [9, 9],       score: 18, count: 1, color: "#a78bca" }},
      {{ name: "Results Worth Effort",items: [5, 6],       score: 11, count: 4, color: "#5ec4b6" }},
    ],
    csiLabels: [
      ["Others could work with me easily", "Easy to share ideas/designs"],
      ["Happy to use regularly", "Enjoyed using the tool"],
      ["Easy to explore many ideas", "Helpful to track different possibilities"],
      ["Able to be very creative", "Allowed me to be very expressive"],
      ["Attention fully tuned to activity", "Became absorbed, forgot about tool"],
      ["Satisfied with what I produced", "Output worth the effort"],
    ],'''

out_path = Path('analysis/kaustubh_data_real.txt')
out_path.write_text(out, encoding='utf-8')
print(f'Generated kaustubh_data_real.txt: {len(out)/1024:.1f}KB')
