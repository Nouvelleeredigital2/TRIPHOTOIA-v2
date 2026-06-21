import { useState, useMemo } from 'react';
import { usePhotoStore } from '../store/photoStore';
import { Photo } from '../types';

export function DuplicateTest() {
  const [testResults, setTestResults] = useState<string[]>([]);

  // Utiliser des sélecteurs optimisés pour éviter les boucles infinies
  const collections = usePhotoStore((state) => state.collections);
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);
  const allPhotos = usePhotoStore((state) => state.photos);

  // Calculer les valeurs dérivées avec useMemo
  const activeCollection = useMemo(
    () => collections[activeCollectionId],
    [collections, activeCollectionId]
  );

  const activePhotos = useMemo(() => {
    if (!activeCollection) {
      return allPhotos;
    }
    const photoMap = new Map(allPhotos.map((photo) => [photo.id, photo]));
    return activeCollection.photoIds
      .map((id) => photoMap.get(id))
      .filter((photo): photo is Photo => Boolean(photo));
  }, [activeCollection, allPhotos]);

  const testDuplicates = () => {
    const results: string[] = [];

    // Vérifier les photos analysées
    const analyzedPhotos = activePhotos.filter(
      (photo) => photo.analysis && !photo.analysis.error
    );

    results.push(`📊 Total photos: ${activePhotos.length}`);
    results.push(`✅ Photos analysées: ${analyzedPhotos.length}`);
    results.push(
      `❌ Photos non analysées: ${activePhotos.length - analyzedPhotos.length}`
    );

    // Vérifier les hashes perceptuels
    const photosWithHashes = analyzedPhotos.filter(
      (photo) => photo.analysis?.perceptualHash
    );
    results.push(`🔍 Photos avec hash perceptuel: ${photosWithHashes.length}`);

    // Grouper par hash
    const hashGroups = new Map<string, Photo[]>();
    photosWithHashes.forEach((photo) => {
      if (photo.analysis?.perceptualHash) {
        const hash = photo.analysis.perceptualHash;
        if (!hashGroups.has(hash)) {
          hashGroups.set(hash, []);
        }
        hashGroups.get(hash)!.push(photo);
      }
    });

    // Compter les groupes de doublons
    const duplicateGroups = Array.from(hashGroups.values()).filter(
      (group) => group.length > 1
    );
    results.push(`🔍 Groupes de doublons détectés: ${duplicateGroups.length}`);

    // Afficher les détails des groupes
    duplicateGroups.forEach((group, index) => {
      results.push(
        `  Groupe ${index + 1}: ${group.length} photos avec hash ${group[0].analysis?.perceptualHash?.substring(0, 8)}...`
      );
      group.forEach((photo) => {
        results.push(
          `    - ${photo.file.name} (${photo.analysis?.perceptualHash})`
        );
      });
    });

    // Photos sans hash
    const photosWithoutHashes = analyzedPhotos.filter(
      (photo) => !photo.analysis?.perceptualHash
    );
    if (photosWithoutHashes.length > 0) {
      results.push(
        `⚠️ Photos analysées sans hash perceptuel: ${photosWithoutHashes.length}`
      );
      photosWithoutHashes.slice(0, 5).forEach((photo) => {
        results.push(`  - ${photo.file.name}`);
      });
    }

    setTestResults(results);
  };

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">Test de Détection de Doublons</h3>

      <button
        onClick={testDuplicates}
        className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
      >
        🔍 Tester la Détection
      </button>

      {testResults.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Résultats du Test:</h4>
          <div className="space-y-1 rounded bg-gray-100 p-3 text-sm">
            {testResults.map((result, index) => (
              <div key={index} className="font-mono">
                {result}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
