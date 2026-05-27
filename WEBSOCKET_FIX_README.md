# Configuration pour résoudre les erreurs WebSocket

## Problème
L'erreur "WebSocket connection to 'ws://localhost:3000/' failed" peut être causée par :
1. Le navigateur qui essaie de se connecter au serveur pour Hot Module Replacement (HMR)
2. Des extensions de navigateur qui interfèrent
3. Des problèmes de réseau ou de pare-feu

## Solutions appliquées

### 1. Configuration Vite (vite.config.ts)
- HMR désactivé (`hmr: false`)
- Surveillance par polling activée (`usePolling: true`)
- Configuration explicite du host et port

### 2. Instructions pour l'utilisateur

#### Si vous voyez encore des erreurs WebSocket :

1. **Redémarrer le navigateur** :
   - Fermez complètement toutes les fenêtres du navigateur
   - Redémarrez le navigateur
   - Ouvrez http://localhost:3000/

2. **Désactiver les extensions** :
   - Ouvrez le navigateur en mode incognito/privé
   - Ou désactivez temporairement les extensions de développement

3. **Vérifier le pare-feu** :
   - Assurez-vous que le port 3000 n'est pas bloqué
   - Vérifiez que les connexions WebSocket sont autorisées

4. **Utiliser un autre navigateur** :
   - Testez avec Chrome, Firefox, Edge, etc.

5. **Redémarrer le serveur** :
   ```bash
   # Arrêter le serveur
   Ctrl+C (dans le terminal)

   # Redémarrer
   npm run dev
   ```

### 3. Test de la connexion
- Ouvrez http://localhost:3000/
- Vérifiez qu'il n'y a plus d'erreurs WebSocket dans la console
- L'application devrait fonctionner normalement sans HMR

### 4. Avantages de la configuration actuelle
- Plus stable (pas de dépendance aux connexions WebSocket)
- Compatible avec tous les environnements réseau
- Moins de problèmes avec les extensions de navigateur
- Surveillance des fichiers toujours active via polling
