const BRIDGE_URL = 'http://127.0.0.1:18765';

const brandLogoEl = document.getElementById('brandLogo');
const brandNameEl = document.getElementById('brandName');
const bridgeStatusEl = document.getElementById('bridgeStatus');
const engineSegmentsEl = document.getElementById('engineSegments');
const engineSelectEl = document.getElementById('engineSelect');
const modelSelectEl = document.getElementById('modelSelect');
const quickMenuBtn = document.getElementById('quickMenuBtn');
const quickActionsMenuEl = document.getElementById('quickActionsMenu');
const refreshModelsBtn = document.getElementById('refreshModelsBtn');
const effortSelectEl = document.getElementById('effortSelect');
const historyBtn = document.getElementById('historyBtn');
const newChatBtn = document.getElementById('newChatBtn');
const sessionDrawerEl = document.getElementById('sessionDrawer');
const closeSessionDrawerBtn = document.getElementById('closeSessionDrawerBtn');
const sessionListEl = document.getElementById('sessionList');
const tabTitleEl = document.getElementById('tabTitle');
const tabUrlEl = document.getElementById('tabUrl');
const refreshTabBtn = document.getElementById('refreshTabBtn');
const includeContextCheckbox = document.getElementById('includeContextCheckbox');
const selectionBadgeEl = document.getElementById('selectionBadge');
const workspaceSelectEl = document.getElementById('workspaceSelect');
const translateBtnTextEl = document.getElementById('translateBtnText');
const btnSummarize = document.getElementById('btnSummarize');
const btnTranslate = document.getElementById('btnTranslate');
const btnAreaScreenshot = document.getElementById('btnAreaScreenshot');
const btnScreenshot = document.getElementById('btnScreenshot');
const chatContainerEl = document.getElementById('chatContainer');
const emptyStateEl = document.getElementById('emptyState');
const emptyIconEl = document.getElementById('emptyIcon');
const emptyTitleEl = document.getElementById('emptyTitle');
const promptInputEl = document.getElementById('promptInput');
const pastedImagePreviewBarEl = document.getElementById('pastedImagePreviewBar');
const pastedImageThumbEl = document.getElementById('pastedImageThumb');
const removePastedImageBtn = document.getElementById('removePastedImageBtn');
const convIndicatorEl = document.getElementById('convIndicator');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const openTabPickerBtn = document.getElementById('openTabPickerBtn');
const selectedTabsCountBadgeEl = document.getElementById('selectedTabsCountBadge');
const selectedTabChipsEl = document.getElementById('selectedTabChips');
const tabPickerPopoverEl = document.getElementById('tabPickerPopover');
const tabPickerListEl = document.getElementById('tabPickerList');
const tabSearchInputEl = document.getElementById('tabSearchInput');
const btnSelectActiveTab = document.getElementById('btnSelectActiveTab');
const btnClearAllTabs = document.getElementById('btnClearAllTabs');
const btnClosePicker = document.getElementById('btnClosePicker');
const updatePluginBtn = document.getElementById('updatePluginBtn');
const menuCheckUpdateBtn = document.getElementById('menuCheckUpdateBtn');
const menuCheckUpdateTextEl = document.getElementById('menuCheckUpdateText');

let currentEngine = 'agy';
let pastedScreenshotDataUrl = null;
let availableEngines = [
  { id: 'agy', name: 'AGY', fullName: 'Antigravity CLI (agy)', icon: '✦', available: true, supportsEffort: true },
  { id: 'claude', name: 'Claude Code', fullName: 'Claude Code CLI (claude)', icon: '✴', available: true, supportsEffort: true },
  { id: 'gemini', name: 'Gemini CLI', fullName: 'Gemini CLI (gemini)', icon: '♊', available: true, supportsEffort: false },
];
let bridgeOnline = false;
let bridgeReachable = false;
let lastEngineOptionsSignature = '';

let currentSessionId = `sess-${Date.now()}`;
let currentSessionTitle = '';
let currentSessionMessages = [];
let sessionsCache = [];
let currentConversationId = null;
let currentConversationIdsByEngine = {};
let currentAbortController = null;
let cachedPageContext = {
  id: null,
  tabId: null,
  title: '',
  url: '',
  favIconUrl: '',
  selection: '',
  content: '',
};
let contextSentInCurrentConv = false;

// Tab selection state: 'follow_active' | 'custom' | 'none'
let tabSelectionMode = 'follow_active';
let customSelectedTabIds = new Set();
let openTabsCache = [];
let lastSentTabsSignature = '';

function getCurrentEngineMeta() {
  return (
    availableEngines.find((e) => e.id === currentEngine) || {
      id: currentEngine,
      name: currentEngine.toUpperCase(),
      fullName: currentEngine,
      icon: '✦',
      available: true,
      supportsEffort: true,
    }
  );
}

function updateEngineBrandingUI() {
  const meta = getCurrentEngineMeta();
  if (brandLogoEl) brandLogoEl.textContent = meta.icon || '✦';
  if (brandNameEl) brandNameEl.textContent = `${meta.name} 侧边栏`;
  if (emptyIconEl) emptyIconEl.textContent = meta.icon || '✦';
  if (emptyTitleEl) emptyTitleEl.textContent = `本地 ${meta.name} 侧边栏`;

  if (effortSelectEl) {
    if (meta.supportsEffort === false) {
      effortSelectEl.classList.add('hidden');
    } else {
      effortSelectEl.classList.remove('hidden');
    }
  }

  if (bridgeReachable && meta.available) {
    bridgeStatusEl.textContent = '';
    bridgeStatusEl.className = 'status-dot online';
    bridgeStatusEl.title = `${meta.name} 在线 · 已连接本地 ${meta.fullName}${meta.binPath ? `\n路径: ${meta.binPath}` : ''}`;
  } else if (bridgeReachable && !meta.available) {
    bridgeStatusEl.textContent = '';
    bridgeStatusEl.className = 'status-dot offline';
    bridgeStatusEl.title = `本地 Bridge 服务在线，但未检测到 ${meta.name} CLI`;
  } else {
    bridgeStatusEl.textContent = '';
    bridgeStatusEl.className = 'status-dot offline';
    bridgeStatusEl.title = '本地桥接服务未启动';
  }
}

function renderEngineSegments() {
  const installedEngines = availableEngines.filter((e) => e.available);
  let visibleEngines;
  if (installedEngines.length > 0) {
    visibleEngines = [...installedEngines];
  } else if (bridgeReachable) {
    // Bridge is online, and agy is confirmed not installed -> never show AGY button, show Claude Code
    visibleEngines = availableEngines.filter((e) => e.id === 'claude' || e.id === 'gemini');
  } else {
    // Bridge offline -> show Claude Code & AGY so user can still click to switch
    visibleEngines = availableEngines.filter((e) => e.id === 'claude' || e.id === 'agy');
  }

  if (!visibleEngines.some((e) => e.id === currentEngine)) {
    const currentObj = availableEngines.find((e) => e.id === currentEngine);
    if (currentObj) visibleEngines.push(currentObj);
  }

  if (engineSelectEl) {
    const sig = visibleEngines
      .map((e) => `${e.id}:${e.available ? 1 : 0}:${e.binPath || ''}`)
      .join('|');
    if (sig !== lastEngineOptionsSignature) {
      lastEngineOptionsSignature = sig;
      engineSelectEl.innerHTML = '';
      for (const eng of visibleEngines) {
        const opt = document.createElement('option');
        opt.value = eng.id;
        opt.textContent = `${eng.icon || '✦'} ${eng.name}`;
        opt.title = eng.available
          ? `${eng.fullName}\n路径: ${eng.binPath || '已就绪'}`
          : eng.fullName;
        engineSelectEl.appendChild(opt);
      }
    }
    if (visibleEngines.some((e) => e.id === currentEngine)) {
      engineSelectEl.value = currentEngine;
    }
  }

  if (!engineSegmentsEl) return;
  engineSegmentsEl.innerHTML = '';

  for (const eng of visibleEngines) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `engine-pill${eng.id === currentEngine ? ' active' : ''}`;
    btn.textContent = `${eng.icon || '✦'} ${eng.name}`;
    btn.title = eng.available
      ? `切换到 ${eng.fullName}\n二进制路径: ${eng.binPath || '已就绪'}`
      : `切换到 ${eng.fullName}`;

    btn.addEventListener('click', () => {
      if (eng.id === currentEngine) return;
      switchEngine(eng.id, true);
    });

    engineSegmentsEl.appendChild(btn);
  }
}

if (engineSelectEl) {
  engineSelectEl.addEventListener('change', () => {
    const val = engineSelectEl.value;
    if (val && val !== currentEngine) {
      switchEngine(val, true);
    }
  });
}

async function switchEngine(newEngineId, resetConvIfChanged = true) {
  const prevEngine = currentEngine;
  if (prevEngine && currentConversationId) {
    currentConversationIdsByEngine[prevEngine] = currentConversationId;
  }
  currentEngine = newEngineId;
  await chrome.storage.local.set({ selectedEngine: currentEngine });

  if (resetConvIfChanged && prevEngine !== currentEngine) {
    // Reuse this engine's previous conversationId if we already have one in the current session
    currentConversationId = currentConversationIdsByEngine[currentEngine] || null;
    contextSentInCurrentConv = Boolean(currentConversationId);
    const meta = getCurrentEngineMeta();
    convIndicatorEl.textContent = currentConversationId
      ? `${meta.name} #${currentConversationId.slice(0, 6)}（已复用历史 resume）`
      : `已切至 ${meta.name}（新上下文）`;
  }

  renderEngineSegments();
  updateEngineBrandingUI();
  await loadModels(false);
}

