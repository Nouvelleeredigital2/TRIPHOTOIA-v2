import React from 'react';
import { StopIcon, UndoIcon } from './IconComponents';

interface StatusBarProps {
    total: number;
    processed: number;
    isProcessing: boolean;
    onStop: () => void;
    canUndo: boolean;
    onUndo: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({ total, processed, isProcessing, onStop, canUndo, onUndo }) => {
    const progress = total > 0 ? (processed / total) * 100 : 0;
    const statusText = isProcessing 
        ? `${processed} / ${total} photos traitées`
        : total > 0 && processed === total 
        ? `Analyse terminée pour ${total} photos.`
        : 'Prêt à analyser.';


    return (
        <footer className="bg-slate-900 border-t border-slate-800 px-4 py-2">
            <div className="container mx-auto flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                    <span className="text-slate-400 w-56">
                       {statusText}
                    </span>
                    <div className="w-48 bg-slate-700 rounded-full h-1.5">
                        <div 
                            className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500" 
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onUndo}
                        className="flex items-center gap-2 px-3 py-1 bg-slate-700/80 text-slate-300 text-xs font-medium rounded-md hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!canUndo}
                        aria-label="Annuler la dernière action"
                    >
                        <UndoIcon />
                        <span>Annuler</span>
                    </button>
                    <button 
                        onClick={onStop}
                        className="flex items-center gap-2 px-3 py-1 bg-rose-800/50 text-rose-300 text-xs font-medium rounded-md hover:bg-rose-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!isProcessing}
                        aria-label="Arrêter l'analyse"
                    >
                        <StopIcon />
                        <span>STOP</span>
                    </button>
                </div>
            </div>
        </footer>
    );
};