#!/usr/bin/env python3
"""Generate real Evan session data for dashboard.html.

All data sourced from:
- Session JSON: backend/data/Evan/sessions/022726-evan_...json (nodes, batches, thumbs)
- Event logs: backend/data/Evan/events/*.jsonl (duration, axes, brief changes, suggestion clicks)
- CSI survey: analysis/csi_responses.csv (row 2)
- Pre-study survey: analysis/prestudy_responses.csv (row 2)
- VTT transcript: GMT20260227-213543_Recording.transcript.vtt (quotes)
"""
import json, re
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).parent.parent
data = json.load(open(ROOT / 'backend/data/Evan/sessions/022726-evan_0227-evan-user-test_cdef4fab-cca7-42ee-857c-3ad0dea327c6.json', encoding='utf-8'))
thumbs = json.load(open(ROOT / 'analysis/evan_thumbs.json', encoding='utf-8'))

t0 = datetime.fromisoformat('2026-02-27T17:05:06.338340')
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

BATCH_LABELS = {
    'external_0':   'Reference Images',
    'batch_1':      'Initial Generation',
    'reference_2':  'Sole Exploration',
    'agent_3':      'Agent: Alpine Hiker',
    'reference_4':  'Iterate: Topo + Boot',
    'reference_5':  'Iterate: High-Top',
    'reference_6':  'Iterate: Waterproof',
    'reference_7':  'Iterate: Waffle Knit',
    'agent_8':      'Agent: Woven Upper',
    'reference_9':  'Iterate: Pale Sand',
    'agent_10':     'Agent: Charcoal Leather',
    'agent_11':     'Agent: Minimalist Knit',
    'reference_12': 'Iterate: Running Sneaker',
    'reference_13': 'Iterate: Sculptural',
    'agent_14':     'Agent: Mesh + Foam',
    'reference_15': 'Iterate: Low Collar',
    'agent_16':     'Agent: Reflective',
    'reference_17': 'Combine: Boot + Sneaker',
    'agent_18':     'Agent: Minimalist Mesh',
    'reference_19': 'Combine: Hi-top + Low',
    'reference_20': 'Combine: Mesh + Boot',
    'reference_21': 'Blend: Avant Garde',
    'agent_22':     'Agent: EVA Slide',
    'agent_23':     'Agent: Foam Slide',
    'reference_24': 'Iterate: Athletic Slide',
    'reference_25': 'Hybrid: Boot + Slide',
    'reference_26': 'Palette Transfer',
    'reference_27': 'Iterate: High Collar Slide',
}

group_to_idx = {g['id']: i for i, g in enumerate(groups)}

# ── batches ──────────────────────────────────────────────────────────────────
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
    nodes_lines.append(
        f'      {{ id:{img["id"]}, batch:{batch_idx}, lane:{lane}, src:"{src}", '
        f'label:"{src.capitalize()} #{img["id"]}", par:{par_js}, del:false, star:false, prompt:"{prompt}" }}'
    )
nodes_js = ',\n'.join(nodes_lines)

# ── prompts ───────────────────────────────────────────────────────────────────
# Categorize prompt modes based on group type:
# - 'batch': initial text generation using suggestion tags → 'tags'
# - 'agent': autonomous AI generation → 'agent' (not shown in prompt timeline)
# - 'reference': most used mix of tags + freetext → 'mixed', some pure freetext
FREETEXT_GROUPS = {
    'reference_6',   # "waterproof mesh" pure text
    'reference_9',   # "modify to lightweight, pale sand" pure text
    'reference_15',  # "make this a low top, lower collar" pure text
    'reference_17',  # combine two with freetext only
    'reference_26',  # "apply color of B" pure text
    'reference_27',  # "high collar applied to sandal" pure text
}

prompts_lines = []
for i, g in enumerate(groups):
    if g['type'] == 'external': continue
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

# ── thumbs ────────────────────────────────────────────────────────────────────
thumbs_parts = []
for k, v in thumbs.items():
    thumbs_parts.append(f'    {k}: "{v}"')
