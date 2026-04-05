import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { t } from '../i18n';
import './MessageList.css';

export default function MessageList({ messages, isLoading }) {
  const listRef = useRef(null);
  const userScrolled = useRef(false);

  // Detect user scrolling up → pause auto-scroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY < 0) userScrolled.current = true;
    };
    let lastTouchY = 0;
    const onTouchStart = (e) => { lastTouchY = e.touches[0].clientY; };
    const onTouchMove = (e) => {
      if (e.touches[0].clientY > lastTouchY) userScrolled.current = true; // scrolling up
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  // Reset when new user message is sent
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'user') userScrolled.current = false;
  }, [messages.length]);

  useEffect(() => {
    if (!userScrolled.current) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [messages, isLoading]);

  return (
    <div className="message-list" ref={listRef}>
      {messages.map((msg, i) => (
        <div key={i} className={`message message--${msg.role}`}>
          <span className="message__label">{msg.role === 'user' ? t('chat.you') : t('chat.assistant')}</span>
          <div className="message__bubble">
            {msg.role === 'assistant'
              ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{a: ({...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />}}>{msg.content}</ReactMarkdown>
              : msg.content}
          </div>
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
      <div />
    </div>
  );
}
