import { t } from '../i18n';
import './Header.css';

export default function Header({ onLogout, userEmail }) {
  return (
    <header className="header">
      <img
        className="header__logo"
        src="https://a0.awsstatic.com/libra-css/images/logos/aws_smile-header-desktop-en-white_59x35.png"
        alt="AWS"
      />
      <div>
        <h1 className="header__title">{t('header.title')}</h1>
        <p className="header__subtitle">{t('header.subtitle')}</p>
      </div>
      {onLogout && (
        <div className="header__user">
          <span className="header__email">{userEmail}</span>
          <button className="header__logout" onClick={onLogout}>{t('login.logout')}</button>
        </div>
      )}
    </header>
  );
}
