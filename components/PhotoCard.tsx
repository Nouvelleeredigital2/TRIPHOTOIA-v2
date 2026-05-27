import React from 'react';
import type { Photo, DuplicateGroup } from '../types';
import { SparklesIcon, EyeIcon, EyeOffIcon, BanIcon } from './IconComponents';
import { EditableTags } from './EditableTags';

interface PhotoCardProps {
  photo: Photo;
  isBestInGroup: boolean;
  duplicateGroup: DuplicateGroup | undefined;
  userTags: string[] | undefined;
  onUpdateTags: (newTags: string[]) => void;
  isSelected: boolean;
  onSelect: () => void;
  onSetAsBest?: () => void;
  showSelectionActions?: boolean;
  isRejected: boolean;
  onToggleReject: (photoId: string) => void;
}

const renderStatusIndicator = (photo: Photo, duplicateGroup: DuplicateGroup | undefined) => {
    let indicatorClass = '';
    let title = '';

    if (photo.analysis?.isBlurry) {
        indicatorClass = 'bg-red-500';
        title = 'Flou détecté';
    } else if (duplicateGroup) {
        indicatorClass = 'bg-purple-500';
        title = 'Fait partie d\'un groupe de doublons';
    } else if (photo.analysis) {
        indicatorClass = 'bg-green-500';
        title = 'Photo de bonne qualité';
    }

    if (!photo.analysis) return null;

    return <div className={`absolute top-2 left-2 h-3 w-3 rounded-full ${indicatorClass}`} title={title}></div>;
}


export const PhotoCard: React.FC<PhotoCardProps> = ({ 
    photo, isBestInGroup, duplicateGroup, userTags, onUpdateTags, 
    isSelected, onSelect, onSetAsBest, showSelectionActions,
    isRejected, onToggleReject 
}) => {
  const { analysis } = photo;
  const filterStyle = analysis?.suggestedRetouch
    ? {
        filter: `brightness(${analysis.suggestedRetouch.brightness}) contrast(${analysis.suggestedRetouch.contrast}) saturate(${analysis.suggestedRetouch.saturation})`,
      }
    : {};

  const displayTags = userTags ?? analysis?.tags ?? [];
  const cardClassName = `
    relative group rounded-lg overflow-hidden border-2 
    ${isSelected ? 'border-cyan-400' : 'border-transparent'} 
    transition-all duration-300 cursor-pointer
    ${showSelectionActions && !isBestInGroup ? 'opacity-60 hover:opacity-100' : ''}
    ${isRejected ? 'grayscale opacity-50' : ''}
  `;
  
  const handleRejectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleReject(photo.id);
  };

  return (
    <div 
        className={cardClassName}
        onClick={onSelect}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      <img
        src={photo.previewUrl}
        alt={photo.file.name}
        className="w-full h-full object-cover aspect-square transition-transform group-hover:scale-105"
        style={filterStyle}
        loading="lazy"
      />
      
      {renderStatusIndicator(photo, duplicateGroup)}

      {isBestInGroup && (
         <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-amber-600 text-white text-xs rounded-full font-semibold z-20">
             <SparklesIcon /> Meilleure
         </div>
     )}

      <div className="absolute bottom-0 left-0 right-0 p-3 z-20 text-white translate-y-full group-hover:translate-y-0 transition-transform duration-300">
        {showSelectionActions && !isBestInGroup && !isRejected && (
            <div className="mb-2">
                <button
                    onClick={(e) => { e.stopPropagation(); onSetAsBest?.(); }}
                    className="w-full text-center px-2 py-1.5 bg-slate-600/80 hover:bg-cyan-600 text-white text-xs rounded font-semibold transition-colors"
                >
                    Conserver celle-ci
                </button>
            </div>
        )}
        
        {analysis && !analysis.error && (
            <div className="space-y-2">
                {!showSelectionActions && <EditableTags tags={displayTags} onUpdateTags={onUpdateTags} /> }
                <div className="flex items-center justify-between text-xs text-slate-300 pt-2 border-t border-slate-700/50">
                    <div className="flex items-center gap-2">
                        {analysis.hasOpenEyes 
                            ? (
                                <span title="Yeux ouverts détectés">
                                    <EyeIcon className="h-5 w-5 text-sky-400 animate-pulse" />
                                </span>
                              )
                            : (
                                <span title="Aucun œil ouvert détecté">
                                    <EyeOffIcon className="h-5 w-5 text-amber-500" />
                                </span>
                              )
                        }
                        <button 
                            onClick={handleRejectClick} 
                            title={isRejected ? "Rétablir la photo" : "Rejeter la photo"}
                            className={`p-1 rounded-full transition-colors ${isRejected ? 'text-amber-400 bg-slate-600/80' : 'text-slate-400 hover:text-white hover:bg-red-600/80'}`}
                        >
                           <BanIcon className="h-4 w-4" />
                        </button>
                    </div>
                    <span>Netteté: {(analysis.sharpnessScore || 0).toFixed(2)}</span>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};