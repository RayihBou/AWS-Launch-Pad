import { t } from '../i18n';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import './Chat.css';

const ICONS = {
  security: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  cost: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  network: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/><rect x="9" y="16" width="6" height="6" rx="1"/><path d="M5 8v3a1 1 0 001 1h12a1 1 0 001-1V8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>,
  containers: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  monitoring: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  audit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
};

const CATEGORIES = [
  { icon: 'security', name: 'chat.catSecurity', desc: 'chat.catSecurityDesc' },
  { icon: 'cost', name: 'chat.catCost', desc: 'chat.catCostDesc' },
  { icon: 'network', name: 'chat.catNetwork', desc: 'chat.catNetworkDesc' },
  { icon: 'containers', name: 'chat.catContainers', desc: 'chat.catContainersDesc' },
  { icon: 'monitoring', name: 'chat.catMonitoring', desc: 'chat.catMonitoringDesc' },
  { icon: 'audit', name: 'chat.catAudit', desc: 'chat.catAuditDesc' },
];

const PROMPTS = ['chat.prompt1', 'chat.prompt2', 'chat.prompt3', 'chat.prompt4', 'chat.prompt5', 'chat.prompt6'];

export default function Chat({ messages, sendMessage, isConnected, isLoading, statusMessage, userName }) {
  return (
    <div className="chat">
      {messages.length === 0 && !isLoading && (
        <div className="chat__welcome">
          <h2>{t('chat.welcomeTitle').replace('{name}', userName || '')}</h2>
          <p className="chat__welcome-desc">{t('chat.welcomeDesc')}</p>
          <div className="chat__cat-grid">
            {CATEGORIES.map(c => (
              <div key={c.name} className="chat__cat-card">
                <div className="chat__cat-icon">{ICONS[c.icon]}</div>
                <div>
                  <div className="chat__cat-name">{t(c.name)}</div>
                  <div className="chat__cat-desc">{t(c.desc)}</div>
                </div>
              </div>
            ))}
          </div>
          <h3 className="chat__suggested-title">{t('chat.suggestedTitle')}</h3>
          <div className="chat__prompts">
            {PROMPTS.map(k => (
              <button key={k} className="chat__prompt-btn" onClick={() => sendMessage(t(k))}>
                {t(k)}
              </button>
            ))}
          </div>
        </div>
      )}
      {(messages.length > 0 || isLoading) && (
        <MessageList messages={messages} isLoading={isLoading} statusMessage={statusMessage} />
      )}
      <MessageInput onSend={sendMessage} disabled={isLoading} isConnected={isConnected} messageCount={messages.length} />
    </div>
  );
}
