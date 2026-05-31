import React, { useEffect, useState } from 'react';
import { Camera, Star, Target, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import {
  getShareLinkByToken,
  getSharedPhotos,
  getShareApprovals,
  setShareApproval,
  getSharedPhotoUrl,
} from '../lib/sync-utils';
import type { DbShareLink, DbPhotoMetadata, ShareApprovalStatus } from '../lib/sync-utils';
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
        <Camera className="w-8 h-8 text-white/10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] text-white/20 text-center px-2 leading-tight">{label}</span>
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
        if (!l) { setError('Lien introuvable ou expiré.'); return; }
        if (l.expires_at && new Date(l.expires_at) < new Date()) {
          setError('Ce lien de partage a expiré.'); return;
        }
        setLink(l);
        const [p, serverApprovals] = await Promise.all([
          getSharedPhotos(l),
          getShareApprovals(token),
        ]);
        setPhotos(p);
        if (serverApprovals.length > 0) {
          const map: ApprovalMap = {};
          serverApprovals.forEach((a) => { map[a.file_hash] = a.status; });
          setApprovals(map);
          cacheApprovals(token, map);
        }
      })
      .catch(() => setError('Erreur lors du chargement.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleApproval = async (fileHash: string, status: ShareApprovalStatus) => {
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
      setSaveError("Votre choix n'a pas pu être enregistré en ligne. Il est conservé localement — réessayez plus tard.");
    }
  };

  const approvedCount = Object.values(approvals).filter((s) => s === 'approved').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/50 text-sm">Chargement…</div>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-white text-xl font-bold mb-2">Lien invalide</h1>
          <p className="text-white/50 text-sm">{error ?? 'Ce lien de partage n\'existe pas.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-pink-400 flex items-center justify-center">
                <Camera className="w-4 h-4 text-black" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white">{link.name || 'Sélection photos'}</h1>
                <p className="text-xs text-white/40">
                  Partagé par votre photographe · {photos.length} photo{photos.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>

          {approvedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs text-green-400 font-medium">
              <CheckCircle className="w-3.5 h-3.5" />
              {approvedCount} approuvée{approvedCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </header>

      {/* Instructions */}
      <div className="max-w-6xl mx-auto px-6 py-4 space-y-2">
        <p className="text-xs text-white/30 bg-white/5 rounded-lg px-4 py-3 border border-white/5">
          📸 Votre photographe vous partage cette sélection. Cliquez sur{' '}
          <span className="text-green-400 font-medium">✓ Approuver</span> pour valider les photos
          que vous souhaitez recevoir. Vos choix sont transmis à votre photographe.
        </p>
        {saveError && (
          <p className="text-xs text-amber-400 bg-amber-500/10 rounded-lg px-4 py-2 border border-amber-500/20 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {saveError}
          </p>
        )}
      </div>

      {/* Grille photos */}
      <main className="max-w-6xl mx-auto px-6 pb-12">
        {photos.length === 0 ? (
          <div className="text-center py-16">
            <Camera className="w-12 h-12 mx-auto mb-4 text-white/20" />
            <p className="text-white/40 text-sm">Aucune photo dans ce partage.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => {
              const isApproved = approvals[photo.file_hash] === 'approved';
              const isRejected = approvals[photo.file_hash] === 'rejected';
              const isSaving = savingHash === photo.file_hash;
              const colorLabel = photo.color_label as ColorLabel | null;
              const labelMeta = colorLabel ? COLOR_LABEL_META[colorLabel] : null;

              return (
                <div
                  key={photo.file_hash}
                  className={`relative bg-white/5 rounded-xl overflow-hidden border transition-all ${
                    isApproved
                      ? 'border-green-500/50 ring-1 ring-green-500/30'
                      : isRejected
                        ? 'border-red-500/20 opacity-50'
                        : 'border-white/10'
                  }`}
                >
                  {/* Vraie image (bucket public) — repli placeholder si indisponible */}
                  <div className="aspect-[4/3] bg-white/5 flex items-center justify-center relative">
                    <SharedThumb url={getSharedPhotoUrl(photo.user_id, photo.file_hash)} label={photo.file_name} />
                    {isApproved && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-medium truncate text-white/80" title={photo.file_name}>
                      {photo.file_name}
                    </p>

                    <div className="flex items-center gap-2">
                      {/* Rating */}
                      {(photo.rating ?? 0) > 0 && (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: photo.rating ?? 0 }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                          ))}
                        </div>
                      )}

                      {/* Pick */}
                      {photo.is_pick && (
                        <span className="flex items-center gap-1 text-[10px] text-green-400">
                          <Target className="w-3 h-3" /> Pick
                        </span>
                      )}

                      {/* Color label */}
                      {labelMeta && (
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: labelMeta.dot }}
                          title={labelMeta.label}
                        />
                      )}
                    </div>

                    {/* Tags */}
                    {(photo.analysis as Record<string, unknown> | null)?.tags && (
                      <div className="flex flex-wrap gap-1">
                        {((photo.analysis as Record<string, unknown>).tags as string[] | undefined)
                          ?.slice(0, 3)
                          .map((tag) => (
                            <span key={tag} className="text-[9px] bg-white/5 text-white/40 px-1.5 py-0.5 rounded">
                              {tag}
                            </span>
                          ))}
                      </div>
                    )}

                    {/* Approval buttons */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() => handleApproval(photo.file_hash, 'approved')}
                        disabled={isSaving}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60 ${
                          isApproved
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-white/5 text-white/40 hover:bg-green-500/10 hover:text-green-400 border border-white/5'
                        }`}
                      >
                        ✓ Approuver
                      </button>
                      <button
                        onClick={() => handleApproval(photo.file_hash, 'rejected')}
                        disabled={isSaving}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60 ${
                          isRejected
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-white/5 text-white/40 hover:bg-red-500/10 hover:text-red-400 border border-white/5'
                        }`}
                      >
                        ✕ Passer
                      </button>
                      {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40 shrink-0" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-white/20">
        Propulsé par <span className="font-semibold text-amber-400/60">Tree Photo IA</span>
      </footer>
    </div>
  );
}
