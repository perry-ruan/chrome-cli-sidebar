#!/usr/bin/env bash
set -euo pipefail

# 获取当前解压目录与固定运行目录
# 注意：macOS 严禁 LaunchAgents 后台服务读写 ~/Downloads、~/Desktop、~/Documents，
# 若同事在「下载」或「桌面」解压运行，直接指向该目录会导致 launchd 报 Operation not permitted (78) 无法启动！
# 因此将服务端运行文件与扩展副本自动同步到不受 macOS TCC 限制的 ~/.agy-sidebar-bridge 目录中。
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="${HOME}/.agy-sidebar-bridge"
SERVER_SCRIPT="${RUNTIME_DIR}/bridge/server.mjs"
PERSISTENT_EXT_DIR="${RUNTIME_DIR}/extension"
LOG_DIR="${RUNTIME_DIR}/logs"

PLIST_NAME="com.perry.agy-sidebar-bridge"
PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_NAME}.plist"

NVM_BIN_DIR=""
if [[ -d "${HOME}/.nvm/versions/node" ]]; then
  LATEST_NVM_NODE="$(ls -1 "${HOME}/.nvm/versions/node" 2>/dev/null | sort -V | tail -n 1 || true)"
  if [[ -n "${LATEST_NVM_NODE}" ]]; then
    NVM_BIN_DIR="${HOME}/.nvm/versions/node/${LATEST_NVM_NODE}/bin:"
  fi
fi

# 合并常见安装目录与当前终端完整 PATH，确保 nvm / fnm / volta / homebrew 等路径全部保留
FULL_PATH="${NVM_BIN_DIR}${HOME}/.local/bin:${HOME}/.claude/local:${HOME}/.claude/bin:/opt/homebrew/bin:/usr/local/bin:${HOME}/.npm-global/bin:${HOME}/.volta/bin:${HOME}/.bun/bin:${HOME}/Library/pnpm:${HOME}/.cargo/bin:${PATH:-/usr/bin:/bin}"
export PATH="${FULL_PATH}"

NODE_BIN="$(command -v node || echo '/usr/local/bin/node')"

# 如果在 Downloads / Desktop / tmp / 远程一键安装目录运行，优先引导加载 ~/.agy-sidebar-bridge/extension 防止清理下载目录导致插件失效
RECOMMENDED_EXT_DIR="${SOURCE_DIR}/extension"
case "${SOURCE_DIR}" in
  "${HOME}/Downloads"*|"${HOME}/Desktop"*|"/tmp"*|"/var/folders"*|"${RUNTIME_DIR}"*)
    RECOMMENDED_EXT_DIR="${PERSISTENT_EXT_DIR}"
    ;;
esac