thumbs_js = '{\n' + ',\n'.join(thumbs_parts) + '\n  }'

# ── quotes (ALL from real VTT transcript) ─────────────────────────────────────
# Source: GMT20260227-213543_Recording.transcript.vtt
# VTT offset to session: ~1763s (VTT 00:00 = 21:35:43 UTC, session start = 22:05:06 UTC)
# session_sec ≈ vtt_sec - 1763
quotes_js = '''[
      {"speaker":"Evan","ts":"2:29","sec":149,"text":"I think the AI suggestions are great. It helps me from having to think of the right prompt.","cat":"Tool Reaction"},
      {"speaker":"Evan","ts":"4:20","sec":260,"text":"The ones that were generated feel very rugged and kind of heavy. I kind of think this one that was auto-generated is pretty interesting. It looks more technical.","cat":"Agent Reaction"},
      {"speaker":"Evan","ts":"4:38","sec":278,"text":"The inspiration images are definitely more on the runner side of things, rather than the hiking or the trail shoe, which is kind of interesting.","cat":"Axis/Semantic"},
      {"speaker":"Evan","ts":"4:53","sec":293,"text":"This is not great, because I do not work for Nike, so don't want to see that, or my director won't want to see that.","cat":"Frustration"},
      {"speaker":"Evan","ts":"8:03","sec":483,"text":"I like that it kept to the midsole, it's really dynamic, but unfortunately it looks pretty heavy.","cat":"Design Thinking"},
      {"speaker":"Evan","ts":"8:26","sec":506,"text":"I want some more auto-generated in the lightweight, because it looks like maybe I'm biased toward the heavy. I can't quite get my vision for lightweight to come through.","cat":"Frustration"},
      {"speaker":"Evan","ts":"12:37","sec":757,"text":"That was kind of my assumption, is that this is the most lightweight it can be, so I thought if I used this, it would force the generation to come over to the right.","cat":"Axis/Semantic"},
      {"speaker":"Evan","ts":"17:16","sec":1036,"text":"What I find really helpful is not having to spend the time to think about the prompt. That seems to be really valuable for me.","cat":"Tool Reaction"},
      {"speaker":"Evan","ts":"17:39","sec":1057,"text":"It's interesting, because I don't know where these came from.","cat":"Agent Reaction"},
      {"speaker":"Evan","ts":"18:39","sec":1119,"text":"I really like the midsole here. It's super modern, really dynamic. Not quite running, but like a pretty cool lifestyle performance kind of shoe.","cat":"Design Thinking"},
      {"speaker":"Evan","ts":"20:41","sec":1241,"text":"Very cool that I just get pushed ideas.","cat":"Agent Reaction"},
      {"speaker":"Evan","ts":"21:11","sec":1271,"text":"I like to go from mild to wild. The things down here are more of the mild, and here it becomes more interesting, but I'd like to explore what can happen in between.","cat":"Design Thinking"},
      {"speaker":"Evan","ts":"24:28","sec":1468,"text":"When I'm seeing fashion-forward runway-ready, I'm thinking this is more fashion-oriented than performance-oriented, so I'm gonna start by changing my axes from ready to wear to avant-garde.","cat":"Axis/Semantic"},
      {"speaker":"Evan","ts":"28:43","sec":1723,"text":"I think the UI with the middle mouse click is really easy to get around, which is really cool.","cat":"Tool Reaction"},
      {"speaker":"Evan","ts":"30:56","sec":1856,"text":"One of the things that I find a little bit difficult is that a lot is happening, and it's sometimes a little hard to keep track.","cat":"Frustration"},
      {"speaker":"Evan","ts":"34:53","sec":2093,"text":"I think that's actually a really quick and sort of fun way to be able to generate quickly, so I would say I enjoyed it.","cat":"Tool Reaction"},
      {"speaker":"Evan","ts":"35:35","sec":2135,"text":"I felt like there was a lot of constraint. I realized that actually it's more that I was relying maybe too much on the suggestions and the prompting.","cat":"Insight"},
      {"speaker":"Evan","ts":"35:43","sec":2143,"text":"When you refine the prompt, it removes some of what I originally typed. It feels like Refine weighs the keywords too much, rather than just generally what I'm saying.","cat":"Frustration"},
      {"speaker":"Evan","ts":"37:43","sec":2263,"text":"I would want to actually group things myself, because sometimes I don't agree. I would want to maybe override the automatic placement.","cat":"Axis/Semantic"},
      {"speaker":"Evan","ts":"38:22","sec":2299,"text":"Is there just a human override? If something came out that was lightweight but on the rugged side, I can drag it over, and perhaps the system then starts learning that's what lightweight means.","cat":"Axis/Semantic"},
      {"speaker":"Evan","ts":"38:39","sec":2316,"text":"The axes could be anything, and my understanding of what avant-garde might be different from yours, or different from the AI's.","cat":"Axis/Semantic"},
      {"speaker":"Evan","ts":"40:42","sec":2442,"text":"I was able to be expressive, and I really enjoyed the surprise of getting ideas pushed to me that actually helped me understand what I was trying to express better.","cat":"Insight"},
      {"speaker":"Evan","ts":"41:02","sec":2462,"text":"I was fully tuned into what I was doing, kind of just in the flow, and maybe that wasn't great because I forgot about probably a lot of the other features.","cat":"Immersion"},
      {"speaker":"Evan","ts":"45:04","sec":2704,"text":"The benefit is all around being pushed information. Rather than having to spend my time thinking of the right prompt, I can spend my time tuning the prompt, because I'm being pushed the vocabulary that is probably close.","cat":"Tool Reaction"},
      {"speaker":"Evan","ts":"45:39","sec":2739,"text":"I got a little bit lazy. It was like, oh, this word's close enough. You need to be careful about re-reading and ensuring what you're prompting is what you want.","cat":"Insight"},
      {"speaker":"Evan","ts":"46:18","sec":2778,"text":"The semantic axes were helpful, but there wasn't a complete alignment with what I thought how things would be placed to how they were placed.","cat":"Axis/Semantic"},
      {"speaker":"Evan","ts":"46:59","sec":2819,"text":"What I really enjoyed was going from Task 1 to Task 2, I just swapped the axes and swapped the category, and just kept going. That was pretty cool.","cat":"Discovery"},
      {"speaker":"Evan","ts":"47:51","sec":2871,"text":"Things get cluttered pretty fast, and so it's difficult to remember what happened a long time ago.","cat":"Frustration"},
      {"speaker":"Evan","ts":"49:40","sec":2980,"text":"I don't think that I took significant note of the lineage aspect. I was more focused on the output and where it sat on the canvas, but less tuned into the lineage.","cat":"Insight"},
      {"speaker":"Evan","ts":"53:07","sec":3187,"text":"To the credit of the work you've done, I was fully kind of just immersed in it, just riffing and jamming.","cat":"Immersion"},
      {"speaker":"Evan","ts":"54:02","sec":3242,"text":"I enjoyed the ability to be fed suggestions all the time. I think that is by far the greatest value.","cat":"Agent Reaction"},
      {"speaker":"Evan","ts":"54:55","sec":3295,"text":"Any time I don't have to do the work of creation, and I do the work of decision-making instead, that is great.","cat":"Design Thinking"},
      {"speaker":"Evan","ts":"55:39","sec":3339,"text":"I definitely see the value, and I just would want more control.","cat":"Axis/Semantic"},
      {"speaker":"Evan","ts":"56:12","sec":3372,"text":"I would say early concepting. Definitely at the start, just to get the juices flowing, get some ideas going.","cat":"Design Thinking"},
      {"speaker":"Evan","ts":"56:39","sec":3399,"text":"There's an opportunity to collaborate with the creative director. This could be part of mood board and direction generation.","cat":"Insight"}
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

# ── full evan_data string ─────────────────────────────────────────────────────
# Duration: 3769s (62m49s) from event log session_start to session_end
# Last generation at ~1882s; post-session survey + debrief from ~1882-3769s
# CSI data from analysis/csi_responses.csv row 2 (Evan, 2/27/2026)
# Pre-study data from analysis/prestudy_responses.csv row 2 (Evan, 2/27/2026)
# Axis change at 1506s from event log (17:30:12)
# Phases from design_brief_change events in event log
out = f'''    id: "evan-s1",
    participant: "Evan Greenberg",
    role: "Product Designer",
    task: "Rugged + lightweight trail shoe & performance runner \u00d7 slide spin-off",
    color: "#f97316",
    dur: 1882,
    speakerNames: {{ participant: "Evan", researcher: "David" }},
    kpis: {{ batches: 28, images: 52, starred: 0, deleted: 0, agentGens: 9, axisChanges: 1 }},
    thumbs: {thumbs_js},
    phases: [
      {{ label: "Setup & Brief",           start: 0,    end: 59,   color: "#58a6ff" }},
      {{ label: "Trail / Hiking Shoe",     start: 59,   end: 885,  color: "#3fb950" }},
      {{ label: "Performance Runner",      start: 885,  end: 1528, color: "#d2a8ff" }},
      {{ label: "Slide Spin-off",          start: 1528, end: 1882, color: "#fbbf24" }},
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
      {{ start:0, end:1506, left:"Rugged", right:"Lightweight" }},
      {{ start:1506, end:1882, left:"Ready-to-Wear", right:"Avant-Garde" }},
    ],
    canvas: [],
    quotes: {quotes_js},
    catColors: {catColors_js},
    preSurvey: {{
      experience: "5\u201310 years",
      tools: ["3D Modeling (Rhino, Grasshopper)", "AI/Generative Tools (Midjourney, Firefly, Vizcom)"],
      aiPhases: ["Moodboarding", "Early Ideation", "Refinement"],
      comfort: 7,
      challenges: ["Lineage/Traceability", "Control (editing specific parts)", "System inflexibility"],
      attitudes: [
        {{ label: "AI can help discover solutions I wouldn\u2019t think of", val: 9, tone: "#7dcea0" }},
        {{ label: "Worry AI might reduce creative agency", val: 2, tone: "#7dcea0" }},
        {{ label: "Struggle translating intent into prompts", val: 3, tone: "#7dcea0" }},
        {{ label: "View AI as collaborator (not just tool)", val: 9, tone: "#7dcea0" }},
      ],
    }},
    csiFact: [
      {{ name: "Collaboration",       items: [null, null], score: 0,  count: 3, color: "#6e7681", note: "N/A (solo session)" }},
      {{ name: "Enjoyment",           items: [8, 8],       score: 16, count: 5, color: "#7dcea0" }},
      {{ name: "Exploration",         items: [6, 5],       score: 11, count: 4, color: "#7eb8da" }},
      {{ name: "Expressiveness",      items: [6, 8],       score: 14, count: 1, color: "#d4a054" }},
      {{ name: "Immersion",           items: [10, 9],      score: 19, count: 2, color: "#a78bca" }},
      {{ name: "Results Worth Effort",items: [7, 8],       score: 15, count: 0, color: "#5ec4b6" }},
    ],
    csiLabels: [
      ["Others could work with me easily", "Easy to share ideas/designs"],
      ["Happy to use regularly", "Enjoyed using the tool"],
      ["Easy to explore many ideas", "Helpful to track different possibilities"],
      ["Able to be very creative", "Allowed me to be very expressive"],
      ["Attention fully tuned to activity", "Became absorbed, forgot about tool"],
      ["Satisfied with what I produced", "Output worth the effort"],
    ],'''

Path('analysis/evan_data_real.txt').write_text(out, encoding='utf-8')
print(f'Generated evan_data_real.txt: {len(out)/1024:.1f}KB')
print(f'Thumbs size: {sum(len(v) for v in thumbs.values())/1024:.1f}KB')
