import { UI_TEXT_FILTER } from '../shared/constants';
import type { CapturePayload } from '../shared/types';
import { normalizeText } from '../shared/utils';
import { extractQueryIdFromUrl } from '../api/deepwikiApi';

function cleanLines(value: string): string {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !UI_TEXT_FILTER.has(line))
    .filter((line) => !/^[\w.-]+\/[\w.-]+$/.test(line))
    .filter((line) => !line.startsWith('Error:'));

  return normalizeText(lines.join('\n'));
}

function getElementText(element: HTMLElement | null): string {
  if (!element) {
    return '';
  }

  return element.innerText || element.textContent || '';
}

export function detectConversationRoot(document: Document): Element | null {
  return document.querySelector('[data-query-display]');
}

export function parseDeepWikiDomSnapshot(document: Document, sourceUrl: string): CapturePayload | null {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-query-display]'));

  if (sections.length === 0) {
    return null;
  }

  const messages = [];
  let order = 0;

  for (const section of sections) {
    const leftColumn = section.children.item(0) as HTMLElement | null;
    const contentWrapper = leftColumn?.firstElementChild as HTMLElement | null;

    if (!contentWrapper) {
      continue;
    }

    const promptElement = contentWrapper.children.item(0) as HTMLElement | null;
    const answerElement = contentWrapper.children.item(2) as HTMLElement | null;

    const promptText = cleanLines(getElementText(promptElement));
    const answerText = cleanLines(getElementText(answerElement));

    if (promptText) {
      messages.push({
        role: 'user' as const,
        content: promptText,
        order,
        sourceNodeKey: section.id || undefined
      });
      order += 1;
    }

    if (answerText) {
      messages.push({
        role: 'assistant' as const,
        content: answerText,
        order,
        sourceNodeKey: section.id || undefined
      });
      order += 1;
    }
  }

  if (messages.length === 0) {
    return null;
  }

  const titleFromDocument = normalizeText(document.title.replace(/\s*\|\s*DeepWiki$/i, ''));
  const fallbackTitle = messages.find((message) => message.role === 'user')?.content ?? 'Untitled conversation';

  return {
    title: titleFromDocument && titleFromDocument !== 'Search' ? titleFromDocument : fallbackTitle,
    sourceUrl,
    sourceHost: new URL(sourceUrl).host,
    sourceSessionId: extractQueryIdFromUrl(sourceUrl) ?? undefined,
    messages,
    capturedAt: Date.now()
  };
}
