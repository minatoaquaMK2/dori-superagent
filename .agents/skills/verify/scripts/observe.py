#!/usr/bin/env python3
"""Read the selected chat runtime and save evidence without copying its bearer token."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--home", required=True, type=Path)
parser.add_argument("--project", required=True, type=Path)
parser.add_argument("--output", type=Path, help="Save doctor, snapshot, and selected persisted state here")
args = parser.parse_args()
home = args.home.resolve(strict=True)
project = args.project.resolve(strict=True)
connection = json.loads((home / "connection.json").read_text())
url = urllib.parse.urlsplit(connection["url"])
if url.scheme != "http" or url.hostname != "127.0.0.1":
    raise SystemExit("Expected the loopback HTTP bridge")
os.kill(connection["pid"], 0)
owner = subprocess.check_output(
    ["ps", "-p", str(connection["pid"]), "-o", "command="], text=True
).strip()
request = urllib.request.Request(
    connection["url"] + "/health", headers={"Authorization": "Bearer " + connection["token"]}
)
with urllib.request.urlopen(request, timeout=5) as response:
    health = json.load(response)
if health.get("connected") is not True:
    raise SystemExit("Bridge is alive but Codex is disconnected")
state = json.loads((home / "state.json").read_text())
conversations = [c for c in state["conversations"] if Path(c["cwd"]).resolve() == project]
if len(conversations) != 1:
    raise SystemExit(f"Expected one conversation for {project}, found {len(conversations)}")
conversation = conversations[0]
request = urllib.request.Request(
    connection["url"] + "/snapshot?" + urllib.parse.urlencode({"conversation": conversation["conversation"]}),
    headers={"Authorization": "Bearer " + connection["token"]},
)
with urllib.request.urlopen(request, timeout=5) as response:
    snapshot = json.load(response)
if Path(snapshot["cwd"]).resolve() != project or snapshot["conversation"] != conversation["conversation"]:
    raise SystemExit("Snapshot does not belong to the requested project and conversation")
if snapshot["state"]["kind"] == "disconnected":
    raise SystemExit("This conversation is disconnected")
tasks = [t for t in state["tasks"] if t["conversation"] == conversation["conversation"]]
doctor = {
    "home": str(home), "project": str(project), "bridgePid": connection["pid"],
    "bridgeCommand": owner, "connected": health["connected"],
    "conversation": conversation["conversation"], "revision": snapshot["revision"],
    "state": snapshot["state"], "queued": snapshot["queued"],
    "tasks": [{k: t[k] for k in ("id", "threadId", "terminal", "tab", "state", "reported")} for t in tasks],
}
if args.output:
    output = args.output.resolve()
    if output == home or home in output.parents:
        raise SystemExit("Evidence must live outside the runtime directory")
    output.mkdir(parents=True, exist_ok=True)
    for name, value in {
        "doctor.json": doctor, "snapshot.json": snapshot,
        "conversation.json": {"conversation": conversation, "tasks": tasks},
    }.items():
        target = output / name
        with target.open("w", encoding="utf-8") as stream:
            os.chmod(target, 0o600)
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
print(json.dumps(doctor, ensure_ascii=False, indent=2))
