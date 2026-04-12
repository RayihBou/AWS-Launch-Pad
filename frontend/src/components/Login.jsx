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
            <img src="https://a0.awsstatic.com/libra-css/images/logos/aws_smile-header-desktop-en-white_59x35.png" alt="AWS" />
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
