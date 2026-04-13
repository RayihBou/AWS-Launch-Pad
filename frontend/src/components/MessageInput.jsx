// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { useState, useRef, useCallback, useEffect } from 'react';
import { t } from '../i18n';
import { config } from '../config';
import { CognitoUserPool } from 'amazon-cognito-identity-js';
import './MessageInput.css';

const ACCEPTED = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/csv,text/plain,text/html,text/markdown,application/json,.yaml,.yml,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function getToken() {
  const pool = new CognitoUserPool({ UserPoolId: config.userPoolId, ClientId: config.userPoolClientId });
  const user = pool.getCurrentUser();
  if (!user) return Promise.resolve('');
  return new Promise(r => user.getSession((e, s) => r(e || !s?.isValid() ? '' : s.getIdToken().getJwtToken())));
}

async function uploadToS3(file) {
  const token = await getToken();
  const res = await fetch(
    `${config.agentEndpoint.replace('/chat', '/upload-url')}?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { uploadUrl, s3Key } = await res.json();
  await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  return s3Key;
}

export default function MessageInput({ onSend, disabled, isConnected, messageCount }) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null); // {name, type, file, preview}
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  // Autofocus on mount, when loading finishes, and on conversation change
  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled, messageCount]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE) { alert('Archivo muy grande (max 5MB)'); return; }
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setAttachment({ name: file.name, type: file.type, file, preview });
    e.target.value = '';
  };

  const handleSend = async () => {
    if ((!text.trim() && !attachment) || disabled || uploading) return;
    let att = null;
    if (attachment) {
      setUploading(true);
      try {
        const s3Key = await uploadToS3(attachment.file);
        att = { s3Key, type: attachment.type, name: attachment.name };
      } catch (e) {
        console.error('Upload failed:', e);
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    onSend(text || 'Analiza este archivo', att);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    setAttachment(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
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
          <button className="message-input__remove" onClick={() => { if (attachment.preview) URL.revokeObjectURL(attachment.preview); setAttachment(null); }} aria-label="Remove">x</button>
        </div>
      )}
      <div className="message-input__row">
        <button className="message-input__attach" onClick={() => fileRef.current?.click()} disabled={disabled || uploading} aria-label="Adjuntar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input type="file" ref={fileRef} accept={ACCEPTED} onChange={handleFile} hidden />
        <textarea
          ref={textareaRef}
          className="message-input__field"
          value={text}
          onChange={(e) => { setText(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          placeholder={uploading ? 'Subiendo archivo...' : t('chat.placeholder')}
          disabled={disabled || uploading}
          aria-label={t('chat.placeholder')}
          rows={1}
        />
        <button
          className="message-input__send"
          onClick={handleSend}
          disabled={disabled || uploading || (!text.trim() && !attachment)}
          aria-label={t('chat.send')}
        >
          {uploading ? '...' : t('chat.send')}
        </button>
      </div>
    </div>
  );
}