async function checkBridgeHealth(forceRefreshCli = false, { skipModelReload = false } = {}) {
  try {
    const wasOffline = !bridgeReachable;
    const res = await fetch(`${BRIDGE_URL}/health${forceRefreshCli ? '?refresh=1' : ''}`);
    const data = await res.json();
    if (Array.isArray(data.engines) && data.engines.length > 0) {
      availableEngines = data.engines;
    }
    bridgeReachable = true;
    bridgeOnline = Boolean(data.ok);

    // Auto-select stored engine if available on this computer, otherwise auto-pick first installed CLI
    const { selectedEngine } = await chrome.storage.local.get('selectedEngine');
    const installedEngines = availableEngines.filter((e) => e.available);
    const savedInstalled = installedEngines.find((e) => e.id === selectedEngine);
    const currentInstalled = installedEngines.find((e) => e.id === currentEngine);
    const firstInstalled = installedEngines[0];

    let targetEngine = currentEngine;
    if (savedInstalled) {
      targetEngine = savedInstalled.id;
    } else if (currentInstalled) {
      targetEngine = currentInstalled.id;
    } else if (firstInstalled) {
      targetEngine = firstInstalled.id;
    } else if (selectedEngine && selectedEngine !== 'agy') {
      // Respect user's manual choice (e.g. 'claude') even if CLI wasn't in static PATH
      targetEngine = selectedEngine;
    } else {
      // No agy detected -> default to 'claude', never lock on 'agy'
      targetEngine = 'claude';
    }

    if (targetEngine !== currentEngine) {
      currentEngine = targetEngine;
      await chrome.storage.local.set({ selectedEngine: currentEngine });
      if (!skipModelReload) {
        await loadModels(false);
      }
    } else if (wasOffline && bridgeReachable && !skipModelReload) {
      await loadModels(false);
      loadWorkspaces();
    }

    renderEngineSegments();
    updateEngineBrandingUI();
    return bridgeReachable;
  } catch {
    bridgeReachable = false;
    bridgeOnline = false;
    renderEngineSegments();
    updateEngineBrandingUI();
    return false;
  }
}

function isExtractableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return (
    (url.startsWith('http://') || url.startsWith('https://')) &&
    !url.startsWith('https://chrome.google.com/webstore') &&
    !url.startsWith('https://chromewebstore.google.com')
  );
}

function extractDomInPage() {
  const selection = (window.getSelection()?.toString() || '').trim();

  const mainEl =
    document.querySelector('article, [role="main"], main, .p-workspace__primary_view_body, #content') ||
    document.body;

  const content = (mainEl ? mainEl.innerText : document.body?.innerText || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    title: document.title || '',
    url: location.href || '',
    selection,
    content: content.slice(0, 45000),
  };
}

async function refreshActiveTabContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return cachedPageContext;

    const prevTabId = cachedPageContext.tabId;
    cachedPageContext.id = tab.id;
    cachedPageContext.tabId = tab.id;
    cachedPageContext.title = tab.title || '未命名标签页';
    cachedPageContext.url = tab.url || '';
    cachedPageContext.favIconUrl = tab.favIconUrl || '';

    tabTitleEl.textContent = cachedPageContext.title;
    tabUrlEl.textContent = cachedPageContext.url;

    if (prevTabId && prevTabId !== tab.id && tabSelectionMode === 'follow_active') {
      contextSentInCurrentConv = false;
    }

    if (tab.id && isExtractableUrl(tab.url || '')) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractDomInPage,
      });
      const extracted = results?.[0]?.result;
      if (extracted) {
        cachedPageContext = {
          id: tab.id,
          tabId: tab.id,
          favIconUrl: tab.favIconUrl || '',
          ...extracted,
        };
      }
    } else {
      cachedPageContext.selection = '';
      cachedPageContext.content = '';
    }
  } catch {
    // Restricted page
  }

  await refreshOpenTabsList();
  updateSelectionUI();
  renderSelectedTabChips();
  return cachedPageContext;
}

async function refreshOpenTabsList() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    openTabsCache = tabs.filter(
      (t) => t.id && t.url && !t.url.startsWith('chrome-extension://')
    );
    const validIds = new Set(openTabsCache.map((t) => t.id));
    for (const id of [...customSelectedTabIds]) {
      if (!validIds.has(id)) {
        customSelectedTabIds.delete(id);
      }
    }
    if (tabSelectionMode === 'custom' && customSelectedTabIds.size === 0) {
      tabSelectionMode = 'none';
      includeContextCheckbox.checked = false;
    }
  } catch {
    // ignore
  }
}

function getEffectiveSelectedTabs() {
  if (tabSelectionMode === 'none' || !includeContextCheckbox.checked) {
    return [];
  }
  if (tabSelectionMode === 'follow_active') {
    const activeTab =
      openTabsCache.find((t) => t.id === cachedPageContext.tabId) ||
      (cachedPageContext.tabId ? cachedPageContext : null);
    return activeTab ? [activeTab] : [];
  }
  return openTabsCache.filter((t) => customSelectedTabIds.has(t.id));
}

function renderSelectedTabChips() {
  selectedTabChipsEl.innerHTML = '';
  const selectedTabs = getEffectiveSelectedTabs();

  if (selectedTabs.length === 0) {
    selectedTabsCountBadgeEl.textContent = '0';
    const emptyChip = document.createElement('div');
    emptyChip.className = 'tab-chip muted-chip';
    emptyChip.innerHTML = `<span class="tab-chip-title">不带网页上下文</span>`;
    selectedTabChipsEl.appendChild(emptyChip);
    return;
  }

  selectedTabsCountBadgeEl.textContent =
    tabSelectionMode === 'follow_active' ? '当前页' : `${selectedTabs.length}`;

  for (const tab of selectedTabs) {
    const chip = document.createElement('div');
    chip.className = 'tab-chip';
    chip.title = `${tab.title || ''}\n${tab.url || ''}`;

    if (tab.favIconUrl && /^https?:\/\//.test(tab.favIconUrl)) {
      const img = document.createElement('img');
      img.src = tab.favIconUrl;
      img.className = 'tab-chip-favicon';
      chip.appendChild(img);
    }

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-chip-title';
    const prefix = tabSelectionMode === 'follow_active' ? '当前: ' : '';
    titleSpan.textContent = `${prefix}${tab.title || '未命名'}`;
    chip.appendChild(titleSpan);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tab-chip-remove';
    removeBtn.textContent = '×';
    removeBtn.title = '移除此标签页上下文';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tabSelectionMode === 'follow_active') {
        tabSelectionMode = 'none';
        includeContextCheckbox.checked = false;
      } else {
        customSelectedTabIds.delete(tab.id);
        if (customSelectedTabIds.size === 0) {
          tabSelectionMode = 'none';
          includeContextCheckbox.checked = false;
        }
      }
      renderSelectedTabChips();
      if (!tabPickerPopoverEl.classList.contains('hidden')) {
        renderTabPickerList();
      }
    });
    chip.appendChild(removeBtn);

    selectedTabChipsEl.appendChild(chip);
  }
}

