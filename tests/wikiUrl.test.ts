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

const ORG = "org/some-org-slug-c5c1f593e932";

describe("Devin wiki URLs", () => {
  const root = `https://app.devin.ai/${ORG}/wiki/drunkod/nix-config-1`;

  it("matches a Devin repo root", () => {
    expect(isWikiPageUrl(root)).toBe(true);
    expect(parseWikiUrl(root)).toEqual({
      owner: "drunkod",
      repo: "nix-config-1",
      sectionPath: undefined,
    });
  });

  it("ignores ?branch= and parses hash sectionPath", () => {
    const url = `${root}?branch=master#1.2-repository-structure`;
    expect(isWikiPageUrl(url)).toBe(true);
    expect(parseWikiUrl(url)?.sectionPath).toBe("1.2");
  });

  it("parses a bare numeric hash", () => {
    expect(parseWikiUrl(`${root}#3`)?.sectionPath).toBe("3");
  });

  it("rejects non-wiki Devin paths", () => {
    expect(isWikiPageUrl(`https://app.devin.ai/${ORG}`)).toBe(false);
    expect(isWikiPageUrl("https://app.devin.ai/settings")).toBe(false);
  });

  it("leaves DeepWiki matching intact", () => {
    expect(isWikiPageUrl("https://deepwiki.com/facebook/react")).toBe(true);
  });
});
