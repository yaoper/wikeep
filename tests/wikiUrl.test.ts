import { describe, expect, it } from 'vitest';
import { isWikiPageUrl, parseWikiUrl } from '../src/shared/wikiUrl';

describe('isWikiPageUrl', () => {
  const yes = [
    'https://deepwiki.com/facebook/react',
    'https://deepwiki.com/facebook/react/1-react-repository-overview',
    'https://deepwiki.com/facebook/react/1.1-repository-structure-and-packages',
    'https://deepwiki.com/vercel/next.js/3.4-react-server-components:-flight-protocol'
  ];
  const no = [
    'https://deepwiki.com/',
    'https://deepwiki.com/search/what-is-the-react-scheduler_abc123',
    'https://deepwiki.com/settings',
    'https://example.com/facebook/react'
  ];

  it.each(yes)('accepts %s', (u) => expect(isWikiPageUrl(u)).toBe(true));
  it.each(no)('rejects %s', (u) => expect(isWikiPageUrl(u)).toBe(false));
});

describe('parseWikiUrl', () => {
  it('parses an overview URL', () => {
    expect(parseWikiUrl('https://deepwiki.com/facebook/react')).toEqual({
      owner: 'facebook',
      repo: 'react',
      sectionPath: undefined
    });
  });

  it('parses a section URL', () => {
    expect(parseWikiUrl('https://deepwiki.com/facebook/react/1.1-repository-structure-and-packages')).toEqual({
      owner: 'facebook',
      repo: 'react',
      sectionPath: '1.1-repository-structure-and-packages'
    });
  });
});