function renderTabPickerList() {
  tabPickerListEl.innerHTML = '';
  const query = (tabSearchInputEl.value || '').trim().toLowerCase();
  const effectiveIds = new Set(getEffectiveSelectedTabs().map((t) => t.id));

  const filtered = openTabsCache.filter((t) => {
    if (!query) return true;
    return (
      (t.title || '').toLowerCase().includes(query) ||
      (t.url || '').toLowerCase().includes(query)
    );
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '12px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--text-muted)';
    empty.style.fontSize = '12px';
    empty.textContent = '未找到匹配的浏览器标签页';
    tabPickerListEl.appendChild(empty);
    return;
  }

  for (const tab of filtered) {
    const isChecked = effectiveIds.has(tab.id);
    const item = document.createElement('div');
    item.className = `tab-picker-item${isChecked ? ' selected' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isChecked;
    checkbox.style.pointerEvents = 'none';
    item.appendChild(checkbox);

    if (tab.favIconUrl && /^https?:\/\//.test(tab.favIconUrl)) {
      const icon = document.createElement('img');
      icon.src = tab.favIconUrl;
      icon.className = 'tab-picker-favicon';
      item.appendChild(icon);
    } else {
      const fallbackIcon = document.createElement('span');
      fallbackIcon.textContent = '🌐';
      fallbackIcon.style.fontSize = '13px';
      item.appendChild(fallbackIcon);
    }

    const info = document.createElement('div');
    info.className = 'tab-picker-info';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'tab-picker-item-title';
    titleDiv.textContent = tab.title || '未命名标签页';

    const urlDiv = document.createElement('div');
    urlDiv.className = 'tab-picker-item-url';
    try {
      urlDiv.textContent = new URL(tab.url).host || tab.url;
    } catch {
      urlDiv.textContent = tab.url || '';
    }

    info.appendChild(titleDiv);
    info.appendChild(urlDiv);
    item.appendChild(info);

    if (tab.active) {
      const activePill = document.createElement('span');
      activePill.className = 'tab-active-pill';
      activePill.textContent = '当前页';
      item.appendChild(activePill);
    }

    item.addEventListener('click', () => {
      if (tabSelectionMode === 'follow_active') {
        customSelectedTabIds = new Set(effectiveIds);
      } else if (tabSelectionMode === 'none') {
        customSelectedTabIds = new Set();
      }
      tabSelectionMode = 'custom';

      if (customSelectedTabIds.has(tab.id)) {
        customSelectedTabIds.delete(tab.id);
      } else {
        customSelectedTabIds.add(tab.id);
      }

      if (customSelectedTabIds.size === 0) {
        tabSelectionMode = 'none';
        includeContextCheckbox.checked = false;
      } else {
        includeContextCheckbox.checked = true;
      }

      contextSentInCurrentConv = false;
      renderSelectedTabChips();
      renderTabPickerList();
    });

    tabPickerListEl.appendChild(item);
  }
}

async function extractContextsForSelectedTabs(overrideSelection = null) {
  const selectedTabs = getEffectiveSelectedTabs();
  const contexts = [];

  for (const tab of selectedTabs) {
    if (!tab.id) continue;
    const isActive = tab.id === cachedPageContext.tabId;
    if (isActive && cachedPageContext.content) {
      contexts.push({
        tabId: tab.id,
        title: cachedPageContext.title || tab.title || '',
        url: cachedPageContext.url || tab.url || '',
        selection: overrideSelection || cachedPageContext.selection || '',
        content: cachedPageContext.content || '',
        isActive: true,
      });
      continue;
    }

    if (isExtractableUrl(tab.url || '')) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractDomInPage,
        });
        const extracted = results?.[0]?.result;
        if (extracted) {
          contexts.push({
            tabId: tab.id,
            ...extracted,
            selection: (isActive && overrideSelection) || extracted.selection || '',
            isActive,
          });
          continue;
        }
      } catch {
        // Fallback to title + url
      }
    }

    contexts.push({
      tabId: tab.id,
      title: tab.title || '',
      url: tab.url || '',
      selection: isActive && overrideSelection ? overrideSelection : '',
      content: '',
      isActive,
    });
  }

  if (contexts.length === 0 && overrideSelection) {
    contexts.push({
      tabId: cachedPageContext.tabId || null,
      title: cachedPageContext.title || '',
      url: cachedPageContext.url || '',
      selection: overrideSelection,
      content: '',
      isActive: true,
    });
  }

  return contexts;
}

function updateSelectionUI() {
  const hasSelection = Boolean(cachedPageContext.selection && cachedPageContext.selection.trim());
  if (hasSelection) {
    const len = cachedPageContext.selection.trim().length;
    selectionBadgeEl.textContent = `已选中 ${len} 字`;
    selectionBadgeEl.classList.remove('hidden');
    translateBtnTextEl.textContent = '翻译选中';
  } else {
    selectionBadgeEl.classList.add('hidden');
    translateBtnTextEl.textContent = '翻译';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInlineMarkdown(raw) {
  if (!raw) return '';
  const PH_OPEN = '\uE000';
  const PH_CLOSE = '\uE001';
  const inlinePlaceholders = [];
  const pushInlinePlaceholder = (htmlSnippet) => {
    const idx = inlinePlaceholders.length;
    inlinePlaceholders.push(htmlSnippet);
    return `${PH_OPEN}${idx}${PH_CLOSE}`;
  };
  const expandPlaceholdersOnce = (str) =>
    str.replace(/\uE000(\d+)\uE001/g, (_, idxStr) => inlinePlaceholders[Number(idxStr)] || '');

  // Strip private-use placeholder delimiters from untrusted input upfront so placeholders can never be forged
  let text = String(raw).replace(/[\uE000-\uE003]/g, '');

  // 1. Extract inline code spans first from raw text so their contents are never parsed as markdown/HTML
  text = text.replace(/`([^`\n]+)`/g, (_, codeStr) =>
    pushInlinePlaceholder(`<code>${escapeHtml(codeStr)}</code>`)
  );

  // 2. Escape HTML on the remaining text
  text = escapeHtml(text);

  // 3. Allow safe line-break tags (<br>, <br/>, <br />) commonly emitted inside Markdown tables
  text = text.replace(/&lt;br\s*\/?&gt;/gi, '<br/>');

  // 4. Helper for Bold + Italic (***text***), Bold (**text**), Strikethrough (~~text~~), Italic (*text*)
  const applyFormatting = (str) =>
    str
      .replace(/\*\*\*([^*\n]+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/~~([^\n]+?)~~/g, '<del>$1</del>')
      .replace(/(^|[^*A-Za-z0-9])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*A-Za-z0-9])/g, '$1<em>$2</em>');

  // 5. Parse Markdown links [label](https://...) safely
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (full, label, rawUrl) => {
    if (/[\uE000-\uE003]/.test(rawUrl)) {
      return full;
    }
    const cleanUrl = rawUrl
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
    if (!/^(https?:\/\/|mailto:)/i.test(cleanUrl)) {
      return full;
    }
    const safeHref = escapeHtml(cleanUrl);
    // Expand any inline-code placeholders inside label in-place so only a single final pass is needed
    const formattedLabel = expandPlaceholdersOnce(applyFormatting(label));
    return pushInlinePlaceholder(
      `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${formattedLabel}</a>`
    );
  });

  // 6. Apply inline formatting outside inline code & link hrefs
  text = applyFormatting(text);

  // 7. Single-pass placeholder restoration (prevents nested placeholder injection across hrefs)
  return expandPlaceholdersOnce(text);
}

function splitMarkdownTableRow(rowLine) {
  let trimmed = String(rowLine || '').trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1);

  const cells = [];
  let current = '';
  let inCode = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '`' && (i === 0 || trimmed[i - 1] !== '\\')) {
      inCode = !inCode;
      current += ch;
    } else if (ch === '|' && !inCode && (i === 0 || trimmed[i - 1] !== '\\')) {
      cells.push(current.trim().replace(/\\\|/g, '|'));
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim().replace(/\\\|/g, '|'));
  return cells;
}

function isMarkdownTableDelimiter(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  const cells = splitMarkdownTableRow(trimmed);
  if (cells.length < 1) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));
}

