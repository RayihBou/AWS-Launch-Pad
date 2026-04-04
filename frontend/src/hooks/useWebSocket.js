import { useState, useCallback } from 'react';
import { CognitoUserPool } from 'amazon-cognito-identity-js';
import { config } from '../config';
import { t } from '../i18n';

// Get JWT token from current Cognito session
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
      const token = await getIdToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(config.agentEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: { text } }),
      });

      const data = await response.json();
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.output?.text || data.body || JSON.stringify(data),
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `${t('chat.error')} (${err.message})`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { messages, sendMessage, isConnected, isLoading };
}
