export const config = {
  agentEndpoint: import.meta.env.VITE_AGENT_ENDPOINT || 'http://localhost:8080',
  userPoolId: import.meta.env.VITE_USER_POOL_ID || '',
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || '',
  region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
};
