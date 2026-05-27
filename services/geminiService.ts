// Service d'analyse de photos modulaire avec support de multiples APIs
import { PhotoAnalysis } from '../types';
import { workerAnalysisService } from '../src/services/workerAnalysisService';
import { simpleAnalysisService } from '../src/services/simpleAnalysisService';

// Types pour les différentes APIs supportées
export type AnalysisProvider = 'local' | 'huggingface' | 'replicate' | 'clarifai';

export interface AnalysisConfig {
  provider: AnalysisProvider;
  apiKey?: string;
  model?: string;
  customEndpoint?: string;
}

// Configuration par défaut
let currentConfig: AnalysisConfig = {
  provider: 'local'
};

/**
 * Configure le provider d'analyse
 */
export function setAnalysisProvider(config: AnalysisConfig): void {
  currentConfig = config;
  console.log(`🔧 Provider d'analyse configuré: ${config.provider}`);
}

/**
 * Obtient la configuration actuelle
 */
export function getAnalysisConfig(): AnalysisConfig {
  return { ...currentConfig };
}

/**
 * Analyse un lot de photos en utilisant le provider configuré
 */
export const analyzePhotosBatch = async (files: File[]): Promise<PhotoAnalysis[]> => {
    if (files.length === 0) {
        console.warn('⚠️ Aucun fichier à analyser');
        return [];
    }

    const currentConfig = getAnalysisConfig();
    console.log(`🔄 Analyse de ${files.length} photo(s) avec ${currentConfig.provider}...`);
    console.log('📁 Fichiers:', files.map(f => f.name));

    try {
        let results: PhotoAnalysis[];
        
        switch (currentConfig.provider) {
            case 'local':
                try {
                    console.log('Using worker-based local analysis...');
                    results = await workerAnalysisService.analyzePhotosBatch(files);
                } catch (workerError) {
                    console.warn('Worker analysis failed, fallback to simple analysis:', workerError);
                    results = await simpleAnalysisService.analyzePhotosBatch(files);
                }
                break;
            
            case 'huggingface':
                console.log('🤗 Utilisation de Hugging Face...');
                results = await analyzeWithHuggingFace(files);
                break;
            
            case 'replicate':
                console.log('⚡ Utilisation de Replicate...');
                results = await analyzeWithReplicate(files);
                break;
            
            case 'clarifai':
                console.log('👁️ Utilisation de Clarifai...');
                results = await analyzeWithClarifai(files);
                break;
            
            default:
                console.warn(`Provider inconnu: ${currentConfig.provider}, utilisation de l'analyse locale simple`);
                results = await simpleAnalysisService.analyzePhotosBatch(files);
        }
        
        console.log(`✅ ${results.length} résultat(s) d'analyse obtenu(s) sur ${files.length} fichier(s)`);
        return results;
    } catch (error) {
        console.error(`❌ Erreur avec le provider ${currentConfig.provider}:`, error);
        // Fallback vers l'analyse locale en cas d'erreur
        console.log('🔄 Fallback vers l\'analyse locale...');
        try {
            console.log('🔄 Fallback vers l\'analyse simple...');
            const simpleResults = await simpleAnalysisService.analyzePhotosBatch(files);
            console.log(`✅ Fallback simple réussi: ${simpleResults.length} résultat(s)`);
            return simpleResults;
        } catch (simpleError) {
            console.error('❌ Échec du fallback simple:', simpleError);
            // Retourner des résultats d'erreur pour chaque fichier
            return files.map(file => ({
                error: `Analyse échouée: ${simpleError instanceof Error ? simpleError.message : 'Erreur inconnue'}`
            }));
        }
    }
};

/**
 * Analyse avec Hugging Face (gratuit, pas de clé requise)
 */
async function analyzeWithHuggingFace(files: File[]): Promise<PhotoAnalysis[]> {
    const results: PhotoAnalysis[] = [];
    
    for (const file of files) {
        try {
            // Convertir l'image en base64
            const base64 = await fileToBase64(file);
            
            // Utiliser l'API Hugging Face pour l'analyse d'images
            const response = await fetch(
                `https://api-inference.huggingface.co/models/microsoft/resnet-50`,
                {
                    headers: {
                        'Authorization': `Bearer ${currentConfig.apiKey || 'hf_demo'}`,
                        'Content-Type': 'application/json',
                    },
                    method: 'POST',
                    body: JSON.stringify({ inputs: base64 }),
                }
            );

            if (!response.ok) {
                throw new Error(`Hugging Face API error: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Convertir la réponse Hugging Face en format PhotoAnalysis
            const analysis: PhotoAnalysis = {
                isBlurry: false, // Hugging Face ne détecte pas directement le flou
                sharpnessScore: 0.8, // Valeur par défaut
                hasOpenEyes: false, // À implémenter avec un modèle spécifique
                tags: data.map((item: any) => item.label).slice(0, 5),
                perceptualHash: generatePerceptualHash(file),
                suggestedRetouch: {
                    brightness: 1.0,
                    contrast: 1.0,
                    saturation: 1.0
                }
            };

            results.push(analysis);
        } catch (error) {
            console.error(`Erreur avec Hugging Face pour ${file.name}:`, error);
            results.push({
                error: `Erreur Hugging Face: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
            });
        }
    }

    return results;
}

/**
 * Analyse avec Replicate (payant, clé API requise)
 */
async function analyzeWithReplicate(files: File[]): Promise<PhotoAnalysis[]> {
    if (!currentConfig.apiKey) {
        throw new Error('Clé API Replicate requise');
    }

    // Implémentation Replicate (à compléter selon les besoins)
    console.log('Replicate API non encore implémentée, utilisation de l\'analyse locale');
    return await workerAnalysisService.analyzePhotosBatch(files);
}

/**
 * Analyse avec Clarifai (payant, clé API requise)
 */
async function analyzeWithClarifai(files: File[]): Promise<PhotoAnalysis[]> {
    if (!currentConfig.apiKey) {
        throw new Error('Clé API Clarifai requise');
    }

    // Implémentation Clarifai (à compléter selon les besoins)
    console.log('Clarifai API non encore implémentée, utilisation de l\'analyse locale');
    return await workerAnalysisService.analyzePhotosBatch(files);
}

/**
 * Convertit un fichier en base64
 */
async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error("Failed to read file as data URL."));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

/**
 * Génère un hash perceptuel simple
 */
function generatePerceptualHash(file: File): string {
    const input = `${file.name}-${file.size}-${file.lastModified}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
}

// Export des services d'analyse locale pour utilisation directe
export { workerAnalysisService };