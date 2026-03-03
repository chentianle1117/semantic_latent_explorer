#!/usr/bin/env python3
"""Parse real survey CSVs, event logs, and VTT transcript into JS data."""
import csv, json, re
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).parent.parent
ANALYSIS = ROOT / "analysis"

# ═══════════════════════════════════════════════════════════════════
# 1. Parse CSI Survey
# ═══════════════════════════════════════════════════════════════════
FACTOR_MAP = {
    'Be creative and expressive': 'Expressiveness',
    'Produce results that are worth the effort I put in': 'Results Worth Effort',
    'Become immersed in the activity': 'Immersion',
    'Explore many different ideas, outcomes, or possibilities': 'Exploration',
    'Enjoy using the system or tool': 'Enjoyment',
    'Work with other people': 'Collaboration',
}
FACTORS = ['Collaboration', 'Enjoyment', 'Exploration', 'Expressiveness', 'Immersion', 'Results Worth Effort']
FACTOR_COLORS = {
    'Collaboration': '#6e7681',
    'Enjoyment': '#7dcea0',
    'Exploration': '#7eb8da',
    'Expressiveness': '#d4a054',
    'Immersion': '#a78bca',
    'Results Worth Effort': '#5ec4b6',
}
CSI_ITEM_LABELS = [
    ["Others could work with me easily", "Easy to share ideas/designs"],
    ["Happy to use regularly", "Enjoyed using the tool"],
    ["Easy to explore many ideas", "Helpful to track different possibilities"],
    ["Able to be very creative", "Allowed me to be very expressive"],
    ["Attention fully tuned to activity", "Became absorbed, forgot about tool"],
    ["Satisfied with what I produced", "Output worth the effort"],
]