function renderMarkdown(md) {
  if (!md) return '';
  const CODE_PH_OPEN = '\uE002';
  const CODE_PH_CLOSE = '\uE003';
  let source = String(md).replace(/\r\n/g, '\n').replace(/[\uE000-\uE003]/g, '');

  const codePlaceholders = [];
  const pushCodeBlock = (_, lang, code) => {
    const cleanLang = escapeHtml((lang || 'code').trim());
    const rawTrimmedCode = String(code || '').replace(/^\n+|\n+$/g, '');
    const encoded = encodeURIComponent(rawTrimmedCode);
    const escapedCode = escapeHtml(rawTrimmedCode);
    const idx = codePlaceholders.length;
    codePlaceholders.push(
      `<div class="code-block-wrap"><div class="code-block-header"><span>${cleanLang}</span><button type="button" class="code-copy-btn" data-code="${encoded}">复制代码</button></div><pre><code>${escapedCode}</code></pre></div>`
    );
    return `\n${CODE_PH_OPEN}${idx}${CODE_PH_CLOSE}\n`;
  };

  source = source.replace(
    /(?:^|\n)```([a-zA-Z0-9_-]*)[^\n]*\n((?:[\s\S]*?\n)?)[ \t]*```(?=[ \t]*(?:\n|$))/g,
    pushCodeBlock
  );
  // Also handle an unclosed streaming code fence at the end of the text
  source = source.replace(/(?:^|\n)```([a-zA-Z0-9_-]*)[^\n]*\n([\s\S]*)$/, pushCodeBlock);

  const lines = source.split('\n');
  const outBlocks = [];
  let i = 0;

  const isHorizontalRule = (line) => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
  const isHeading = (line) => /^\s*#{1,6}\s+\S.*$/.test(line);
  const isCodePlaceholder = (line) => /^\uE002\d+\uE003$/.test(line.trim());
  const isBlockquote = (line) => /^\s*>\s?.*$/.test(line);
  const matchListItem = (line) => line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Code block placeholder
    const codeMatch = trimmed.match(/^\uE002(\d+)\uE003$/);
    if (codeMatch) {
      outBlocks.push(codePlaceholders[Number(codeMatch[1])] || '');
      i++;
      continue;
    }

    // 2. Horizontal rule (---, ***, ___)
    if (isHorizontalRule(line)) {
      outBlocks.push('<hr class="md-hr"/>');
      i++;
      continue;
    }

    // 3. Headings (# ~ ######)
    const headingMatch = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length);
      outBlocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // 4. GFM Table
    if (line.includes('|') && i + 1 < lines.length && isMarkdownTableDelimiter(lines[i + 1])) {
      const headerCells = splitMarkdownTableRow(line);
      const delimCells = splitMarkdownTableRow(lines[i + 1]);
      const aligns = delimCells.map((c) => {
        const t = c.trim();
        if (t.startsWith(':') && t.endsWith(':')) return 'center';
        if (t.endsWith(':')) return 'right';
        return 'left';
      });
      i += 2;
      const bodyRows = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        lines[i].includes('|') &&
        !isHorizontalRule(lines[i]) &&
        !isHeading(lines[i]) &&
        !isCodePlaceholder(lines[i])
      ) {
        bodyRows.push(splitMarkdownTableRow(lines[i]));
        i++;
      }

      const colCount = Math.max(headerCells.length, aligns.length);
      const theadHtml =
        '<thead><tr>' +
        Array.from({ length: colCount }, (_, colIdx) => {
          const align = aligns[colIdx] || 'left';
          const cellText = headerCells[colIdx] ?? '';
          return `<th style="text-align:${align}">${renderInlineMarkdown(cellText)}</th>`;
        }).join('') +
        '</tr></thead>';

      const tbodyHtml =
        bodyRows.length > 0
          ? '<tbody>' +
            bodyRows
              .map(
                (row) =>
                  '<tr>' +
                  Array.from({ length: colCount }, (_, colIdx) => {
                    const align = aligns[colIdx] || 'left';
                    const cellText = row[colIdx] ?? '';
                    return `<td style="text-align:${align}">${renderInlineMarkdown(cellText)}</td>`;
                  }).join('') +
                  '</tr>'
              )
              .join('') +
            '</tbody>'
          : '';

      outBlocks.push(`<div class="md-table-wrap"><table class="md-table">${theadHtml}${tbodyHtml}</table></div>`);
      continue;
    }

    // 5. Blockquote (> ...)
    if (isBlockquote(line)) {
      const quoteLines = [];
      while (i < lines.length && isBlockquote(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      outBlocks.push(
        `<blockquote class="md-blockquote">${quoteLines.map((l) => renderInlineMarkdown(l)).join('<br/>')}</blockquote>`
      );
      continue;
    }

    // 6. Ordered & Unordered Lists (with multi-level nesting & start attribute support)
    if (matchListItem(line)) {
      const items = [];
      while (i < lines.length) {
        const m = matchListItem(lines[i]);
        if (m) {
          const rawIndent = m[1].replace(/\t/g, '  ').length;
          const marker = m[2];
          const isOrdered = /^\d+\.$/.test(marker);
          const type = isOrdered ? 'ol' : 'ul';
          const startNum = isOrdered ? parseInt(marker, 10) : 1;
          items.push({
            indent: rawIndent,
            type,
            startNum,
            html: renderInlineMarkdown(m[3]),
          });
          i++;
        } else if (
          !lines[i].trim() &&
          i + 1 < lines.length &&
          matchListItem(lines[i + 1])
        ) {
          // Skip single blank line between list items
          i++;
        } else {
          break;
        }
      }

      if (items.length > 0) {
        let listHtml = '';
        const stack = [];
        const openListTag = (type, level, startNum) => {
          const startAttr = type === 'ol' && Number.isFinite(startNum) && startNum > 1 ? ` start="${startNum}"` : '';
          return `<${type} class="md-list level-${level}"${startAttr}>`;
        };
        for (const item of items) {
          if (stack.length === 0) {
            stack.push({ type: item.type, indent: item.indent });
            listHtml += `${openListTag(item.type, 0, item.startNum)}<li>${item.html}`;
          } else if (item.indent > stack[stack.length - 1].indent + 1 && stack.length < 4) {
            stack.push({ type: item.type, indent: item.indent });
            listHtml += `${openListTag(item.type, stack.length - 1, item.startNum)}<li>${item.html}`;
          } else {
            listHtml += '</li>';
            while (stack.length > 1 && item.indent < stack[stack.length - 1].indent) {
              const popped = stack.pop();
              listHtml += `</${popped.type}></li>`;
            }
            const top = stack[stack.length - 1];
            if (top.type !== item.type) {
              listHtml += `</${top.type}>${openListTag(item.type, stack.length - 1, item.startNum)}`;
              top.type = item.type;
            }
            if (item.indent <= top.indent + 1) {
              top.indent = item.indent;
            }
            listHtml += `<li>${item.html}`;
          }
        }
        listHtml += '</li>';
        while (stack.length > 0) {
          const popped = stack.pop();
          listHtml += `</${popped.type}>`;
          if (stack.length > 0) {
            listHtml += '</li>';
          }
        }
        outBlocks.push(listHtml);
      }
      continue;
    }

    // 7. Regular paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isCodePlaceholder(lines[i]) &&
      !isHorizontalRule(lines[i]) &&
      !isHeading(lines[i]) &&
      !isBlockquote(lines[i]) &&
      !matchListItem(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isMarkdownTableDelimiter(lines[i + 1]))
    ) {
      paraLines.push(renderInlineMarkdown(lines[i].trim()));
      i++;
    }
    if (paraLines.length > 0) {
      outBlocks.push(`<p>${paraLines.join('<br/>')}</p>`);
    }
  }

  return outBlocks.filter(Boolean).join('\n');
}

function appendMessage(role, label, initialText = '', screenshotDataUrl = null, meta = {}) {
  if (emptyStateEl) {
    emptyStateEl.classList.add('hidden');
  }

  const msgEl = document.createElement('div');
  msgEl.className = `msg ${role}`;

  const headerEl = document.createElement('div');
  headerEl.className = 'msg-header';

  const roleSpan = document.createElement('span');
  roleSpan.textContent = label;
  headerEl.appendChild(roleSpan);

  let rawContent = initialText;
  const snapshotSourceUrl = meta.sourceUrl || cachedPageContext.url || '';
  const snapshotTitle = meta.sessionTitle || currentSessionTitle || cachedPageContext.title || 'AI-笔记';

  if (role === 'ai') {
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'msg-header-actions';

    const saveNoteBtn = document.createElement('button');
    saveNoteBtn.className = 'copy-btn';
    saveNoteBtn.textContent = '💾 存笔记';
    saveNoteBtn.title = '保存为本地 Markdown 笔记 (~/.agy-sidebar-bridge/notes)';
    saveNoteBtn.addEventListener('click', async () => {
      if (!rawContent.trim()) return;
      saveNoteBtn.disabled = true;
      saveNoteBtn.textContent = '保存中…';
      try {
        const res = await fetch(`${BRIDGE_URL}/save-note`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: snapshotTitle,
            content: rawContent,
            sourceUrl: snapshotSourceUrl,
          }),
        });
        const data = await res.json();
        if (data?.ok) {
          saveNoteBtn.textContent = '已存 ✓';
          saveNoteBtn.title = `已保存至: ${data.filePath}`;
          setTimeout(() => (saveNoteBtn.textContent = '💾 存笔记'), 2000);
        } else {
          saveNoteBtn.textContent = '失败';
          setTimeout(() => (saveNoteBtn.textContent = '💾 存笔记'), 1500);
        }
      } catch {
        saveNoteBtn.textContent = '失败';
        setTimeout(() => (saveNoteBtn.textContent = '💾 存笔记'), 1500);
      } finally {
        saveNoteBtn.disabled = false;
      }
    });

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard
        ?.writeText(rawContent)
        .then(() => {
          copyBtn.textContent = '已复制 ✓';
          setTimeout(() => (copyBtn.textContent = '复制'), 1500);
        })
        .catch(() => {
          copyBtn.textContent = '失败';
          setTimeout(() => (copyBtn.textContent = '复制'), 1500);
        });
    });

    actionsWrap.appendChild(saveNoteBtn);
    actionsWrap.appendChild(copyBtn);
    headerEl.appendChild(actionsWrap);
  }

  const statusEl = document.createElement('div');
  statusEl.className = 'status-line hidden';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'msg-body';
  bodyEl.innerHTML =
    role === 'ai' ? renderMarkdown(initialText) : `<p>${escapeHtml(initialText).replace(/\n/g, '<br/>')}</p>`;

  msgEl.appendChild(headerEl);
  msgEl.appendChild(statusEl);
  msgEl.appendChild(bodyEl);

  if (screenshotDataUrl) {
    const img = document.createElement('img');
    img.src = screenshotDataUrl;
    img.className = 'msg-screenshot-preview';
    msgEl.appendChild(img);
  }

  chatContainerEl.appendChild(msgEl);
  chatContainerEl.scrollTop = chatContainerEl.scrollHeight;

  let rafRenderId = null;
  const isNearBottom = () =>
    chatContainerEl.scrollHeight - chatContainerEl.scrollTop - chatContainerEl.clientHeight < 90;

  return {
    getRawContent() {
      return rawContent;
    },
    setStatus(text) {
      if (text) {
        statusEl.textContent = text;
        statusEl.classList.remove('hidden');
      } else {
        statusEl.classList.add('hidden');
      }
    },
    appendDelta(delta) {
      const shouldStick = isNearBottom();
      rawContent += delta;
      if (!rafRenderId) {
        rafRenderId = requestAnimationFrame(() => {
          rafRenderId = null;
          bodyEl.innerHTML = renderMarkdown(rawContent);
          if (shouldStick || isNearBottom()) {
            chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
          }
        });
      }
    },
    setError(errText) {
      if (rafRenderId) {
        cancelAnimationFrame(rafRenderId);
        rafRenderId = null;
      }
      rawContent = `⚠️ ${errText}`;
      bodyEl.innerHTML = `<p style="color: var(--danger);">${escapeHtml(rawContent)}</p>`;
      chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
    },
  };
}

function formatRelativeTime(ts) {
  if (!ts) return '';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
}

async function saveCurrentSession() {
  if (currentSessionMessages.length === 0) return;
  if (currentConversationId) {
    currentConversationIdsByEngine[currentEngine] = currentConversationId;
  }
  const sessionObj = {
    id: currentSessionId,
    engine: currentEngine,
    conversationId: currentConversationId,
    conversationIdsByEngine: { ...currentConversationIdsByEngine },
    title: currentSessionTitle || currentSessionMessages[0]?.text?.slice(0, 48) || '未命名会话',
    updatedAt: Date.now(),
    model: modelSelectEl.value || '',
    effort: effortSelectEl.value || 'low',
    messages: currentSessionMessages,
  };

  const existingIdx = sessionsCache.findIndex((s) => s.id === currentSessionId);
  if (existingIdx >= 0) {
    sessionsCache[existingIdx] = sessionObj;
  } else {
    sessionsCache.unshift(sessionObj);
  }
  updateHistoryBtnBadge();

  try {
    await fetch(`${BRIDGE_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: sessionObj,
        activeSessionId: currentSessionId,
      }),
    });
  } catch {
    // ignore offline save error
  }
}

function updateHistoryBtnBadge() {
  const count = sessionsCache.length;
  historyBtn.textContent = count > 0 ? `🕘 历史 (${count})` : '🕘 历史';
}

function renderSessionMessagesToDOM(session) {
  chatContainerEl.innerHTML = '';
  const msgs = Array.isArray(session?.messages) ? session.messages : [];
  if (msgs.length === 0) {
    if (emptyStateEl) {
      emptyStateEl.classList.remove('hidden');
      chatContainerEl.appendChild(emptyStateEl);
    }
    convIndicatorEl.textContent = '新会话（点击切换历史）';
    return;
  }

  for (const m of msgs) {
    appendMessage(m.role, m.label, m.text || '', null, {
      sourceUrl: m.sourceUrl || '',
      sessionTitle: m.sessionTitle || session?.title || '',
    });
  }

  if (session.conversationId) {
    convIndicatorEl.textContent = `会话 #${session.conversationId.slice(0, 6)}（可连续追问 · 点击切换）`;
  } else {
    convIndicatorEl.textContent = '已恢复历史会话（点击切换）';
  }
}

