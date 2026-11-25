import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { setSyncSession } from './syncServices.js';

/**
 * Starts the background sync for capture roles. It renders nothing and wraps
 * nothing, so App.jsx only needs one added line (constitution §2). Components
 * read the state with useSyncStatus().
 */
export function OfflineSyncProvider() {
  const { user, canCapture } = useAuth();
  const email = user?.email;
  const token = user?.token;

  useEffect(() => {
    // Logout or a role without capture stops sending (no session, no token).
    setSyncSession(canCapture && email && token ? { authorEmail: email, token } : null);
  }, [canCapture, email, token]);

  return null;
}
