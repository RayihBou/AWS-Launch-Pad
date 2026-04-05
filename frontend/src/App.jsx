import useAuth from './hooks/useAuth';
import Header from './components/Header';
import Chat from './components/Chat';
import Login from './components/Login';
import './App.css';

export default function App() {
  const { user, loading, error, login, logout, newPasswordRequired, completeNewPassword, mfaRequired, mfaSetupRequired, totpSecret, verifyTotp } = useAuth();

  if (loading) return null;

  if (!user) {
    return (
      <Login
        onLogin={login}
        onCompleteNewPassword={completeNewPassword}
        onVerifyTotp={verifyTotp}
        error={error}
        newPasswordRequired={newPasswordRequired}
        mfaRequired={mfaRequired}
        mfaSetupRequired={mfaSetupRequired}
        totpSecret={totpSecret}
      />
    );
  }

  return (
    <div className="app">
      <Header onLogout={logout} userEmail={user.email} />
      <Chat />
    </div>
  );
}