async function switchToSession(sessionId) {
  const target = sessionsCache.find((s) => s.id === sessionId);
  if (!target) return;

  if (currentAbortController) {
    currentAbortController.abort();
  }
  setPastedScreenshot(null);

  currentSessionId = target.id;
  currentSessionTitle = target.title || '';
  currentSessionMessages = Array.isArray(target.messages) ? [...target.messages] : [];
  currentConversationIdsByEngine = { ...(target.conversationIdsByEngine || {}) };
  if (target.conversationId && target.engine) {
    currentConversationIdsByEngine[target.engine] =
      currentConversationIdsByEngine[target.engine] || target.conversationId;
  }

  // Switch engine if the session was recorded with a specific available engine
  if (target.engine) {
    const targetEngInfo = availableEngines.find((e) => e.id === target.engine && e.available);
    if (targetEngInfo && targetEngInfo.id !== currentEngine) {
      await switchEngine(targetEngInfo.id, false);
    }
  }

  currentConversationId = currentConversationIdsByEngine[currentEngine] || null;
  contextSentInCurrentConv = Boolean(currentConversationId);

  renderSessionMessagesToDOM(target);
  sessionDrawerEl.classList.add('hidden');

  try {
    await fetch(`${BRIDGE_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeSessionId: currentSessionId }),
    });
  } catch {
    // ignore
  }
}

async function deleteSessionById(sessionId) {
  sessionsCache = sessionsCache.filter((s) => s.id !== sessionId);
  updateHistoryBtnBadge();

  try {
    await fetch(`${BRIDGE_URL}/sessions?id=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  } catch {
    // ignore
  }

  if (currentSessionId === sessionId) {
    if (sessionsCache.length > 0) {
      await switchToSession(sessionsCache[0].id);
    } else {
      startNewSession(false);
    }
  }
  renderSessionListDrawer();
}

function renderSessionListDrawer() {
  sessionListEl.innerHTML = '';
  if (sessionsCache.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '16px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--text-muted)';
    empty.style.fontSize = '12px';
    empty.textContent = '暂无历史会话记录';
    sessionListEl.appendChild(empty);
    return;
  }

  for (const s of sessionsCache) {
    const item = document.createElement('div');
    item.className = `session-item${s.id === currentSessionId ? ' active' : ''}`;

    const main = document.createElement('div');
    main.className = 'session-item-main';

    const title = document.createElement('div');
    title.className = 'session-item-title';
    title.textContent = s.title || '未命名会话';

    const meta = document.createElement('div');
    meta.className = 'session-item-meta';
    const msgCount = Array.isArray(s.messages) ? Math.ceil(s.messages.length / 2) : 0;
    const engBadge = (s.engine || 'agy').toUpperCase();
    const convShort = s.conversationId ? `#${s.conversationId.slice(0, 6)}` : '本地记录';
    meta.textContent = `${formatRelativeTime(s.updatedAt)} · ${engBadge} · ${msgCount} 轮 · ${convShort}`;

    main.appendChild(title);
    main.appendChild(meta);
    item.appendChild(main);

    const delBtn = document.createElement('button');
    delBtn.className = 'session-delete-btn';
    delBtn.textContent = '🗑️';
    delBtn.title = '删除此会话';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSessionById(s.id);
    });
    item.appendChild(delBtn);

    item.addEventListener('click', () => {
      switchToSession(s.id);
    });

    sessionListEl.appendChild(item);
  }
}

async function loadSessionsOnStartup() {
  try {
    const res = await fetch(`${BRIDGE_URL}/sessions`);
    const data = await res.json();
    sessionsCache = Array.isArray(data?.sessions) ? data.sessions : [];
    updateHistoryBtnBadge();

    if (sessionsCache.length > 0) {
      const active =
        sessionsCache.find((s) => s.id === data.activeSessionId) || sessionsCache[0];
      if (active) {
        currentSessionId = active.id;
        currentSessionTitle = active.title || '';
        currentConversationIdsByEngine = { ...(active.conversationIdsByEngine || {}) };
        const sessionEngine = active.engine || 'agy';
        if (active.conversationId) {
          currentConversationIdsByEngine[sessionEngine] =
            currentConversationIdsByEngine[sessionEngine] || active.conversationId;
        }
        if (active.engine) {
          const targetEngInfo = availableEngines.find((e) => e.id === active.engine && e.available);
          if (targetEngInfo && targetEngInfo.id !== currentEngine) {
            await switchEngine(targetEngInfo.id, false);
          }
        }
        currentConversationId = currentConversationIdsByEngine[currentEngine] || null;
        currentSessionMessages = Array.isArray(active.messages) ? [...active.messages] : [];
        contextSentInCurrentConv = Boolean(currentConversationId);
        renderSessionMessagesToDOM(active);
      }
    }
  } catch {
    // ignore if bridge offline on startup
  }
}

function startNewSession(syncActiveToBridge = true) {
  if (currentAbortController) {
    currentAbortController.abort();
  }
  setPastedScreenshot(null);
  currentSessionId = `sess-${Date.now()}`;
  currentSessionTitle = '';
  currentSessionMessages = [];
  currentConversationId = null;
  currentConversationIdsByEngine = {};
  contextSentInCurrentConv = false;
  convIndicatorEl.textContent = '新会话（点击切换历史）';
  chatContainerEl.innerHTML = '';
  if (emptyStateEl) {
    emptyStateEl.classList.remove('hidden');
    chatContainerEl.appendChild(emptyStateEl);
  }
  if (syncActiveToBridge) {
    fetch(`${BRIDGE_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeSessionId: null }),
    }).catch(() => {});
  }
}

function setGeneratingState(isGenerating) {
  sendBtn.disabled = isGenerating;
  btnSummarize.disabled = isGenerating;
  btnTranslate.disabled = isGenerating;
  btnScreenshot.disabled = isGenerating;
  if (btnAreaScreenshot) btnAreaScreenshot.disabled = isGenerating;
  if (isGenerating) {
    stopBtn.classList.remove('hidden');
  } else {
    stopBtn.classList.add('hidden');
  }
}

function setPastedScreenshot(dataUrl) {
  pastedScreenshotDataUrl = dataUrl || null;
  if (!pastedImagePreviewBarEl || !pastedImageThumbEl) return;
  if (pastedScreenshotDataUrl) {
    pastedImageThumbEl.src = pastedScreenshotDataUrl;
    pastedImagePreviewBarEl.classList.remove('hidden');
  } else {
    pastedImageThumbEl.src = '';
    pastedImagePreviewBarEl.classList.add('hidden');
  }
}

async function runAgyTask({ mode = 'chat', userPrompt = '', screenshotDataUrl = null, overrideSelection = null }) {
  if (currentAbortController) {
    currentAbortController.abort();
  }

  const reachable = await checkBridgeHealth();
  if (!reachable) {
    appendMessage(
      'ai',
      '系统提示',
      '本地 Bridge 服务未响应 (`http://127.0.0.1:18765`)。请在项目目录下运行 `./install-service.sh` 启动服务。'
    );
    return;
  }
  if (!bridgeOnline) {
    appendMessage(
      'ai',
      '系统提示',
      '本地 Bridge 服务已连接，但未检测到已安装的 AI CLI 工具（`claude` / `agy` / `gemini` / `codex`）。请先在终端安装对应 CLI 工具。'
    );
    return;
  }

  await refreshActiveTabContext();
  if (overrideSelection) {
    cachedPageContext.selection = overrideSelection;
    updateSelectionUI();
  }

  const selectedTabsList = getEffectiveSelectedTabs();
  const currentTabsSignature = selectedTabsList.map((t) => `${t.id}:${t.url}`).join('|');
  if (currentTabsSignature !== lastSentTabsSignature) {
    contextSentInCurrentConv = false;
  }

  let displayUserTitle = userPrompt;
  if (mode === 'summarize') {
    if (selectedTabsList.length > 1) {
      displayUserTitle = userPrompt
        ? `📝 汇总 ${selectedTabsList.length} 个标签页：${userPrompt}`
        : `📝 汇总总结已选的 ${selectedTabsList.length} 个标签页`;
    } else {
      const targetTitle = selectedTabsList[0]?.title || cachedPageContext.title;
      displayUserTitle = userPrompt ? `📝 总结此页：${userPrompt}` : `📝 总结当前网页：《${targetTitle}》`;
    }
  } else if (mode === 'translate') {
    const hasSel = Boolean(cachedPageContext.selection?.trim());
    displayUserTitle = hasSel
      ? `🌐 翻译选中文本（${cachedPageContext.selection.trim().slice(0, 60)}...）`
      : `🌐 翻译网页：《${selectedTabsList[0]?.title || cachedPageContext.title}》`;
  } else if (mode === 'screenshot') {
    displayUserTitle = userPrompt ? `📸 截屏分析：${userPrompt}` : '📸 截屏识别与中文翻译';
  }

  const requestEngine = currentEngine;
  const requestConversationId = currentConversationIdsByEngine[requestEngine] || currentConversationId;
  const engMeta = getCurrentEngineMeta();
  const selectedModel = modelSelectEl.value || '';
  const selectedModelLabel =
    modelSelectEl.options[modelSelectEl.selectedIndex]?.textContent || selectedModel || '默认模型';
  const aiLabel = `${engMeta.icon} ${engMeta.name} · ${selectedModel || 'Default'}`;

  if (!currentSessionTitle) {
    currentSessionTitle = displayUserTitle.slice(0, 50);
  }

  const msgMeta = {
    sourceUrl: cachedPageContext.url || '',
    sessionTitle: currentSessionTitle,
  };

  appendMessage('user', '你', displayUserTitle, screenshotDataUrl, msgMeta);
  currentSessionMessages.push({
    role: 'user',
    label: '你',
    text: displayUserTitle,
    sourceUrl: msgMeta.sourceUrl,
    sessionTitle: msgMeta.sessionTitle,
    time: Date.now(),
  });

  const aiMsg = appendMessage('ai', aiLabel, '', null, msgMeta);
  const aiMsgIndex = currentSessionMessages.length;
  currentSessionMessages.push({
    role: 'ai',
    label: aiLabel,
    text: '',
    sourceUrl: msgMeta.sourceUrl,
    sessionTitle: msgMeta.sessionTitle,
    time: Date.now(),
  });
  await saveCurrentSession();

  aiMsg.setStatus(`正在通过 ${engMeta.name} (${selectedModelLabel}) 思考中...`);

  const shouldIncludeContext =
    Boolean(overrideSelection) ||
    (selectedTabsList.length > 0 &&
      (mode === 'summarize' || mode === 'translate' || !contextSentInCurrentConv || Boolean(cachedPageContext.selection)));

  const extractedContexts = shouldIncludeContext
    ? await extractContextsForSelectedTabs(overrideSelection)
    : [];

  const myAbortController = new AbortController();
  currentAbortController = myAbortController;
  setGeneratingState(true);

  try {
    const response = await fetch(`${BRIDGE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: requestEngine,
        prompt: userPrompt,
        mode,
        includePageContext: shouldIncludeContext,
        pageContext: extractedContexts[0] || null,
        pageContexts: extractedContexts,
        screenshotDataUrl,
        conversationId: requestConversationId,
        model: selectedModel,
        effort: effortSelectEl.value || 'low',
        workspacePath: workspaceSelectEl?.value || '',
      }),
      signal: myAbortController.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (shouldIncludeContext) {
      contextSentInCurrentConv = true;
      lastSentTabsSignature = currentTabsSignature;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const rawEvt of events) {
        const lines = rawEvt.split('\n');
        let evtType = 'message';
        let dataStr = '';
        for (const line of lines) {
          if (line.startsWith('event:')) {
            evtType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataStr += line.slice(5).trim();
          }
        }
        if (!dataStr) continue;

        let payload;
        try {
          payload = JSON.parse(dataStr);
        } catch {
          continue;
        }

        if (payload.conversationId) {
          currentConversationIdsByEngine[requestEngine] = payload.conversationId;
          if (currentEngine === requestEngine) {
            currentConversationId = payload.conversationId;
            convIndicatorEl.textContent = `${engMeta.name} #${currentConversationId.slice(0, 6)}（可连续追问 · 点击切换）`;
          }
        }

        if (evtType === 'delta' && payload.text) {
          aiMsg.setStatus('');
          aiMsg.appendDelta(payload.text);
          if (currentSessionMessages[aiMsgIndex]) {
            currentSessionMessages[aiMsgIndex].text = aiMsg.getRawContent();
          }
        } else if (evtType === 'status') {
          aiMsg.setStatus(`正在执行工具: ${payload.stepType}...`);
        } else if (evtType === 'error') {
          aiMsg.setStatus('');
          aiMsg.setError(payload.message || '未知错误');
          if (currentSessionMessages[aiMsgIndex]) {
            currentSessionMessages[aiMsgIndex].text = aiMsg.getRawContent();
          }
        } else if (evtType === 'done') {
          aiMsg.setStatus('');
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      aiMsg.setStatus('⏹ 已手动停止生成');
    } else {
      aiMsg.setStatus('');
      aiMsg.setError(`请求失败: ${err.message}`);
      if (currentSessionMessages[aiMsgIndex]) {
        currentSessionMessages[aiMsgIndex].text = aiMsg.getRawContent();
      }
    }
  } finally {
    if (currentAbortController === myAbortController) {
      setGeneratingState(false);
      currentAbortController = null;
    }
    await saveCurrentSession();
  }
}

