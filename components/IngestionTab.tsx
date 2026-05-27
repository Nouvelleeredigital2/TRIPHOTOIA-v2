import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Photo } from '../types';
import { UploadIcon } from './IconComponents';
import { AnalysisView } from './AnalysisView';

interface IngestionTabProps {
    onFilesSelected: (files: File[]) => void;
    photos: Photo[];
    analyzingPhotoIds: Set<string>;
}

export const IngestionTab: React.FC<IngestionTabProps> = ({ onFilesSelected, photos, analyzingPhotoIds }) => {
    const [isHovering, setIsHovering] = useState(false);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const imageFiles = acceptedFiles.filter(file => file.type.startsWith('image/'));
        if (imageFiles.length > 0) {
            onFilesSelected(imageFiles);
        }
        setIsHovering(false);
    }, [onFilesSelected]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.webp', '.gif'] },
        onDragEnter: () => setIsHovering(true),
        onDragLeave: () => setIsHovering(false),
    });
    
    const dropzoneClassName = `border-2 border-dashed rounded-xl transition-colors duration-300 flex flex-col items-center justify-center text-center p-8 md:p-16 ${
        isDragActive || isHovering
            ? 'border-cyan-400 bg-slate-800/50'
            : 'border-slate-700 hover:border-cyan-500 bg-slate-800/20'
    }`;

    return (
        <div className="space-y-8">
            <div {...getRootProps()} className={dropzoneClassName}>
                <input {...getInputProps()} />
                <UploadIcon />
                <p className="mt-4 text-lg font-semibold text-slate-300">
                    {isDragActive ? "Déposez les fichiers ici..." : "Glissez-déposez des photos ici, ou cliquez pour sélectionner"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                    Les images sont analysées dans votre navigateur. Aucune photo n'est stockée sur nos serveurs.
                </p>
            </div>

            {photos.length > 0 && (
                <div>
                    <h2 className="text-2xl font-bold mb-4 text-white">En cours d'analyse...</h2>
                    <AnalysisView photos={photos} analyzingPhotoIds={analyzingPhotoIds} />
                </div>
            )}
        </div>
    );
};