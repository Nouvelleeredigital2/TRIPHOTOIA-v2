import React, { useState, useMemo } from 'react';
import { Photo, DuplicateGroup } from '../types';
import { DownloadIcon } from './IconComponents';

// JSZip is loaded from a script tag in index.html, we need to declare it for TypeScript
declare var JSZip: any;

interface ExportTabProps {
    photos: Photo[];
    duplicateGroups: DuplicateGroup[];
    bestPhotoOverrides: Record<string, string>;
    rejectedPhotoIds: Set<string>;
}

const getFormattedDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
};

const formatFilename = (pattern: string, photo: Photo, index: number, total: number) => {
    const originalFilename = photo.file.name;
    const lastDot = originalFilename.lastIndexOf('.');
    const originalFilenameNoExt = lastDot > -1 ? originalFilename.substring(0, lastDot) : originalFilename;
    const ext = lastDot > -1 ? originalFilename.substring(lastDot + 1) : '';

    return pattern
        .replace(/\{index\}/g, String(index + 1).padStart(String(total).length, '0'))
        .replace(/\{YYYYMMDD\}/g, getFormattedDate())
        .replace(/\{original_filename\}/g, originalFilename)
        .replace(/\{original_filename_no_ext\}/g, originalFilenameNoExt)
        .replace(/\{ext\}/g, ext);
};


export const ExportTab: React.FC<ExportTabProps> = ({ photos, duplicateGroups, bestPhotoOverrides, rejectedPhotoIds }) => {
    const [exportSettings, setExportSettings] = useState({
        includeRejected: false,
        filenamePattern: '{original_filename}',
    });
    const [isZipping, setIsZipping] = useState(false);
    const [zipProgress, setZipProgress] = useState(0);

    const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setExportSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };
    
    const analyzedPhotos = useMemo(() => photos.filter(p => p.analysis && !p.analysis.error), [photos]);

    const { photosToExport, keptPhotos, rejectedPhotos } = useMemo(() => {
        const photoMap = new Map(analyzedPhotos.map(p => [p.id, p]));
        
        const keptIds = new Set<string>();
        const photoIdsInGroups = new Set<string>();

        // 1. Get best photos from duplicate groups
        duplicateGroups.forEach(group => {
            group.photos.forEach(p => photoIdsInGroups.add(p.id));
            const bestId = bestPhotoOverrides[group.id] || group.bestPhotoId;
            if (photoMap.has(bestId)) {
                keptIds.add(bestId);
            }
        });

        // 2. Get unique photos
        analyzedPhotos.forEach(p => {
            if (!photoIdsInGroups.has(p.id)) {
                keptIds.add(p.id);
            }
        });

        // 3. Filter out rejected photos from kept list
        const finalKeptIds = new Set<string>();
        keptIds.forEach(id => {
            if (!rejectedPhotoIds.has(id)) {
                finalKeptIds.add(id);
            }
        });

        const keptPhotos = Array.from(finalKeptIds).map(id => photoMap.get(id)!).filter(Boolean);
        const rejectedPhotos = Array.from(rejectedPhotoIds).map(id => photoMap.get(id)!).filter(Boolean);

        const photosToExport = exportSettings.includeRejected 
            ? [...keptPhotos, ...rejectedPhotos]
            : keptPhotos;

        return { photosToExport, keptPhotos, rejectedPhotos };

    }, [analyzedPhotos, duplicateGroups, bestPhotoOverrides, rejectedPhotoIds, exportSettings.includeRejected]);


    const handleDownload = async () => {
        if (!photosToExport.length || isZipping) return;
        
        setIsZipping(true);
        setZipProgress(0);

        try {
            const zip = new JSZip();
            const totalFiles = photosToExport.length;
            
            for (let i = 0; i < totalFiles; i++) {
                const photo = photosToExport[i];
                const newFilename = formatFilename(exportSettings.filenamePattern, photo, i, totalFiles);
                zip.file(newFilename, photo.file);
                setZipProgress(Math.round(((i + 1) / totalFiles) * 100));
                // Yield to the event loop to allow UI updates
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(content);
            link.download = `photo-triage-export-${getFormattedDate()}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

        } catch (error) {
            console.error("Error creating zip file:", error);
            alert("Une erreur est survenue lors de la création du fichier ZIP.");
        } finally {
            setIsZipping(false);
        }
    };
    
    if (analyzedPhotos.length === 0) {
         return (
            <div className="text-center py-16">
                <h2 className="text-2xl font-bold text-white">Aucune photo analysée</h2>
                <p className="text-slate-400 mt-2">Ajoutez et analysez des photos dans le premier onglet pour pouvoir les exporter.</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold text-white">Exporter les Photos</h2>
            
            <div className="bg-slate-800/50 p-6 rounded-xl space-y-4">
                <h3 className="text-lg font-semibold text-slate-200">Résumé de l'exportation</h3>
                <div className="flex justify-between items-center text-slate-300">
                    <span>Photos à conserver (meilleures des doublons + uniques)</span>
                    <span className="font-bold text-white text-lg">{keptPhotos.length}</span>
                </div>
                 <div className="flex justify-between items-center text-slate-300">
                    <span>Photos rejetées</span>
                    <span className="font-bold text-white text-lg">{rejectedPhotos.length}</span>
                </div>
                <hr className="border-slate-700"/>
                 <div className="flex justify-between items-center text-white font-semibold">
                    <span>Total à exporter</span>
                    <span className="font-bold text-cyan-400 text-xl">{photosToExport.length}</span>
                </div>
            </div>

            <div className="bg-slate-800/50 p-6 rounded-xl space-y-6">
                 <h3 className="text-lg font-semibold text-slate-200">Options d'exportation</h3>
                 <div>
                     <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            name="includeRejected"
                            checked={exportSettings.includeRejected}
                            onChange={handleSettingsChange}
                            className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
                        />
                        <span className="text-slate-300">Inclure les photos rejetées dans le fichier ZIP</span>
                     </label>
                 </div>
                 <div>
                     <label htmlFor="filenamePattern" className="block text-sm font-medium text-slate-300 mb-2">Modèle de renommage des fichiers</label>
                     <input
                        type="text"
                        id="filenamePattern"
                        name="filenamePattern"
                        value={exportSettings.filenamePattern}
                        onChange={handleSettingsChange}
                        className="w-full bg-slate-700 text-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 border border-slate-600"
                     />
                     <p className="text-xs text-slate-500 mt-2">
                        Placeholders: <code className="bg-slate-900 px-1 rounded">{'{original_filename}'}</code>, <code className="bg-slate-900 px-1 rounded">{'{index}'}</code>, <code className="bg-slate-900 px-1 rounded">{'{YYYYMMDD}'}</code>, <code className="bg-slate-900 px-1 rounded">{'{original_filename_no_ext}'}</code>, <code className="bg-slate-900 px-1 rounded">{'{ext}'}</code>
                     </p>
                 </div>
            </div>

            <div>
                 <button
                    onClick={handleDownload}
                    disabled={isZipping || photosToExport.length === 0}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                 >
                    {isZipping ? (
                        <>
                            <div className="w-5 h-5 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div>
                            <span>Préparation du ZIP... ({zipProgress}%)</span>
                        </>
                    ) : (
                        <>
                            <DownloadIcon />
                            <span>Télécharger {photosToExport.length} Fichier(s)</span>
                        </>
                    )}
                 </button>
                 {photosToExport.length === 0 && (
                    <p className="text-center text-sm text-amber-400 mt-3">Aucun fichier à exporter avec les paramètres actuels.</p>
                 )}
            </div>

        </div>
    );
};
