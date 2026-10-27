#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/perry-ruan/chrome-cli-sidebar.git"
DEFAULT_CLONE_DIR="${HOME}/.agy-sidebar-bridge/repo"

# 判断是本地目录直接执行，还是通过 curl -fsSL .../install.sh | bash 远程一键执行
SCRIPT_PATH="${BASH_SOURCE[0]:-}"
if [[ -n "${SCRIPT_PATH}" && -f "$(dirname "${SCRIPT_PATH}")/install-service.sh" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"
  exec "${SCRIPT_DIR}/install-service.sh" "$@"
fi

echo "📦 正在从 GitHub 获取最新 Chrome AI CLI Sidebar..."
if ! command -v git >/dev/null 2>&1; then
  echo "❌ 未检测到 git，请先安装 git (xcode-select --install)"
  exit 1
fi

mkdir -p "$(dirname "${DEFAULT_CLONE_DIR}")"
if [[ -d "${DEFAULT_CLONE_DIR}/.git" ]]; then
  git -C "${DEFAULT_CLONE_DIR}" fetch --depth=1 origin main
  git -C "${DEFAULT_CLONE_DIR}" reset --hard origin/main
else
  rm -rf "${DEFAULT_CLONE_DIR}"
  git clone --depth=1 "${REPO_URL}" "${DEFAULT_CLONE_DIR}"
fi

chmod +x "${DEFAULT_CLONE_DIR}/install.sh" "${DEFAULT_CLONE_DIR}/install-service.sh"
exec "${DEFAULT_CLONE_DIR}/install-service.sh" "$@"
