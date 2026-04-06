import { t } from '../i18n';
import './Header.css';

export default function Header({ onLogout, userEmail, onNewConversation, onExport }) {
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
          <button className="header__new-chat" onClick={onNewConversation} title={t('header.newConversation')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button className="header__new-chat" onClick={onExport} title={t('header.export')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button className="header__logout" onClick={onLogout}>{t('login.logout')}</button>
        </div>
      )}
    </header>
  );
}
