import React from 'react';
import { Photo } from '../types';
import { EditableTags } from './EditableTags';
import { EyeIcon, EyeOffIcon, InfoIcon } from './IconComponents';

interface SidebarProps {
    photo: Photo | null;
    userTags: string[] | undefined;
    onUpdateTags: (newTags: string[]) => void;
    onClose: () => void;
}

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-200">{value}</span>
    </div>
);

export const Sidebar: React.FC<SidebarProps> = ({ photo, userTags, onUpdateTags, onClose }) => {
    const analysis = photo?.analysis;
    const displayTags = userTags ?? analysis?.tags ?? [];

    return (
        <aside className={`w-80 bg-slate-800/50 border-l border-slate-700/50 transition-transform transform ${photo ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}>
            {photo ? (
                <>
                    <div className="p-4 border-b border-slate-700/50 flex justify-between items-center">
                        <h3 className="font-bold text-lg text-white">Détails</h3>
                        <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">&times;</button>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto space-y-6">
                        <div className="aspect-square rounded-lg overflow-hidden">
                            <img src={photo.previewUrl} alt={photo.file.name} className="w-full h-full object-cover" />
                        </div>
                        
                        <div className="space-y-2">
                             <h4 className="text-sm font-semibold text-slate-300 border-b border-slate-700 pb-1 mb-2">Informations</h4>
                             <InfoRow label="Fichier" value={<span className="truncate max-w-40" title={photo.file.name}>{photo.file.name}</span>} />
                             <InfoRow label="Taille" value={`${Math.round(photo.file.size / 1024)} KB`} />
                        </div>

                        {analysis && !analysis.error && (
                             <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-slate-300 border-b border-slate-700 pb-1 mb-2">Analyse IA</h4>
                                <InfoRow label="Netteté" value={(analysis.sharpnessScore || 0).toFixed(2)} />
                                <InfoRow 
                                    label="Yeux ouverts" 
                                    value={
                                        analysis.hasOpenEyes ? 
                                        <span className="flex items-center gap-1.5 text-sky-400"><EyeIcon className="w-4 h-4" /> Oui</span> : 
                                        <span className="flex items-center gap-1.5 text-amber-500"><EyeOffIcon className="w-4 h-4" /> Non</span>
                                    } 
                                />
                            </div>
                        )}
                        
                        <div>
                             <h4 className="text-sm font-semibold text-slate-300 border-b border-slate-700 pb-1 mb-3">Étiquettes</h4>
                             <EditableTags tags={displayTags} onUpdateTags={onUpdateTags} />
                        </div>

                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 p-4">
                    <InfoIcon />
                    <p className="mt-2 font-semibold">Aucune photo sélectionnée</p>
                    <p className="text-sm">Cliquez sur une photo pour voir ses détails.</p>
                </div>
            )}
        </aside>
    );
};