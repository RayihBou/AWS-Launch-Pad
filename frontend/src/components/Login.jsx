// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { useState } from 'react';
import { t } from '../i18n';
import './Login.css';

const ICONS = {
  security: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  cost: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  network: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/><rect x="9" y="16" width="6" height="6" rx="1"/><path d="M5 8v3a1 1 0 001 1h12a1 1 0 001-1V8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>,
  containers: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  monitoring: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  audit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
};

const CATEGORIES = [
  { icon: 'security', key: 'login.catSecurity' },
  { icon: 'cost', key: 'login.catCost' },
  { icon: 'network', key: 'login.catNetwork' },
  { icon: 'containers', key: 'login.catContainers' },
  { icon: 'monitoring', key: 'login.catMonitoring' },
  { icon: 'audit', key: 'login.catAudit' },
];

export default function Login({ onLogin, onCompleteNewPassword, onVerifyTotp, error, newPasswordRequired, mfaRequired, mfaSetupRequired, totpSecret }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const handleLogin = (e) => { e.preventDefault(); onLogin(email, password); };
  const handleNewPassword = (e) => { e.preventDefault(); onCompleteNewPassword(newPassword); };
  const handleTotp = (e) => { e.preventDefault(); onVerifyTotp(totpCode); setTotpCode(''); };

  const renderForm = () => {
    if (mfaSetupRequired) {
      const otpUri = `otpauth://totp/AWSLaunchPad:${email}?secret=${totpSecret}&issuer=AWSLaunchPad`;
      return (
        <form onSubmit={handleTotp}>
          <p className="login__message">Configura MFA con tu app authenticator (Google Authenticator, Authy, etc.)</p>
          <div className="login__qr">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpUri)}`} alt="QR Code" />
          </div>
          <p className="login__secret">Clave manual: <code>{totpSecret}</code></p>
          <input type="text" placeholder="Codigo de 6 digitos" value={totpCode} autoFocus onChange={(e) => setTotpCode(e.target.value)} required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" />
          <button type="submit">Verificar</button>
        </form>
      );
    }
    if (mfaRequired) {
      return (
        <form onSubmit={handleTotp}>
          <p className="login__message">Ingresa el codigo de tu app authenticator</p>
          <input type="text" placeholder="Codigo de 6 digitos" value={totpCode} autoFocus onChange={(e) => setTotpCode(e.target.value)} required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" />
          <button type="submit">Verificar</button>
        </form>
      );
    }
    if (newPasswordRequired) {
      return (
        <form onSubmit={handleNewPassword}>
          <p className="login__message">{t('login.newPasswordMessage')}</p>
          <input type="password" placeholder={t('login.newPassword')} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoFocus />
          <button type="submit">{t('login.changePassword')}</button>
        </form>
      );
    }
    return (
      <form onSubmit={handleLogin}>
        <input type="email" placeholder={t('login.email')} value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <input type="password" placeholder={t('login.password')} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit">{t('login.submit')}</button>
      </form>
    );
  };

  return (
    <div className="login">
      <div className="login__form-side">
        <div className="login__card">
          <div className="login__card-brand">
            <svg viewBox="0 0 706 534" width="48" height="28" xmlns="http://www.w3.org/2000/svg">
              <path fill="#FFFFFF" d="M208.52,223.05c0,6.82,0.69,12.26,2.08,16.3c1.38,4.05,3.36,8.42,5.91,13.11c0.85,1.49,1.28,2.88,1.28,4.15c0,1.92-1.17,3.73-3.52,5.43l-11.51,7.67c-1.71,1.06-3.31,1.6-4.79,1.6c-1.92,0-3.73-0.85-5.43-2.56c-2.56-2.56-4.74-5.38-6.55-8.47c-1.81-3.09-3.68-6.66-5.59-10.71c-14.28,16.84-32.18,25.25-53.69,25.25c-15.34,0-27.49-4.37-36.44-13.11c-8.95-8.73-13.42-20.45-13.42-35.16c0-15.55,5.54-28.07,16.62-37.56c11.08-9.48,25.99-14.22,44.75-14.22c6.18,0,12.62,0.48,19.34,1.44c6.71,0.96,13.69,2.29,20.94,4V166.8c0-13.85-2.88-23.6-8.63-29.25c-5.75-5.64-15.66-8.47-29.73-8.47c-6.39,0-12.95,0.8-19.66,2.4c-6.71,1.6-13.26,3.68-19.66,6.23c-2.99,1.28-5.11,2.08-6.39,2.4c-1.28,0.32-2.24,0.48-2.88,0.48c-2.56,0-3.84-1.92-3.84-5.75v-8.95c0-2.98,0.42-5.11,1.28-6.39c0.85-1.28,2.56-2.56,5.11-3.84c6.39-3.2,14.06-5.96,23.01-8.31c8.95-2.34,18.43-3.52,28.44-3.52c21.73,0,37.66,4.95,47.78,14.86c10.12,9.91,15.18,24.88,15.18,44.91V223.05z M134.36,250.86c5.96,0,12.25-1.12,18.86-3.36c6.6-2.24,12.35-6.12,17.26-11.67c2.98-3.4,5.06-7.3,6.23-11.67c1.17-4.36,1.76-9.64,1.76-15.82v-7.67c-5.33-1.28-10.92-2.29-16.78-3.04c-5.86-0.74-11.56-1.12-17.1-1.12c-12.15,0-21.2,2.45-27.17,7.35c-5.97,4.9-8.95,11.94-8.95,21.09c0,8.53,2.24,14.97,6.71,19.34C119.66,248.68,126.05,250.86,134.36,250.86z M281.07,270.68c-3.2,0-5.54-0.58-7.03-1.76c-1.49-1.17-2.77-3.57-3.84-7.19l-42.83-141.27c-1.07-3.62-1.6-6.07-1.6-7.35c0-2.98,1.49-4.48,4.47-4.48h17.9c3.4,0,5.8,0.59,7.19,1.76c1.38,1.17,2.61,3.57,3.67,7.19L289.7,238.4l28.44-120.82c0.85-3.62,2.02-6.02,3.52-7.19c1.49-1.17,3.94-1.76,7.35-1.76h14.7c3.41,0,5.86,0.59,7.35,1.76c1.49,1.17,2.66,3.57,3.52,7.19l28.77,122.41l31.64-122.41c1.06-3.62,2.29-6.02,3.68-7.19c1.38-1.17,3.78-1.76,7.19-1.76h16.94c2.98,0,4.48,1.49,4.48,4.48c0,0.85-0.11,1.81-0.32,2.88c-0.21,1.07-0.64,2.56-1.28,4.48l-44.11,141.27c-1.07,3.63-2.35,6.02-3.84,7.19c-1.49,1.17-3.83,1.76-7.03,1.76h-15.66c-3.41,0-5.86-0.64-7.35-1.92c-1.49-1.28-2.67-3.73-3.52-7.35l-28.45-117.62L307.6,261.41c-0.85,3.63-2.03,6.07-3.52,7.35c-1.49,1.28-3.95,1.92-7.35,1.92H281.07z M515.67,275.47c-9.59,0-18.97-1.07-28.13-3.2c-9.16-2.13-16.19-4.58-21.09-7.35c-2.99-1.7-4.85-3.4-5.59-5.11c-0.75-1.7-1.12-3.4-1.12-5.11v-9.27c0-3.83,1.38-5.75,4.16-5.75c1.06,0,2.18,0.21,3.36,0.64c1.17,0.43,2.72,1.07,4.64,1.92c6.18,2.77,12.89,4.9,20.14,6.39c7.24,1.49,14.49,2.24,21.73,2.24c11.51,0,20.4-2.02,26.69-6.07c6.28-4.05,9.43-9.8,9.43-17.26c0-5.11-1.65-9.37-4.95-12.78c-3.31-3.41-9.43-6.6-18.38-9.59l-26.53-8.31c-13.42-4.26-23.17-10.44-29.25-18.54c-6.07-8.09-9.11-16.94-9.11-26.53c0-7.67,1.65-14.43,4.95-20.3c3.3-5.86,7.67-10.87,13.1-15.02c5.43-4.15,11.77-7.3,19.02-9.43c7.24-2.13,14.91-3.2,23.01-3.2c4.05,0,8.15,0.27,12.31,0.8c4.16,0.53,8.1,1.23,11.83,2.08c3.73,0.85,7.19,1.81,10.39,2.88c3.2,1.07,5.75,2.13,7.67,3.2c2.56,1.49,4.36,2.99,5.43,4.48c1.06,1.49,1.6,3.52,1.6,6.07v8.63c0,3.84-1.39,5.75-4.16,5.75c-1.49,0-3.83-0.74-7.03-2.24c-10.44-4.68-22.16-7.03-35.16-7.03c-10.44,0-18.54,1.71-24.29,5.11c-5.75,3.41-8.63,8.84-8.63,16.3c0,5.11,1.81,9.43,5.43,12.94c3.62,3.52,10.33,6.87,20.14,10.07l25.89,8.31c13.21,4.26,22.64,10.12,28.29,17.58c5.64,7.46,8.47,15.98,8.47,25.57c0,7.89-1.6,14.97-4.79,21.26c-3.2,6.29-7.62,11.67-13.26,16.14c-5.65,4.48-12.41,7.89-20.3,10.23C533.67,274.3,525.04,275.47,515.67,275.47z"/>
              <path fill="#FF9900" fillRule="evenodd" clipRule="evenodd" d="M550.21,364.29c-60.13,44.38-147.31,67.98-222.38,67.98c-105.21,0-199.96-38.89-271.65-103.63c-5.63-5.09-0.61-12.03,6.16-8.09c77.35,45.01,173.01,72.12,271.81,72.12c66.65,0,139.91-13.83,207.33-42.43C551.64,345.93,560.16,356.94,550.21,364.29z"/>
              <path fill="#FF9900" fillRule="evenodd" clipRule="evenodd" d="M575.24,335.72c-7.69-9.85-50.84-4.67-70.23-2.34c-5.87,0.7-6.78-4.43-1.49-8.14c34.42-24.18,90.82-17.2,97.38-9.1c6.6,8.16-1.74,64.71-33.99,91.7c-4.96,4.15-9.68,1.93-7.48-3.54C566.69,386.16,582.94,345.57,575.24,335.72z"/>
            </svg>
            <span>AWS LaunchPad</span>
          </div>
          <h2>{t('login.title')}</h2>
          {renderForm()}
          {error && <p className="login__error">{error}</p>}
        </div>
      </div>
      <div className="login__hero">
        <div className="login__hero-content">
          <h1 className="login__hero-title">{t('login.heroTitle')}</h1>
          <p className="login__hero-desc">{t('login.heroDesc')}</p>
          <div className="login__categories">
            {CATEGORIES.map(c => (
              <div key={c.key} className="login__cat">
                <div className="login__cat-icon">{ICONS[c.icon]}</div>
                <span>{t(c.key)}</span>
              </div>
            ))}
          </div>
          <div className="login__hero-footer">Powered by Amazon Bedrock AgentCore</div>
        </div>
      </div>
    </div>
  );
}
