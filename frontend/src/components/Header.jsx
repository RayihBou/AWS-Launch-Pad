import './Header.css';

export default function Header() {
  return (
    <header className="header">
      <img
        className="header__logo"
        src="https://a0.awsstatic.com/libra-css/images/logos/aws_smile-header-desktop-en-white_59x35.png"
        alt="AWS"
      />
      <div>
        <h1 className="header__title">AWS LaunchPad</h1>
        <p className="header__subtitle">AI-Powered Cloud Assistant</p>
      </div>
    </header>
  );
}
