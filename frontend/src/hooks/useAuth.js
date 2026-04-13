// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { useState, useEffect, useCallback } from 'react';
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';
import { config } from '../config';

const userPool = config.userPoolId ? new CognitoUserPool({
  UserPoolId: config.userPoolId,
  ClientId: config.userPoolClientId,
}) : null;

function extractUser(session, fallback) {
  const payload = session.getIdToken().decodePayload();
  const email = payload.email || fallback;
  return { email: email.split('@')[0] };
}

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newPasswordRequired, setNewPasswordRequired] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [cognitoUser, setCognitoUser] = useState(null);

  useEffect(() => {
    if (!userPool) { setLoading(false); return; }
    const currentUser = userPool.getCurrentUser();
    if (currentUser) {
      currentUser.getSession((err, session) => {
        if (session?.isValid()) setUser(extractUser(session, currentUser.getUsername()));
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const handleSuccess = useCallback((session, email) => {
    setUser(extractUser(session, email));
    setNewPasswordRequired(false);
    setMfaRequired(false);
    setMfaSetupRequired(false);
  }, []);

  const handleMfaSetup = useCallback((authUser) => {
    authUser.associateSoftwareToken({
      associateSecretCode: (secret) => {
        setCognitoUser(authUser);
        setTotpSecret(secret);
        setMfaSetupRequired(true);
      },
      onFailure: (err) => setError(err.message || 'MFA setup failed'),
    });
  }, []);

  const login = useCallback((email, password) => {
    setError('');
    const authUser = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    authUser.authenticateUser(authDetails, {
      onSuccess: (session) => handleSuccess(session, email),
      onFailure: (err) => setError(err.message || 'Login failed'),
      newPasswordRequired: () => {
        setCognitoUser(authUser);
        setNewPasswordRequired(true);
      },
      totpRequired: () => {
        setCognitoUser(authUser);
        setMfaRequired(true);
      },
      mfaSetup: () => handleMfaSetup(authUser),
    });
  }, [handleSuccess, handleMfaSetup]);

  const completeNewPassword = useCallback((newPassword) => {
    if (!cognitoUser) return;
    setError('');
    cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
      onSuccess: (session) => handleSuccess(session, cognitoUser.getUsername()),
      onFailure: (err) => setError(err.message || 'Password change failed'),
      totpRequired: () => setMfaRequired(true),
      mfaSetup: () => handleMfaSetup(cognitoUser),
    });
  }, [cognitoUser, handleSuccess, handleMfaSetup]);

  const verifyTotp = useCallback((code) => {
    if (!cognitoUser) return;
    setError('');
    if (mfaSetupRequired) {
      // First time: verify and set as preferred
      cognitoUser.verifySoftwareToken(code, 'TOTP', {
        onSuccess: () => {
          cognitoUser.setUserMfaPreference(null, { PreferredMfa: true, Enabled: true }, (err) => {
            if (err) { setError(err.message); return; }
            // Re-authenticate after MFA setup
            setMfaSetupRequired(false);
            setError('MFA configurado. Inicia sesion nuevamente.');
          });
        },
        onFailure: (err) => setError(err.message || 'Invalid code'),
      });
    } else {
      // Subsequent logins: verify TOTP challenge
      cognitoUser.sendMFACode(code, {
        onSuccess: (session) => handleSuccess(session, cognitoUser.getUsername()),
        onFailure: (err) => setError(err.message || 'Invalid code'),
      }, 'SOFTWARE_TOKEN_MFA');
    }
  }, [cognitoUser, mfaSetupRequired, handleSuccess]);

  const logout = useCallback(() => {
    const currentUser = userPool?.getCurrentUser();
    if (currentUser) currentUser.signOut();
    setUser(null);
  }, []);

  return { user, loading, error, login, logout, newPasswordRequired, completeNewPassword, mfaRequired, mfaSetupRequired, totpSecret, verifyTotp };
}
