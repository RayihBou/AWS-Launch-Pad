import { useEffect } from 'react';
import useWebSocket from '../hooks/useWebSocket';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import './Chat.css';

export default function Chat() {
  const { messages, sendMessage, isConnected, isLoading, loadHistory } = useWebSocket();

  useEffect(() => { loadHistory(); }, [loadHistory]);

  return (
    <div className="chat">
      <MessageList messages={messages} isLoading={isLoading} />
      <MessageInput onSend={sendMessage} disabled={isLoading} isConnected={isConnected} />
    </div>
  );
}