run_doctor() {
  local fail_count=0
  local warn_count=0

  echo "🩺 Chrome AI CLI Sidebar — 环境自检 (doctor)"
  echo "------------------------------------------------------------"

  # 1. Node.js 检查
  if [[ -x "${NODE_BIN}" ]]; then
    local node_ver
    node_ver="$("${NODE_BIN}" -v 2>/dev/null || echo 'unknown')"
    local node_major
    node_major="$(echo "${node_ver}" | sed -E 's/^v([0-9]+).*/\1/')"
    if [[ "${node_major}" =~ ^[0-9]+$ ]] && [[ "${node_major}" -ge 18 ]]; then
      echo "[PASS] Node.js: ${node_ver} (${NODE_BIN})"
    else
      echo "[FAIL] Node.js 版本过低: ${node_ver} (${NODE_BIN})"
      echo "       hint: 请升级 Node.js 至 v18+（例如运行 brew install node）"
      fail_count=$((fail_count + 1))
    fi
  else
    echo "[FAIL] Node.js 未找到"
    echo "       hint: 请先安装 Node.js v18+（例如运行 brew install node）"
    fail_count=$((fail_count + 1))
  fi

  # 2. CLI 工具检查
  local cli_found=0
  for cli in agy claude gemini codex; do
    local cli_path
    cli_path="$(command -v "${cli}" 2>/dev/null || true)"
    if [[ -n "${cli_path}" && -x "${cli_path}" ]]; then
      echo "[PASS] CLI (${cli}): ${cli_path}"
      cli_found=$((cli_found + 1))
    else
      echo "[INFO] CLI (${cli}): 未安装（可选）"
    fi
  done
  if [[ "${cli_found}" -eq 0 ]]; then
    echo "[FAIL] 本机未检测到任何受支持的 AI CLI (agy / claude / gemini / codex)"
    echo "       hint: 请至少安装其中一个 CLI 并确保其在 PATH 中可执行"
    fail_count=$((fail_count + 1))
  fi

  # 3. 扩展文件完整性检查
  local check_ext_dir="${RECOMMENDED_EXT_DIR}"
  if [[ ! -d "${check_ext_dir}" ]]; then
    check_ext_dir="${SOURCE_DIR}/extension"
  fi
  if [[ -f "${check_ext_dir}/manifest.json" && -f "${check_ext_dir}/sidepanel.js" && -f "${check_ext_dir}/sidepanel.html" ]]; then
    echo "[PASS] Extension 目录完整: ${check_ext_dir}"
  else
    echo "[FAIL] Extension 核心文件缺失: ${check_ext_dir}"
    echo "       hint: 请先运行 ./install.sh 同步扩展文件"
    fail_count=$((fail_count + 1))
  fi

  # 4. 本地 Bridge 服务健康检查 (127.0.0.1:18765)
  local health_json
  if health_json="$(curl -fsS --max-time 3 "http://127.0.0.1:18765/health" 2>/dev/null)"; then
    if echo "${health_json}" | grep -q '"ok":true'; then
      echo "[PASS] Bridge 服务在线: http://127.0.0.1:18765/health (ok: true)"
    else
      echo "[WARN] Bridge 服务已响应但无可用 CLI: ${health_json}"
      echo "       hint: 检查至少一个 CLI 是否已安装并重新运行 ./install.sh"
      warn_count=$((warn_count + 1))
    fi
  else
    echo "[FAIL] Bridge 服务未响应: http://127.0.0.1:18765/health"
    echo "       hint: 请运行 ./install.sh 启动后台服务，或查看日志 ${LOG_DIR}/bridge.err.log"
    fail_count=$((fail_count + 1))
  fi

  echo "------------------------------------------------------------"
  if [[ "${fail_count}" -eq 0 ]]; then
    echo "✅ Doctor 检查通过 (${fail_count} fail, ${warn_count} warn)。推荐加载扩展目录: ${check_ext_dir}"
    return 0
  else
    echo "❌ Doctor 检查发现 ${fail_count} 个错误 (${warn_count} 个警告)，请按照上方 hint 修复后重试。"
    return 1
  fi
}

open_chrome_helper() {
  local target_ext_dir="${RECOMMENDED_EXT_DIR}"
  if [[ ! -d "${target_ext_dir}" ]]; then
    target_ext_dir="${SOURCE_DIR}/extension"
  fi

  if command -v pbcopy >/dev/null 2>&1; then
    printf "%s" "${target_ext_dir}" | pbcopy || true
    echo "📋 已将扩展目录路径复制到剪贴板: ${target_ext_dir}"
  fi

  if [[ -d "/Applications/Google Chrome.app" ]]; then
    osascript -e 'tell application "Google Chrome"
      activate
      if (count of windows) = 0 then
        make new window
      end if
      open location "chrome://extensions/"
    end tell' >/dev/null 2>&1 || open -a "Google Chrome" "chrome://extensions/" >/dev/null 2>&1 || true
    echo "🌐 已在 Google Chrome 中打开 chrome://extensions/"
  fi

  open -R "${target_ext_dir}" >/dev/null 2>&1 || true
  echo "📂 已在 Finder 中打开并高亮扩展文件夹: ${target_ext_dir}"
  echo "👉 请在 Chrome 右上角开启「开发者模式」，然后将 Finder 中高亮的 extension 文件夹直接拖入 Chrome 页面（或点击「加载已解压的扩展程序」后按 Cmd+Shift+G 粘贴路径）。"
}

if [[ "${1:-}" == "--doctor" ]]; then
  run_doctor
  exit $?
fi

if [[ "${1:-}" == "--open-chrome" ]]; then
  open_chrome_helper
  exit 0
fi

# 清除从微信/飞书/Slack/浏览器下载压缩包附带的 macOS 隔离属性 (com.apple.quarantine)
xattr -cr "${SOURCE_DIR}" 2>/dev/null || true

# 同步服务端脚本与扩展静态目录到不受 macOS 权限拦截的 ~/.agy-sidebar-bridge
mkdir -p "${RUNTIME_DIR}/bridge" "${PERSISTENT_EXT_DIR}" "${LOG_DIR}" "${HOME}/Library/LaunchAgents"
cp -f "${SOURCE_DIR}/bridge/server.mjs" "${SERVER_SCRIPT}"
chmod +x "${SERVER_SCRIPT}"
if [[ -d "${SOURCE_DIR}/extension" ]]; then
  cp -Rf "${SOURCE_DIR}/extension/"* "${PERSISTENT_EXT_DIR}/"
