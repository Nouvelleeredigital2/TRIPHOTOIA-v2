# Configuration de l'Application Photo Triage AI

## 🔑 Configuration de la clé API Gemini

### Étape 1 : Obtenir une clé API Gemini

1. Allez sur [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Connectez-vous avec votre compte Google
3. Cliquez sur "Create API Key"
4. Copiez la clé API générée

### Étape 2 : Configurer la clé API

Créez un fichier `.env` à la racine du projet avec le contenu suivant :

```env
GEMINI_API_KEY=votre_cle_api_ici
```

Remplacez `votre_cle_api_ici` par votre vraie clé API.

### Étape 3 : Redémarrer le serveur

Après avoir créé le fichier `.env`, redémarrez le serveur de développement :

```bash
cmd /c "npm run dev"
```

## 🚀 Mode de développement sans API

Si vous ne souhaitez pas configurer l'API Gemini immédiatement, l'application fonctionnera en mode simulation :

- ✅ L'interface utilisateur fonctionne normalement
- ✅ Vous pouvez charger et organiser des photos
- ✅ L'analyse des photos est simulée avec des données aléatoires
- ✅ Toutes les fonctionnalités de triage sont disponibles

## 📝 Notes importantes

- Le fichier `.env` ne doit pas être commité dans Git (il est déjà dans `.gitignore`)
- La clé API Gemini est gratuite avec des limites généreuses
- En mode simulation, les analyses sont cohérentes pour la même photo (basées sur le nom et la taille du fichier)

## 🔧 Dépannage

Si vous rencontrez des erreurs :

1. Vérifiez que le fichier `.env` est bien créé à la racine du projet
2. Vérifiez que la clé API est correcte
3. Redémarrez le serveur après modification du fichier `.env`
4. Consultez la console du navigateur pour les messages d'erreur
