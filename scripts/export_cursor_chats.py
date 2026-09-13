#!/usr/bin/env python3
import argparse
import json
import os
import re
import time
from pathlib import Path


ROLE_RE = re.compile(r"^(user|assistant|system|tool):\s*(.*)$")


def parse_transcript(src_path: Path, out_md: Path, out_jsonl: Path) -> dict:
    stat = src_path.stat()
    created_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))

    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_jsonl.parent.mkdir(parents=True, exist_ok=True)

    with src_path.open("r", encoding="utf-8", errors="replace") as src, \
            out_md.open("w", encoding="utf-8") as md, \
            out_jsonl.open("w", encoding="utf-8") as jsonl:
        md.write(f"# Cursor Chat Export\n\n")
        md.write(f"- Source: {src_path}\n")
        md.write(f"- Last modified: {created_at}\n")
        md.write(f"- Bytes: {stat.st_size}\n\n")

        current_role = None
        buffer = []

        def flush():
            nonlocal current_role, buffer
            if current_role is None:
                buffer = []
                return
            content = "".join(buffer).rstrip("\n")
            md.write(f"## {current_role}\n\n")
            if content:
                md.write(content)
                if not content.endswith("\n"):
                    md.write("\n")
            md.write("\n")
            jsonl.write(json.dumps({"role": current_role, "content": content}, ensure_ascii=True))
            jsonl.write("\n")
            buffer = []

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

    return {
        "source": str(src_path),
        "output_md": str(out_md),
        "output_jsonl": str(out_jsonl),
        "mtime": stat.st_mtime,
        "bytes": stat.st_size,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Export Cursor agent transcripts to Markdown/JSONL for VS Code.")
    parser.add_argument(
        "--input",
        default=str(Path.home() / ".cursor" / "projects" / "Users-machd-Documents-SERGIK-Web-and-app" / "agent-transcripts"),
        help="Path to Cursor agent-transcripts folder.",
    )
    parser.add_argument(
        "--output",
        default=str(Path.cwd() / "cursor-chat-export"),
        help="Output directory inside your workspace.",
    )
    args = parser.parse_args()

    in_dir = Path(args.input)
    out_dir = Path(args.output)
    sessions_dir = out_dir / "sessions"

    if not in_dir.exists():
        raise SystemExit(f"Input folder not found: {in_dir}")

    sessions = []
    for path in sorted(in_dir.glob("*.txt")):
        stem = path.stem
        out_md = sessions_dir / f"{stem}.md"
        out_jsonl = sessions_dir / f"{stem}.jsonl"
        sessions.append(parse_transcript(path, out_md, out_jsonl))

    index_path = out_dir / "index.json"
    index_path.parent.mkdir(parents=True, exist_ok=True)
    sessions_sorted = sorted(sessions, key=lambda s: s["mtime"], reverse=True)
    with index_path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
                "input": str(in_dir),
                "output": str(out_dir),
                "count": len(sessions_sorted),
                "sessions": sessions_sorted,
            },
            f,
            indent=2,
            ensure_ascii=True,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
