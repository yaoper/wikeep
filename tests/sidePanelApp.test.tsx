import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidePanelApp } from '../src/ui/sidepanel/SidePanelApp';

const settings = {
  autoCaptureEnabled: true,
  preferredPanel: 'sidePanel' as const,
  hasSeenPrivacyNotice: true,
  autoRefreshWikiPages: false,
  schemaVersion: 1
};

function installChromeStub() {
  (globalThis as any).chrome = {
    runtime: {
      sendMessage: vi.fn(async (request: { command: string }) => {
        switch (request.command) {
          case 'LIST_CONVERSATIONS':
            return { ok: true, data: [] };
          case 'LIST_WIKI_PAGES':
            return { ok: true, data: [] };
          case 'GET_ACTIVE_TAB_CONTEXT':
            return { ok: true, data: { supported: false, routeKind: 'other' } };
          case 'GET_SETTINGS':
            return { ok: true, data: settings };
          default:
            return { ok: true, data: null };
        }
      }),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    }
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('SidePanelApp', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    installChromeStub();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('loads the history view without crashing', async () => {
    await act(async () => {
      root.render(<SidePanelApp />);
    });
    await flush();

    expect(container.textContent).toMatch(/Not a DeepWiki page|Reading current page status/);
    expect((globalThis as any).chrome.runtime.sendMessage).toHaveBeenCalledWith({
      command: 'LIST_CONVERSATIONS',
      payload: { keyword: '' }
    });
  });

  it('switches to the settings view from the menu', async () => {
    await act(async () => {
      root.render(<SidePanelApp />);
    });
    await flush();

    const moreButton = container.querySelector<HTMLButtonElement>('button[title="More"]');
    expect(moreButton).not.toBeNull();

    await act(async () => {
      moreButton!.click();
    });

    const settingsButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Settings')
    );
    expect(settingsButton).toBeTruthy();

    await act(async () => {
      settingsButton!.click();
    });
    await flush();

    expect(container.textContent).toContain('Enable auto-save');
  });
});
