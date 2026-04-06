import useAuth from './hooks/useAuth';
import useChat from './hooks/useWebSocket';
import Header from './components/Header';
import Chat from './components/Chat';
import Login from './components/Login';
import './App.css';
import { useEffect, useCallback } from 'react';

export default function App() {
  const { user, loading, error, login, logout, newPasswordRequired, completeNewPassword, mfaRequired, mfaSetupRequired, totpSecret, verifyTotp } = useAuth();
  const chat = useChat();

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
      <Header onLogout={logout} userEmail={user.email} onNewConversation={chat.clearConversation} onExport={exportConversation} />
      <Chat messages={chat.messages} sendMessage={chat.sendMessage} isConnected={chat.isConnected} isLoading={chat.isLoading} userName={user.email?.split('@')[0]} />
    </div>
  );
}
