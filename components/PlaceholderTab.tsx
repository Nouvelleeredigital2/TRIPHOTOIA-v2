
import React from 'react';

interface PlaceholderTabProps {
    title: string;
    message: string;
}

export const PlaceholderTab: React.FC<PlaceholderTabProps> = ({ title, message }) => {
    return (
        <div className="text-center py-16">
            <h2 className="text-2xl font-bold text-white">{title}</h2>
            <p className="text-slate-400 mt-2">{message}</p>
        </div>
    );
};
