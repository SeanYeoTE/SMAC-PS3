#!/usr/bin/env bash
# Checks for the runtimes this project needs (Python 3.10+, Node.js 18+),
# offers to install whichever is missing, then offers to install the
# project's own dependencies (pip + npm).
#
# Installs are user-local and sudo-free: official binary releases are
# downloaded, checksum-verified, and unpacked under ~/.local -- nothing is
# piped into a shell and nothing touches system directories. Supports
# macOS and Linux (x86_64 / arm64). On Windows, use WSL.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DIR="$HOME/.local"
NODE_DIR="$LOCAL_DIR/node-lts"
PYTHON_DIR="$LOCAL_DIR/py311"
MIN_NODE_MAJOR=18
MIN_PY_MINOR=10   # Python 3.10+

PATH_HINTS=()

# ---------- helpers ----------------------------------------------------

confirm() {
  local prompt="$1"
  local reply
  read -r -p "$prompt [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

detect_platform() {
  case "$(uname -s)" in
    Darwin) OS_NAME=darwin ;;
    Linux)  OS_NAME=linux ;;
    *) echo "Unsupported OS: $(uname -s). Use WSL on Windows." >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) ARCH_NODE=arm64; ARCH_PY=aarch64 ;;
    x86_64|amd64)  ARCH_NODE=x64;   ARCH_PY=x86_64 ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
}

verify_sha256() {
  local file="$1" expected="$2" actual
  actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "Checksum mismatch for $file (expected $expected, got $actual)." >&2
    return 1
  fi
}

# ---------- Node.js ------------------------------------------------------

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node -e 'console.log(process.versions.node.split(".")[0])')"
  [[ "$major" -ge "$MIN_NODE_MAJOR" ]]
}

install_node() {
  echo "Fetching the latest Node.js LTS release list from nodejs.org..."
  local version
  version="$(curl -sSL https://nodejs.org/dist/index.json \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(x["version"] for x in d if x.get("lts")))')"
  local pkg="node-${version}-${OS_NAME}-${ARCH_NODE}"
  local url="https://nodejs.org/dist/${version}/${pkg}.tar.gz"
  local tmp; tmp="$(mktemp -d)"

  echo "Downloading Node.js ${version} for ${OS_NAME}-${ARCH_NODE}..."
  curl -sSL -o "$tmp/node.tar.gz" "$url"
  curl -sSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/${version}/SHASUMS256.txt"
  local expected
  expected="$(grep " ${pkg}.tar.gz\$" "$tmp/SHASUMS256.txt" | awk '{print $1}')"
  verify_sha256 "$tmp/node.tar.gz" "$expected"

  mkdir -p "$NODE_DIR"
  tar -xzf "$tmp/node.tar.gz" -C "$NODE_DIR" --strip-components=1
  rm -rf "$tmp"
  echo "Node.js ${version} installed to $NODE_DIR"
  PATH_HINTS+=("$NODE_DIR/bin")
  export PATH="$NODE_DIR/bin:$PATH"
}

# ---------- Python -------------------------------------------------------

python_ok() {
  PY_BIN=""
  local candidate
  for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
      local minor
      minor="$("$candidate" -c 'import sys; print(sys.version_info[1])' 2>/dev/null || echo 0)"
      if [[ "$("$candidate" -c 'import sys; print(sys.version_info[0])')" == "3" && "$minor" -ge "$MIN_PY_MINOR" ]]; then
        PY_BIN="$candidate"
        return 0
      fi
    fi
  done
  return 1
}

install_python() {
  echo "Looking up the latest python-build-standalone release..."
  local release_json
  release_json="$(curl -sSL https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest)"
  local tag asset_name url
  tag="$(echo "$release_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')"
  asset_name="$(echo "$release_json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
target = '${ARCH_PY}-$( [ "$OS_NAME" = darwin ] && echo apple-darwin || echo unknown-linux-gnu )'
for a in data['assets']:
    n = a['name']
    if 'cpython-3.11' in n and target in n and n.endswith('install_only.tar.gz'):
        print(n); break
")"
  if [[ -z "$asset_name" ]]; then
    echo "Couldn't find a matching python-build-standalone release for this platform." >&2
    return 1
  fi
  url="https://github.com/astral-sh/python-build-standalone/releases/download/${tag}/${asset_name}"
  local tmp; tmp="$(mktemp -d)"

  echo "Downloading standalone CPython 3.11 (${asset_name})..."
  curl -sSL -o "$tmp/python.tar.gz" "$url"
  curl -sSL -o "$tmp/SHA256SUMS" "https://github.com/astral-sh/python-build-standalone/releases/download/${tag}/SHA256SUMS"
  local expected
  expected="$(grep " ${asset_name}\$" "$tmp/SHA256SUMS" | awk '{print $1}')"
  verify_sha256 "$tmp/python.tar.gz" "$expected"

  mkdir -p "$PYTHON_DIR"
  tar -xzf "$tmp/python.tar.gz" -C "$PYTHON_DIR" --strip-components=1
  rm -rf "$tmp"
  echo "Python 3.11 installed to $PYTHON_DIR"
  PATH_HINTS+=("$PYTHON_DIR/bin")
  PY_BIN="$PYTHON_DIR/bin/python3.11"
}

# ---------- main ----------------------------------------------------------

detect_platform

echo "== Node.js =="
if node_ok; then
  echo "OK: $(node --version) ($(command -v node))"
else
  echo "Not found (or older than v${MIN_NODE_MAJOR})."
  if confirm "Install Node.js LTS locally under $NODE_DIR (no sudo, official nodejs.org binary)?"; then
    install_node
  else
    echo "Skipping. Install Node.js ${MIN_NODE_MAJOR}+ yourself, then re-run this script."
  fi
fi

echo
echo "== Python =="
if python_ok; then
  echo "OK: $PY_BIN ($("$PY_BIN" --version))"
else
  echo "No Python 3.${MIN_PY_MINOR}+ found."
  if confirm "Install Python 3.11 locally under $PYTHON_DIR (no sudo, official python-build-standalone binary)?"; then
    install_python
  else
    echo "Skipping. Install Python 3.${MIN_PY_MINOR}+ yourself, then re-run this script."
  fi
fi

echo
if [[ -n "${PY_BIN:-}" ]]; then
  echo "== Backend dependencies =="
  if confirm "Create/refresh .venv and run 'pip install -r requirements.txt'?"; then
    "$PY_BIN" -m venv "$REPO_ROOT/.venv"
    "$REPO_ROOT/.venv/bin/pip" install -q --upgrade pip
    "$REPO_ROOT/.venv/bin/pip" install -q -r "$REPO_ROOT/requirements.txt"
    echo "Done. Activate with: source .venv/bin/activate"
  fi
fi

if node_ok; then
  echo
  echo "== Frontend dependencies =="
  if confirm "Run 'npm install' in web/?"; then
    npm --prefix "$REPO_ROOT/web" install
  fi
fi

if [[ "${#PATH_HINTS[@]}" -gt 0 ]]; then
  echo
  echo "Add these to your shell profile (~/.zshrc) to use the tools you just installed in new terminals:"
  for dir in "${PATH_HINTS[@]}"; do
    echo "  export PATH=\"$dir:\$PATH\""
  done
fi

echo
echo "Done. To run the app:"
echo "  source .venv/bin/activate && uvicorn app.main:app --reload   # backend"
echo "  npm --prefix web run dev                                     # frontend"
