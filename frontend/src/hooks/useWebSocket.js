import { useState, useCallback, useRef } from 'react';
import { CognitoUserPool } from 'amazon-cognito-identity-js';
import { config } from '../config';
import { t } from '../i18n';

function getAuthInfo() {
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
      const payload = session.getIdToken().decodePayload();
      const groups = payload['cognito:groups'] || [];
      const role = groups.includes('Operator') ? 'Operator' : 'Viewer';
      resolve({ token: session.getIdToken().getJwtToken(), role });
    });
  });
}

export default function useChat() {
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(!!config.agentEndpoint);
  const [isLoading, setIsLoading] = useState(false);
  const streamRef = useRef(null);
  const messagesRef = useRef([]);
  const historyLoaded = useRef(false);
  const conversationIdRef = useRef(crypto.randomUUID());

  const loadHistory = useCallback(async () => {
    if (historyLoaded.current || !config.agentEndpoint) return;
    historyLoaded.current = true;
    try {
      const auth = await getAuthInfo();
      if (!auth) return;
      // Load most recent conversation
      const convsEndpoint = config.agentEndpoint.replace('/chat', '/conversations');
      const convsRes = await fetch(convsEndpoint, { headers: { 'Authorization': `Bearer ${auth.token}` } });
      const convsData = await convsRes.json();
      if (convsData.conversations?.length) {
        const latest = convsData.conversations[0];
        conversationIdRef.current = latest.conversationId;
        const endpoint = config.agentEndpoint.replace('/chat', '/history') + `?conversationId=${latest.conversationId}`;
        const res = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${auth.token}` } });
        const data = await res.json();
        if (data.messages?.length) {
          const restored = data.messages.map(m => ({ role: m.role, content: m.text }));
          setMessages(restored);
          messagesRef.current = restored;
        }
      }
    } catch (e) { /* ignore */ }
  }, []);

  const clearConversation = useCallback(async () => {
    if (streamRef.current) clearInterval(streamRef.current);
    conversationIdRef.current = crypto.randomUUID();
    setMessages([]);
    messagesRef.current = [];
  }, []);

  const streamText = useCallback((fullText) => {
    if (streamRef.current) clearInterval(streamRef.current);
    let i = 0;
    const chunkSize = 3;
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    streamRef.current = setInterval(() => {
      i += chunkSize;
      if (i >= fullText.length) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: fullText };
          messagesRef.current = copy;
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

  const sendMessage = useCallback(async (text, attachment = null) => {
    if ((!text.trim() && !attachment) || isLoading) return;

    const userMsg = { role: 'user', content: text || 'Analiza este archivo', attachment: attachment?.preview ? { preview: attachment.preview, name: attachment.name } : attachment?.name ? { name: attachment.name } : null };
    setMessages((prev) => {
      const updated = [...prev, userMsg];
      messagesRef.current = updated;
      return updated;
    });
    setIsLoading(true);

    if (!config.agentEndpoint) {
      streamText(t('chat.welcome'));
      setIsLoading(false);
      return;
    }

    try {
      const auth = await getAuthInfo();
      const headers = { 'Content-Type': 'application/json' };
      if (auth) headers['Authorization'] = `Bearer ${auth.token}`;

      const history = messagesRef.current
        .filter(m => m.content && m.content.length > 0)
        .map(m => ({ role: m.role, text: m.content }));

      const payload = {
        input: { text: text || 'Analiza este archivo' },
        conversationId: conversationIdRef.current,
        role: auth?.role || 'Viewer',
        history,
      };
      if (attachment) {
        payload.attachment = { base64: attachment.base64, type: attachment.type, name: attachment.name };
      }
      const body = JSON.stringify(payload);

      let data;
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(config.agentEndpoint, { method: 'POST', headers, body });
        if (response.status === 503 && attempt < 2) {
          setMessages((prev) => {
            const copy = [...prev];
            if (copy[copy.length - 1]?.role === 'assistant') copy.pop();
            return [...copy, { role: 'assistant', content: 'Procesando consulta compleja, un momento...' }];
          });
          continue;
        }
        data = await response.json();
        break;
      }

      if (data?.conversationId) conversationIdRef.current = data.conversationId;
      const content = data?.output?.text || data?.body || JSON.stringify(data || {});
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

  return { messages, sendMessage, isConnected, isLoading, loadHistory, clearConversation };
}
