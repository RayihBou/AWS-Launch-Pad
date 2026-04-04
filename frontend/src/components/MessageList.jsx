import { useEffect, useRef } from 'react';
import { t } from '../i18n';
import './MessageList.css';

export default function MessageList({ messages, isLoading }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="message-list">
      {messages.map((msg, i) => (
        <div key={i} className={`message message--${msg.role}`}>
          <span className="message__label">{msg.role === 'user' ? t('chat.you') : t('chat.assistant')}</span>
          <div className="message__bubble">{msg.content}</div>
        </div>
      ))}
      {isLoading && (
        <div className="message message--assistant">
          <span className="message__label">{t('chat.assistant')}</span>
          <div className="message__bubble">
            <span className="typing-dots">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
