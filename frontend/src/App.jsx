import useAuth from './hooks/useAuth';
import useChat from './hooks/useWebSocket';
import Header from './components/Header';
import Chat from './components/Chat';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import './App.css';
import { useEffect, useCallback, useState } from 'react';

export default function App() {
  const { user, loading, error, login, logout, newPasswordRequired, completeNewPassword, mfaRequired, mfaSetupRequired, totpSecret, verifyTotp } = useAuth();
  const chat = useChat();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { if (user) chat.loadHistory(); }, [user, chat.loadHistory]);

  const exportConversation = useCallback(() => {
    if (!chat.messages.length) return;
    const lines = chat.messages.map(m => {
      const label = m.role === 'user' ? 'You' : 'Assistant';
      return `[${label}]\n${m.content}\n`;
    });
    const text = `AWS LaunchPad - Conversation Export\n${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n${lines.join('\n')}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `launchpad-chat-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [chat.messages]);

  const handleSelectConversation = useCallback((convId) => {
    chat.loadConversation(convId);
    setSidebarOpen(false);
  }, [chat.loadConversation]);

  const handleNewConversation = useCallback(() => {
    chat.clearConversation();
    setSidebarOpen(false);
  }, [chat.clearConversation]);

  if (loading) return null;

  if (!user) {
    return (
      <Login
        onLogin={login}
        onCompleteNewPassword={completeNewPassword}
        onVerifyTotp={verifyTotp}
        error={error}
        newPasswordRequired={newPasswordRequired}
        mfaRequired={mfaRequired}
        mfaSetupRequired={mfaSetupRequired}
        totpSecret={totpSecret}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        conversations={chat.conversations}
        activeId={chat.activeConversationId}
        onSelect={handleSelectConversation}
        onRename={chat.renameConversation}
        onDelete={chat.deleteConversation}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(v => !v)}
      />
      <Header onLogout={logout} userEmail={user.email} onNewConversation={handleNewConversation} onExport={exportConversation} />
      <Chat messages={chat.messages} sendMessage={chat.sendMessage} isConnected={chat.isConnected} isLoading={chat.isLoading} userName={user.email?.split('@')[0]} />
    </div>
  );
}
