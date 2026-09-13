#!/usr/bin/env python3
"""
use_local_model.py

Same auto‑setup as the original installer, but it ONLY uses models that are
already present in your local Ollama installation.  If the requested model
is not found the script stops with a clear message instead of pulling it.

Features
--------
* Detect OS, install Ollama binary if missing
* Start (or verify) the Ollama daemon
* Create a clean .venv and install the Python client `ollama`
* Validate that the requested model already exists locally
* Launch a streaming "cursor‑style" REPL that prints tokens as they arrive
* Idempotent – re‑run safely; nothing is re‑downloaded
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

# ----------------------------------------------------------------------
# Helper wrappers
# ----------------------------------------------------------------------
def run(cmd: list[str], *, capture_output: bool = False, check: bool = True, env=None):
    """Run a subprocess command and return CompletedProcess."""
    return subprocess.run(
        cmd,
        check=check,
        stdout=subprocess.PIPE if capture_output else None,
        stderr=subprocess.PIPE if capture_output else None,
        text=True,
        env=env,
    )

def spinner(msg: str):
    """Yield a simple rotating spinner."""
    while True:
        for ch in "|/-\\":
            yield f"\r{msg} {ch}"

# ----------------------------------------------------------------------
# 1️⃣ Detect platform
# ----------------------------------------------------------------------
def detect_platform() -> str:
    if sys.platform.startswith("linux"):
        return "linux"
    if sys.platform == "darwin":
        return "macos"
    if sys.platform.startswith("win"):
        return "windows"
    raise RuntimeError(f"Unsupported platform: {sys.platform}")

# ----------------------------------------------------------------------
# 2️⃣ Install Ollama binary (if missing)
# ----------------------------------------------------------------------
def install_ollama():
    if shutil.which("ollama"):
        print("✅ Ollama binary already installed.")
        return

    platform = detect_platform()
    if platform == "windows":
        print(
            "⚠️  Windows detected. Please download the MSI from:\n"
            "   https://ollama.com/download/Ollama.exe\n"
            "   and run it, then re‑run this script."
        )
        sys.exit(1)

    print("⬇️  Installing Ollama (official install script)…")
    try:
        run(
            ["bash", "-c", "curl -fsSL https://ollama.com/install.sh | sh"],
            check=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"❌ Ollama installation failed: {e}")
        sys.exit(1)

    if not shutil.which("ollama"):
        print("❌ Ollama binary still not found after install.")
        sys.exit(1)

    print("✅ Ollama installed successfully.")

# ----------------------------------------------------------------------
# 3️⃣ Ensure daemon is running
# ----------------------------------------------------------------------
def check_ollama_api():
    """Check if Ollama API is responding."""
    try:
        with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=2) as response:
            return json.loads(response.read())
    except Exception:
        return None

def ensure_ollama_running():
    if check_ollama_api() is not None:
        print("✅ Ollama daemon already running.")
        return

    print("🚀 Starting Ollama daemon …")
    log = Path("ollama.log")
    with log.open("ab") as f:
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=f,
            stderr=subprocess.STDOUT,
            preexec_fn=os.setsid if hasattr(os, "setsid") else None,
        )
    spin = spinner("⏳ Waiting for daemon")
    for _ in range(30):
        time.sleep(0.5)
        if check_ollama_api() is not None:
            print("\n✅ Ollama daemon is ready.")
            return
        sys.stdout.write(next(spin))
        sys.stdout.flush()
    print("\n❌ Ollama daemon failed to start – see ollama.log")
    sys.exit(1)

# ----------------------------------------------------------------------
# 4️⃣ Create virtual‑env and install client
# ----------------------------------------------------------------------
def create_venv(venv_dir: Path) -> Path:
    if not venv_dir.is_dir():
        print(f"🛠️  Creating virtual‑env at {venv_dir}")
        run([sys.executable, "-m", "venv", str(venv_dir)])
    else:
        print(f"✅ Virtual‑env already present at {venv_dir}")

    bin_dir = venv_dir / ("Scripts" if os.name == "nt" else "bin")
    pip = bin_dir / "pip"
    python = bin_dir / "python"

    print("🔧 Upgrading pip …")
    run([str(pip), "install", "--quiet", "--upgrade", "pip"])
    print("📦 Installing ollama …")
    run([str(pip), "install", "--quiet", "ollama"])

    return python

# ----------------------------------------------------------------------
# 5️⃣ Verify requested model is already local
# ----------------------------------------------------------------------
def verify_local_model(model_name: str):
    """Check Ollama API for the requested model; abort if absent."""
    try:
        api_data = check_ollama_api()
        if api_data is None:
            print("❌ Unable to connect to Ollama API.")
            sys.exit(1)
        
        models = api_data.get("models", [])
    except Exception as e:
        print(f"❌ Unable to query local models: {e}")
        sys.exit(1)

    for m in models:
        if m.get("name") == model_name:
            print(f"✅ Model `{model_name}` is already present and ready.")
            return

    # If we get here the model is missing
    print(
        f"⚠️  Model `{model_name}` NOT found locally.\n"
        f"   • To add it, run `ollama pull {model_name}` in a terminal.\n"
        "   • Or choose a different name with `--model`.\n"
        "   • After the model is ready, re‑run this script."
    )
    sys.exit(1)

# ----------------------------------------------------------------------
# 6️⃣ Streaming REPL (cursor style)
# ----------------------------------------------------------------------
def launch_repl(python_exe: Path, model_name: str):
    repl_code = f"""
import sys
from ollama import Client

client = Client()   # defaults to http://localhost:11434

def stream(prompt: str):
    for chunk in client.generate(model="{model_name}", prompt=prompt, stream=True):
        sys.stdout.write(chunk.get('response', ''))
        sys.stdout.flush()

print("🖱️  Ollama cursor REPL – type your prompt, press ENTER. Ctrl‑C to exit.")
while True:
    try:
        txt = input("\\n> ").strip()
        if not txt:
            continue
        stream(txt)
        print("\\n---")
    except KeyboardInterrupt:
        print("\\n👋 Bye!")
        break
"""

    run([str(python_exe), "-c", repl_code])

# ----------------------------------------------------------------------
# 7️⃣ Main driver
# ----------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Use a locally‑installed Ollama model and launch a streaming REPL."
    )
    parser.add_argument(
        "--model",
        default="llama3",
        help="Name of a model that is already present in your local Ollama store.",
    )
    parser.add_argument(
        "--venv",
        default=".venv",
        help="Directory for the temporary Python virtual‑env.",
    )
    args = parser.parse_args()

    install_ollama()
    ensure_ollama_running()
    py_exe = create_venv(Path(args.venv))
    verify_local_model(args.model)
    launch_repl(py_exe, args.model)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n🚦 Interrupted – exiting.")
        sys.exit(0)
