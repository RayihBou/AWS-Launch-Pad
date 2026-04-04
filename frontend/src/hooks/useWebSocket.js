import { useState, useCallback } from 'react';
import { config } from '../config';
import { t } from '../i18n';

export default function useChat() {
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(!!config.agentEndpoint);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim()) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);

    if (!config.agentEndpoint) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: t('chat.welcome'),
      }]);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${config.agentEndpoint}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { text } }),
      });

      const data = await response.json();
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.output?.text || t('chat.error'),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: t('chat.error'),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { messages, sendMessage, isConnected, isLoading };
}
