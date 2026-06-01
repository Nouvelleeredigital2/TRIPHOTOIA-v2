import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePhotoStore } from '../store/photoStore';
import { useSmartCollections } from '../store/smartCollectionsSelector';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import {
  FolderOpen,
  Plus,
  Edit2,
  Trash2,
  Folder,
  Image as ImageIcon,
  Sparkles,
  Zap,
  X,
} from 'lucide-react';
import { ConfirmationDialog } from './ui/confirmation-dialog';
import { COLOR_LABEL_META } from '../types';
import toast from 'react-hot-toast';

interface CollectionSidebarProps {
  /** Mobile overlay: whether the sidebar is open on small screens */
  mobileOpen?: boolean;
  /** Callback to close the sidebar on mobile */
  onMobileClose?: () => void;
}

export function CollectionSidebar({ mobileOpen = false, onMobileClose }: CollectionSidebarProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [renameCollectionId, setRenameCollectionId] = useState('');
  const [renameCollectionName, setRenameCollectionName] = useState('');
  const [creationMessage, setCreationMessage] = useState('');
  const [renameMessage, setRenameMessage] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null);
  const [hoveredCollection, setHoveredCollection] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const collections = usePhotoStore((state) => state.collections);
  const collectionOrder = usePhotoStore((state) => state.collectionOrder);
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);
  const activeSmartCollectionId = usePhotoStore((state) => state.activeSmartCollectionId);
  const createCollection = usePhotoStore((state) => state.createCollection);
  const applyWeddingTemplate = usePhotoStore((state) => state.applyWeddingTemplate);
  const renameCollection = usePhotoStore((state) => state.renameCollection);
  const deleteCollection = usePhotoStore((state) => state.deleteCollection);
  const undo = usePhotoStore((state) => state.undo);
  const setActiveCollection = usePhotoStore((state) => state.setActiveCollection);
  const setActiveSmartCollection = usePhotoStore((state) => state.setActiveSmartCollection);
  const smartCollections = useSmartCollections();

  const handleCreateCollection = () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) {
      setCreationMessage('Veuillez saisir un nom de collection.');
      return;
    }

    const existingNames = new Set(collectionOrder.map((id) => collections[id]?.name?.toLowerCase() ?? ''));
    if (existingNames.has(trimmed.toLowerCase())) {
      setCreationMessage('Une collection porte déjà ce nom.');
      return;
    }

    createCollection(trimmed, []);
    setNewCollectionName('');
    setIsCreateDialogOpen(false);
    setCreationMessage('');
    toast.success(`Collection « ${trimmed} » créée`);
  };

  const handleRenameCollection = () => {
    const trimmed = renameCollectionName.trim();
    if (!trimmed || !renameCollectionId) {
      setRenameMessage('Le nom ne peut pas être vide.');
      return;
    }

    const existingNames = new Set(collectionOrder.map((id) => collections[id]?.name?.toLowerCase() ?? ''));
    if (existingNames.has(trimmed.toLowerCase()) && collections[renameCollectionId]?.name.toLowerCase() !== trimmed.toLowerCase()) {
      setRenameMessage('Une autre collection utilise déjà ce nom.');
      return;
    }

    const ok = renameCollection(renameCollectionId, trimmed);
    if (!ok) {
      setRenameMessage('Ce nom est déjà utilisé par une autre collection.');
      return;
    }
    toast.success(`Collection renommée en « ${trimmed} »`);
    setRenameCollectionName('');
    setRenameCollectionId('');
    setRenameMessage('');
    setIsRenameDialogOpen(false);
  };

  const handleDeleteCollection = (collectionId: string) => {
    setCollectionToDelete(collectionId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteCollection = () => {
    if (collectionToDelete && collectionOrder.length > 1) {
      deleteCollection(collectionToDelete);
      setCollectionToDelete(null);
      // A-08 : suppression annulable.
      toast((t) => (
        <span className="flex items-center gap-3">
          Collection supprimée
          <button
            onClick={() => { undo(); toast.dismiss(t.id); }}
            className="px-2 py-0.5 rounded bg-primary/15 hover:bg-primary/25 text-xs font-medium"
          >
            Annuler
          </button>
        </span>
      ), { duration: 6000 });
    }
  };

  const openRenameDialog = (collectionId: string, currentName: string) => {
    setRenameCollectionId(collectionId);
    setRenameCollectionName(currentName);
    setRenameMessage('');
    setIsRenameDialogOpen(true);
  };

  const handleApplyWeddingTemplate = () => {
    const createdIds = applyWeddingTemplate();
    if (createdIds.length === 0) {
      toast('Template mariage déjà appliqué');
      return;
    }

    toast.success(`${createdIds.length} collections mariage créées`);
  };

  const sidebarContent = (
    <motion.aside
      initial={{ x: -288 }}
      animate={{ x: 0 }}
      exit={{ x: -288 }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      className="w-72 bg-card border-r border-border/50 flex flex-col h-full"
    >
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Collections</h2>
          </div>
          <div className="flex items-center gap-1">
            {/* Close button (mobile only) */}
            {onMobileClose && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 lg:hidden"
                onClick={onMobileClose}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    setNewCollectionName(`Collection ${collectionOrder.length + 1}`);
                    setCreationMessage('');
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent description="Formulaire de création d'une nouvelle collection.">
                <DialogHeader>
                  <DialogTitle>Créer une nouvelle collection</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Nom de la collection"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateCollection();
                      }
                    }}
                    autoFocus
                  />
                  {creationMessage && (
                    <p className="text-sm text-destructive">{creationMessage}</p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Annuler
                    </Button>
                    <Button onClick={handleCreateCollection}>
                      Créer
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleApplyWeddingTemplate}
        >
          <Sparkles className="w-4 h-4" />
          Template mariage
        </Button>
      </div>

      {/* Collections List */}
        <div className="flex-1 overflow-y-auto p-2">
          {/* Smart Collections */}
          <div className="mb-3">
            <div className="flex items-center gap-1 px-2 py-1 mb-1">
              <Zap className="w-3 h-3 text-amber-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Collections dynamiques
              </span>
            </div>
            {smartCollections.map((sc) => {
              const isActive = activeSmartCollectionId === sc.id;
              // Detect color-label collections by id prefix
              const colorKey = sc.id.startsWith('sc-') ? sc.id.slice(3) : null;
              const colorMeta = colorKey && colorKey in COLOR_LABEL_META
                ? COLOR_LABEL_META[colorKey as keyof typeof COLOR_LABEL_META]
                : null;

              return (
                <div
                  key={sc.id}
                  className={`
                    flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer
                    transition-all duration-200 mb-0.5
                    ${isActive
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium'
                      : 'hover:bg-muted text-foreground'
                    }
                  `}
                  onClick={() => setActiveSmartCollection(isActive ? null : sc.id)}
                >
                  {colorMeta ? (
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/30"
                      style={{ backgroundColor: colorMeta.dot }}
                    />
                  ) : (
                    <span className="text-sm w-4 text-center">{sc.icon}</span>
                  )}
                  <span className="flex-1 text-sm truncate">{sc.name}</span>
                  <Badge
                    variant={isActive ? 'default' : 'secondary'}
                    className={`text-xs font-semibold h-5 min-w-[28px] flex items-center justify-center ${isActive ? 'bg-amber-500 text-white' : ''}`}
                  >
                    {sc.count}
                  </Badge>
                </div>
              );
            })}
          </div>

          {/* Séparateur */}
          <div className="flex items-center gap-2 px-2 py-1 mb-1">
            <Folder className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Mes collections
            </span>
          </div>

          <AnimatePresence>
            {collectionOrder.map((collectionId) => {
              const collection = collections[collectionId];
              const photoCount = collection?.photoIds?.length || 0;
              const isActive = activeCollectionId === collectionId;
              const isHovered = hoveredCollection === collectionId;

              return (
                <motion.div
                  key={collectionId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="mb-1"
                >
                  <div
                    className={`
                      group relative flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer
                      transition-all duration-200
                      ${isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted text-foreground'
                      }
                    `}
                    onClick={() => setActiveCollection(collectionId)}
                    onMouseEnter={() => setHoveredCollection(collectionId)}
                    onMouseLeave={() => setHoveredCollection(null)}
                  >
                    {/* Icon */}
                    <Folder
                      className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                    />

                    {/* Name */}
                    <span className="flex-1 text-sm truncate">
                      {collection?.name || 'Collection sans nom'}
                    </span>

                    {/* Badge */}
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className="text-xs font-semibold h-5 min-w-[28px] flex items-center justify-center"
                    >
                      {photoCount}
                    </Badge>

                    {/* Actions (visible on hover) */}
                    {(isHovered || isActive) && collectionOrder.length > 1 && (
                      <div className="flex items-center gap-1 ml-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRenameDialog(collectionId, collection?.name || '');
                          }}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCollection(collectionId);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Footer Stats */}
        <div className="p-4 border-t border-border/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            <span>
              {collectionOrder.reduce((acc, id) => acc + (collections[id]?.photoIds?.length || 0), 0)} photos au total
            </span>
          </div>
        </div>
      </motion.aside>

  );

  return (
    <>
      {/* Desktop: static sidebar */}
      <div className="hidden lg:block h-full shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile: overlay drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={onMobileClose}
            />
            {/* Drawer — uses its own motion wrapper so exit animation works */}
            <motion.div
              key="sidebar-drawer"
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 left-0 z-50 lg:hidden h-full w-72 bg-card border-r border-border/50 flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-border/50 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold text-foreground">Collections</h2>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onMobileClose}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    handleApplyWeddingTemplate();
                    onMobileClose?.();
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                  Template mariage
                </Button>
              </div>
              {/* Scrollable body — same as desktop */}
              <div className="flex-1 overflow-y-auto p-2">
                <div className="mb-3">
                  <div className="flex items-center gap-1 px-2 py-1 mb-1">
                    <Zap className="w-3 h-3 text-amber-500" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Collections dynamiques</span>
                  </div>
                  {smartCollections.map((sc) => {
                    const isActive2 = activeSmartCollectionId === sc.id;
                    const ck = sc.id.startsWith('sc-') ? sc.id.slice(3) : null;
                    const cm = ck && ck in COLOR_LABEL_META ? COLOR_LABEL_META[ck as keyof typeof COLOR_LABEL_META] : null;
                    return (
                      <div key={sc.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-200 mb-0.5 ${isActive2 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium' : 'hover:bg-muted text-foreground'}`}
                        onClick={() => { setActiveSmartCollection(isActive2 ? null : sc.id); onMobileClose?.(); }}
                      >
                        {cm ? <span className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/30" style={{ backgroundColor: cm.dot }} /> : <span className="text-sm w-4 text-center">{sc.icon}</span>}
                        <span className="flex-1 text-sm truncate">{sc.name}</span>
                        <Badge variant={isActive2 ? 'default' : 'secondary'} className={`text-xs font-semibold h-5 min-w-[28px] flex items-center justify-center ${isActive2 ? 'bg-amber-500 text-white' : ''}`}>{sc.count}</Badge>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 px-2 py-1 mb-1">
                  <Folder className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mes collections</span>
                </div>
                {collectionOrder.map((cid) => {
                  const col = collections[cid];
                  const isActive2 = activeCollectionId === cid;
                  return (
                    <div key={cid}
                      className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all duration-200 mb-1 ${isActive2 ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'}`}
                      onClick={() => { setActiveCollection(cid); onMobileClose?.(); }}
                    >
                      <Folder className={`w-4 h-4 flex-shrink-0 ${isActive2 ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="flex-1 text-sm truncate">{col?.name || 'Collection sans nom'}</span>
                      <Badge variant={isActive2 ? 'default' : 'secondary'} className="text-xs font-semibold h-5 min-w-[28px] flex items-center justify-center">
                        {col?.photoIds?.length || 0}
                      </Badge>
                      {/* A-10 : actions toujours visibles sur mobile (pas de hover au tactile) */}
                      {collectionOrder.length > 1 && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 shrink-0"
                            aria-label={`Renommer ${col?.name || 'la collection'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openRenameDialog(cid, col?.name || '');
                            }}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive"
                            aria-label={`Supprimer ${col?.name || 'la collection'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCollection(cid);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t border-border/50 text-xs text-muted-foreground shrink-0">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  <span>{collectionOrder.reduce((acc, id) => acc + (collections[id]?.photoIds?.length || 0), 0)} photos au total</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent description="Formulaire pour renommer la collection sélectionnée.">
          <DialogHeader>
            <DialogTitle>Renommer la collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Nouveau nom"
              value={renameCollectionName}
              onChange={(e) => setRenameCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameCollection();
                }
              }}
              autoFocus
            />
            {renameMessage && (
              <p className="text-sm text-destructive">{renameMessage}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsRenameDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button onClick={handleRenameCollection}>
                Renommer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDeleteCollection}
        title="Supprimer la collection ?"
        description={`Êtes-vous sûr de vouloir supprimer la collection "${collectionToDelete ? collections[collectionToDelete]?.name : ''}" ? Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="destructive"
      />
    </>
  );
}
