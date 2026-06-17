import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Link,
  Copy,
  Trash2,
  Share2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { usePhotoStore } from '../store/photoStore';
import {
  createShareLink,
  getUserShareLinks,
  deleteShareLink,
  syncPhotosForShare,
  uploadSharedPhotos,
} from '../lib/sync-utils';
import type { DbShareLink } from '../lib/sync-utils';
import { ConfirmationDialog } from './ui/confirmation-dialog';
import toast from 'react-hot-toast';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
}

// P2 : l'URL de base provient du navigateur. Le repli (contexte non-navigateur,
// p. ex. tests SSR) reste vide plutôt que de coder en dur un ancien domaine.
const BASE_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`
    : '';

export function ShareDialog({ open, onClose }: ShareDialogProps) {
  const { user } = useAuthStore();
  const [links, setLinks] = useState<DbShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [linkName, setLinkName] = useState('');

  // Sélectionner la référence stable du tableau, puis dériver avec useMemo.
  // Filtrer DANS le sélecteur zustand retourne un nouveau tableau à chaque rendu,
  // ce qui casse le cache de getSnapshot → boucle de rendu infinie (React #185).
  const photos = usePhotoStore((s) => s.photos);
  const userTags = usePhotoStore((s) => s.userTags);
  const photoNotes = usePhotoStore((s) => s.photoNotes);
  const picks = useMemo(
    () => photos.filter((p) => p.analysis?.isPick && p.fileHash),
    [photos]
  );

  const [deleteTarget, setDeleteTarget] = useState<DbShareLink | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Charger les liens existants
  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    getUserShareLinks(user.id)
      .then((l) => setLinks(l))
      .finally(() => setLoading(false));
  }, [open, user]);

  const handleCreate = async () => {
    if (!user) {
      toast.error('Connectez-vous pour partager');
      return;
    }
    const hashes = picks.map((p) => p.fileHash!).filter(Boolean);
    if (hashes.length === 0) {
      toast.error('Aucun Pick avec hash disponible');
      return;
    }

    setCreating(true);
    try {
      // A-04 : synchroniser les métadonnées des picks AVANT de créer le lien, sinon la
      // galerie publique peut être vide (photo_metadata absente côté cloud).
      const sync = await syncPhotosForShare(
        user.id,
        picks,
        userTags,
        photoNotes
      );
      if (sync.error) {
        toast.error(`Synchronisation impossible : ${sync.error}`);
        return;
      }
      if (sync.synced === 0) {
        toast.error(
          'Aucune photo synchronisable (hash manquant). Lien non créé.'
        );
        return;
      }

      // A-02 : uploader les images vers le bucket public pour que la galerie cliente
      // affiche les vraies photos (et non un placeholder).
      const upload = await uploadSharedPhotos(user.id, picks);

      const name =
        linkName.trim() ||
        `Sélection du ${new Date().toLocaleDateString('fr-FR')}`;
      const link = await createShareLink(user.id, name, hashes);
      if (!link) {
        toast.error('Erreur lors de la création du lien');
        return;
      }
      setLinks((prev) => [link, ...prev]);
      const url = `${BASE_URL}#/share/${link.token}`;
      await navigator.clipboard.writeText(url);
      const warnings: string[] = [];
      if (sync.skipped > 0) warnings.push(`${sync.skipped} sans hash`);
      if (upload.failed > 0)
        warnings.push(`${upload.failed} image(s) non envoyée(s)`);
      toast.success(
        warnings.length > 0
          ? `Lien copié ! (${warnings.join(', ')})`
          : 'Lien copié dans le presse-papier !'
      );
      setLinkName('');
    } catch {
      toast.error('Erreur lors de la création du lien');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (token: string) => {
    const url = `${BASE_URL}#/share/${token}`;
    await navigator.clipboard.writeText(url);
    toast.success('Lien copié !');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const linkId = deleteTarget.id;
    setDeletingId(linkId);
    try {
      await deleteShareLink(linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      toast.success('Lien supprimé');
    } catch {
      toast.error('Échec de la suppression du lien');
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold">Partager avec un client</h2>
                </div>
                <button
                  onClick={onClose}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-5 p-5">
                {!user ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    <Share2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
                    Connectez-vous pour créer des liens de partage.
                  </div>
                ) : (
                  <>
                    {/* Créer un lien */}
                    <div className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Nouveau lien — {picks.length} pick
                        {picks.length !== 1 ? 's' : ''}
                      </div>

                      {picks.length === 0 ? (
                        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          Marquez des photos comme <strong>Pick</strong> (touche{' '}
                          <kbd className="font-mono">P</kbd>) pour les partager.
                        </p>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Nom du lien (optionnel)"
                            value={linkName}
                            onChange={(e) => setLinkName(e.target.value)}
                            onKeyDown={(e) =>
                              e.key === 'Enter' && handleCreate()
                            }
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                          <button
                            onClick={handleCreate}
                            disabled={creating || picks.length === 0}
                            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {creating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Link className="h-4 w-4" />
                            )}
                            Créer
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Liste des liens existants */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Liens existants
                      </div>

                      {loading ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          Chargement…
                        </p>
                      ) : links.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          Aucun lien créé
                        </p>
                      ) : (
                        <div className="max-h-48 space-y-2 overflow-y-auto">
                          {links.map((link) => {
                            const url = `${BASE_URL}#/share/${link.token}`;
                            const isExpired =
                              link.expires_at &&
                              new Date(link.expires_at) < new Date();
                            return (
                              <div
                                key={link.id}
                                className={`flex items-center gap-2 rounded-lg border p-3 ${isExpired ? 'border-border/30 bg-muted/20 opacity-60' : 'border-border/60 bg-muted/30'}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium">
                                    {link.name || 'Sans titre'}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {link.photo_file_hashes.length} photo
                                    {link.photo_file_hashes.length !== 1
                                      ? 's'
                                      : ''}{' '}
                                    •{' '}
                                    {new Date(
                                      link.created_at
                                    ).toLocaleDateString('fr-FR')}
                                    {isExpired && ' • Expiré'}
                                  </p>
                                </div>
                                <button
                                  onClick={() => window.open(url, '_blank')}
                                  className="p-1 text-muted-foreground transition-colors hover:text-foreground"
                                  title="Ouvrir"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleCopy(link.token)}
                                  className="p-1 text-muted-foreground transition-colors hover:text-foreground"
                                  title="Copier le lien"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(link)}
                                  disabled={deletingId === link.id}
                                  className="p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                                  title="Supprimer"
                                >
                                  {deletingId === link.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        onConfirm={confirmDelete}
        title="Supprimer ce lien de partage ?"
        description={
          `Le lien « ${deleteTarget?.name || 'Sans titre'} » sera définitivement supprimé. ` +
          `Toute personne possédant l'URL n'y aura plus accès. Cette action est irréversible.`
        }
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="destructive"
      />
    </>
  );
}
