import type { Conversation, ConversationListItem, Message } from '../shared/types';
import { buildSnippet } from '../shared/utils';

export function searchConversations(
  keyword: string,
  conversations: Conversation[],
  messages: Message[]
): ConversationListItem[] {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return [...conversations].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  const messagesByConversation = new Map<string, Message[]>();

  for (const message of messages) {
    const list = messagesByConversation.get(message.conversationId) ?? [];
    list.push(message);
    messagesByConversation.set(message.conversationId, list);
  }

  const results: ConversationListItem[] = [];

  for (const conversation of conversations) {
    const messageList = messagesByConversation.get(conversation.id) ?? [];
    const searchableValues = [
      conversation.title,
      conversation.summary,
      conversation.sourceUrl,
      ...messageList.map((message) => message.content)
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
