import React, { useEffect, useState } from 'react';
import {
  Camera,
  Star,
  Target,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import {
  getShareLinkByToken,
  getSharedPhotos,
  getShareApprovals,
  setShareApproval,
  getSharedPhotoUrl,
} from '../lib/sync-utils';
import type {
  DbShareLink,
  DbPhotoMetadata,
  ShareApprovalStatus,
} from '../lib/sync-utils';
import { COLOR_LABEL_META } from '../types';
import type { ColorLabel } from '../types';

type ApprovalMap = Record<string, ShareApprovalStatus>;

// Cache local (par token) : repli hors-ligne et affichage immédiat. La source de vérité
// reste Supabase via les RPC set_share_approval / get_share_approvals.
function localCacheKey(token: string): string {
  return `treephoto_approvals_${token}`;
}

function getCachedApprovals(token: string): ApprovalMap {
  try {
    return JSON.parse(localStorage.getItem(localCacheKey(token)) ?? '{}');
  } catch {
    return {};
  }
}

function cacheApprovals(token: string, approvals: ApprovalMap) {
  try {
    localStorage.setItem(localCacheKey(token), JSON.stringify(approvals));
  } catch {
    /* quota / mode privé — on ignore, la source de vérité est le cloud */
  }
}

/** Miniature partagée : vraie image (bucket public) avec repli placeholder si absente/erreur. */
function SharedThumb({ url, label }: { url: string | null; label: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <>
        <Camera className="h-8 w-8 text-white/10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="px-2 text-center text-[10px] leading-tight text-white/20">
            {label}
          </span>
        </div>
      </>
    );
  }
  return (
    <img
      src={url}
      alt={label}
      loading="lazy"
      className="absolute inset-0 h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

interface ShareViewProps {
  token: string;
}

export function ShareView({ token }: ShareViewProps) {
  const [link, setLink] = useState<DbShareLink | null>(null);
  const [photos, setPhotos] = useState<DbPhotoMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalMap>({});
  const [savingHash, setSavingHash] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    // Affichage immédiat depuis le cache local, puis rafraîchi par le cloud.
    setApprovals(getCachedApprovals(token));
    getShareLinkByToken(token)
      .then(async (l) => {
        if (!l) {
          setError('Lien introuvable ou expiré.');
          return;
        }
        if (l.expires_at && new Date(l.expires_at) < new Date()) {
          setError('Ce lien de partage a expiré.');
          return;
        }
        setLink(l);
        const [p, serverApprovals] = await Promise.all([
          getSharedPhotos(l),
          getShareApprovals(token),
        ]);
        setPhotos(p);
        if (serverApprovals.length > 0) {
          const map: ApprovalMap = {};
          serverApprovals.forEach((a) => {
            map[a.file_hash] = a.status;
          });
          setApprovals(map);
          cacheApprovals(token, map);
        }
      })
      .catch(() => setError('Erreur lors du chargement.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleApproval = async (
    fileHash: string,
    status: ShareApprovalStatus
  ) => {
    // MAJ optimiste fonctionnelle (clics rapides successifs ne s'écrasent pas) + cache.
    setApprovals((prev) => {
      const next: ApprovalMap = { ...prev, [fileHash]: status };
      cacheApprovals(token, next);
      return next;
    });
    setSaveError(null);
    setSavingHash(fileHash);

    const ok = await setShareApproval(token, fileHash, status);
    setSavingHash(null);
    if (!ok) {
      setSaveError(
        "Votre choix n'a pas pu être enregistré en ligne. Il est conservé localement — réessayez plus tard."
      );
    }
  };

  const approvedCount = Object.values(approvals).filter(
    (s) => s === 'approved'
  ).length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-sm text-white/50">Chargement…</div>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h1 className="mb-2 text-xl font-bold text-white">Lien invalide</h1>
          <p className="text-sm text-white/50">
            {error ?? "Ce lien de partage n'existe pas."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/5 bg-black/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-pink-400">
                <Camera className="h-4 w-4 text-black" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white">
                  {link.name || 'Sélection photos'}
                </h1>
                <p className="text-xs text-white/40">
                  Partagé par votre photographe · {photos.length} photo
                  {photos.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>

          {approvedCount > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400">
              <CheckCircle className="h-3.5 w-3.5" />
              {approvedCount} approuvée{approvedCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </header>

      {/* Instructions */}
      <div className="mx-auto max-w-6xl space-y-2 px-6 py-4">
        <p className="rounded-lg border border-white/5 bg-white/5 px-4 py-3 text-xs text-white/30">
          📸 Votre photographe vous partage cette sélection. Cliquez sur{' '}
          <span className="font-medium text-green-400">✓ Approuver</span> pour
          valider les photos que vous souhaitez recevoir. Vos choix sont
          transmis à votre photographe.
        </p>
        {saveError && (
          <p className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {saveError}
          </p>
        )}
      </div>

      {/* Grille photos */}
      <main className="mx-auto max-w-6xl px-6 pb-12">
        {photos.length === 0 ? (
          <div className="py-16 text-center">
            <Camera className="mx-auto mb-4 h-12 w-12 text-white/20" />
            <p className="text-sm text-white/40">
              Aucune photo dans ce partage.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => {
              const isApproved = approvals[photo.file_hash] === 'approved';
              const isRejected = approvals[photo.file_hash] === 'rejected';
              const isSaving = savingHash === photo.file_hash;
              const colorLabel = photo.color_label as ColorLabel | null;
              const labelMeta = colorLabel
                ? COLOR_LABEL_META[colorLabel]
                : null;

              return (
                <div
                  key={photo.file_hash}
                  className={`relative overflow-hidden rounded-xl border bg-white/5 transition-all ${
                    isApproved
                      ? 'border-green-500/50 ring-1 ring-green-500/30'
                      : isRejected
                        ? 'border-red-500/20 opacity-50'
                        : 'border-white/10'
                  }`}
                >
                  {/* Vraie image (bucket public) — repli placeholder si indisponible */}
                  <div className="relative flex aspect-[4/3] items-center justify-center bg-white/5">
                    <SharedThumb
                      url={getSharedPhotoUrl(photo.user_id, photo.file_hash)}
                      label={photo.file_name}
                    />
                    {isApproved && (
                      <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500">
                        <CheckCircle className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="space-y-2 p-3">
                    <p
                      className="truncate text-xs font-medium text-white/80"
                      title={photo.file_name}
                    >
                      {photo.file_name}
                    </p>

                    <div className="flex items-center gap-2">
                      {/* Rating */}
                      {(photo.rating ?? 0) > 0 && (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: photo.rating ?? 0 }).map(
                            (_, i) => (
                              <Star
                                key={i}
                                className="h-3 w-3 fill-yellow-400 text-yellow-400"
                              />
                            )
                          )}
                        </div>
                      )}

                      {/* Pick */}
                      {photo.is_pick && (
                        <span className="flex items-center gap-1 text-[10px] text-green-400">
                          <Target className="h-3 w-3" /> Pick
                        </span>
                      )}

                      {/* Color label */}
                      {labelMeta && (
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: labelMeta.dot }}
                          title={labelMeta.label}
                        />
                      )}
                    </div>

                    {/* Tags */}
                    {(photo.analysis as Record<string, unknown> | null)
                      ?.tags && (
                      <div className="flex flex-wrap gap-1">
                        {(
                          (photo.analysis as Record<string, unknown>).tags as
                            | string[]
                            | undefined
                        )
                          ?.slice(0, 3)
                          .map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-white/40"
                            >
                              {tag}
                            </span>
                          ))}
                      </div>
                    )}

                    {/* Approval buttons */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() =>
                          handleApproval(photo.file_hash, 'approved')
                        }
                        disabled={isSaving}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all disabled:opacity-60 ${
                          isApproved
                            ? 'border border-green-500/30 bg-green-500/20 text-green-400'
                            : 'border border-white/5 bg-white/5 text-white/40 hover:bg-green-500/10 hover:text-green-400'
                        }`}
                      >
                        ✓ Approuver
                      </button>
                      <button
                        onClick={() =>
                          handleApproval(photo.file_hash, 'rejected')
                        }
                        disabled={isSaving}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all disabled:opacity-60 ${
                          isRejected
                            ? 'border border-red-500/30 bg-red-500/20 text-red-400'
                            : 'border border-white/5 bg-white/5 text-white/40 hover:bg-red-500/10 hover:text-red-400'
                        }`}
                      >
                        ✕ Passer
                      </button>
                      {isSaving && (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/40" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-white/20">
        Propulsé par{' '}
        <span className="font-semibold text-amber-400/60">Tree Photo IA</span>
      </footer>
    </div>
  );
}
