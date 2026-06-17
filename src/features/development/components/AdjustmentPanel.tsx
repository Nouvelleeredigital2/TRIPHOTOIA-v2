import React, { useMemo } from 'react';
import { RetouchOptions, RetouchOptionKey } from '../../../types';
import { Button } from '../../../components/ui/button';

interface AdjustmentPanelProps {
  options: RetouchOptions;
  onChange: (option: RetouchOptionKey, value: number) => void;
  onReset: () => void;
  isProcessing?: boolean;
  onAuto?: () => void;
  isAutoComputing?: boolean;
  autoError?: string | null;
  lastAutoPreset?: Partial<RetouchOptions> | null;
  autoConfidence?: number | null;
}

const formatValue = (value: number) => (value > 0 ? `+${value}` : `${value}`);

const CONTROL_CONFIG: Array<{
  title: string;
  description: string;
  controls: Array<{
    key: RetouchOptionKey;
    label: string;
    min: number;
    max: number;
    step?: number;
  }>;
}> = [
  {
    title: 'Balance des blancs',
    description: 'Ajustez la température et la teinte de votre image.',
    controls: [
      {
        key: 'temperature',
        label: 'Température',
        min: -100,
        max: 100,
        step: 1,
      },
      { key: 'tint', label: 'Teinte', min: -100, max: 100, step: 1 },
    ],
  },
  {
    title: 'Tonalité',
    description:
      'Contrôlez l’exposition globale et les détails dans les hautes lumières et les ombres.',
    controls: [
      { key: 'exposure', label: 'Exposition', min: -100, max: 100, step: 1 },
      { key: 'contrast', label: 'Contraste', min: -100, max: 100, step: 1 },
      {
        key: 'highlights',
        label: 'Hautes lumières',
        min: -100,
        max: 100,
        step: 1,
      },
      { key: 'shadows', label: 'Ombres', min: -100, max: 100, step: 1 },
      { key: 'whites', label: 'Blancs', min: -100, max: 100, step: 1 },
      { key: 'blacks', label: 'Noirs', min: -100, max: 100, step: 1 },
    ],
  },
  {
    title: 'Présence',
    description: 'Affinez la texture et la saturation globale de vos photos.',
    controls: [
      { key: 'clarity', label: 'Clarté', min: -100, max: 100, step: 1 },
      { key: 'texture', label: 'Texture', min: -100, max: 100, step: 1 },
      { key: 'dehaze', label: 'Déhaze', min: -100, max: 100, step: 1 },
      { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1 },
      { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1 },
    ],
  },
  {
    title: 'Contraste ciblé',
    description: 'Renforcez les tons moyens sans écraser les extrêmes.',
    controls: [
      {
        key: 'midtoneContrast',
        label: 'Contraste tons moyens',
        min: -100,
        max: 100,
        step: 1,
      },
    ],
  },
  {
    title: 'Netteté',
    description: 'Renforcez la netteté perçue sans perdre les détails fins.',
    controls: [
      { key: 'sharpness', label: 'Netteté', min: 0, max: 100, step: 1 },
    ],
  },
];

export const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({
  options,
  onChange,
  onReset,
  isProcessing = false,
  onAuto,
  isAutoComputing = false,
  autoError = null,
  lastAutoPreset = null,
  autoConfidence = null,
}) => {
  const formattedOptions = useMemo(() => options, [options]);

  const autoConfidenceDisplay = useMemo(() => {
    if (!autoConfidence && autoConfidence !== 0) {
      return null;
    }
    const percent = Math.round(autoConfidence * 100);
    return `${percent}%`;
  }, [autoConfidence]);

  return (
    <div className="space-y-6">
      <header className="rounded-xl bg-gradient-to-r from-primary/15 via-primary/10 to-transparent px-5 py-4 shadow-sm ring-1 ring-primary/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/70">
              Assistant de retouche
            </p>
            <h3 className="text-lg font-semibold text-primary-foreground">
              Réglages de développement
            </h3>
            <p className="text-sm text-primary-foreground/80">
              Ajustez finement les curseurs ou laissez l’intelligence
              automatique proposer un preset.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {onAuto && (
              <Button
                variant="default"
                size="sm"
                onClick={onAuto}
                className="shadow-lg shadow-primary/30"
                disabled={isProcessing || isAutoComputing}
              >
                {isAutoComputing ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Calcul…
                  </span>
                ) : (
                  'Auto magique'
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className="border-primary/40 text-primary hover:bg-primary/10"
              disabled={isProcessing || isAutoComputing}
            >
              Réinitialiser
            </Button>
          </div>
        </div>
      </header>

      <div className="space-y-4">
        {autoError ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {autoError}
          </div>
        ) : (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary/80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">Preset automatique</span>
              {autoConfidenceDisplay && (
                <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold text-primary">
                  Confiance {autoConfidenceDisplay}
                </span>
              )}
            </div>
            {lastAutoPreset ? (
              <p className="mt-2 text-xs text-primary/70">
                Dernier preset appliqué. Ajustez librement les curseurs selon
                vos goûts.
              </p>
            ) : (
              <p className="mt-2 text-xs text-primary/70">
                Lancez l’analyse automatique pour obtenir une base équilibrée et
                adaptée à votre photo.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-5">
        {CONTROL_CONFIG.map((section) => (
          <section
            key={section.title}
            className="space-y-3 rounded-xl border border-border/30 bg-card/80 p-4 shadow-sm backdrop-blur"
          >
            <div>
              <h4 className="text-sm font-semibold">{section.title}</h4>
              <p className="text-xs text-muted-foreground">
                {section.description}
              </p>
            </div>

            <div className="space-y-3">
              {section.controls.map((control) => (
                <div
                  key={control.key}
                  className="space-y-2 rounded-lg bg-muted/10 p-3"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">
                      {control.label}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatValue(formattedOptions[control.key])}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step ?? 1}
                    value={formattedOptions[control.key]}
                    onChange={(event) =>
                      onChange(control.key, Number(event.target.value))
                    }
                    className="w-full accent-primary"
                    disabled={isProcessing}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