function closeQuickActionsMenu() {
  if (quickActionsMenuEl) quickActionsMenuEl.classList.add('hidden');
  if (quickMenuBtn) quickMenuBtn.classList.remove('active');
}

if (quickMenuBtn && quickActionsMenuEl) {
  quickMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = quickActionsMenuEl.classList.contains('hidden');
    if (isHidden) {
      tabPickerPopoverEl.classList.add('hidden');
      quickActionsMenuEl.classList.remove('hidden');
      quickMenuBtn.classList.add('active');
    } else {
      closeQuickActionsMenu();
    }
  });
}

btnSummarize.addEventListener('click', () => {
  closeQuickActionsMenu();
  const extra = promptInputEl.value.trim();
  promptInputEl.value = '';
  runAgyTask({ mode: 'summarize', userPrompt: extra });
});

btnTranslate.addEventListener('click', () => {
  closeQuickActionsMenu();
  const extra = promptInputEl.value.trim();
  promptInputEl.value = '';
  runAgyTask({ mode: 'translate', userPrompt: extra });
});

btnScreenshot.addEventListener('click', async () => {
  closeQuickActionsMenu();
  try {
    const extra = promptInputEl.value.trim();
    promptInputEl.value = '';
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    await runAgyTask({ mode: 'screenshot', userPrompt: extra, screenshotDataUrl: dataUrl });
  } catch (err) {
    appendMessage('ai', '系统提示', `无法截取当前页面：${err.message}`);
  }
});

if (btnAreaScreenshot) {
  btnAreaScreenshot.addEventListener('click', async () => {
    closeQuickActionsMenu();
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id || !isExtractableUrl(activeTab.url || '')) {
        appendMessage('ai', '系统提示', '当前页面不支持框选截屏（请切换到普通 http/https 网页）。');
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          return new Promise((resolve) => {
            const existing = document.getElementById('__agy_area_crop_overlay__');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = '__agy_area_crop_overlay__';
            overlay.style.cssText =
              'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(15,23,42,0.28);user-select:none;';

            const hint = document.createElement('div');
            hint.textContent = '✂️ 按住鼠标左键拖拽框选截屏区域 · 按 Esc 取消';
            hint.style.cssText =
              'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#0f172a;color:#f8fafc;padding:6px 14px;border-radius:999px;font:600 12.5px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.25);pointer-events:none;';
            overlay.appendChild(hint);

            const box = document.createElement('div');
            box.style.cssText =
              'position:fixed;border:2px solid #6366f1;background:rgba(99,102,241,0.12);border-radius:4px;display:none;pointer-events:none;';
            overlay.appendChild(box);

            let startX = 0;
            let startY = 0;
            let dragging = false;

            const cleanup = (rect) => {
              window.removeEventListener('keydown', onKeyDown, true);
              window.removeEventListener('blur', onBlur, false);
              document.removeEventListener('visibilitychange', onVisibilityChange, true);
              overlay.remove();
              resolve(rect);
            };

            const onKeyDown = (e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cleanup(null);
              }
            };
            const onBlur = (e) => {
              if (e.target === window) cleanup(null);
            };
            const onVisibilityChange = () => {
              if (document.hidden) cleanup(null);
            };
            window.addEventListener('keydown', onKeyDown, true);
            window.addEventListener('blur', onBlur, false);
            document.addEventListener('visibilitychange', onVisibilityChange, true);

            overlay.addEventListener('mousedown', (e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              dragging = true;
              startX = e.clientX;
              startY = e.clientY;
              box.style.display = 'block';
              box.style.left = `${startX}px`;
              box.style.top = `${startY}px`;
              box.style.width = '0px';
              box.style.height = '0px';
            });

            overlay.addEventListener('mousemove', (e) => {
              if (!dragging) return;
              const x = Math.min(startX, e.clientX);
              const y = Math.min(startY, e.clientY);
              const w = Math.abs(e.clientX - startX);
              const h = Math.abs(e.clientY - startY);
              box.style.left = `${x}px`;
              box.style.top = `${y}px`;
              box.style.width = `${w}px`;
              box.style.height = `${h}px`;
            });

            overlay.addEventListener('mouseup', (e) => {
              if (!dragging) return;
              dragging = false;
              const x = Math.min(startX, e.clientX);
              const y = Math.min(startY, e.clientY);
              const width = Math.abs(e.clientX - startX);
              const height = Math.abs(e.clientY - startY);
              if (width < 12 || height < 12) {
                cleanup(null);
                return;
              }
              cleanup({
                x,
                y,
                width,
                height,
                dpr: window.devicePixelRatio || 1,
              });
            });

            document.documentElement.appendChild(overlay);
          });
        },
      });

      const rect = results?.[0]?.result;
      if (!rect) return;

      // Wait a brief frame so the overlay is completely gone before capturing
      await new Promise((r) => setTimeout(r, 60));
      const fullDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

      const croppedDataUrl = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const dpr = rect.dpr || 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(rect.width * dpr));
          canvas.height = Math.max(1, Math.round(rect.height * dpr));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(
            img,
            Math.round(rect.x * dpr),
            Math.round(rect.y * dpr),
            Math.round(rect.width * dpr),
            Math.round(rect.height * dpr),
            0,
            0,
            canvas.width,
            canvas.height
          );
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = fullDataUrl;
      });

      const extra = promptInputEl.value.trim();
      promptInputEl.value = '';
      await runAgyTask({
        mode: 'screenshot',
        userPrompt: extra || '请识别并详细分析我框选区域的截图内容（若是外文请翻译成中文，若是代码/报错请给出排查建议）。',
        screenshotDataUrl: croppedDataUrl,
      });
    } catch (err) {
      appendMessage('ai', '系统提示', `框选截屏失败：${err.message}`);
    }
  });
}

