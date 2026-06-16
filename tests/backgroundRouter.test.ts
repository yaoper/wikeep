import { beforeEach, describe, expect, it, vi } from 'vitest';

const conversationRepo = vi.hoisted(() => ({
  clearAllData: vi.fn(),
  deleteConversation: vi.fn(),
  exportAllData: vi.fn(),
  getConversationDetail: vi.fn(),
  getConversationMessages: vi.fn(),
  importAllData: vi.fn(),
  listConversations: vi.fn(),
  lookupConversationBySourceSessionId: vi.fn(),
  pruneLegacyConversationData: vi.fn(),
  upsertCapturedSession: vi.fn()
}));

const settingsRepo = vi.hoisted(() => ({
  ensureSettings: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn()
}));

const pageRepo = vi.hoisted(() => ({
  deleteWikiPage: vi.fn(),
  getWikiPage: vi.fn(),
  getWikiPageByUrl: vi.fn(),
  listWikiPages: vi.fn(),
  lookupWikiPageByUrl: vi.fn(),
  markWikiPageStale: vi.fn(),
  touchWikiPage: vi.fn(),
  upsertWikiPage: vi.fn()
}));

vi.mock('../src/storage/conversationRepository', () => conversationRepo);
vi.mock('../src/storage/settingsRepository', () => settingsRepo);
vi.mock('../src/storage/pageRepository', () => pageRepo);
vi.mock('../src/api/deepwikiApi', () => ({
  buildCapturePayloadFromDeepWikiSession: vi.fn(),
  extractQueryIdFromUrl: vi.fn(() => null),
  fetchDeepWikiSession: vi.fn()
}));

type RuntimeListener = (
  request: { command: string; payload?: unknown },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => boolean;

const settings = {
  autoCaptureEnabled: true,
  preferredPanel: 'sidePanel' as const,
  hasSeenPrivacyNotice: true,
  autoRefreshWikiPages: false,
  schemaVersion: 1
};

const backup = {
  version: 1,
  exportedAt: 123,
  conversations: [],
  messages: [],
  pages: []
};

const wikiSnapshot = {
  url: 'https://deepwiki.com/facebook/react',
  owner: 'facebook',
  repo: 'react',
  title: 'React',
  markdown: '# React\n\nSaved content.',
  contentHash: 'hash-1',
  wordCount: 3,
  capturedAt: 123
};

function installChromeStub() {
  (globalThis as any).chrome = {
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setTitle: vi.fn().mockResolvedValue(undefined)
    },
    runtime: {
      lastError: undefined,
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() }
    },
    sidePanel: {
      open: vi.fn().mockResolvedValue(undefined),
      setPanelBehavior: vi.fn().mockResolvedValue(undefined)
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn(),
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() }
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: { addListener: vi.fn() }
    }
  };
}

async function loadRuntimeListener(): Promise<RuntimeListener> {
  vi.resetModules();
  installChromeStub();
  await import('../src/background/index');

  const listener = (globalThis as any).chrome.runtime.onMessage.addListener.mock
    .calls.at(-1)?.[0] as RuntimeListener | undefined;

  if (!listener) {
    throw new Error('background did not register a runtime message listener');
  }

  return listener;
}

async function dispatch(command: string, payload?: unknown) {
  const listener = await loadRuntimeListener();

  return new Promise<any>((resolve) => {
    const keepAlive = listener({ command, payload }, {} as any, resolve);
    expect(keepAlive).toBe(true);
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  conversationRepo.clearAllData.mockResolvedValue(undefined);
  conversationRepo.deleteConversation.mockResolvedValue(undefined);
  conversationRepo.exportAllData.mockResolvedValue(backup);
  conversationRepo.getConversationDetail.mockResolvedValue(null);
  conversationRepo.getConversationMessages.mockResolvedValue([]);
  conversationRepo.importAllData.mockResolvedValue({
    conversationCount: 0,
    messageCount: 0
  });
  conversationRepo.listConversations.mockResolvedValue([]);
  conversationRepo.lookupConversationBySourceSessionId.mockResolvedValue(null);
  conversationRepo.pruneLegacyConversationData.mockResolvedValue(undefined);
  conversationRepo.upsertCapturedSession.mockResolvedValue({
    conversationId: 'c1',
    messageCount: 1
  });

  settingsRepo.ensureSettings.mockResolvedValue(undefined);
  settingsRepo.getSettings.mockResolvedValue(settings);
  settingsRepo.updateSettings.mockResolvedValue(settings);

  pageRepo.deleteWikiPage.mockResolvedValue(undefined);
  pageRepo.getWikiPage.mockResolvedValue(null);
  pageRepo.getWikiPageByUrl.mockResolvedValue(null);
  pageRepo.listWikiPages.mockResolvedValue([]);
  pageRepo.lookupWikiPageByUrl.mockResolvedValue({ exists: false });
  pageRepo.markWikiPageStale.mockResolvedValue(undefined);
  pageRepo.touchWikiPage.mockResolvedValue(undefined);
  pageRepo.upsertWikiPage.mockResolvedValue({
    pageId: 'p1',
    changed: true,
    created: true
  });
});

describe('background runtime router', () => {
  it('routes LIST_CONVERSATIONS to the conversation repository with keyword', async () => {
    const response = await dispatch('LIST_CONVERSATIONS', { keyword: 'auth' });

    expect(response).toEqual({ ok: true, data: [] });
    expect(conversationRepo.listConversations).toHaveBeenCalledWith('auth');
  });

  it('routes SAVE_WIKI_PAGE snapshot saves to the wiki page repository', async () => {
    const response = await dispatch('SAVE_WIKI_PAGE', { snapshot: wikiSnapshot });

    expect(response).toEqual({
      ok: true,
      data: {
        pageId: 'p1',
        changed: true,
        created: true,
        title: 'React'
      }
    });
    expect(pageRepo.upsertWikiPage).toHaveBeenCalledWith(wikiSnapshot);
  });

  it('routes GET_SETTINGS to the settings repository', async () => {
    const response = await dispatch('GET_SETTINGS');

    expect(response).toEqual({ ok: true, data: settings });
    expect(settingsRepo.getSettings).toHaveBeenCalledOnce();
  });

  it('routes EXPORT_DATA and IMPORT_DATA to the backup handlers', async () => {
    const exported = await dispatch('EXPORT_DATA');
    const imported = await dispatch('IMPORT_DATA', { backup });

    expect(exported).toEqual({ ok: true, data: backup });
    expect(imported).toEqual({
      ok: true,
      data: { conversationCount: 0, messageCount: 0 }
    });
    expect(conversationRepo.exportAllData).toHaveBeenCalledOnce();
    expect(conversationRepo.importAllData).toHaveBeenCalledWith(backup);
  });

  it('returns a runtime error response for unknown commands', async () => {
    const response = await dispatch('NOPE');

    expect(response.ok).toBe(false);
    expect(response.error.message).toMatch(/Unsupported runtime command/);
  });
});
