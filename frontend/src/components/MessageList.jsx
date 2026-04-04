import { useEffect, useRef } from 'react';
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
          <span className="message__label">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
          <div className="message__bubble">{msg.content}</div>
        </div>
      ))}
      {isLoading && (
        <div className="message message--assistant">
          <span className="message__label">Assistant</span>
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
