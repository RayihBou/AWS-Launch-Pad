import { t } from '../i18n';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import './Chat.css';

export default function Chat({ messages, sendMessage, isConnected, isLoading, statusMessage, userName }) {
  return (
    <div className="chat">
      {messages.length === 0 && !isLoading && (
        <div className="chat__welcome">
          <h2>{t('chat.welcomeTitle').replace('{name}', userName || '')}</h2>
          <p>{t('chat.welcomeDesc')}</p>
          <div className="chat__capabilities">
            {['chat.capMonitoring', 'chat.capSecurity', 'chat.capCost', 'chat.capGeneral'].map(k => (
              <span key={k} className="chat__cap-tag">{t(k)}</span>
            ))}
          </div>
        </div>
      )}
      <MessageList messages={messages} isLoading={isLoading} statusMessage={statusMessage} />
      <MessageInput onSend={sendMessage} disabled={isLoading} isConnected={isConnected} messageCount={messages.length} />
    </div>
  );
}
