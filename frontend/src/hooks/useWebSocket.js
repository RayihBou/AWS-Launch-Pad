import { useState, useRef, useCallback, useEffect } from 'react';
import { config } from '../config';

const MAX_RECONNECT = 3;

export default function useWebSocket() {
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wsRef = useRef(null);
  const reconnectCount = useRef(0);
  const chunkBuffer = useRef('');

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(config.websocketUrl);

    ws.onopen = () => {
      setIsConnected(true);
      reconnectCount.current = 0;
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      if (reconnectCount.current < MAX_RECONNECT) {
        reconnectCount.current++;
        setTimeout(connect, 2000 * reconnectCount.current);
      }
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'chunk') {
          chunkBuffer.current += parsed.data;
        } else if (parsed.type === 'end') {
          const text = chunkBuffer.current || parsed.data || '';
          chunkBuffer.current = '';
          setMessages((prev) => [...prev, { role: 'assistant', content: text }]);
          setIsLoading(false);
        } else if (parsed.type === 'error') {
          chunkBuffer.current = '';
          setMessages((prev) => [...prev, { role: 'assistant', content: parsed.data || 'An error occurred.' }]);
          setIsLoading(false);
        }
      } catch {
        // Non-JSON message, treat as plain text response
        setMessages((prev) => [...prev, { role: 'assistant', content: event.data }]);
        setIsLoading(false);
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const sendMessage = useCallback((text) => {
    if (!text.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    chunkBuffer.current = '';
    wsRef.current.send(JSON.stringify({ action: 'sendMessage', message: text }));
  }, []);

  return { messages, sendMessage, isConnected, isLoading };
}
