import { useState, useEffect, useCallback } from 'react';
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';
import { config } from '../config';

const userPool = config.userPoolId ? new CognitoUserPool({
  UserPoolId: config.userPoolId,
  ClientId: config.userPoolClientId,
}) : null;

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newPasswordRequired, setNewPasswordRequired] = useState(false);
  const [cognitoUser, setCognitoUser] = useState(null);

  useEffect(() => {
    if (!userPool) { setLoading(false); return; }
    const currentUser = userPool.getCurrentUser();
    if (currentUser) {
      currentUser.getSession((err, session) => {
        if (session?.isValid()) {
          const payload = session.getIdToken().decodePayload();
          const email = payload.email || currentUser.getUsername();
          setUser({ email: email.split('@')[0] });
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback((email, password) => {
    setError('');
    const authUser = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    authUser.authenticateUser(authDetails, {
      onSuccess: (session) => {
        const payload = session.getIdToken().decodePayload();
        const em = payload.email || email;
        setUser({ email: em.split('@')[0] });
        setNewPasswordRequired(false);
      },
      onFailure: (err) => setError(err.message || 'Login failed'),
      newPasswordRequired: () => {
        setCognitoUser(authUser);
        setNewPasswordRequired(true);
      },
    });
  }, []);

  const completeNewPassword = useCallback((newPassword) => {
    if (!cognitoUser) return;
    setError('');
    cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
      onSuccess: (session) => {
        const payload = session.getIdToken().decodePayload();
        const em = payload.email || cognitoUser.getUsername();
        setUser({ email: em.split('@')[0] });
        setNewPasswordRequired(false);
      },
      onFailure: (err) => setError(err.message || 'Password change failed'),
    });
  }, [cognitoUser]);

  const logout = useCallback(() => {
    const currentUser = userPool?.getCurrentUser();
    if (currentUser) currentUser.signOut();
    setUser(null);
  }, []);

  return { user, loading, error, login, logout, newPasswordRequired, completeNewPassword };
}