promptInputEl.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) {
        appendMessage('ai', '系统提示', '粘贴的图片超过 15MB 限制，请裁剪或压缩后再粘贴。');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPastedScreenshot(reader.result);
        }
      };
      reader.readAsDataURL(file);
      break;
    }
  }
});

if (removePastedImageBtn) {
  removePastedImageBtn.addEventListener('click', () => {
    setPastedScreenshot(null);
  });
}

document.querySelectorAll('.slash-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    closeQuickActionsMenu();
    const promptTemplate = btn.getAttribute('data-slash') || btn.getAttribute('data-prompt') || '';
    if (!promptTemplate) return;
    const existing = promptInputEl.value.trim();
    promptInputEl.value = existing ? `${promptTemplate}\n${existing}` : promptTemplate;
    promptInputEl.focus();
  });
});

chatContainerEl.addEventListener('click', async (e) => {
  const copyBtn = e.target.closest('.code-copy-btn');
  if (!copyBtn) return;
  const wrap = copyBtn.closest('.code-block-wrap');
  const codeEl = wrap?.querySelector('code');
  const encodedCode = copyBtn.getAttribute('data-code');
  let rawCode = '';
  if (encodedCode) {
    try {
      rawCode = decodeURIComponent(encodedCode);
    } catch {
      rawCode = codeEl?.textContent || '';
    }
  } else {
    rawCode = codeEl?.textContent || '';
  }
  if (!rawCode && !codeEl) return;
  try {
    await navigator.clipboard.writeText(rawCode);
    const orig = copyBtn.textContent;
    copyBtn.textContent = '已复制 ✓';
    setTimeout(() => {
      copyBtn.textContent = orig;
    }, 1500);
  } catch {
    copyBtn.textContent = '失败';
  }
});

sendBtn.addEventListener('click', () => {
  const text = promptInputEl.value.trim();
  const attachedImg = pastedScreenshotDataUrl;
  if (!text && !attachedImg) return;
  promptInputEl.value = '';
  setPastedScreenshot(null);
  if (attachedImg) {
    runAgyTask({
      mode: 'screenshot',
      userPrompt: text || '请结合我粘贴的这张图片进行分析解答。',
      screenshotDataUrl: attachedImg,
    });
  } else {
    runAgyTask({ mode: 'chat', userPrompt: text });
  }
});

promptInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendBtn.click();
  }
});

stopBtn.addEventListener('click', () => {
  if (currentAbortController) {
    currentAbortController.abort();
  }
});

newChatBtn.addEventListener('click', () => {
  startNewSession(true);
});

function toggleSessionDrawer(e) {
  if (e) e.stopPropagation();
  const isHidden = sessionDrawerEl.classList.contains('hidden');
  if (isHidden) {
    renderSessionListDrawer();
    sessionDrawerEl.classList.remove('hidden');
  } else {
    sessionDrawerEl.classList.add('hidden');
  }
}

historyBtn.addEventListener('click', toggleSessionDrawer);
convIndicatorEl.addEventListener('click', toggleSessionDrawer);

closeSessionDrawerBtn.addEventListener('click', () => {
  sessionDrawerEl.classList.add('hidden');
});

refreshTabBtn.addEventListener('click', () => {
  refreshActiveTabContext();
});

includeContextCheckbox.addEventListener('change', () => {
  if (includeContextCheckbox.checked) {
    if (tabSelectionMode === 'none') {
      tabSelectionMode = 'follow_active';
    }
  } else {
    tabSelectionMode = 'none';
  }
  contextSentInCurrentConv = false;
  renderSelectedTabChips();
  if (!tabPickerPopoverEl.classList.contains('hidden')) {
    renderTabPickerList();
  }
});

openTabPickerBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  closeQuickActionsMenu();
  const isHidden = tabPickerPopoverEl.classList.contains('hidden');
  if (isHidden) {
    await refreshOpenTabsList();
    renderTabPickerList();
    tabPickerPopoverEl.classList.remove('hidden');
    tabSearchInputEl.focus();
  } else {
    tabPickerPopoverEl.classList.add('hidden');
  }
});

btnSelectActiveTab.addEventListener('click', () => {
  tabSelectionMode = 'follow_active';
  customSelectedTabIds.clear();
  includeContextCheckbox.checked = true;
  contextSentInCurrentConv = false;
  renderSelectedTabChips();
  renderTabPickerList();
});

btnClearAllTabs.addEventListener('click', () => {
  tabSelectionMode = 'none';
  customSelectedTabIds.clear();
  includeContextCheckbox.checked = false;
  contextSentInCurrentConv = false;
  renderSelectedTabChips();
  renderTabPickerList();
});

btnClosePicker.addEventListener('click', () => {
  tabPickerPopoverEl.classList.add('hidden');
});

tabSearchInputEl.addEventListener('input', () => {
  renderTabPickerList();
});

document.addEventListener('click', (e) => {
  if (
    quickActionsMenuEl &&
    !quickActionsMenuEl.classList.contains('hidden') &&
    !quickActionsMenuEl.contains(e.target) &&
    (!quickMenuBtn || !quickMenuBtn.contains(e.target))
  ) {
    closeQuickActionsMenu();
  }
  if (
    !tabPickerPopoverEl.classList.contains('hidden') &&
    !tabPickerPopoverEl.contains(e.target) &&
    !openTabPickerBtn.contains(e.target)
  ) {
    tabPickerPopoverEl.classList.add('hidden');
  }
  if (
    !sessionDrawerEl.classList.contains('hidden') &&
    !sessionDrawerEl.contains(e.target) &&
    !historyBtn.contains(e.target) &&
    !convIndicatorEl.contains(e.target)
  ) {
    sessionDrawerEl.classList.add('hidden');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (quickActionsMenuEl && !quickActionsMenuEl.classList.contains('hidden')) {
      closeQuickActionsMenu();
    }
    if (!tabPickerPopoverEl.classList.contains('hidden')) {
      tabPickerPopoverEl.classList.add('hidden');
    }
    if (!sessionDrawerEl.classList.contains('hidden')) {
      sessionDrawerEl.classList.add('hidden');
    }
  }
});

chrome.tabs.onActivated.addListener(() => {
  refreshActiveTabContext();
});

let tabUpdateDebounceTimer = null;
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ((changeInfo.status === 'complete' || changeInfo.title) && (tab?.active || tabId === cachedPageContext.tabId)) {
    if (tabUpdateDebounceTimer) clearTimeout(tabUpdateDebounceTimer);
    tabUpdateDebounceTimer = setTimeout(() => {
      tabUpdateDebounceTimer = null;
      refreshActiveTabContext();
    }, 350);
  }
});

chrome.tabs.onRemoved.addListener(() => {
  refreshActiveTabContext();
});

let currentWindowId = null;
const windowIdReadyPromise = chrome.windows
  .getCurrent()
  .then((win) => {
    currentWindowId = win?.id || null;
    return currentWindowId;
  })
  .catch(() => null);
let handledActionId = null;

async function executeQuickActionOnce(action) {
  if (!action) return;
  if (currentWindowId === null) {
    await windowIdReadyPromise;
  }
  if (action.windowId && currentWindowId && action.windowId !== currentWindowId) {
    return;
  }
  if (action.actionId && action.actionId === handledActionId) {
    return;
  }
  if (action.actionId) {
    handledActionId = action.actionId;
  }
  await chrome.storage.local.remove('pendingAction');
  runAgyTask({
    mode: action.mode || 'chat',
    userPrompt: action.userPrompt || '',
    overrideSelection: action.selectionText || null,
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'QUICK_ACTION') {
    executeQuickActionOnce(msg);
  }
});

async function checkPendingActionOnOpen() {
  const { pendingAction } = await chrome.storage.local.get('pendingAction');
  if (pendingAction && Date.now() - pendingAction.timestamp < 20000) {
    await executeQuickActionOnce(pendingAction);
  }
}

async function loadWorkspaces() {
  if (!workspaceSelectEl) return;
  try {
    const { selectedWorkspacePath = '' } = await chrome.storage.local.get('selectedWorkspacePath');
    const res = await fetch(`${BRIDGE_URL}/workspaces`);
    if (!res.ok) return;
    const data = await res.json();
    const list = Array.isArray(data?.workspaces) ? data.workspaces : [];
    workspaceSelectEl.innerHTML = '<option value="">📂 不关联代码库</option>';
    for (const ws of list) {
      const opt = document.createElement('option');
      opt.value = ws.path;
      opt.textContent = `📂 ${ws.name}`;
      opt.title = ws.path;
      workspaceSelectEl.appendChild(opt);
    }
    if (selectedWorkspacePath && [...workspaceSelectEl.options].some((o) => o.value === selectedWorkspacePath)) {
      workspaceSelectEl.value = selectedWorkspacePath;
    }
  } catch {
    // ignore if offline
  }
}

if (workspaceSelectEl) {
  workspaceSelectEl.addEventListener('change', () => {
    chrome.storage.local.set({ selectedWorkspacePath: workspaceSelectEl.value || '' });
  });
}

let loadModelsSeq = 0;

