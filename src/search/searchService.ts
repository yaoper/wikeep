import type { Conversation, ConversationListItem } from '../shared/types';
import { buildSnippet } from '../shared/utils';

export function searchConversations(
  keyword: string,
  conversations: Conversation[]
): ConversationListItem[] {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return [...conversations].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  const results: ConversationListItem[] = [];

  for (const conversation of conversations) {
    const searchableValues = [
      conversation.question,
      ...(conversation.metadata?.repoNames ?? [])
    ];
    const joined = searchableValues.join('\n');

    if (!joined.toLowerCase().includes(normalizedKeyword)) {
      continue;
    }

    results.push({
      ...conversation,
      matchedSnippet: buildSnippet(joined, normalizedKeyword)
    });
  }

  return results.sort((left, right) => right.updatedAt - left.updatedAt);
}
