
import React, { useState } from 'react';

interface EditableTagsProps {
    tags: string[];
    onUpdateTags: (newTags: string[]) => void;
}

export const EditableTags: React.FC<EditableTagsProps> = ({ tags, onUpdateTags }) => {
    const [inputValue, setInputValue] = useState('');

    const handleRemoveTag = (tagToRemove: string) => {
        onUpdateTags(tags.filter(tag => tag !== tagToRemove));
    };

    const handleAddTag = () => {
        const newTag = inputValue.trim().toLowerCase();
        if (newTag && !tags.includes(newTag)) {
            onUpdateTags([...tags, newTag]);
        }
        setInputValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddTag();
        }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-1 mb-2">
                {tags.map(tag => (
                    <span key={tag} className="flex items-center px-2 py-0.5 bg-slate-700/80 text-cyan-300 text-xs rounded">
                        {tag}
                        <button 
                            onClick={() => handleRemoveTag(tag)} 
                            className="ml-1.5 -mr-1 w-4 h-4 flex items-center justify-center text-cyan-500 hover:text-white hover:bg-slate-600/80 rounded-full transition-colors"
                            aria-label={`Supprimer l'étiquette ${tag}`}
                        >
                            &times;
                        </button>
                    </span>
                ))}
            </div>
            <div className="flex items-center">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ajouter une étiquette..."
                    className="bg-slate-800/80 text-white text-xs rounded-l-md px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-cyan-500 border border-transparent focus:border-cyan-500"
                    aria-label="Ajouter une nouvelle étiquette"
                />
                <button
                    onClick={handleAddTag}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold px-3 py-1 rounded-r-md transition-colors"
                    aria-label="Valider la nouvelle étiquette"
                >
                    Ajouter
                </button>
            </div>
        </div>
    );
};