async function loadModels(forceRefresh = false) {
  const mySeq = ++loadModelsSeq;
  const targetEngine = currentEngine;
  try {
    if (forceRefresh) {
      refreshModelsBtn.disabled = true;
      refreshModelsBtn.textContent = '…';
      await checkBridgeHealth(true, { skipModelReload: true });
    }
    const { selectedModelsByEngine = {}, selectedModel, selectedEffort } =
      await chrome.storage.local.get([
        'selectedModelsByEngine',
        'selectedModel',
        'selectedEffort',
      ]);
    if (mySeq !== loadModelsSeq || currentEngine !== targetEngine) return;
    if (selectedEffort) {
      effortSelectEl.value = selectedEffort;
    }

    const res = await fetch(
      `${BRIDGE_URL}/models?engine=${encodeURIComponent(targetEngine)}${forceRefresh ? '&refresh=1' : ''}`
    );
    const data = await res.json();
    if (mySeq !== loadModelsSeq || currentEngine !== targetEngine) return;
    const models = Array.isArray(data?.models) ? data.models : [];

    if (models.length > 0) {
      const savedForEngine =
        selectedModelsByEngine[targetEngine] !== undefined
          ? selectedModelsByEngine[targetEngine]
          : targetEngine === 'agy'
            ? selectedModel
            : undefined;

      modelSelectEl.innerHTML = '';

      const groups = new Map();
      for (const m of models) {
        const g = m.group || '模型';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(m);
      }

      for (const [groupName, items] of groups.entries()) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        for (const item of items) {
          const opt = document.createElement('option');
          opt.value = item.id;
          opt.textContent = item.label;
          optgroup.appendChild(opt);
        }
        modelSelectEl.appendChild(optgroup);
      }

      const defaultPreferredByEngine = {
        agy: 'gemini-3.8-flash-low',
        claude: 'sonnet',
        gemini: 'gemini-2.5-flash',
        codex: 'o4-mini',
      };

      if (savedForEngine !== undefined && [...modelSelectEl.options].some((o) => o.value === savedForEngine)) {
        modelSelectEl.value = savedForEngine;
      } else {
        const pref = defaultPreferredByEngine[currentEngine] || '';
        if ([...modelSelectEl.options].some((o) => o.value === pref)) {
          modelSelectEl.value = pref;
        } else {
          modelSelectEl.selectedIndex = 0;
        }
      }
    }
  } catch {
    // ignore if offline
  } finally {
    if (forceRefresh) {
      refreshModelsBtn.disabled = false;
      refreshModelsBtn.textContent = '↻';
    }
  }
}

modelSelectEl.addEventListener('change', async () => {
  const val = modelSelectEl.value;
  const { selectedModelsByEngine = {} } = await chrome.storage.local.get('selectedModelsByEngine');
  selectedModelsByEngine[currentEngine] = val;
  chrome.storage.local.set({ selectedModelsByEngine, selectedModel: val });

  if (val.endsWith('-low')) {
    effortSelectEl.value = 'low';
    chrome.storage.local.set({ selectedEffort: 'low' });
  } else if (val.endsWith('-medium')) {
    effortSelectEl.value = 'medium';
    chrome.storage.local.set({ selectedEffort: 'medium' });
  } else if (val.endsWith('-high')) {
    effortSelectEl.value = 'high';
    chrome.storage.local.set({ selectedEffort: 'high' });
  }
});

effortSelectEl.addEventListener('change', () => {
  chrome.storage.local.set({ selectedEffort: effortSelectEl.value });
});

refreshModelsBtn.addEventListener('click', () => {
  loadModels(true);
});

let pluginUpdateRunning = false;

async function waitForBridgeRestart(previousPid = null, maxWaitMs = 12000) {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, 600));
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${BRIDGE_URL}/health`, { cache: 'no-store' });
      if (res.ok) {
        const info = await res.json().catch(() => null);
        if (!previousPid || !info?.pid || info.pid !== previousPid) {
          return true;
        }
      }
    } catch {
      // bridge is restarting
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function checkPluginUpdate(force = false) {
  if (pluginUpdateRunning) return null;
  try {
    const res = await fetch(`${BRIDGE_URL}/update-check${force ? '?force=1' : ''}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (pluginUpdateRunning) return data;

    if (data?.ok && data.hasUpdate) {
      if (updatePluginBtn) {
        updatePluginBtn.classList.remove('hidden');
        updatePluginBtn.textContent = `🚀 更新 (${data.remoteSha})`;
        updatePluginBtn.title = data.versionUnknown
          ? `未检测到本地版本记录，远端最新版本为 ${data.remoteSha}\n点击一键拉取同步并重载插件`
          : `发现 GitHub 新版本 (${data.localSha} → ${data.remoteSha})\n点击一键自动拉取更新并重载插件`;
      }
      if (menuCheckUpdateTextEl) {
        menuCheckUpdateTextEl.textContent = `一键更新到新版本 (${data.remoteSha})`;
      }
    } else if (data?.ok) {
      if (updatePluginBtn) {
        updatePluginBtn.classList.add('hidden');
      }
      if (menuCheckUpdateTextEl) {
        menuCheckUpdateTextEl.textContent = data.localSha
          ? `检查更新 (当前 ${data.localSha})`
          : '检查并更新插件';
      }
    }
    return data;
  } catch {
    return null;
  }
}

async function applyPluginUpdate() {
  if (pluginUpdateRunning) return;
  pluginUpdateRunning = true;

  if (quickActionsMenuEl) quickActionsMenuEl.classList.add('hidden');
  if (updatePluginBtn) {
    updatePluginBtn.disabled = true;
    updatePluginBtn.textContent = '⏳ 更新中...';
  }
  if (menuCheckUpdateBtn) {
    menuCheckUpdateBtn.disabled = true;
  }
  if (menuCheckUpdateTextEl) {
    menuCheckUpdateTextEl.textContent = '正在拉取更新...';
  }

  const updateMsg = appendMessage(
    'ai',
    '系统更新',
    '🔄 正在从 GitHub 拉取最新版本并同步插件与后台服务，请稍候...'
  );

  try {
    let previousPid = null;
    try {
      const hRes = await fetch(`${BRIDGE_URL}/health`, { cache: 'no-store' });
      if (hRes.ok) {
        const hData = await hRes.json();
        previousPid = hData?.pid || null;
      }
    } catch {}

    const res = await fetch(`${BRIDGE_URL}/update-apply`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || '更新失败');
    }
    const sourceSyncHint =
      data.sourceDirSynced === false
        ? '\n\n💡 提示：检测到你本地源码仓库含未提交改动或分支偏移，因此未自动覆盖你的开发目录。若你的 Chrome 扩展是从开发目录加载的，请执行 `git pull` 或改为从 `~/.agy-sidebar-bridge/extension` 加载。'
        : '';

    if (data.willRestart === false) {
      pluginUpdateRunning = false;
      if (updatePluginBtn) {
        updatePluginBtn.disabled = false;
        updatePluginBtn.classList.add('hidden');
      }
      if (menuCheckUpdateBtn) {
        menuCheckUpdateBtn.disabled = false;
      }
      if (menuCheckUpdateTextEl) {
        menuCheckUpdateTextEl.textContent = `已同步 (${data.updatedSha || 'latest'})`;
      }
      updateMsg.appendDelta(
        `\n\n✅ 已同步最新版本 (\`${data.updatedSha || 'latest'}\`)。由于当前后台服务未通过 \`launchd\` 托管，请先在终端重新运行 \`~/.agy-sidebar-bridge/repo/install.sh\` 重启后台服务，然后再重新打开侧边栏。${sourceSyncHint}`
      );
      return;
    }

    updateMsg.setStatus('正在等待本地 Bridge 服务重启...');
    const restarted = await waitForBridgeRestart(previousPid, 12000);
    if (!restarted) {
      throw new Error(
        '代码已更新，但等待本地 Bridge 服务重启超时。请在终端运行 ~/.agy-sidebar-bridge/repo/install.sh 重启服务。'
      );
    }
    updateMsg.setStatus('');
    updateMsg.appendDelta(
      `\n\n✅ 已更新至最新版本 (\`${data.updatedSha || 'latest'}\`)，正在自动重载侧边栏...${sourceSyncHint}`
    );
    setTimeout(() => {
      chrome.runtime.reload();
    }, 400);
  } catch (err) {
    pluginUpdateRunning = false;
    if (updatePluginBtn) {
      updatePluginBtn.disabled = false;
      updatePluginBtn.textContent = '🚀 重试更新';
    }
    if (menuCheckUpdateBtn) {
      menuCheckUpdateBtn.disabled = false;
    }
    if (menuCheckUpdateTextEl) {
      menuCheckUpdateTextEl.textContent = '重试检查并更新插件';
    }
    updateMsg.setStatus('');
    updateMsg.setError(`自动更新失败：${err.message || String(err)}`);
  }
}

if (updatePluginBtn) {
  updatePluginBtn.addEventListener('click', () => {
    applyPluginUpdate();
  });
}

if (menuCheckUpdateBtn) {
  menuCheckUpdateBtn.addEventListener('click', async () => {
    if (quickActionsMenuEl) quickActionsMenuEl.classList.add('hidden');
    if (pluginUpdateRunning) return;
    const info = await checkPluginUpdate(true);
    if (info?.hasUpdate) {
      await applyPluginUpdate();
    } else if (info?.ok) {
      appendMessage(
        'ai',
        '系统更新',
        `✅ 当前已是最新版本 (\`${info.localSha || 'latest'}\`)，无需更新。`
      );
    } else {
      const errMsg = appendMessage('ai', '系统更新', '');
      errMsg.setError(
        info?.error
          ? `检查更新失败：${info.error}`
          : '无法连接 GitHub 检查更新，请检查网络或本地 Bridge 服务状态。'
      );
    }
  });
}

// Init sequence
(async () => {
  try {
    const win = await chrome.windows.getCurrent();
    currentWindowId = win?.id || null;
  } catch {
    // ignore
  }
  renderEngineSegments();
  await checkBridgeHealth(false);
  await Promise.all([
    loadModels(false),
    loadWorkspaces(),
    loadSessionsOnStartup(),
    refreshActiveTabContext(),
  ]);
  setInterval(() => checkBridgeHealth(false), 10000);
  setTimeout(() => checkPluginUpdate(false), 2500);
  setInterval(() => checkPluginUpdate(false), 15 * 60 * 1000);
  checkPendingActionOnOpen();
})();
