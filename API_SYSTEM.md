# Système d'API Modulaire - Photo Triage AI

## 🎯 **Vue d'ensemble**

L'application utilise maintenant un système d'API modulaire qui permet de choisir entre différentes options d'analyse d'images, de l'analyse locale à des APIs externes avancées.

## 🔧 **APIs Supportées**

### **1. 🏠 Analyse Locale (Par défaut)**
- **Type** : Traitement 100% local
- **Coût** : Gratuit
- **Confidentialité** : 100% - Aucune donnée envoyée
- **Fonctionnalités** :
  - Détection de flou (Laplacian)
  - Hashing perceptuel pour les doublons
  - Analyse des couleurs
  - Détection des yeux ouverts
  - Génération de tags
  - Suggestions de retouche

### **2. 🤗 Hugging Face**
- **Type** : API gratuite
- **Coût** : Gratuit (avec limites)
- **Confidentialité** : Données envoyées à Hugging Face
- **Fonctionnalités** :
  - Classification d'images avancée
  - Détection d'objets
  - Modèles pré-entraînés
  - Pas de clé API requise

### **3. ⚡ Replicate**
- **Type** : API payante
- **Coût** : Payant selon l'utilisation
- **Confidentialité** : Données envoyées à Replicate
- **Fonctionnalités** :
  - Modèles de pointe
  - Haute précision
  - Détection avancée
  - Clé API requise

### **4. 👁️ Clarifai**
- **Type** : API payante spécialisée
- **Coût** : Payant selon l'utilisation
- **Confidentialité** : Données envoyées à Clarifai
- **Fonctionnalités** :
  - Spécialisé en vision par ordinateur
  - Détection de visages
  - Reconnaissance d'objets
  - Clé API requise

## 🚀 **Comment utiliser**

### **Interface utilisateur**
1. Ouvrez l'onglet "Ingestion & Analyse"
2. Cliquez sur "Configurer" dans la section "Configuration de l'analyse"
3. Choisissez votre provider préféré
4. Configurez la clé API si nécessaire
5. Chargez vos photos

### **Programmatiquement**
```typescript
import { setAnalysisProvider } from './services/geminiService';

// Utiliser l'analyse locale
setAnalysisProvider({ provider: 'local' });

// Utiliser Hugging Face
setAnalysisProvider({ 
  provider: 'huggingface',
  apiKey: 'your_api_key_here' // Optionnel
});

// Utiliser Replicate
setAnalysisProvider({ 
  provider: 'replicate',
  apiKey: 'your_api_key_here'
});
```

## 🔄 **Système de Fallback**

L'application utilise un système de fallback intelligent :

1. **Tentative avec l'API choisie**
2. **En cas d'erreur** → Fallback automatique vers l'analyse locale
3. **Logs détaillés** pour le débogage

## 📊 **Comparaison des APIs**

| Fonctionnalité | Local | Hugging Face | Replicate | Clarifai |
|----------------|-------|--------------|-----------|----------|
| **Coût** | Gratuit | Gratuit | Payant | Payant |
| **Confidentialité** | 100% | Partielle | Partielle | Partielle |
| **Hors ligne** | ✅ | ❌ | ❌ | ❌ |
| **Détection de flou** | ✅ | ❌ | ✅ | ✅ |
| **Classification** | Basique | Avancée | Avancée | Avancée |
| **Détection d'objets** | ❌ | ✅ | ✅ | ✅ |
| **Détection de visages** | Basique | ✅ | ✅ | ✅ |
| **Latence** | Instantané | Réseau | Réseau | Réseau |

## 🛠️ **Configuration**

### **Variables d'environnement**
```env
# Hugging Face (optionnel)
HUGGINGFACE_API_KEY=your_key_here

# Replicate (requis pour Replicate)
REPLICATE_API_KEY=your_key_here

# Clarifai (requis pour Clarifai)
CLARIFAI_API_KEY=your_key_here
```

### **Configuration par défaut**
```typescript
const defaultConfig = {
  provider: 'local', // Analyse locale par défaut
  apiKey: undefined,
  model: undefined
};
```

## 🔧 **Ajout d'une nouvelle API**

Pour ajouter une nouvelle API, suivez ces étapes :

1. **Ajouter le type dans `AnalysisProvider`** :
```typescript
export type AnalysisProvider = 'local' | 'huggingface' | 'replicate' | 'clarifai' | 'nouvelle_api';
```

2. **Implémenter la fonction d'analyse** :
```typescript
async function analyzeWithNouvelleAPI(files: File[]): Promise<PhotoAnalysis[]> {
  // Implémentation de l'API
}
```

3. **Ajouter le cas dans le switch** :
```typescript
case 'nouvelle_api':
  return await analyzeWithNouvelleAPI(files);
```

4. **Mettre à jour l'interface utilisateur** dans `ApiSelector.tsx`

## 🐛 **Dépannage**

### **Erreur de clé API**
- Vérifiez que la clé API est correcte
- Vérifiez que la clé a les bonnes permissions
- Consultez les logs de la console

### **Fallback vers l'analyse locale**
- Normal en cas d'erreur API
- Vérifiez votre connexion internet
- Vérifiez les quotas API

### **Performance lente**
- Utilisez l'analyse locale pour de meilleures performances
- Réduisez la taille des images
- Vérifiez la latence réseau

## 📈 **Métriques et monitoring**

L'application enregistre automatiquement :
- Provider utilisé
- Temps d'analyse
- Erreurs rencontrées
- Fallbacks effectués

Consultez la console du navigateur pour les logs détaillés.

## 🔮 **Améliorations futures**

- [ ] Support de plus d'APIs (OpenAI Vision, Azure Computer Vision)
- [ ] Cache intelligent des résultats
- [ ] Analyse hybride (local + API)
- [ ] Métriques de performance en temps réel
- [ ] Configuration avancée des modèles
- [ ] Support des formats d'image spécialisés

Le système est conçu pour être extensible et facilement configurable selon vos besoins !
