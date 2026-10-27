#!/usr/bin/env node
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import {
  existsSync,
  mkdirSync,
  accessSync,
  readdirSync,
  statSync,
  realpathSync,
  constants as fsConstants,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const HOME_DIR = process.env.HOME || os.homedir() || '';
const DATA_ROOT = HOME_DIR ? path.join(HOME_DIR, '.agy-sidebar-bridge') : PROJECT_ROOT;
const SCREENSHOT_DIR = path.join(DATA_ROOT, '.tmp-screenshots');
const SESSIONS_DIR = path.join(DATA_ROOT, '.sessions');
const SESSIONS_FILE = path.join(SESSIONS_DIR, 'sessions.json');
const LEGACY_SESSIONS_FILE = path.join(PROJECT_ROOT, '.sessions', 'sessions.json');
const NOTES_DIR = path.join(DATA_ROOT, 'notes');
const DEFAULT_CWD_DIR = path.join(DATA_ROOT, 'workspace-sandbox');

for (const dir of [SCREENSHOT_DIR, SESSIONS_DIR, NOTES_DIR, DEFAULT_CWD_DIR]) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

const PORT = Number(process.env.AGY_BRIDGE_PORT || 18765);
const HOST = '127.0.0.1';
const MAX_CONTENT_CHARS = 45000;

function getVersionManagerBinDirs() {
  if (!HOME_DIR) return [];
  const results = [];

  // 1. NVM: ~/.nvm/versions/node/*/bin
  const nvmDir = path.join(HOME_DIR, '.nvm', 'versions', 'node');
  if (existsSync(nvmDir)) {
    try {
      for (const ver of readdirSync(nvmDir).sort().reverse()) {
        const bin = path.join(nvmDir, ver, 'bin');
        if (existsSync(bin)) results.push(bin);
      }
    } catch {}
  }

  // 2. fnm: ~/Library/Application Support/fnm/node-versions/*/installation/bin & ~/.local/share/fnm/...
  const fnmRoots = [
    path.join(HOME_DIR, 'Library', 'Application Support', 'fnm', 'node-versions'),
    path.join(HOME_DIR, '.local', 'share', 'fnm', 'node-versions'),
    path.join(HOME_DIR, '.fnm', 'node-versions'),
  ];
  for (const root of fnmRoots) {
    if (!existsSync(root)) continue;
    try {
      for (const ver of readdirSync(root).sort().reverse()) {
        const bin = path.join(root, ver, 'installation', 'bin');
        if (existsSync(bin)) results.push(bin);
      }
    } catch {}
  }

  return results;
}

function buildEnhancedPath() {
  const nodeBinDir = process.execPath ? path.dirname(process.execPath) : '';
  const staticDirs = [
    nodeBinDir,
    HOME_DIR ? path.join(HOME_DIR, '.local', 'bin') : '',
    HOME_DIR ? path.join(HOME_DIR, '.claude', 'local') : '',
    HOME_DIR ? path.join(HOME_DIR, '.claude', 'local', 'node_modules', '.bin') : '',
    HOME_DIR ? path.join(HOME_DIR, '.claude', 'bin') : '',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    ...getVersionManagerBinDirs(),
    HOME_DIR ? path.join(HOME_DIR, '.volta', 'bin') : '',
    HOME_DIR ? path.join(HOME_DIR, '.bun', 'bin') : '',
    HOME_DIR ? path.join(HOME_DIR, 'Library', 'pnpm') : '',
    HOME_DIR ? path.join(HOME_DIR, '.local', 'share', 'pnpm') : '',
    HOME_DIR ? path.join(HOME_DIR, '.local', 'share', 'mise', 'shims') : '',
    HOME_DIR ? path.join(HOME_DIR, '.asdf', 'shims') : '',
    HOME_DIR ? path.join(HOME_DIR, '.npm-global', 'bin') : '',
    HOME_DIR ? path.join(HOME_DIR, '.cargo', 'bin') : '',
    '/usr/bin',
    '/bin',
  ].filter(Boolean);

  const existing = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return [...new Set([...staticDirs, ...existing])].join(path.delimiter);
}

function isExecutable(filePath) {
  if (!filePath || !existsSync(filePath)) return false;
  try {
    accessSync(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCliBinary(cmdName, envOverrideKey) {
  const envVal = envOverrideKey ? process.env[envOverrideKey] : '';
  if (envVal === 'none' || envVal === 'disabled') {
    return null;
  }
  if (envVal && isExecutable(envVal)) {
    return envVal;
  }

  // 1. Search in enhanced PATH directories
  const searchDirs = buildEnhancedPath().split(path.delimiter).filter(Boolean);
  for (const dir of searchDirs) {
    const candidate = path.join(dir, cmdName);
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  // 2. Fallback: ask user's login shell
  try {
    const userShell = process.env.SHELL || '/bin/zsh';
    const out = execFileSync(userShell, ['-lc', `command -v ${cmdName}`], {
      env: { ...process.env, HOME: HOME_DIR, PATH: buildEnhancedPath() },
      timeout: 1200,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString('utf8')
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('/'))
      .pop();
    if (out && isExecutable(out)) {
      return out;
    }
  } catch {
    // ignore shell lookup failure
  }

  return null;
}

const ENGINE_SPECS = [
  {
    id: 'agy',
    cmd: 'agy',
    envKey: 'AGY_BIN',
    name: 'AGY',
    fullName: 'Antigravity CLI (agy)',
    icon: '✦',
    supportsEffort: true,
  },
  {
    id: 'claude',
    cmd: 'claude',
    envKey: 'CLAUDE_BIN',
    name: 'Claude Code',
    fullName: 'Claude Code CLI (claude)',
    icon: '✴',
    supportsEffort: true,
  },
  {
    id: 'gemini',
    cmd: 'gemini',
    envKey: 'GEMINI_BIN',
    name: 'Gemini CLI',
    fullName: 'Gemini CLI (gemini)',
    icon: '♊',
    supportsEffort: false,
  },
  {
    id: 'codex',
    cmd: 'codex',
    envKey: 'CODEX_BIN',
    name: 'Codex CLI',
    fullName: 'OpenAI Codex CLI (codex)',
    icon: '◈',
    supportsEffort: false,
  },
];

let detectedEngines = [];
let lastEngineDetectAt = 0;

function detectInstalledEngines(force = false) {
  const now = Date.now();
  if (!force && detectedEngines.length > 0 && now - lastEngineDetectAt < 15_000) {
    return detectedEngines;
  }
  lastEngineDetectAt = now;
  detectedEngines = ENGINE_SPECS.map((spec) => {
    const binPath = resolveCliBinary(spec.cmd, spec.envKey);
    return {
      id: spec.id,
      cmd: spec.cmd,
      name: spec.name,
      fullName: spec.fullName,
      icon: spec.icon,
      supportsEffort: spec.supportsEffort,
      available: Boolean(binPath),
      binPath: binPath || null,
    };
  });
  return detectedEngines;
}

function getDefaultEngineId() {
  if (detectedEngines.length === 0) detectInstalledEngines(true);
  const preferredOrder = ['agy', 'claude', 'gemini', 'codex'];
  for (const id of preferredOrder) {
    const found = detectedEngines.find((e) => e.id === id && e.available);
    if (found) return found.id;
  }
  return 'claude';
}

function getEngineInfo(engineId) {
  if (detectedEngines.length === 0) detectInstalledEngines(true);
  if (engineId) {
    let requested = detectedEngines.find((e) => e.id === engineId);
    // If user explicitly picked an engine that wasn't detected at startup, re-probe with TTL
    if (requested && !requested.available) {
      detectInstalledEngines(false);
      requested = detectedEngines.find((e) => e.id === engineId);
    }
    if (requested) return requested;
  }
  const fallbackId = getDefaultEngineId();
  return detectedEngines.find((e) => e.id === fallbackId) || detectedEngines[0];
}

// Initial detection on startup
detectInstalledEngines();

async function readSessionsStore() {
  try {
    if (!existsSync(SESSIONS_FILE) && existsSync(LEGACY_SESSIONS_FILE)) {
      const legacyRaw = await fs.readFile(LEGACY_SESSIONS_FILE, 'utf8');
      await fs.writeFile(SESSIONS_FILE, legacyRaw, 'utf8');
    }
    const raw = await fs.readFile(SESSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      activeSessionId: parsed.activeSessionId || null,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { activeSessionId: null, sessions: [] };
  }
}

function getWorkspaceRootDirs() {
  const customRoots = (process.env.AGY_WORKSPACE_ROOTS || '')
    .split(path.delimiter)
    .map((p) => p.trim())
    .filter(Boolean);
  return [
    ...customRoots,
    HOME_DIR ? path.join(HOME_DIR, 'WebstormProjects') : '',
    HOME_DIR ? path.join(HOME_DIR, 'IdeaProjects') : '',
    HOME_DIR ? path.join(HOME_DIR, 'GolandProjects') : '',
    HOME_DIR ? path.join(HOME_DIR, 'PycharmProjects') : '',
    HOME_DIR ? path.join(HOME_DIR, 'Projects') : '',
    HOME_DIR ? path.join(HOME_DIR, 'Developer') : '',
    HOME_DIR ? path.join(HOME_DIR, 'Code') : '',
    HOME_DIR ? path.join(HOME_DIR, 'workspace') : '',
    HOME_DIR ? path.join(HOME_DIR, 'src') : '',
    HOME_DIR ? path.join(HOME_DIR, 'repos') : '',
  ].filter(Boolean);
}

let cachedWorkspaces = null;
let lastWorkspacesScanAt = 0;

function discoverLocalWorkspaces(force = false) {
  const now = Date.now();
  if (!force && cachedWorkspaces && now - lastWorkspacesScanAt < 15_000) {
    return cachedWorkspaces;
  }
  lastWorkspacesScanAt = now;
  const candidates = [];
  const roots = getWorkspaceRootDirs();

  const seenPaths = new Set();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    try {
      const entries = readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(root, entry.name);
        try {
          if (!statSync(fullPath).isDirectory()) continue;
          const real = realpathSync(fullPath);
          if (seenPaths.has(real)) continue;
          seenPaths.add(real);
          candidates.push({
            name: entry.name,
            path: real,
            group: path.basename(root),
          });
        } catch {
          // ignore broken symlinks
        }
      }
    } catch {
      // ignore unreadable directories
    }
  }
  candidates.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  cachedWorkspaces = candidates.slice(0, 80);
  return cachedWorkspaces;
}

function resolveValidWorkspacePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const trimmed = rawPath.trim().replace(/^~(?=$|\/)/, HOME_DIR);
  if (!trimmed) return null;
  try {
    const resolved = realpathSync(path.resolve(trimmed));
    if (!statSync(resolved).isDirectory()) return null;
    const allowedSet = new Set(discoverLocalWorkspaces(false).map((w) => w.path));
    if (allowedSet.has(resolved)) {
      return resolved;
    }
  } catch {
    // ignore
  }
  return null;
}

let sessionsWriteChain = Promise.resolve();
function mutateSessionsStore(mutator) {
  const runMutation = async () => {
    const store = await readSessionsStore();
    await mutator(store);
    const sessions = (store.sessions || [])
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 50);
    store.sessions = sessions;
    store.activeSessionId = store.activeSessionId || null;
    const payload = JSON.stringify({ activeSessionId: store.activeSessionId, sessions }, null, 2);
    const tmpFile = `${SESSIONS_FILE}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmpFile, payload, 'utf8');
    await fs.rename(tmpFile, SESSIONS_FILE);
    return store;
  };
  const next = sessionsWriteChain.then(runMutation, runMutation);
  sessionsWriteChain = next.catch(() => {});
  return next;
}

const DEFAULT_MODELS_BY_ENGINE = {
  agy: [
    { id: '', label: '默认模型 (AGY Default)', group: '默认' },
    { id: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low · 极速推荐)', group: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)', group: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)', group: 'Gemini 3.8 Flash' },
    { id: 'gemini-4-argon-low', label: 'Gemini 4 Argon (Low)', group: 'Gemini 4 Argon' },
    { id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon (Medium)', group: 'Gemini 4 Argon' },
    { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High)', group: 'Gemini 4 Argon' },
    { id: 'gemini-3.1-pro-low', label: 'Gemini 3.1 Pro (Low)', group: 'Gemini 3.1 Pro' },
    { id: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro (High)', group: 'Gemini 3.1 Pro' },
    { id: 'claude-sonnet-5-5-low', label: 'Claude Sonnet 5.5 (Low)', group: 'Claude 5.5' },
    { id: 'claude-sonnet-5-5-medium', label: 'Claude Sonnet 5.5 (Medium)', group: 'Claude 5.5' },
    { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)', group: 'Claude 5.5' },
    { id: 'claude-opus-5-5-low', label: 'Claude Opus 5.5 (Low)', group: 'Claude 5.5' },
    { id: 'claude-opus-5-5-medium', label: 'Claude Opus 5.5 (Medium)', group: 'Claude 5.5' },
    { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)', group: 'Claude 5.5' },
  ],
  claude: [
    { id: '', label: '默认模型 (Claude Default)', group: '默认' },
    { id: 'sonnet', label: 'Claude Sonnet (Latest · 极速推荐)', group: 'Claude 官方别名' },
    { id: 'opus', label: 'Claude Opus (Latest · 深度推理)', group: 'Claude 官方别名' },
    { id: 'haiku', label: 'Claude Haiku (Latest · 轻量秒回)', group: 'Claude 官方别名' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', group: '指定版本' },
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', group: '指定版本' },
  ],
  gemini: [
    { id: '', label: '默认模型 (Gemini Default)', group: '默认' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (极速推荐)', group: 'Gemini 2.5' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (深度推理)', group: 'Gemini 2.5' },
  ],
  codex: [
    { id: '', label: '默认模型 (Codex Default)', group: '默认' },
    { id: 'o4-mini', label: 'o4-mini (推荐)', group: 'OpenAI' },
    { id: 'gpt-4.1', label: 'GPT-4.1', group: 'OpenAI' },
  ],
};

let cachedAgyModels = null;

function inferAgyGroup(id) {
  if (id.startsWith('gemini-4')) return 'Gemini 4 Argon';
  if (id.startsWith('gemini-3.8')) return 'Gemini 3.8 Flash';
  if (id.startsWith('gemini-3.7')) return 'Gemini 3.7 Flash';
  if (id.startsWith('gemini-3.1')) return 'Gemini 3.1 Pro';
  if (id.startsWith('claude-')) return 'Claude';
  return '其他模型';
}

function fetchAgyModels(forceRefresh = false) {
  if (cachedAgyModels && !forceRefresh) {
    return Promise.resolve(cachedAgyModels);
  }
  const agyInfo = detectedEngines.find((e) => e.id === 'agy');
  if (!agyInfo || !agyInfo.available || !agyInfo.binPath) {
    return Promise.resolve(DEFAULT_MODELS_BY_ENGINE.agy);
  }

  return new Promise((resolve) => {
    const child = spawn(agyInfo.binPath, ['models'], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        PATH: buildEnhancedPath(),
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    let out = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(cachedAgyModels || DEFAULT_MODELS_BY_ENGINE.agy);
    }, 6000);

    child.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
    });

    child.on('close', () => {
      clearTimeout(timer);
      const clean = out.replace(/\r/g, '\n');
      const parsed = [{ id: '', label: '默认模型 (AGY Default)', group: '默认' }];
      const seen = new Set(['']);
      for (const rawLine of clean.split('\n')) {
        const line = rawLine.replace(/^.*Fetching available models\.\.\.\s*/, '').trim();
        const m = line.match(/^([a-z0-9._-]+)\s{2,}(.+)$/i);
        if (m) {
          const id = m[1].trim();
          const label = m[2].trim();
          if (!seen.has(id)) {
            seen.add(id);
            parsed.push({ id, label, group: inferAgyGroup(id) });
          }
        }
      }
      if (parsed.length > 1) {
        cachedAgyModels = parsed;
      }
      resolve(cachedAgyModels || DEFAULT_MODELS_BY_ENGINE.agy);
    });

    child.on('error', () => {
      clearTimeout(timer);
      resolve(cachedAgyModels || DEFAULT_MODELS_BY_ENGINE.agy);
    });
  });
}

async function getModelsForEngine(engineId, forceRefresh = false) {
  if (engineId === 'agy') {
    if (forceRefresh) {
      return await fetchAgyModels(true);
    }
    if (!cachedAgyModels) {
      fetchAgyModels(true).catch(() => {});
    }
    return cachedAgyModels || DEFAULT_MODELS_BY_ENGINE.agy;
  }
  return DEFAULT_MODELS_BY_ENGINE[engineId] || DEFAULT_MODELS_BY_ENGINE.claude;
}

const ALLOWED_EXTENSION_IDS = new Set(
  (process.env.AGY_ALLOWED_EXTENSION_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser local CLI / curl health check
  if (!origin.startsWith('chrome-extension://')) return false;
  if (ALLOWED_EXTENSION_IDS.size > 0) {
    const extId = origin.slice('chrome-extension://'.length).split('/')[0];
    return ALLOWED_EXTENSION_IDS.has(extId);
  }
  return true;
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(req)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sanitizeCliArgToken(val) {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed || trimmed.startsWith('-') || !/^[\w.:-]+$/.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function sendSse(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function cleanupOldScreenshots() {
  try {
    const files = await fs.readdir(SCREENSHOT_DIR);
    const now = Date.now();
    for (const file of files) {
      if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(file)) continue;
      const fullPath = path.join(SCREENSHOT_DIR, file);
      const stat = await fs.stat(fullPath);
      if (now - stat.mtimeMs > 3600_000) {
        await fs.unlink(fullPath).catch(() => {});
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

function buildFinalPrompt({
  prompt,
  mode,
  includePageContext,
  pageContext,
  pageContexts,
  screenshotPath,
  workspacePath,
  engineName = 'AI CLI',
}) {
  const parts = [];

  parts.push(
    `你是一个运行在 Chrome 侧边栏中的本地 AI 助手（当前底层引擎：${engineName}）。请默认使用清晰、结构化的中文回答（除非用户另有要求）。不要修改任何本地代码文件。`
  );

  if (workspacePath) {
    parts.push(
      `\n【已关联的本机代码仓库目录】\n当前工作目录已挂载至本地代码库：\`${workspacePath}\`\n如果用户询问代码实现、排查报错堆栈、审查 PR 或查找文件，你可以直接读取和检索该本地仓库中的源码文件来给出精确到文件路径与行号的分析（只读分析，不要修改本地代码）。`
    );
  }

  if (screenshotPath) {
    parts.push(
      `\n【当前浏览器截图/图片文件】\n图片已保存在本地文件：\`${screenshotPath}\`\n请先调用读取文件/看图工具查看该图片文件，然后结合图片内容完成下方任务。`
    );
  }

  const tabsToInclude =
    Array.isArray(pageContexts) && pageContexts.length > 0
      ? pageContexts
      : includePageContext && pageContext
        ? [pageContext]
        : [];

  if (includePageContext && tabsToInclude.length > 0) {
    const totalBudget = Math.min(MAX_CONTENT_CHARS * 2, 90000);
    const perTabBudget = Math.max(3000, Math.min(MAX_CONTENT_CHARS, Math.floor(totalBudget / tabsToInclude.length)));
    tabsToInclude.forEach((tabCtx, idx) => {
      const { title, url, selection, content, isActive } = tabCtx || {};
      const headerLabel =
        tabsToInclude.length === 1
          ? '【已引入的浏览器标签页上下文】'
          : `【已引入的浏览器标签页 #${idx + 1}${isActive ? ' (当前激活页)' : ''}】`;
      const contextLines = [`\n${headerLabel}`];
      if (title) contextLines.push(`- 标题: ${title}`);
      if (url) contextLines.push(`- 网址: ${url}`);
      if (selection && selection.trim()) {
        contextLines.push(`\n【用户在页面上选中的文本】\n"""\n${selection.trim().slice(0, perTabBudget)}\n"""`);
      }
      if (content && content.trim()) {
        const clipped = content.trim().slice(0, perTabBudget);
        contextLines.push(`\n【页面正文提取内容】\n"""\n${clipped}\n"""`);
      }
      parts.push(contextLines.join('\n'));
    });
  }

  if (mode === 'summarize') {
    parts.push(
      tabsToInclude.length > 1
        ? `\n【任务：汇总总结上述 ${tabsToInclude.length} 个标签页】\n请综合分析上述引入的 ${tabsToInclude.length} 个网页内容，提供一份结构化中文总结，包含：\n1. **各页面核心主旨与关联**\n2. **关键要点汇总（Bullet Points）**\n3. **重要结论 / 待办或行动项（如有）**`
        : '\n【任务：总结当前网页】\n请针对上述网页内容（若选中文本存在则优先兼顾选中部分）提供一份条理清晰的中文总结，包含：\n1. **一句话核心主旨**\n2. **关键要点（Bullet Points）**\n3. **重要结论 / 待办或行动项（如有）**'
    );
    if (prompt && prompt.trim()) {
      parts.push(`\n补充要求：${prompt.trim()}`);
    }
  } else if (mode === 'translate') {
    const anySelection = tabsToInclude.some((t) => Boolean(t?.selection?.trim()));
    parts.push(
      anySelection
        ? '\n【任务：翻译选中文本】\n请将上方【用户在页面上选中的文本】准确、地道地翻译为中文（如果原文已是中文，则翻译为自然流畅的英文）。对于专业术语可保留原文括号注释。'
        : '\n【任务：翻译网页内容】\n请将上方【页面正文提取内容】的核心段落完整、准确、流畅地翻译为中文（保持原有层级结构，专业术语可保留英文括注）。'
    );
    if (prompt && prompt.trim()) {
      parts.push(`\n补充要求：${prompt.trim()}`);
    }
  } else if (mode === 'screenshot') {
    parts.push(
      `\n【任务：截屏识别与翻译/解析】\n${
        prompt && prompt.trim()
          ? prompt.trim()
          : '请查看上方截图文件，提取并翻译截图中的关键文字内容为中文，并简要说明截图展示的核心信息。'
      }`
    );
  } else {
    parts.push(`\n【用户问题/指令】\n${prompt || '请分析当前页面内容。'}`);
  }

  return parts.join('\n');
}

function createCliAdapter({
  engine,
  finalPrompt,
  model,
  effort,
  conversationId,
  screenshotPath,
  workspacePath,
  res,
  onInvalidSession,
}) {
  const validEffort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : 'low';
  const safeModel = sanitizeCliArgToken(model);
  const safeConversationId = sanitizeCliArgToken(conversationId);
  model = safeModel;
  conversationId = safeConversationId || null;
  let activeConversationId = conversationId;
  let streamedAnyDelta = false;
  let finished = false;
  let initSent = false;

  const emitInitOnce = (id) => {
    if (id) activeConversationId = id;
    if (!initSent && activeConversationId) {
      initSent = true;
      sendSse(res, 'init', { conversationId: activeConversationId, engine: engine.id });
    }
  };

  if (engine.id === 'agy') {
    const args = [
      '-p',
      finalPrompt,
      '--output-format',
      'stream-json',
      '--effort',
      validEffort,
    ];
    if (model && typeof model === 'string' && model.trim()) {
      args.push('--model', model.trim());
    }
    if (conversationId && typeof conversationId === 'string') {
      args.push('--conversation', conversationId);
    }

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const evt = JSON.parse(trimmed);
        if (evt.event === 'init') {
          emitInitOnce(evt.conversation_id || activeConversationId);
        } else if (evt.event === 'step_update' && evt.step_update) {
          const su = evt.step_update;
          if (su.conversation_id) {
            emitInitOnce(su.conversation_id);
          }
          if (
            su.step_type === 'agent_response' &&
            typeof su.text_delta === 'string' &&
            su.text_delta.length > 0
          ) {
            streamedAnyDelta = true;
            sendSse(res, 'delta', {
              text: su.text_delta,
              conversationId: activeConversationId,
              engine: engine.id,
            });
          } else if (
            su.step_type &&
            su.step_type !== 'user_input' &&
            su.step_type !== 'agent_response'
          ) {
            sendSse(res, 'status', {
              stepType: su.step_type,
              state: su.state,
              conversationId: activeConversationId,
              engine: engine.id,
            });
          }
        } else if (evt.event === 'result' && evt.result) {
          const r = evt.result;
          if (r.conversation_id) {
            emitInitOnce(r.conversation_id);
          }
          if (!streamedAnyDelta && typeof r.response === 'string' && r.response.length > 0) {
            sendSse(res, 'delta', {
              text: r.response,
              conversationId: activeConversationId,
              engine: engine.id,
            });
          }
          finished = true;
          sendSse(res, 'done', {
            conversationId: activeConversationId,
            durationSeconds: r.duration_seconds,
            status: r.status,
            engine: engine.id,
          });
        }
      } catch {
        // ignore non-json lines
      }
    };

    return {
      args,
      handleLine,
      isFinished: () => finished,
      hasStreamedDelta: () => streamedAnyDelta,
      getConversationId: () => activeConversationId,
    };
  }

  if (engine.id === 'claude') {
    const claudeEffort = ['low', 'medium', 'high'].includes(validEffort) ? validEffort : 'high';
    const args = [
      '-p',
      finalPrompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--effort',
      claudeEffort,
      '--permission-mode',
      'bypassPermissions',
    ];
    if (model && typeof model === 'string' && model.trim()) {
      args.push('--model', model.trim());
    }
    if (conversationId && typeof conversationId === 'string') {
      args.push('--resume', conversationId);
    }
    if (screenshotPath) {
      args.push('--add-dir', SCREENSHOT_DIR);
    }
    if (workspacePath) {
      args.push('--add-dir', workspacePath);
    }

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const evt = JSON.parse(trimmed);
        if (evt.session_id && !evt.is_error) {
          emitInitOnce(evt.session_id);
        }

        if (evt.type === 'stream_event' && evt.event) {
          const inner = evt.event;
          if (
            inner.type === 'content_block_delta' &&
            inner.delta?.type === 'text_delta' &&
            typeof inner.delta.text === 'string' &&
            inner.delta.text.length > 0
          ) {
            streamedAnyDelta = true;
            sendSse(res, 'delta', {
              text: inner.delta.text,
              conversationId: activeConversationId,
              engine: engine.id,
            });
          } else if (
            inner.type === 'content_block_start' &&
            inner.content_block?.type === 'tool_use'
          ) {
            sendSse(res, 'status', {
              stepType: inner.content_block.name || 'tool_use',
              conversationId: activeConversationId,
              engine: engine.id,
            });
          }
        } else if (evt.type === 'assistant' && evt.message?.content) {
          const blocks = Array.isArray(evt.message.content) ? evt.message.content : [];
          for (const block of blocks) {
            if (block.type === 'tool_use' && block.name) {
              sendSse(res, 'status', {
                stepType: block.name,
                conversationId: activeConversationId,
                engine: engine.id,
              });
            } else if (!streamedAnyDelta && block.type === 'text' && block.text) {
              streamedAnyDelta = true;
              sendSse(res, 'delta', {
                text: block.text,
                conversationId: activeConversationId,
                engine: engine.id,
              });
            }
          }
        } else if (evt.type === 'result') {
          if (evt.is_error) {
            const errList = Array.isArray(evt.errors) ? evt.errors.filter(Boolean).join('; ') : '';
            const errMsg = errList || evt.result || evt.error || 'Claude Code 执行返回错误';
            if (
              conversationId &&
              onInvalidSession &&
              /No conversation found with session ID/i.test(errMsg)
            ) {
              finished = true;
              onInvalidSession();
              return;
            }
            finished = true;
            sendSse(res, 'error', {
              message: errMsg,
              conversationId: activeConversationId,
              engine: engine.id,
            });
            return;
          }
          if (!streamedAnyDelta && typeof evt.result === 'string' && evt.result.length > 0) {
            streamedAnyDelta = true;
            sendSse(res, 'delta', {
              text: evt.result,
              conversationId: activeConversationId,
              engine: engine.id,
            });
          }
          finished = true;
          sendSse(res, 'done', {
            conversationId: activeConversationId,
            durationSeconds: evt.duration_ms ? Number((evt.duration_ms / 1000).toFixed(2)) : undefined,
            status: evt.subtype || 'success',
            engine: engine.id,
          });
        }
      } catch {
        // Fallback if plain text line is emitted
      }
    };

    return {
      args,
      handleLine,
      isFinished: () => finished,
      hasStreamedDelta: () => streamedAnyDelta,
      getConversationId: () => activeConversationId,
    };
  }

  if (engine.id === 'gemini') {
    const args = ['-p', finalPrompt, '--output-format', 'stream-json'];
    if (model && typeof model === 'string' && model.trim()) {
      args.push('--model', model.trim());
    }
    if (conversationId && typeof conversationId === 'string') {
      args.push('--resume', conversationId);
    }
    if (screenshotPath) {
      args.push('--include-directories', SCREENSHOT_DIR);
    }
    if (workspacePath) {
      args.push('--include-directories', workspacePath);
      args.push('--approval-mode', 'plan');
    }

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const evt = JSON.parse(trimmed);
        if (evt.session_id || evt.sessionId || evt.conversation_id) {
          emitInitOnce(evt.session_id || evt.sessionId || evt.conversation_id);
        }
        const deltaText =
          evt.text_delta ||
          evt.delta ||
          (evt.type === 'message' && evt.role !== 'user' ? evt.content : null) ||
          (evt.type === 'content' ? evt.text || evt.value : null);

        if (typeof deltaText === 'string' && deltaText.length > 0) {
          streamedAnyDelta = true;
          sendSse(res, 'delta', {
            text: deltaText,
            conversationId: activeConversationId,
            engine: engine.id,
          });
        } else if (evt.type === 'tool_use' || evt.type === 'tool_call') {
          sendSse(res, 'status', {
            stepType: evt.name || evt.tool_name || 'tool',
            conversationId: activeConversationId,
            engine: engine.id,
          });
        } else if (evt.type === 'result' || evt.event === 'result') {
          const finalResp = evt.response || evt.result?.response || evt.result;
          if (!streamedAnyDelta && typeof finalResp === 'string' && finalResp.length > 0) {
            streamedAnyDelta = true;
            sendSse(res, 'delta', {
              text: finalResp,
              conversationId: activeConversationId,
              engine: engine.id,
            });
          }
          finished = true;
          sendSse(res, 'done', {
            conversationId: activeConversationId,
            engine: engine.id,
          });
        }
      } catch {
        // Ignore non-JSON diagnostic lines (e.g. "Loaded cached credentials.")
      }
    };

    return {
      args,
      handleLine,
      isFinished: () => finished,
      hasStreamedDelta: () => streamedAnyDelta,
      getConversationId: () => activeConversationId,
    };
  }

  const args = ['exec', '--sandbox', 'read-only', finalPrompt];
  if (model && typeof model === 'string' && model.trim()) {
    args.push('-m', model.trim());
  }

  const handleLine = (line) => {
    if (!line) return;
    streamedAnyDelta = true;
    sendSse(res, 'delta', {
      text: `${line}\n`,
      conversationId: activeConversationId,
      engine: engine.id,
    });
  };

  return {
    args,
    handleLine,
    isFinished: () => finished,
    hasStreamedDelta: () => streamedAnyDelta,
    getConversationId: () => activeConversationId,
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > 25 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new Error('JSON body must be an object'));
          return;
        }
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    setCorsHeaders(req, res);

    if (!isAllowedOrigin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Forbidden origin' }));
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/engines')) {
      if (url.searchParams.get('refresh') === '1' || !detectedEngines.some((e) => e.available)) {
        detectInstalledEngines(url.searchParams.get('refresh') === '1');
      }
      const defaultEngineId = getDefaultEngineId();
      const defaultEngine = getEngineInfo(defaultEngineId);
      const anyAvailable = detectedEngines.some((e) => e.available);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: anyAvailable,
          defaultEngine: defaultEngineId,
          engine: defaultEngine?.id || 'claude',
          agyPath: defaultEngine?.binPath || null,
          engines: detectedEngines,
          port: PORT,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/models') {
      const force = url.searchParams.get('refresh') === '1';
      const engineId = url.searchParams.get('engine') || getDefaultEngineId();
      const models = await getModelsForEngine(engineId, force);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ engine: engineId, models }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/workspaces') {
      const workspaces = discoverLocalWorkspaces();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ workspaces }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/save-note') {
      try {
        const body = await readJsonBody(req);
        const title = String(body.title || 'AI-Note')
          .replace(/[\x00-\x1f\x7f]/g, '')
          .trim();
        const content = String(body.content || '').trim();
        const sourceUrl = String(body.sourceUrl || '')
          .replace(/[\x00-\x1f\x7f]/g, '')
          .trim();
        if (!content) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '笔记内容为空' }));
          return;
        }

        const safeSlug =
          title
            .replace(/[\\/:*?"<>|#\n\r\t]+/g, '-')
            .replace(/\s+/g, '-')
            .slice(0, 48)
            .replace(/^-+|-+$/g, '') || 'note';
        const now = new Date();
        const datePrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
          now.getDate()
        ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
          now.getMinutes()
        ).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        let fileName = `${datePrefix}_${safeSlug}.md`;
        let filePath = path.join(NOTES_DIR, fileName);

        const mdHeader = [
          `# ${title || 'AI 笔记'}`,
          '',
          `- **保存时间**: ${now.toLocaleString('zh-CN')}`,
          ...(sourceUrl ? [`- **来源网页**: ${sourceUrl}`] : []),
          '',
          '---',
          '',
        ].join('\n');

        try {
          await fs.writeFile(filePath, `${mdHeader}${content}\n`, { encoding: 'utf8', flag: 'wx' });
        } catch {
          fileName = `${datePrefix}_${String(now.getMilliseconds()).padStart(3, '0')}_${safeSlug}.md`;
          filePath = path.join(NOTES_DIR, fileName);
          await fs.writeFile(filePath, `${mdHeader}${content}\n`, 'utf8');
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, filePath, fileName }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/sessions') {
      const store = await readSessionsStore();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(store));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/sessions') {
      try {
        const body = await readJsonBody(req);
        const store = await mutateSessionsStore((s) => {
          if (body.session && typeof body.session === 'object' && typeof body.session.id === 'string' && body.session.id.trim()) {
            const cleanSession = {
              id: String(body.session.id).trim(),
              title: String(body.session.title || '新对话').slice(0, 120),
              engine: typeof body.session.engine === 'string' ? body.session.engine : 'claude',
              conversationId: typeof body.session.conversationId === 'string' ? body.session.conversationId : null,
              updatedAt: Number(body.session.updatedAt) || Date.now(),
              messages: Array.isArray(body.session.messages) ? body.session.messages.slice(-100) : [],
            };
            const idx = s.sessions.findIndex((item) => item.id === cleanSession.id);
            if (idx >= 0) {
              s.sessions[idx] = { ...s.sessions[idx], ...cleanSession };
            } else {
              s.sessions.unshift(cleanSession);
            }
          }
          if (body.activeSessionId === null || typeof body.activeSessionId === 'string') {
            s.activeSessionId = body.activeSessionId;
          }
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, activeSessionId: store.activeSessionId }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === 'DELETE' && url.pathname === '/sessions') {
      const id = url.searchParams.get('id');
      const store = id
        ? await mutateSessionsStore((s) => {
            s.sessions = s.sessions.filter((item) => item.id !== id);
            if (s.activeSessionId === id) {
              s.activeSessionId = s.sessions[0]?.id || null;
            }
          })
        : await readSessionsStore();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(store));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/chat') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: `Invalid JSON body: ${err.message}` }));
        return;
      }

      const requestedEngineId = typeof body.engine === 'string' ? body.engine : '';
      const prompt = typeof body.prompt === 'string' ? body.prompt : '';
      const mode = typeof body.mode === 'string' ? body.mode : 'chat';
      const includePageContext = Boolean(body.includePageContext ?? true);
      const pageContext = body.pageContext && typeof body.pageContext === 'object' ? body.pageContext : null;
      const pageContexts = Array.isArray(body.pageContexts) ? body.pageContexts : null;
      const screenshotDataUrl = typeof body.screenshotDataUrl === 'string' ? body.screenshotDataUrl : null;
      const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
      const model = typeof body.model === 'string' ? body.model : '';
      const effort = typeof body.effort === 'string' ? body.effort : 'low';
      const rawWorkspacePath = typeof body.workspacePath === 'string' ? body.workspacePath : '';

      const validWorkspacePath = resolveValidWorkspacePath(rawWorkspacePath);
      const effectiveCwd = validWorkspacePath || DEFAULT_CWD_DIR;

      const engineInfo = getEngineInfo(requestedEngineId);
      const binToRun = engineInfo?.binPath;

      if (!engineInfo || !engineInfo.available || !binToRun || (requestedEngineId && engineInfo.id !== requestedEngineId)) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        sendSse(res, 'error', {
          message: `未检测到可用的 CLI 引擎 (${requestedEngineId || engineInfo?.cmd || 'agy/claude'})，请确认本机已安装对应命令行工具。`,
        });
        res.end();
        return;
      }

      let screenshotPath = null;
      if (screenshotDataUrl) {
        const match = screenshotDataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
        if (!match) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '无效的截图数据格式 (Invalid screenshotDataUrl)' }));
          return;
        }
        await cleanupOldScreenshots();
        const mimeSub = match[1].toLowerCase();
        const ext =
          mimeSub === 'jpeg' || mimeSub === 'jpg'
            ? 'jpg'
            : mimeSub === 'webp'
              ? 'webp'
              : mimeSub === 'gif'
                ? 'gif'
                : 'png';
        const fileName = `shot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        screenshotPath = path.join(SCREENSHOT_DIR, fileName);
        const buffer = Buffer.from(match[2], 'base64');
        await fs.writeFile(screenshotPath, buffer);
      } else if (mode === 'screenshot') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '截屏模式下缺少截图数据 (Missing screenshotDataUrl)' }));
        return;
      }

      const finalPrompt = buildFinalPrompt({
        prompt,
        mode,
        includePageContext,
        pageContext,
        pageContexts,
        screenshotPath,
        workspacePath: validWorkspacePath,
        engineName: engineInfo.fullName,
      });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });

      let activeChild = null;
      let activeTimeoutTimer = null;
      let aborted = false;
      const cleanupTempScreenshot = () => {
        if (screenshotPath) {
          const toDelete = screenshotPath;
          screenshotPath = null;
          fs.unlink(toDelete).catch(() => {});
        }
      };

      const startCliRun = (convIdToUse) => {
        let retryingFreshSession = false;
        const adapter = createCliAdapter({
          engine: engineInfo,
          finalPrompt,
          model,
          effort,
          conversationId: convIdToUse,
          screenshotPath,
          workspacePath: validWorkspacePath,
          res,
          onInvalidSession: () => {
            if (aborted || res.writableEnded) return;
            retryingFreshSession = true;
            sendSse(res, 'status', {
              stepType: '原会话已过期，正在自动开启新会话重试...',
              engine: engineInfo.id,
            });
            startCliRun(null);
          },
        });

        const child = spawn(binToRun, adapter.args, {
          cwd: effectiveCwd,
          env: {
            ...process.env,
            PATH: buildEnhancedPath(),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        activeChild = child;

        const localTimeoutTimer = setTimeout(() => {
          if (child.exitCode === null && !child.killed) {
            aborted = true;
            child.kill('SIGTERM');
            sendSse(res, 'error', {
              message: `${engineInfo.name} 执行超时 (300s)，已自动终止。`,
            });
            res.end();
          }
        }, 300_000);
        activeTimeoutTimer = localTimeoutTimer;

        let stdoutBuffer = '';
        let stderrText = '';

        child.stdout.on('data', (chunk) => {
          stdoutBuffer += chunk.toString('utf8');
          const lines = stdoutBuffer.split(/\r?\n/);
          stdoutBuffer = lines.pop() || '';
          for (const line of lines) {
            adapter.handleLine(line);
          }
        });

        child.stderr.on('data', (chunk) => {
          stderrText += chunk.toString('utf8');
        });

        child.on('error', (err) => {
          clearTimeout(localTimeoutTimer);
          if (retryingFreshSession || aborted) return;
          cleanupTempScreenshot();
          sendSse(res, 'error', {
            message: `无法启动 ${engineInfo.name} (${binToRun}): ${err.message}。请确认本机已安装 ${engineInfo.cmd} 命令。`,
          });
          res.end();
        });

        child.on('close', (code, signal) => {
          clearTimeout(localTimeoutTimer);
          if (stdoutBuffer.trim()) {
            adapter.handleLine(stdoutBuffer);
          }
          if (retryingFreshSession || aborted || res.writableEnded) {
            return;
          }
          // If resuming a conversation failed cleanly before streaming any delta, automatically retry once without conversationId
          if (
            signal === null &&
            code !== 0 &&
            convIdToUse &&
            !adapter.hasStreamedDelta() &&
            !adapter.isFinished()
          ) {
            retryingFreshSession = true;
            sendSse(res, 'status', {
              stepType: '续聊会话失效，已自动切换为新会话重试...',
              engine: engineInfo.id,
            });
            startCliRun(null);
            return;
          }
          cleanupTempScreenshot();
          if (code !== 0 && !adapter.isFinished()) {
            sendSse(res, 'error', {
              message:
                stderrText.trim() || `${engineInfo.name} 进程异常退出 (exit code ${code})`,
            });
          } else if (!adapter.isFinished()) {
            sendSse(res, 'done', {
              conversationId: adapter.getConversationId(),
              engine: engineInfo.id,
            });
          }
          res.end();
        });
      };

      startCliRun(conversationId);

      res.on('close', () => {
        if (!res.writableEnded) {
          aborted = true;
          if (activeTimeoutTimer) clearTimeout(activeTimeoutTimer);
          if (activeChild && !activeChild.killed && activeChild.exitCode === null) {
            activeChild.kill('SIGTERM');
          }
          cleanupTempScreenshot();
        }
      });

      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err?.message || 'Internal Server Error' }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

server.on('error', (err) => {
  console.error(`[cli-sidebar-bridge] Server error:`, err);
  if (err && err.code === 'EADDRINUSE') {
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  const availableList = detectedEngines
    .filter((e) => e.available)
    .map((e) => `${e.id}(${e.binPath})`)
    .join(', ');
  console.log(
    `[cli-sidebar-bridge] Listening on http://${HOST}:${PORT} | Detected CLIs: ${availableList || 'none'}`
  );
});
