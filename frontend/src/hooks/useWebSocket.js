import { useState, useCallback, useRef } from 'react';
import { CognitoUserPool } from 'amazon-cognito-identity-js';
import { config } from '../config';
import { t } from '../i18n';

function getIdToken() {
  if (!config.userPoolId) return null;
  const pool = new CognitoUserPool({
    UserPoolId: config.userPoolId,
    ClientId: config.userPoolClientId,
  });
  const user = pool.getCurrentUser();
  if (!user) return null;

  return new Promise((resolve) => {
    user.getSession((err, session) => {
      if (err || !session?.isValid()) { resolve(null); return; }
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

export default function useChat() {
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(!!config.agentEndpoint);
  const [isLoading, setIsLoading] = useState(false);
  const streamRef = useRef(null);

  const streamText = useCallback((fullText) => {
    if (streamRef.current) clearInterval(streamRef.current);
    let i = 0;
    const chunkSize = 3;
    // Add empty assistant message
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    streamRef.current = setInterval(() => {
      i += chunkSize;
      if (i >= fullText.length) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: fullText };
          return copy;
        });
        clearInterval(streamRef.current);
        streamRef.current = null;
        return;
      }
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: fullText.slice(0, i) };
        return copy;
      });
    }, 12);
  }, []);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);

    if (!config.agentEndpoint) {
      streamText(t('chat.welcome'));
      setIsLoading(false);
      return;
    }

    try {
      const token = await getIdToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(config.agentEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: { text } }),
      });

      const data = await response.json();
      const content = data.output?.text || data.body || JSON.stringify(data);
      streamText(content);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `${t('chat.error')} (${err.message})`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, streamText]);

  return { messages, sendMessage, isConnected, isLoading };
}
