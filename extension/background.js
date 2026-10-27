chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('Failed to set sidePanel behavior:', err));

  chrome.contextMenus.removeAll(() => {
    const ignoreMenuErr = () => {
      void chrome.runtime.lastError;
    };
    chrome.contextMenus.create(
      {
        id: 'agy-translate-selection',
        title: '🌐 用 AI CLI 翻译选中内容',
        contexts: ['selection'],
      },
      ignoreMenuErr
    );
    chrome.contextMenus.create(
      {
        id: 'agy-explain-selection',
        title: '💡 用 AI CLI 解释选中内容',
        contexts: ['selection'],
      },
      ignoreMenuErr
    );
    chrome.contextMenus.create(
      {
        id: 'agy-summarize-page',
        title: '📝 用 AI CLI 总结当前网页',
        contexts: ['page'],
      },
      ignoreMenuErr
    );
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  // Trigger sidePanel.open synchronously inside the user-gesture callback
  const openPromise = chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});

  let action;
  if (info.menuItemId === 'agy-translate-selection') {
    action = {
      type: 'QUICK_ACTION',
      mode: 'translate',
      selectionText: info.selectionText || '',
      windowId: tab.windowId,
      actionId: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
  } else if (info.menuItemId === 'agy-explain-selection') {
    action = {
      type: 'QUICK_ACTION',
      mode: 'chat',
      userPrompt: '请清晰解释我选中的这段内容：',
      selectionText: info.selectionText || '',
      windowId: tab.windowId,
      actionId: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
  } else {
    action = {
      type: 'QUICK_ACTION',
      mode: 'summarize',
      windowId: tab.windowId,
      actionId: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
  }

  await chrome.storage.local.set({ pendingAction: { ...action, timestamp: Date.now() } });
  await openPromise;
  chrome.runtime.sendMessage(action).catch(() => {});
});
