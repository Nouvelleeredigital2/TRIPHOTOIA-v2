import React from 'react';
import { Photo } from '../types';
import { CheckCircleIcon, XCircleIcon, SpinnerIcon } from './IconComponents';

interface AnalysisViewProps {
    photos: Photo[];
    analyzingPhotoIds: Set<string>;
}

const PhotoRow: React.FC<{ photo: Photo, isAnalyzing: boolean }> = ({ photo, isAnalyzing }) => {
    const getStatus = () => {
        if (photo.analysis?.error) {
            return (
                <div className="flex items-center gap-2 text-red-400" title={photo.analysis.error}>
                    <XCircleIcon />
                    <span>Échec</span>
                </div>
            );
        }
        if (photo.analysis) {
            return (
                <div className="flex items-center gap-2 text-green-400">
                    <CheckCircleIcon />
                    <span>Terminé</span>
                </div>
            );
        }
        if (isAnalyzing) {
             return (
                <div className="flex items-center gap-2 text-cyan-400">
                    <SpinnerIcon />
                    <span>Traitement IA...</span>
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2 text-slate-400">
                <div className="h-2.5 w-2.5 bg-slate-500 rounded-full animate-pulse"></div>
                <span>En attente...</span>
            </div>
        );
    };

    return (
        <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg">
            <img src={photo.previewUrl} alt={photo.file.name} className="w-12 h-12 object-cover rounded-md" />
            <div className="flex-grow">
                <p className="text-sm font-medium text-slate-200 truncate">{photo.file.name}</p>
                <p className="text-xs text-slate-500">{Math.round(photo.file.size / 1024)} KB</p>
            </div>
            <div className="text-sm w-48 text-right">{getStatus()}</div>
        </div>
    );
};

export const AnalysisView: React.FC<AnalysisViewProps> = ({ photos, analyzingPhotoIds }) => {
    // Show most recent uploads first
    const reversedPhotos = [...photos].reverse();

    return (
        <div className="space-y-2 bg-slate-800 p-4 rounded-xl shadow-inner">
            {reversedPhotos.map(photo => (
                <PhotoRow key={photo.id} photo={photo} isAnalyzing={analyzingPhotoIds.has(photo.id)} />
            ))}
        </div>
    );
};