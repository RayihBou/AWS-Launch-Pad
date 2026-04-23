// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
const _endpoint = import.meta.env.VITE_AGENT_ENDPOINT || 'http://localhost:8080';
export const config = {
  agentEndpoint: _endpoint.endsWith('/chat') ? _endpoint : `${_endpoint}/chat`,
  apiBase: _endpoint.endsWith('/chat') ? _endpoint.replace(/\/chat$/, '') : _endpoint,
  wsEndpoint: import.meta.env.VITE_WS_ENDPOINT || '',
  userPoolId: import.meta.env.VITE_USER_POOL_ID || '',
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || '',
  region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
};
