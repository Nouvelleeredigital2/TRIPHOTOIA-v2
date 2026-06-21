import React, { useState } from 'react';
import { Trash2, Save, ChevronDown, ChevronRight, Star } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { RetouchOptions, RetouchPreset } from '../../../types';
import { usePresetsStore } from '../../../store/presetsStore';
import { ConfirmationDialog } from '../../../components/ui/confirmation-dialog';
import toast from 'react-hot-toast';

interface PresetsPanelProps {
  currentOptions: RetouchOptions;
  onApplyPreset: (options: RetouchOptions) => void;
  /** Si fourni, un bouton "Appliquer à tous" apparaît quand ≥2 photos sélectionnées */
  onApplyPresetToAll?: (options: RetouchOptions) => void;
  selectedCount?: number;
  disabled?: boolean;
}

function PresetRow({
  preset,
  onApply,
  onDelete,
  disabled,
}: {
  preset: RetouchPreset;
  onApply: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60">
      <button
        onClick={onApply}
        disabled={disabled}
        className="flex-1 truncate text-left text-sm disabled:opacity-50"
        title={preset.name}
      >
        {preset.isBuiltIn && (
          <Star className="mr-1 inline-block h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
        )}
        {preset.name}
      </button>

      {!preset.isBuiltIn && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded p-0.5 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
          title="Supprimer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function PresetsPanel({
  currentOptions,
  onApplyPreset,
  onApplyPresetToAll,
  selectedCount = 1,
  disabled,
}: PresetsPanelProps) {
  const { getAllPresets, savePreset, deletePreset } = usePresetsStore();
  const allPresets = getAllPresets();
  const builtInPresets = allPresets.filter((p) => p.isBuiltIn);
  const userPresets = allPresets.filter((p) => !p.isBuiltIn);

  const [builtInOpen, setBuiltInOpen] = useState(true);
  const [userOpen, setUserOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetToDelete, setPresetToDelete] = useState<RetouchPreset | null>(
    null
  );

  const handleSave = () => {
    const name = presetName.trim();
    if (!name) {
      toast.error('Donnez un nom à votre preset');
      return;
    }
    savePreset(name, currentOptions);
    setPresetName('');
    setSaving(false);
    toast.success(`Preset « ${name} » sauvegardé`);
  };

  const handleApply = (preset: RetouchPreset) => {
    onApplyPreset(preset.options);
    toast.success(`Preset « ${preset.name} » appliqué`);
  };

  const handleApplyToAll = (preset: RetouchPreset) => {
    if (onApplyPresetToAll) {
      onApplyPresetToAll(preset.options);
      toast.success(
        `Preset « ${preset.name} » appliqué à ${selectedCount} photos`
      );
    }
  };

  const handleDelete = (preset: RetouchPreset) => {
    setPresetToDelete(preset);
  };

  const confirmDelete = () => {
    if (!presetToDelete) return;
    deletePreset(presetToDelete.id);
    toast.success(`Preset « ${presetToDelete.name} » supprimé`);
    setPresetToDelete(null);
  };

  return (
    <div className="space-y-3">
      {/* En-tête + bouton sauvegarder */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Presets
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => setSaving((v) => !v)}
          disabled={disabled}
        >
          <Save className="h-3 w-3" />
          Sauvegarder
        </Button>
      </div>

      {/* Formulaire de sauvegarde */}
      {saving && (
        <div className="flex gap-1">
          <Input
            autoFocus
            placeholder="Nom du preset…"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setSaving(false);
                setPresetName('');
              }
            }}
            className="h-7 text-sm"
          />
          <Button size="sm" className="h-7 shrink-0 px-2" onClick={handleSave}>
            OK
          </Button>
        </div>
      )}

      {/* Presets intégrés */}
      <div>
        <button
          className="flex w-full items-center gap-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setBuiltInOpen((v) => !v)}
        >
          {builtInOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Intégrés
          <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
            {builtInPresets.length}
          </Badge>
        </button>

        {builtInOpen && (
          <div className="mt-1 space-y-0.5">
            {builtInPresets.map((preset) => (
              <PresetRow
                key={preset.id}
                preset={preset}
                onApply={() => handleApply(preset)}
                disabled={disabled}
              />
            ))}
          </div>
        )}
      </div>

      {/* Presets utilisateur */}
      <div>
        <button
          className="flex w-full items-center gap-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setUserOpen((v) => !v)}
        >
          {userOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Mes presets
          <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
            {userPresets.length}
          </Badge>
        </button>

        {userOpen && (
          <div className="mt-1 space-y-0.5">
            {userPresets.length === 0 ? (
              <p className="px-2 py-1 text-xs italic text-muted-foreground">
                Aucun preset — sauvegardez vos réglages ci-dessus
              </p>
            ) : (
              userPresets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <PresetRow
                      preset={preset}
                      onApply={() => handleApply(preset)}
                      onDelete={() => handleDelete(preset)}
                      disabled={disabled}
                    />
                  </div>
                  {onApplyPresetToAll && selectedCount > 1 && (
                    <button
                      onClick={() => handleApplyToAll(preset)}
                      disabled={disabled}
                      className="shrink-0 rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
                      title={`Appliquer à ${selectedCount} photos`}
                    >
                      ×{selectedCount}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={presetToDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPresetToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Supprimer ce preset ?"
        description={`Le preset « ${presetToDelete?.name ?? ''} » sera définitivement supprimé. Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="destructive"
      />
    </div>
  );
}
