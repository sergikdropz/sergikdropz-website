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


def find_latest_codex_session(root: Path):
    if not root.exists():
        return None
    files = sorted(root.rglob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    return files[0] if files else None


def load_template_session_meta(path: Path):
    if not path or not path.exists():
        return {}
    with path.open("r", encoding="utf-8", errors="replace") as f:
        first = f.readline()
        if not first:
            return {}
        obj = json.loads(first)
        if obj.get("type") != "session_meta":
            return {}
        return obj.get("payload", {})


def iso_timestamp(ts):
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(ts))


def message_item(role, text):
    if role == "assistant":
        content_type = "output_text"
    else:
        content_type = "input_text"
    return {
        "type": "response_item",
        "payload": {
            "type": "message",
            "role": role,
            "content": [{"type": content_type, "text": text}],
        },
    }


def build_session_lines(template_meta, messages, session_id, cwd, ts):
    meta = {
        "id": session_id,
        "timestamp": iso_timestamp(ts),
        "cwd": cwd,
        "originator": "cursor_import",
        "cli_version": template_meta.get("cli_version", "unknown"),
        "source": template_meta.get("source", "import"),
        "model_provider": template_meta.get("model_provider", "openai"),
    }
    if "base_instructions" in template_meta:
        meta["base_instructions"] = template_meta["base_instructions"]
    if "git" in template_meta:
        meta["git"] = template_meta["git"]

    lines = []
    lines.append({"timestamp": iso_timestamp(ts), "type": "session_meta", "payload": meta})

    for role, content in messages:
        if role == "assistant":
            lines.append(message_item("assistant", content))
        elif role == "user":
            lines.append(message_item("user", content))
        else:
            # Preserve system/tool as assistant-side context.
            prefix = f"[{role}] "
            text = prefix + content if content else f"[{role}]"
            lines.append(message_item("assistant", text))

    return lines


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Codex CLI session JSONL from Cursor transcripts.")
    parser.add_argument(
        "--input",
        default=str(Path.home() / ".cursor" / "projects" / "Users-machd-Documents-SERGIK-Web-and-app" / "agent-transcripts"),
        help="Path to Cursor agent-transcripts folder.",
    )
    parser.add_argument(
        "--output",
        default=str(Path.cwd() / "codex-chat-import"),
        help="Output folder for generated Codex session JSONL files.",
    )
    parser.add_argument(
        "--codex-sessions",
        default=str(Path.home() / ".codex" / "sessions"),
        help="Codex sessions root (used for template detection).",
    )
    parser.add_argument(
        "--workspace",
        default=str(Path.cwd()),
        help="Workspace path stored in session_meta.cwd.",
    )
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    codex_root = Path(args.codex_sessions)

    template_path = find_latest_codex_session(codex_root)
    template_meta = load_template_session_meta(template_path) if template_path else {}

    output_dir.mkdir(parents=True, exist_ok=True)
    cwd = args.workspace

    count = 0
    for path in sorted(input_dir.glob("*.txt")):
        messages = parse_transcript_messages(path)
        if not messages:
            continue
        ts = path.stat().st_mtime
        session_id = str(uuid.uuid4())
        date_dir = time.strftime("%Y/%m/%d", time.localtime(ts))
        out_dir = output_dir / date_dir
        out_dir.mkdir(parents=True, exist_ok=True)
        filename = f"import-{time.strftime('%Y-%m-%dT%H-%M-%S', time.localtime(ts))}-{session_id}.jsonl"
        out_path = out_dir / filename
        lines = build_session_lines(template_meta, messages, session_id, cwd, ts)
        with out_path.open("w", encoding="utf-8") as f:
            for obj in lines:
                f.write(json.dumps(obj, ensure_ascii=True))
                f.write("\n")
        count += 1

    index_path = output_dir / "index.json"
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
