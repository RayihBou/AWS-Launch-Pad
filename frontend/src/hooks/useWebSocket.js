import { useState, useCallback, useRef, useEffect } from 'react';
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

async function apiCall(path, method = 'GET', body = null) {
  const auth = await getAuthInfo();
  if (!auth) return null;
  const headers = { 'Authorization': `Bearer ${auth.token}` };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(config.agentEndpoint.replace('/chat', path), {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  return { data: await res.json(), auth };
}

export default function useChat() {
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const streamRef = useRef(null);
  const messagesRef = useRef([]);
  const historyLoaded = useRef(false);
  const conversationIdRef = useRef(crypto.randomUUID());
  const wsRef = useRef(null);
  const pendingResolve = useRef(null);

  // WebSocket connection
  const connectWs = useCallback(async () => {
    const auth = await getAuthInfo();
    if (!auth || !config.wsEndpoint) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${config.wsEndpoint}?token=${auth.token}`);
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      // Reconnect after 3s
      setTimeout(() => connectWs(), 3000);
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'status') {
          setStatusMessage(data.message || '');
          return;
        }
        if (data.type === 'response' || data.type === 'error') {
          setStatusMessage('');
          if (data.conversationId) conversationIdRef.current = data.conversationId;
          const text = data.output?.text || '';
          streamText(text);
          setIsLoading(false);
          loadConversations();
        }
      } catch (e) { /* ignore */ }
    };
    wsRef.current = ws;
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const r = await apiCall('/conversations');
      if (r?.data?.conversations) {
        const sorted = r.data.conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setConversations(sorted);
        return sorted;
      }
    } catch (e) { /* ignore */ }
    return [];
  }, []);

  const loadConversation = useCallback(async (convId) => {
    conversationIdRef.current = convId;
    try {
      const r = await apiCall(`/history?conversationId=${convId}`);
      if (r?.data?.messages?.length) {
        const restored = r.data.messages.map(m => ({ role: m.role, content: m.text }));
        setMessages(restored);
        messagesRef.current = restored;
        return;
      }
    } catch (e) { /* ignore */ }
    setMessages([]);
    messagesRef.current = [];
  }, []);

  const loadHistory = useCallback(async () => {
    if (historyLoaded.current || !config.agentEndpoint) return;
    historyLoaded.current = true;
    await connectWs();
    const convs = await loadConversations();
    if (convs.length) await loadConversation(convs[0].conversationId);
  }, [loadConversations, loadConversation, connectWs]);

  const clearConversation = useCallback(() => {
    if (streamRef.current) clearInterval(streamRef.current);
    conversationIdRef.current = crypto.randomUUID();
    setMessages([]);
    messagesRef.current = [];
  }, []);

  const renameConversation = useCallback(async (convId, title) => {
    try {
      await apiCall(`/history?conversationId=${convId}`, 'PATCH', { title });
      setConversations(prev => prev.map(c => c.conversationId === convId ? { ...c, title } : c));
    } catch (e) { /* ignore */ }
  }, []);

  const deleteConversation = useCallback(async (convId) => {
    try {
      await apiCall(`/history?conversationId=${convId}`, 'DELETE');
      setConversations(prev => prev.filter(c => c.conversationId !== convId));
      if (conversationIdRef.current === convId) {
        conversationIdRef.current = crypto.randomUUID();
        setMessages([]);
        messagesRef.current = [];
      }
    } catch (e) { /* ignore */ }
  }, []);

  const streamText = useCallback((fullText) => {
    if (streamRef.current) clearInterval(streamRef.current);
    let i = 0;
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    streamRef.current = setInterval(() => {
      i += 3;
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

    // Try WebSocket first, fallback to HTTP
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const payload = {
        action: 'sendMessage',
        input: { text: text || 'Analiza este archivo' },
        conversationId: conversationIdRef.current,
      };
      if (attachment) {
        payload.attachment = { base64: attachment.base64, type: attachment.type, name: attachment.name };
      }
      wsRef.current.send(JSON.stringify(payload));
      return; // Response comes via onmessage
    }

    // HTTP fallback (for when WS is not connected)
    try {
      const auth = await getAuthInfo();
      const headers = { 'Content-Type': 'application/json' };
      if (auth) headers['Authorization'] = `Bearer ${auth.token}`;
      const payload = {
        input: { text: text || 'Analiza este archivo' },
        conversationId: conversationIdRef.current,
        role: auth?.role || 'Viewer',
        history: messagesRef.current.filter(m => m.content?.length > 0).map(m => ({ role: m.role, text: m.content })),
      };
      if (attachment) payload.attachment = { base64: attachment.base64, type: attachment.type, name: attachment.name };

      const response = await fetch(config.agentEndpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await response.json();
      if (data?.conversationId) conversationIdRef.current = data.conversationId;
      streamText(data?.output?.text || '');
      loadConversations();
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `${t('chat.error')} (${err.message})` }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, streamText, loadConversations]);

  return {
    messages, sendMessage, isConnected, isLoading, statusMessage, loadHistory, clearConversation,
    conversations, loadConversation, renameConversation, deleteConversation, activeConversationId: conversationIdRef.current,
  };
}