fi
printf "%s" "${SOURCE_DIR}" > "${RUNTIME_DIR}/source-dir.txt" 2>/dev/null || true
if command -v git >/dev/null 2>&1 && git -C "${SOURCE_DIR}" rev-parse HEAD >/dev/null 2>&1; then
  git -C "${SOURCE_DIR}" rev-parse HEAD > "${RUNTIME_DIR}/version.txt" 2>/dev/null || true
fi

if [[ ! -x "$NODE_BIN" ]]; then
  echo "❌ 未检测到 Node.js，请先安装 Node.js (v18+)，例如: brew install node"
  exit 1
fi

echo "🔍 正在探测本机已安装的 AI CLI 工具..."
DETECTED_COUNT=0
DETECTED_AGY="$(command -v agy 2>/dev/null || true)"
DETECTED_CLAUDE="$(command -v claude 2>/dev/null || true)"
DETECTED_GEMINI="$(command -v gemini 2>/dev/null || true)"
DETECTED_CODEX="$(command -v codex 2>/dev/null || true)"

for pair in "agy:${DETECTED_AGY}" "claude:${DETECTED_CLAUDE}" "gemini:${DETECTED_GEMINI}" "codex:${DETECTED_CODEX}"; do
  cli="${pair%%:*}"
  cli_path="${pair#*:}"
  if [[ -n "${cli_path}" && -x "${cli_path}" ]]; then
    echo "   ✅ 检测到 ${cli}: ${cli_path}"
    DETECTED_COUNT=$((DETECTED_COUNT + 1))
  else
    echo "   ⚪ 未安装 ${cli}"
  fi
done

# 先停止旧的 LaunchAgent 服务并清理可能残留占用 18765 端口的旧进程
launchctl bootout "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null || launchctl unload "${PLIST_PATH}" 2>/dev/null || true
if command -v lsof >/dev/null 2>&1; then
  OLD_PIDS="$(lsof -ti:18765 2>/dev/null || true)"
  if [[ -n "${OLD_PIDS}" ]]; then
    echo "🔄 正在终止旧的 18765 端口服务进程 (${OLD_PIDS})..."
    kill -9 ${OLD_PIDS} 2>/dev/null || true
    sleep 0.5
  fi
fi

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${SERVER_SCRIPT}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${RUNTIME_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>PATH</key>
    <string>${FULL_PATH}</string>
    <key>AGY_BIN</key>
    <string>${DETECTED_AGY}</string>
    <key>CLAUDE_BIN</key>
    <string>${DETECTED_CLAUDE}</string>
    <key>GEMINI_BIN</key>
    <string>${DETECTED_GEMINI}</string>
    <key>CODEX_BIN</key>
    <string>${DETECTED_CODEX}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/bridge.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/bridge.err.log</string>
</dict>
</plist>
EOF

launchctl enable "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}" 2>/dev/null || launchctl load -w "${PLIST_PATH}" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null || true

# 真实探测 18765 端口是否启动成功（最多等待 3 秒）
STARTED=0
for _ in 1 2 3 4 5 6; do
  if curl -fsS "http://127.0.0.1:18765/health" >/dev/null 2>&1; then
    STARTED=1
    break
  fi
  sleep 0.5
done

# 如果 launchctl 因为系统权限策略未能拉起，直接用 nohup 在后台兜底拉起
if [[ "$STARTED" -eq 0 ]]; then
  echo "⚠️  LaunchAgent 未能自动拉起，正在使用后台守护模式直接启动..."
  nohup "${NODE_BIN}" "${SERVER_SCRIPT}" >> "${LOG_DIR}/bridge.out.log" 2>> "${LOG_DIR}/bridge.err.log" &
  sleep 1
  if curl -fsS "http://127.0.0.1:18765/health" >/dev/null 2>&1; then
    STARTED=1
  fi
fi

echo ""
if [[ "$STARTED" -eq 1 ]]; then
  echo "✅ 服务已成功启动并通过健康检查！"
  echo "🔗 本地 Bridge 健康检查: http://127.0.0.1:18765/health"
  echo ""
  if [[ "${1:-}" != "--no-open" ]]; then
    open_chrome_helper
  else
    echo "📂 推荐加载的 Chrome 扩展目录: ${RECOMMENDED_EXT_DIR}"
  fi
else
  echo "❌ 服务启动失败，错误日志如下（${LOG_DIR}/bridge.err.log）："
  tail -n 20 "${LOG_DIR}/bridge.err.log" 2>/dev/null || true
  exit 1
fi
