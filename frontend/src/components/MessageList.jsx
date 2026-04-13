// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { t } from '../i18n';
import './MessageList.css';

const TOOL_MESSAGES = [
  'chat.thinking',
  'chat.toolConsulting',
  'chat.toolAnalyzing',
  'chat.toolProcessing',
];

function ToolIndicator() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIdx(i => (i + 1) % TOOL_MESSAGES.length), 3000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="tool-indicator">
      <span className="typing-dots"><span /><span /><span /></span>
      <span className="tool-indicator__text">{t(TOOL_MESSAGES[idx])}</span>
    </span>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button className={`copy-btn${copied ? ' copy-btn--copied' : ''}`} onClick={handleCopy} title="Copy">
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      )}
    </button>
  );
}

export default function MessageList({ messages, isLoading, statusMessage }) {
  const listRef = useRef(null);
  const userScrolled = useRef(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onWheel = (e) => { if (e.deltaY < 0) userScrolled.current = true; };
    let lastTouchY = 0;
    const onTouchStart = (e) => { lastTouchY = e.touches[0].clientY; };
    const onTouchMove = (e) => { if (e.touches[0].clientY > lastTouchY) userScrolled.current = true; };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

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
            {msg.attachment && (
              <div className="message__attachment">
                {msg.attachment.preview
                  ? <img src={msg.attachment.preview} alt={msg.attachment.name} />
                  : <span>{msg.attachment.name}</span>}
              </div>
            )}
            {msg.role === 'assistant' ? (
              <>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                  a: ({...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                  pre: ({children}) => <div className="code-block-wrapper"><pre>{children}</pre><CopyButton text={children?.props?.children || ''} /></div>,
                }}>{msg.content}</ReactMarkdown>
                <CopyButton text={msg.content} />
              </>
            ) : msg.content}
          </div>
        </div>
      ))}
      {isLoading && (
        <div className="message message--assistant">
          <span className="message__label">{t('chat.assistant')}</span>
          <div className="message__bubble">
            <span className="tool-indicator">
              <span className="typing-dots"><span /><span /><span /></span>
              <span className="tool-indicator__text">{statusMessage || t('chat.thinking')}</span>
            </span>
          </div>
        </div>
      )}
      <div />
    </div>
  );
}
