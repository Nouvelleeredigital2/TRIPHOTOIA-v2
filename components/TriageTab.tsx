import React, { useState, useMemo } from 'react';
import { Photo, DuplicateGroup } from '../types';
import { PhotoCard } from './PhotoCard';

interface TriageTabProps {
    photos: Photo[];
    duplicateGroups: DuplicateGroup[];
    userTags: Record<string, string[]>;
    onUpdateTags: (photoId: string, newTags: string[]) => void;
    selectedPhotoId: string | null;
    onSelectPhoto: (photoId: string | null) => void;
    bestPhotoOverrides: Record<string, string>;
    onSetBestInGroup: (groupId: string, photoId: string) => void;
    rejectedPhotoIds: Set<string>;
    onToggleRejectPhoto: (photoId: string) => void;
}

type FilterType = 'all' | 'good' | 'blurry' | 'duplicates';

export const TriageTab: React.FC<TriageTabProps> = ({ 
    photos, duplicateGroups, userTags, onUpdateTags, 
    selectedPhotoId, onSelectPhoto, bestPhotoOverrides, onSetBestInGroup,
    rejectedPhotoIds, onToggleRejectPhoto
}) => {
    const [filter, setFilter] = useState<FilterType>('all');

    const photosInGroups = useMemo(() => new Set(duplicateGroups.flatMap(g => g.photos.map(p => p.id))), [duplicateGroups]);

    const filteredPhotos = useMemo(() => {
        switch (filter) {
            case 'good':
                return photos.filter(p => p.analysis && !p.analysis.isBlurry && !photosInGroups.has(p.id));
            case 'blurry':
                return photos.filter(p => p.analysis && p.analysis.isBlurry);
            case 'duplicates':
                // This case is handled by rendering groups directly, but we can return an empty array for the flat list.
                return [];
            case 'all':
            default:
                // For 'all', we only want to show photos that are not in any duplicate group in the main grid.
                return photos.filter(p => !photosInGroups.has(p.id));
        }
    }, [filter, photos, duplicateGroups, photosInGroups]);


    if (photos.length === 0) {
        return (
            <div className="text-center py-16">
                <h2 className="text-2xl font-bold text-white">Commencez par ajouter des photos</h2>
                <p className="text-slate-400 mt-2">Allez dans l'onglet "Ingestion & Analyse" pour téléverser vos premières images.</p>
            </div>
        );
    }
    
    const FilterButton: React.FC<{ filterType: FilterType; label: string }> = ({ filterType, label }) => (
         <button
            onClick={() => setFilter(filterType)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                filter === filterType
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700/50 hover:text-white'
            }`}
        >
            {label}
        </button>
    );

    const renderDuplicateGroups = () => (
        duplicateGroups.length > 0 ? (
            <div className="space-y-8">
                {duplicateGroups.map(group => {
                    const currentBestPhotoId = bestPhotoOverrides[group.id] || group.bestPhotoId;
                    return (
                        <div key={group.id} className="bg-slate-800/50 p-4 rounded-xl">
                            <h3 className="font-semibold mb-3 text-purple-300">Groupe de {group.photos.length} photos similaires</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {group.photos.map(photo => (
                                    <PhotoCard
                                        key={photo.id}
                                        photo={photo}
                                        isBestInGroup={photo.id === currentBestPhotoId}
                                        duplicateGroup={group}
                                        userTags={userTags[photo.id]}
                                        onUpdateTags={(newTags) => onUpdateTags(photo.id, newTags)}
                                        isSelected={selectedPhotoId === photo.id}
                                        onSelect={() => onSelectPhoto(photo.id)}
                                        onSetAsBest={() => onSetBestInGroup(group.id, photo.id)}
                                        showSelectionActions={true}
                                        isRejected={rejectedPhotoIds.has(photo.id)}
                                        onToggleReject={onToggleRejectPhoto}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        ) : (filter === 'duplicates' && <p className="text-slate-400 text-center py-8">Aucun doublon trouvé.</p>)
    );

    const renderUniquePhotos = () => (
        filteredPhotos.length > 0 ? (
             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                 {filteredPhotos.map(photo => (
                    <PhotoCard
                        key={photo.id} photo={photo} isBestInGroup={false}
                        duplicateGroup={undefined}
                        userTags={userTags[photo.id]} onUpdateTags={(newTags) => onUpdateTags(photo.id, newTags)}
                        isSelected={selectedPhotoId === photo.id} onSelect={() => onSelectPhoto(photo.id)}
                        isRejected={rejectedPhotoIds.has(photo.id)}
                        onToggleReject={onToggleRejectPhoto}
                    />
                ))}
            </div>
        ) : (filter !== 'all' && filter !== 'duplicates' && <p className="text-slate-400 text-center py-8">Aucune photo ne correspond à ce filtre.</p>)
    );


    return (
        <div className="space-y-8">
            <div className="flex items-center gap-2 p-1 bg-slate-800 rounded-lg max-w-max">
                <FilterButton filterType="all" label="Toutes" />
                <FilterButton filterType="good" label="Bonnes" />
                <FilterButton filterType="blurry" label="Floues" />
                <FilterButton filterType="duplicates" label="Doublons" />
            </div>
            
            <div className="space-y-8">
                {filter === 'duplicates' 
                    ? renderDuplicateGroups()
                    : (
                        <>
                            {renderDuplicateGroups()}
                            { (duplicateGroups.length > 0 && filteredPhotos.length > 0) && <hr className="border-slate-700 my-8" />}
                            {renderUniquePhotos()}
                        </>
                      )
                }

                {filter === 'all' && duplicateGroups.length === 0 && filteredPhotos.length === 0 && (
                    <p className="text-slate-400 text-center py-8">Toutes vos photos sont uniques et non-floues.</p>
                )}
            </div>
        </div>
    );
};