def parse_csi(csv_path):
    rows = []
    with open(csv_path, encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            rows.append(row)

    results = []
    for ri, row in enumerate(rows):
        name = 'benson' if ri == 0 else 'evan'
        items_raw = row[1:13]

        # Parse items into factor pairs
        factor_data = {}
        for fi, fname in enumerate(FACTORS):
            a = items_raw[fi*2].strip()
            b = items_raw[fi*2+1].strip()
            a_val = None if 'N/A' in a else int(a)
            b_val = None if 'N/A' in b else int(b)
            factor_data[fname] = {'items': [a_val, b_val]}

        # Paired comparisons: columns 13-27
        comparisons = row[13:28]
        factor_counts = {f: 0 for f in FACTORS}
        for choice in comparisons:
            mapped = FACTOR_MAP.get(choice.strip(), None)
            if mapped:
                factor_counts[mapped] += 1

        # Build csiFact array
        csi_factors = []
        for fname in FACTORS:
            items = factor_data[fname]['items']
            count = factor_counts[fname]
            if items[0] is not None and items[1] is not None:
                score = items[0] + items[1]
            else:
                score = 0
            note = 'N/A (solo session)' if items[0] is None and items[1] is None else ''
            csi_factors.append({
                'name': fname,
                'items': items,
                'score': score,
                'count': count,
                'color': FACTOR_COLORS[fname],
                'note': note,
            })

        results.append({'name': name, 'csiFact': csi_factors})

    return results


# ═══════════════════════════════════════════════════════════════════
# 2. Parse Pre-Study Survey
# ═══════════════════════════════════════════════════════════════════
def parse_prestudy(csv_path):
    rows = []
    with open(csv_path, encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            rows.append(row)

    results = []
    for ri, row in enumerate(rows):
        name = 'benson' if ri == 0 else 'evan'

        experience = row[1].strip()
        # Fix encoding issues
        experience = experience.replace('\u00e2', '-').replace('â', '-')

        tools_raw = row[2].strip()
        tools = [t.strip().split(' (')[0] for t in tools_raw.split(', ') if t.strip()]
        # Deduplicate (some have "etc.)" suffix)
        tools_clean = []
        seen = set()
        for t in tools:
            key = t.split('/')[0].strip()
            if key not in seen:
                seen.add(key)
                tools_clean.append(t)

        ai_phases_raw = row[3].strip()
        ai_phases = [p.strip().split(':')[0] for p in ai_phases_raw.split('.,') if p.strip()]
        # Clean last item
        ai_phases = [p.rstrip('.') for p in ai_phases]

        comfort = int(row[4].strip())

        challenges_raw = row[5].strip()
        challenges = [c.strip().split(':')[0] for c in challenges_raw.split('.,') if c.strip()]
        challenges = [c.rstrip('.') for c in challenges]

        # Attitude questions
        attitudes = [
            {'label': "AI can help discover solutions I wouldn\u2019t think of", 'val': int(row[6].strip()), 'tone': '#7dcea0'},
            {'label': "Worry AI might reduce creative agency", 'val': int(row[7].strip()), 'tone': '#7dcea0' if int(row[7].strip()) <= 5 else '#d4a054'},
            {'label': "Struggle translating intent into prompts", 'val': int(row[8].strip()), 'tone': '#d4a054' if int(row[8].strip()) >= 6 else '#7dcea0'},
            {'label': "View AI as collaborator (not just tool)", 'val': int(row[9].strip()), 'tone': '#7dcea0'},
        ]

        results.append({
            'name': name,
            'experience': experience,
            'tools': tools_clean,
            'aiPhases': ai_phases,
            'comfort': comfort,
            'challenges': challenges,
            'attitudes': attitudes,
        })

    return results


# ═══════════════════════════════════════════════════════════════════
# 3. Parse VTT Transcript → Extract quotes
# ═══════════════════════════════════════════════════════════════════
def parse_vtt(vtt_path):
    """Parse VTT file and return list of {speaker, start_sec, text}."""
    if not vtt_path.exists():
        print(f"WARNING: VTT file not found: {vtt_path}")
        return []

    content = vtt_path.read_text(encoding='utf-8')
    entries = []

    # Match VTT cue blocks
    pattern = re.compile(
        r'(\d+)\n(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\n(.+?)(?=\n\n|\Z)',
        re.DOTALL
    )

    for m in pattern.finditer(content):
        h, mi, s = int(m.group(2)), int(m.group(3)), int(m.group(4))
        sec = h * 3600 + mi * 60 + s
        text = m.group(6).strip()

        # Split speaker from text
        if ':' in text:
            speaker, utterance = text.split(':', 1)
            speaker = speaker.strip()
            utterance = utterance.strip()
        else:
            speaker = '?'
            utterance = text

        # Normalize speaker names
        if 'Evan' in speaker:
            speaker = 'Evan'
        elif 'David' in speaker:
            speaker = 'David'

        entries.append({
            'speaker': speaker,
            'vtt_sec': sec,
            'text': utterance,
        })

    return entries


# ═══════════════════════════════════════════════════════════════════
# 4. Extract Evan event log data
# ═══════════════════════════════════════════════════════════════════
def parse_evan_events():
    events_all = []
    event_files = [
        ROOT / 'backend/data/Evan/events/022726-evan_0227-evan-user-test_2026-02-27_1705_eventlog.jsonl',
        ROOT / 'backend/data/Evan/events/022726-evan_0227-evan-user-test_2026-02-27_1808_eventlog.jsonl',
    ]
    for f in event_files:
        with open(f, encoding='utf-8') as fh:
            for line in fh:
                if line.strip():
                    events_all.append(json.loads(line))
    events_all.sort(key=lambda e: e.get('timestamp', ''))

    t0 = datetime.fromisoformat('2026-02-27T17:05:06.338340')

    # Session duration
    session_end = None
    for e in events_all:
        if e.get('type') == 'session_end':
            session_end = datetime.fromisoformat(e['timestamp'])

    dur = int((session_end - t0).total_seconds()) if session_end else 3769

    # Axis changes (only those during the session, not after)
    axes = []
    for e in events_all:
        if e.get('type') == 'axis_change':
            t = datetime.fromisoformat(e['timestamp'])
            elapsed = int((t - t0).total_seconds())
            if elapsed > 0 and elapsed < dur:
                labels = e['data']['axisLabels']
                axes.append({
                    'time': elapsed,
                    'x': labels.get('x', []),
                    'y': labels.get('y', []),
                })

    # Design brief changes (mark phase transitions)
    brief_changes = []
    for e in events_all:
        if e.get('type') == 'design_brief_change':
            t = datetime.fromisoformat(e['timestamp'])
            elapsed = int((t - t0).total_seconds())
            if elapsed >= 0 and elapsed < dur:
                brief = e['data'].get('brief', '')[:100]
                brief_changes.append({'time': elapsed, 'brief': brief})

    # Generation events with timing
    gen_events = []
    for e in events_all:
        if e.get('type') == 'generation':
            t = datetime.fromisoformat(e['timestamp'])
            elapsed = int((t - t0).total_seconds())
            gen_events.append({'time': elapsed})

    # Suggestion clicks
    suggestion_clicks = []
    for e in events_all:
        if e.get('type') == 'suggestion_click':
            t = datetime.fromisoformat(e['timestamp'])
            elapsed = int((t - t0).total_seconds())
            d = e.get('data', {})
            suggestion_clicks.append({
                'time': elapsed,
                'tag': d.get('tag', ''),
                'category': d.get('category', ''),
                'action': d.get('action', ''),
            })

    return {
        'dur': dur,
        'axes': axes,
        'brief_changes': brief_changes,
        'gen_events': gen_events,
        'suggestion_clicks': suggestion_clicks,
    }


# ═══════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    print("=== CSI Survey ===")
    csi = parse_csi(ANALYSIS / 'csi_responses.csv')
    for r in csi:
        name = r['name']
        total = sum(f['score'] * f['count'] / 3 for f in r['csiFact'])
        print(f"\n{name.upper()} CSI total: {total:.1f}")
        for f in r['csiFact']:
            weighted = f['score'] * f['count'] / 3
            print(f"  {f['name']:25s}  items={f['items']}  score={f['score']:2d}  count={f['count']}  weighted={weighted:.1f}")

    print("\n\n=== Pre-Study Survey ===")
    prestudy = parse_prestudy(ANALYSIS / 'prestudy_responses.csv')
    for r in prestudy:
        print(f"\n{r['name'].upper()}:")
        print(f"  Experience: {r['experience']}")
        print(f"  Tools: {r['tools']}")
        print(f"  AI Phases: {r['aiPhases']}")
        print(f"  Comfort: {r['comfort']}")
        print(f"  Challenges: {r['challenges']}")
        print(f"  Attitudes: {[(a['label'][:40], a['val']) for a in r['attitudes']]}")

    print("\n\n=== Evan Event Log ===")
    evan_events = parse_evan_events()
    print(f"  Duration: {evan_events['dur']}s ({evan_events['dur']//60}m {evan_events['dur']%60}s)")
    print(f"  Axis changes: {len(evan_events['axes'])}")
    for a in evan_events['axes']:
        print(f"    at {a['time']//60}:{a['time']%60:02d} — x={a['x']}, y={a['y']}")
    print(f"  Brief changes: {len(evan_events['brief_changes'])}")
    for b in evan_events['brief_changes']:
        print(f"    at {b['time']//60}:{b['time']%60:02d} — {b['brief'][:80]}")
    print(f"  Generation events: {len(evan_events['gen_events'])}")
    print(f"  Suggestion clicks: {len(evan_events['suggestion_clicks'])}")

    # VTT
    vtt_path = Path(r"C:\Users\chent\Downloads\GMT20260227-213543_Recording.transcript.vtt")
    print(f"\n\n=== VTT Transcript ===")
    vtt = parse_vtt(vtt_path)
    if vtt:
        print(f"  Total entries: {len(vtt)}")
        print(f"  Evan entries: {sum(1 for e in vtt if e['speaker'] == 'Evan')}")
        print(f"  Duration: {vtt[-1]['vtt_sec']//60}m")
    else:
        print("  (not found)")
