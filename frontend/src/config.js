export const config = {
  websocketUrl: import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:8080',
  userPoolId: import.meta.env.VITE_USER_POOL_ID || '',
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || '',
};
