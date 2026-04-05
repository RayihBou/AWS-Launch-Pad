import { useState } from 'react';
import { t } from '../i18n';
import './Login.css';

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
          <input type="text" placeholder="Codigo de 6 digitos" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" />
          <button type="submit">Verificar</button>
        </form>
      );
    }
    if (mfaRequired) {
      return (
        <form onSubmit={handleTotp}>
          <p className="login__message">Ingresa el codigo de tu app authenticator</p>
          <input type="text" placeholder="Codigo de 6 digitos" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" />
          <button type="submit">Verificar</button>
        </form>
      );
    }
    if (newPasswordRequired) {
      return (
        <form onSubmit={handleNewPassword}>
          <p className="login__message">{t('login.newPasswordMessage')}</p>
          <input type="password" placeholder={t('login.newPassword')} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          <button type="submit">{t('login.changePassword')}</button>
        </form>
      );
    }
    return (
      <form onSubmit={handleLogin}>
        <input type="email" placeholder={t('login.email')} value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder={t('login.password')} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit">{t('login.submit')}</button>
      </form>
    );
  };

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <img src="https://a0.awsstatic.com/libra-css/images/logos/aws_smile-header-desktop-en-white_59x35.png" alt="AWS" />
          <h1>{t('header.title')}</h1>
        </div>
        {renderForm()}
        {error && <p className="login__error">{error}</p>}
      </div>
    </div>
  );
}
