import { useState } from 'react';
import './MessageInput.css';

export default function MessageInput({ onSend, disabled, isConnected }) {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-input">
      {!isConnected && <div className="message-input__status">Connecting...</div>}
      <div className="message-input__row">
        <input
          className="message-input__field"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me about your AWS environment..."
          disabled={disabled}
          aria-label="Message input"
        />
        <button
          className="message-input__send"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </div>
  );
}
