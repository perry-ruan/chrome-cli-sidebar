# Chrome AI CLI 侧边栏 (AGY / Claude Code / Cursor / Gemini / Codex)

在 Chrome 侧边栏中直接调用你本机已安装的命令行 AI 工具（**Antigravity `agy`**、**Claude Code `claude`**、**Cursor Agent `cursor-agent`**、**Gemini CLI `gemini`**、**OpenAI Codex `codex`**），读取当前或任意多个打开的浏览器标签页内容进行**总结、全文翻译、框选截屏提问、代码审查与多轮追问**，彻底告别浏览器账号与地区限制。

## ✨ 核心特性

- **极简紧凑工具台设计**：引擎下拉切换（`✦ AGY` / `✴ Claude Code` / `⌘ Cursor` / `♊ Gemini` / `◈ Codex`）与 `⚡ 快捷` 操作/斜杠指令下拉菜单（Menu Dropdown），将超过 80% 的侧边栏可视面积留给对话阅读。
- **多 CLI 自动探测与热切换**：服务启动时自动在 `~/.local/bin`、`/opt/homebrew/bin`、`/usr/local/bin`、`nvm` 等路径探测本机安装的 CLI。
- **多标签页上下文选择器（Chrome Gemini 同款）**：输入框上方可自由勾选当前打开的任意多个 Chrome 标签页作为上下文，支持实时搜索与一键移除。
- **框选截屏 & 剪贴板粘贴图片**：支持在任意网页拖拽框选截屏（`✂️ 框选截屏`）或直接在输入框按 `Cmd+V` 粘贴截图提问。
- **历史会话本地隔离持久化**：所有会话记录与临时截图保存在本机 `~/.agy-sidebar-bridge/`，支持 `--conversation` (AGY) 或 `--resume` (Claude Code / Cursor Agent / Gemini) 连续多轮追问，且分享代码库时不会泄露个人历史。

---

## 🤖 方式一：把链接甩给 AI 自动安装（最推荐 · 零门槛）

参考 `Tencent/BrowserSkill` 的 [AGENT_INSTALL.md](file:///Users/perry/WebstormProjects/chrome-cli-sidebar/AGENT_INSTALL.md) 规范，同事只需打开 **Cursor / Claude Code / Antigravity (`agy`) / Gemini CLI / Windsurf**，直接发送下面这句话（连仓库都不用手动克隆）：

```text
请阅读 https://raw.githubusercontent.com/perry-ruan/chrome-cli-sidebar/main/AGENT_INSTALL.md 并帮我安装配置好这个 Chrome 侧边栏插件
```

AI 会自动帮你完成：
1. 拉取最新代码并启动 macOS 开机自启后台服务（监听 `127.0.0.1:18765`）
2. 执行 `--doctor` 自检 Node.js、CLI 路径与端口健康状态
3. **自动唤醒 Chrome 打开 `chrome://extensions/` 页面、自动在 Finder 高亮弹出 `extension` 文件夹、并将路径复制到剪贴板**，你只需把高亮文件夹拖进 Chrome 即可！

---

## 🚀 方式二：终端一行命令极速安装

前提：电脑已安装 **Node.js (v18+)**，且至少安装了 `agy`、`claude`、`cursor-agent`、`gemini`、`codex` 中的任意一个 CLI。

### 第 1 步：一行命令安装后台服务并自动弹出扩展目录

打开终端运行：

```bash
curl -fsSL https://raw.githubusercontent.com/perry-ruan/chrome-cli-sidebar/main/install.sh | bash
```

*(如果已经 `git clone` 到本地，直接运行 `./install.sh` 即可；随时可运行 `./install.sh --doctor` 进行环境自检。)*

### 第 2 步：拖入 Chrome 扩展（2 秒完成）

1. 在自动打开的 Chrome `chrome://extensions/` 页面右上角，开启 **「开发者模式 (Developer mode)」**
2. 将自动弹出的 Finder 窗口中高亮的 **`extension`** 文件夹直接拖入 Chrome 页面（或点击左上角 **「加载已解压的扩展程序」** 后按 `Cmd+Shift+G` 粘贴剪贴板中已自动复制的路径）即可！
