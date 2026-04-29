import type { Message } from '../../shared/types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <div className={`message-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}>
      <div className="message-bubble__role">{message.role === 'user' ? '用户' : 'AI'}</div>
      <pre className="message-bubble__content">{message.content}</pre>
    </div>
  );
}
