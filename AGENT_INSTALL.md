# Chrome AI CLI Sidebar — Install Guide for AI Agents (`AGENT_INSTALL.md`)

You are an AI agent (e.g., Antigravity `agy`, Claude Code, Cursor, Gemini CLI, Codex, or Windsurf) setting up **Chrome AI CLI Sidebar (`chrome-cli-sidebar`)** for the user.

**Done =**
1. The installer (`./install.sh` or the remote `curl` installer) completes and `./install.sh --doctor` reports **`0 fail`** checks (`Node.js >= 18`, at least one AI CLI `agy`/`claude`/`gemini`/`codex` available, extension files intact, and `http://127.0.0.1:18765/health` returns `"ok": true`).
2. `chrome://extensions/` has been opened in Google Chrome alongside Finder highlighting the `extension` folder, and the extension directory path is copied to the user's clipboard.
3. The user confirms the unpacked extension is loaded in Chrome and the sidebar status badge shows **`在线`**.

Never use `sudo`. Because Chrome forbids external scripts from silently installing unpacked extensions into a user profile, you will automate 99% of the setup and pop open the exact Chrome page + Finder folder so the user only needs a 2-second drag-and-drop.

---

## 1. Install and Start the Local Bridge Service

- **If you are NOT already inside a local checkout of `chrome-cli-sidebar`**, run the one-line remote installer (which clones `https://github.com/perry-ruan/chrome-cli-sidebar.git` to `~/.agy-sidebar-bridge/repo` and runs `install-service.sh`):

  ```bash
  curl -fsSL https://raw.githubusercontent.com/perry-ruan/chrome-cli-sidebar/main/install.sh | bash
  ```

- **If you ARE already inside a local checkout of the repository**, run:

  ```bash
  chmod +x install.sh install-service.sh
  ./install.sh
  ```

### What the installer does automatically:
- Removes macOS quarantine attributes (`xattr -cr`) added by Slack / WeChat / Feishu / browser downloads.
- Copies `bridge/server.mjs` and `extension/` into `~/.agy-sidebar-bridge/` so macOS TCC (`Operation not permitted` on `~/Downloads` or `~/Desktop`) never blocks the background `launchd` service, and cleaning up `~/Downloads` later will not break the unpacked Chrome extension.
- Detects Node.js (`v18+`) across `nvm`, `fnm`, `volta`, Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`), and standard paths.
- Detects installed AI CLIs (`agy`, `claude`, `gemini`, `codex`) and injects their full paths into `~/Library/LaunchAgents/com.perry.agy-sidebar-bridge.plist`.
- Starts the background service on `http://127.0.0.1:18765` (with automatic `nohup` fallback if `launchctl` is restricted by the host environment).
- Automatically opens `chrome://extensions/` in Google Chrome, reveals the `extension` directory in Finder, and copies the directory path to the system clipboard.

> **Important note for sandboxed agents (Cursor / Claude Code / Codex):**
> If your tool execution environment runs inside a restricted sandbox that blocks `launchctl`, `lsof`, or loopback HTTP requests to `127.0.0.1:18765`, re-run the installer and `--doctor` with full host/network permissions enabled (`disableSandbox` / `full_access`).

---

## 2. Run `--doctor`

Verify the installation by running the built-in diagnostic check:

```bash
~/.agy-sidebar-bridge/repo/install.sh --doctor 2>/dev/null || ./install.sh --doctor
```

Each `[FAIL]` or `[WARN]` row prints a `hint` — follow it and re-run once:
- **`Node.js 未找到` or `版本过低`**: Install or upgrade Node.js (`brew install node` or via `nvm install --lts`), then re-run `./install.sh`.
- **`本机未检测到任何受支持的 AI CLI`**: Check if the user's CLI (`agy`, `claude`, `gemini`, or `codex`) is installed in a non-standard directory. If found, prepend its directory to `PATH` and re-run `./install.sh`.
- **`Bridge 服务未响应`**: Inspect `~/.agy-sidebar-bridge/logs/bridge.err.log`, resolve any port conflict on `18765`, and re-run `./install.sh`.

Do not proceed to Step 3 until `--doctor` reports `0 fail`.

---

## 3. Guide the User to Load the Chrome Extension (2-Second Drag & Drop)

If Chrome or Finder was not opened yet, run:

```bash
~/.agy-sidebar-bridge/repo/install.sh --open-chrome 2>/dev/null || ./install.sh --open-chrome
```

Then give the user these concise instructions:

1. 在刚刚自动打开的 Chrome **`chrome://extensions/`** 页面右上角，开启 **「开发者模式 (Developer mode)」**。
2. **方式 A（最推荐 · 直接拖拽）**：将刚刚自动弹出的 Finder 窗口中高亮的 **`extension`** 文件夹，直接用鼠标拖入 Chrome 的 `chrome://extensions/` 页面即可完成安装！
3. **方式 B（点击选择 · 路径已自动复制）**：点击左上角 **「加载已解压的扩展程序 (Load unpacked)」**，在文件选择框中按 **`Cmd + Shift + G`**，再按 **`Cmd + V`**（扩展路径已由脚本自动写入剪贴板），回车并点击「选择」。

---

## 4. Verify First Use

Ask the user to:
1. Click the Extensions puzzle icon (`🧩`) in the top-right corner of Chrome and pin **AI CLI Sidebar**.
2. Click the extension icon (or press `Cmd + Shift + Y`) to open the sidebar.
3. Confirm that the status badge next to the title reads **`在线`** (green).

---

## 5. Tell the User What the Extension & Bridge Access

When reporting completion, briefly inform the user:
- **100% Local Execution**: The extension communicates exclusively with the local bridge at `http://127.0.0.1:18765`, which invokes the user's locally installed CLI (`agy`, `claude`, `gemini`, `codex`).
- **Local Session Storage**: Chat history and temporary screenshots are stored strictly on the user's own machine under `~/.agy-sidebar-bridge/` (never committed to Git).
- **Untrusted Page Content**: When summarizing or analyzing webpages, page text is passed to the local CLI as untrusted context data.
