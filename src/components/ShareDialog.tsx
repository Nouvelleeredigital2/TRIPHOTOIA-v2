import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link, Copy, Trash2, Share2, Loader2, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { usePhotoStore } from '../store/photoStore';
import {
  createShareLink,
  getUserShareLinks,
  deleteShareLink,
} from '../lib/sync-utils';
import type { DbShareLink } from '../lib/sync-utils';
import toast from 'react-hot-toast';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
}

const BASE_URL = typeof window !== 'undefined'
  ? `${window.location.origin}${window.location.pathname}`
  : 'https://triphotoia.vercel.app/';

export function ShareDialog({ open, onClose }: ShareDialogProps) {
  const { user } = useAuthStore();
  const [links, setLinks] = useState<DbShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [linkName, setLinkName] = useState('');

  const picks = usePhotoStore((s) =>
    s.photos.filter((p) => p.analysis?.isPick && p.fileHash),
  );
  const multiSelection = usePhotoStore((s) => s.selectedPhotoId);

  // Charger les liens existants
  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    getUserShareLinks(user.id).then((l) => setLinks(l)).finally(() => setLoading(false));
  }, [open, user]);

  const handleCreate = async () => {
    if (!user) { toast.error('Connectez-vous pour partager'); return; }
    const hashes = picks.map((p) => p.fileHash!).filter(Boolean);
    if (hashes.length === 0) { toast.error('Aucun Pick avec hash disponible'); return; }

    setCreating(true);
    try {
      const name = linkName.trim() || `Sélection du ${new Date().toLocaleDateString('fr-FR')}`;
      const link = await createShareLink(user.id, name, hashes);
      if (link) {
        setLinks((prev) => [link, ...prev]);
        const url = `${BASE_URL}#/share/${link.token}`;
        await navigator.clipboard.writeText(url);
        toast.success('Lien copié dans le presse-papier !');
        setLinkName('');
      }
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

  const handleDelete = async (linkId: string) => {
    await deleteShareLink(linkId);
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    toast.success('Lien supprimé');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.18 }}
            className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold">Partager avec un client</h2>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {!user ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Share2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Connectez-vous pour créer des liens de partage.
                </div>
              ) : (
                <>
                  {/* Créer un lien */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Nouveau lien — {picks.length} pick{picks.length !== 1 ? 's' : ''}
                    </div>

                    {picks.length === 0 ? (
                      <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                        Marquez des photos comme <strong>Pick</strong> (touche <kbd className="font-mono">P</kbd>) pour les partager.
                      </p>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Nom du lien (optionnel)"
                          value={linkName}
                          onChange={(e) => setLinkName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <button
                          onClick={handleCreate}
                          disabled={creating || picks.length === 0}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                          Créer
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Liste des liens existants */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Liens existants
                    </div>

                    {loading ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Chargement…</p>
                    ) : links.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Aucun lien créé</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {links.map((link) => {
                          const url = `${BASE_URL}#/share/${link.token}`;
                          const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
                          return (
                            <div key={link.id} className={`flex items-center gap-2 p-3 rounded-lg border ${isExpired ? 'border-border/30 bg-muted/20 opacity-60' : 'border-border/60 bg-muted/30'}`}>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{link.name || 'Sans titre'}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {link.photo_file_hashes.length} photo{link.photo_file_hashes.length !== 1 ? 's' : ''} • {new Date(link.created_at).toLocaleDateString('fr-FR')}
                                  {isExpired && ' • Expiré'}
                                </p>
                              </div>
                              <button
                                onClick={() => window.open(url, '_blank')}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                title="Ouvrir"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCopy(link.token)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                title="Copier le lien"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(link.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                title="Supprimer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
  );
}
