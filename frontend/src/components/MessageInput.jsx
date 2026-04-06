import { useState, useRef } from 'react';
import { t } from '../i18n';
import './MessageInput.css';

const ACCEPTED = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/csv,text/plain,text/html,text/markdown,application/json,.yaml,.yml,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export default function MessageInput({ onSend, disabled, isConnected }) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null); // {name, type, base64, preview}
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE) { alert('Archivo muy grande (max 5MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      const preview = file.type.startsWith('image/') ? reader.result : null;
      setAttachment({ name: file.name, type: file.type, base64, preview });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSend = () => {
    if ((!text.trim() && !attachment) || disabled) return;
    onSend(text || 'Analiza este archivo', attachment);
    setText('');
    setAttachment(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="message-input">
      {!isConnected && <div className="message-input__status">{t('chat.connecting')}</div>}
      {attachment && (
        <div className="message-input__preview">
          {attachment.preview
            ? <img src={attachment.preview} alt={attachment.name} />
            : <span className="message-input__file-name">{attachment.name}</span>}
          <button className="message-input__remove" onClick={() => setAttachment(null)} aria-label="Remove">x</button>
        </div>
      )}
      <div className="message-input__row">
        <button className="message-input__attach" onClick={() => fileRef.current?.click()} disabled={disabled} aria-label="Adjuntar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input type="file" ref={fileRef} accept={ACCEPTED} onChange={handleFile} hidden />
        <input
          className="message-input__field"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.placeholder')}
          disabled={disabled}
          aria-label={t('chat.placeholder')}
        />
        <button
          className="message-input__send"
          onClick={handleSend}
          disabled={disabled || (!text.trim() && !attachment)}
          aria-label={t('chat.send')}
        >
          {t('chat.send')}
        </button>
      </div>
    </div>
  );
}
