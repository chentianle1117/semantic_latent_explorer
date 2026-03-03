#!/usr/bin/env python3
"""
Build dashboard.html from session data files.

Usage:
    python analysis/build_dashboard.py

To add a new session:
1. Run the session JSON through gen_session_data.py to create analysis/sessions/<id>_data.txt
2. Run this script

The script auto-discovers all analysis/sessions/*_data.txt files and includes them.
If evan_data_real.txt exists, Evan's real data is also included.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
ANALYSIS = ROOT / "analysis"

def run():
    # Step 1: Regenerate Evan thumbnails + data if not current
    evan_thumbs = ANALYSIS / "evan_thumbs.json"
    evan_data = ANALYSIS / "evan_data_real.txt"

    if not evan_thumbs.exists():
        print("Generating Evan thumbnails...")
        subprocess.run([sys.executable, str(ANALYSIS / "gen_evan_data.py")], check=True, cwd=ROOT)
    elif not evan_data.exists():
        print("Generating Evan session data...")
        subprocess.run([sys.executable, str(ANALYSIS / "gen_evan_data.py")], check=True, cwd=ROOT)
    else:
        evan_session = ROOT / "backend/data/Evan/sessions/022726-evan_0227-evan-user-test_cdef4fab-cca7-42ee-857c-3ad0dea327c6.json"
        if evan_session.stat().st_mtime > evan_data.stat().st_mtime:
            print("Evan session data is stale, regenerating...")
            subprocess.run([sys.executable, str(ANALYSIS / "gen_evan_data.py")], check=True, cwd=ROOT)
        else:
            print(f"Evan data is current ({evan_data.stat().st_size//1024}KB)")

    # Step 2: Run the main migration/assembly script
    print("Building dashboard.html...")
    subprocess.run([sys.executable, str(ANALYSIS / "migrate_to_multisession.py")], check=True, cwd=ROOT)

    out = ANALYSIS / "dashboard.html"
    print(f"\nDone! Output: {out}  ({out.stat().st_size//1024}KB)")
    print("\nTo add a new participant session:")
    print("  1. Run: python analysis/gen_session_data.py <session_json> --id <participant-id>")
    print("  2. Add the session data reference to migrate_to_multisession.py SESSIONS list")
    print("  3. Run: python analysis/build_dashboard.py")

if __name__ == "__main__":
    run()
