/**
 * Détection centralisée des erreurs d'authentification / session (A-50).
 *
 * Couvre : 401, JWT expiré (PostgREST PGRST301/302), « not authenticated »,
 * claims invalides, RLS qui refuse faute de session. Permet d'afficher un message
 * actionnable « Session expirée » plutôt que l'erreur technique brute.
 */
export const SESSION_EXPIRED_MESSAGE =
  'Session expirée — reconnectez-vous pour synchroniser.';

export function isAuthError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { status?: number; code?: string; message?: string };

  if (e.status === 401) return true;

  const code = (e.code ?? '').toString().toUpperCase();
  if (code === 'PGRST301' || code === 'PGRST302' || code === '401') return true;

  const msg = (e.message ?? '').toLowerCase();
  return /jwt|token (is )?expired|expired token|not authenticated|unauthor|invalid claim|session.*(expir|invalid)/.test(
    msg
  );
}
