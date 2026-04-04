import { useState } from 'react';
import { t } from '../i18n';
import './Login.css';

export default function Login({ onLogin, onCompleteNewPassword, error, newPasswordRequired }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  const handleNewPassword = (e) => {
    e.preventDefault();
    onCompleteNewPassword(newPassword);
  };

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <img
            src="https://a0.awsstatic.com/libra-css/images/logos/aws_smile-header-desktop-en-white_59x35.png"
            alt="AWS"
          />
          <h1>{t('header.title')}</h1>
        </div>

        {newPasswordRequired ? (
          <form onSubmit={handleNewPassword}>
            <p className="login__message">{t('login.newPasswordMessage')}</p>
            <input
              type="password"
              placeholder={t('login.newPassword')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <button type="submit">{t('login.changePassword')}</button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder={t('login.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder={t('login.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">{t('login.submit')}</button>
          </form>
        )}

        {error && <p className="login__error">{error}</p>}
      </div>
    </div>
  );
}
