#!/usr/bin/env python3
import argparse
import json
import os
import re
import time
import uuid
from pathlib import Path


ROLE_RE = re.compile(r"^(user|assistant|system|tool):\s*(.*)$")


def parse_transcript_messages(src_path: Path):
    messages = []
    current_role = None
    buffer = []

    def flush():
        nonlocal current_role, buffer
        if current_role is None:
            buffer = []
            return
        content = "".join(buffer).rstrip("\n")
        messages.append((current_role, content))
        buffer = []

    with src_path.open("r", encoding="utf-8", errors="replace") as src:
        for line in src:
            match = ROLE_RE.match(line)
            if match:
                flush()
                current_role = match.group(1)
                remainder = match.group(2)
                if remainder:
                    buffer.append(remainder + "\n")
                continue
            buffer.append(line)
        flush()

    return messages


def pair_requests(messages):
    requests = []
    current_user = None
    assistant_buffer = []

    def flush_pair():
        nonlocal current_user, assistant_buffer
        if current_user is None and not assistant_buffer:
            return
        user_text = current_user or "(no user message)"
        assistant_text = "\n\n".join([t for t in assistant_buffer if t]) if assistant_buffer else ""
        requests.append((user_text, assistant_text))
        current_user = None
        assistant_buffer = []

    for role, content in messages:
        if role == "user":
            flush_pair()
            current_user = content
        elif role == "assistant":
            assistant_buffer.append(content)
        else:
            # Treat system/tool as assistant-side context to avoid losing content
            assistant_buffer.append(f"[{role}] {content}" if content else f"[{role}]")

    flush_pair()
    return requests


def load_template(template_path: Path):
    if not template_path or not template_path.exists():
        return None
    try:
        return json.loads(template_path.read_text())
    except Exception:
        return None


def build_message(text):
    length = len(text)
    return {
        "parts": [
            {
                "range": {"start": 0, "endExclusive": length},
                "editorRange": {
                    "startLineNumber": 1,
                    "startColumn": 1,
                    "endLineNumber": 1,
                    "endColumn": max(1, length + 1),
                },
                "text": text,
                "kind": "text",
            }
        ],
        "text": text,
    }


def build_response(text, base_uri):
    return [
        {
            "value": text,
            "supportThemeIcons": False,
            "supportHtml": False,
            "baseUri": base_uri,
        }
    ]


def build_request_entry(user_text, assistant_text, template_request, base_uri, timestamp_ms, session_id):
    request_id = f"request_{uuid.uuid4()}"
    response_id = f"response_{uuid.uuid4()}"

    entry = {
        "requestId": request_id,
        "message": build_message(user_text),
        "variableData": {"variables": []},
        "response": build_response(assistant_text, base_uri),
        "agent": template_request.get("agent", {}),
        "timestamp": timestamp_ms,
        "modelId": template_request.get("modelId", "copilot/auto"),
        "responseId": response_id,
        "result": {
            "timings": {"firstProgress": 0, "totalElapsed": 0},
            "metadata": {
                "codeBlocks": [],
                "renderedUserMessage": [],
                "renderedGlobalContext": [],
                "cacheKey": base_uri.get("path", ""),
            },
            "toolCallRounds": [],
            "toolCallResults": {},
            "modelMessageId": str(uuid.uuid4()),
            "responseId": response_id,
            "sessionId": session_id,
            "agentId": template_request.get("agent", {}).get("id", "imported"),
            "details": "Imported from Cursor",
        },
        "responseMarkdownInfo": [],
        "followups": [],
        "modelState": {"value": 1, "completedAt": timestamp_ms},
        "contentReferences": [],
        "codeCitations": [],
        "timeSpentWaiting": 0,
    }
    return entry


def build_session(template_session, template_request, requests, created_ms, workspace_path):
    session_id = str(uuid.uuid4())
    base_uri = {"$mid": 1, "path": workspace_path, "scheme": "file"}

    built_requests = []
    ts = created_ms
    for user_text, assistant_text in requests:
        built_requests.append(
            build_request_entry(user_text, assistant_text, template_request, base_uri, ts, session_id)
        )
        ts += 1000

    return {
        "version": template_session.get("version", 3),
        "responderUsername": template_session.get("responderUsername", "GitHub Copilot"),
        "responderAvatarIconUri": template_session.get("responderAvatarIconUri", {"id": "copilot"}),
        "initialLocation": template_session.get("initialLocation", "panel"),
        "requests": built_requests,
        "sessionId": session_id,
        "creationDate": created_ms,
        "lastMessageDate": ts if built_requests else created_ms,
        "hasPendingEdits": False,
        "inputState": template_session.get("inputState", {}),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build VS Code chatSessions JSON files from Cursor transcripts.")
    parser.add_argument(
        "--input",
        default=str(Path.home() / ".cursor" / "projects" / "Users-machd-Documents-SERGIK-Web-and-app" / "agent-transcripts"),
        help="Path to Cursor agent-transcripts folder.",
    )
    parser.add_argument(
        "--output",
        default=str(Path.cwd() / "vscode-chat-import" / "chatSessions"),
        help="Output folder for generated chatSessions JSON files.",
    )
    parser.add_argument(
        "--template",
        default=str(Path.home() / "Library" / "Application Support" / "Code" / "User" / "workspaceStorage" / "8dea2edf2aa5dfee7b038f03473f431f" / "chatSessions" / "dd809600-c867-4c9f-8c4d-43c74a0302db.json"),
        help="Template chat session JSON file (used to mirror structure).",
    )
    parser.add_argument(
        "--workspace",
        default=str(Path.cwd()),
        help="Workspace path used for baseUri.",
    )
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    template_session = load_template(Path(args.template)) or {}
    template_request = {}
    if template_session.get("requests"):
        template_request = template_session["requests"][0]

    output_dir.mkdir(parents=True, exist_ok=True)
    workspace_path = args.workspace

    count = 0
    for path in sorted(input_dir.glob("*.txt")):
        messages = parse_transcript_messages(path)
        reqs = pair_requests(messages)
        if not reqs:
            continue
        created_ms = int(path.stat().st_mtime * 1000)
        session = build_session(template_session, template_request, reqs, created_ms, workspace_path)
        out_path = output_dir / f"{session['sessionId']}.json"
        out_path.write_text(json.dumps(session, indent=2), encoding="utf-8")
        count += 1

    index_path = output_dir.parent / "index.json"
    index_path.write_text(
        json.dumps(
            {
                "generated_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
                "input": str(input_dir),
                "output": str(output_dir),
                "count": count,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
