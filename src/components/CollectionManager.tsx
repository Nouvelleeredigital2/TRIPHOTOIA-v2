import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { usePhotoStore } from '../store/photoStore';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Input } from './ui/input';
import { Plus, FolderOpen, Edit2, Trash2 } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { ConfirmationDialog } from './ui/confirmation-dialog';
import toast from 'react-hot-toast';

export function CollectionManager() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [renameCollectionId, setRenameCollectionId] = useState('');
  const [renameCollectionName, setRenameCollectionName] = useState('');
  const [includeSelection, setIncludeSelection] = useState(true);
  const [creationMessage, setCreationMessage] = useState('');
  const [renameMessage, setRenameMessage] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(
    null
  );

  const collections = usePhotoStore((state) => state.collections);
  const collectionOrder = usePhotoStore((state) => state.collectionOrder);
  const activeCollectionId = usePhotoStore((state) => state.activeCollectionId);
  const activeCollection = usePhotoStore(
    (state) => state.collections[activeCollectionId]
  );

  const createCollection = usePhotoStore((state) => state.createCollection);
  const renameCollection = usePhotoStore((state) => state.renameCollection);
  const deleteCollection = usePhotoStore((state) => state.deleteCollection);
  const setActiveCollection = usePhotoStore(
    (state) => state.setActiveCollection
  );
  const developmentSelection = usePhotoStore(
    (state) => state.developmentSelection
  );
  const selectedPhotoIds = useMemo(
    () => Array.from(developmentSelection),
    [developmentSelection]
  );
  const selectedCount = selectedPhotoIds.length;

  const activeCount = activeCollection?.photoIds?.length ?? 0;

  const existingNames = useMemo(
    () =>
      new Set(
        collectionOrder.map((id) => collections[id]?.name?.toLowerCase() ?? '')
      ),
    [collectionOrder, collections]
  );

  const handleOpenCreateDialog = () => {
    const suggestion =
      selectedCount > 0
        ? `Sélection (${selectedCount})`
        : `Collection ${collectionOrder.length + 1}`;
    setNewCollectionName(suggestion);
    setIncludeSelection(selectedCount > 0);
    setCreationMessage('');
    setIsCreateDialogOpen(true);
  };

  const handleCreateDialogToggle = (open: boolean) => {
    setIsCreateDialogOpen(open);
    if (!open) {
      setCreationMessage('');
      setNewCollectionName('');
      setIncludeSelection(selectedCount > 0);
    }
  };

  const handleCreateCollection = () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) {
      setCreationMessage('Veuillez saisir un nom de collection.');
      return;
    }

    if (existingNames.has(trimmed.toLowerCase())) {
      setCreationMessage('Une collection porte déj�  ce nom.');
      return;
    }

    const collectionId = createCollection(
      trimmed,
      includeSelection ? selectedPhotoIds : []
    );
    const createdCollection =
      usePhotoStore.getState().collections[collectionId];
    setNewCollectionName('');
    setIsCreateDialogOpen(false);
    setCreationMessage('');
    toast.success(
      `Collection «� ${createdCollection?.name ?? trimmed}� » créée`
    );
  };

  const handleRenameCollection = () => {
    const trimmed = renameCollectionName.trim();
    if (!trimmed || !renameCollectionId) {
      setRenameMessage('Le nom ne peut pas être vide.');
      return;
    }

    if (
      existingNames.has(trimmed.toLowerCase()) &&
      collections[renameCollectionId]?.name.toLowerCase() !==
        trimmed.toLowerCase()
    ) {
      setRenameMessage('Une autre collection utilise déj�  ce nom.');
      return;
    }

    if (!renameCollection(renameCollectionId, trimmed)) {
      setRenameMessage('Ce nom est déjà utilisé par une autre collection.');
      return;
    }
    toast.success(`Collection renommée en «� ${trimmed}� »`);
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
      toast.success('Collection supprimée');
      setCollectionToDelete(null);
    }
  };

  const openRenameDialog = (collectionId: string, currentName: string) => {
    setRenameCollectionId(collectionId);
    setRenameCollectionName(currentName);
    setRenameMessage('');
    setIsRenameDialogOpen(true);
  };

  const handleRenameDialogToggle = (open: boolean) => {
    setIsRenameDialogOpen(open);
    if (!open) {
      setRenameMessage('');
      setRenameCollectionId('');
      setRenameCollectionName('');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-full items-center gap-4"
    >
      <div className="flex flex-1 items-center gap-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            Collection
          </span>
        </div>

        <Select value={activeCollectionId} onValueChange={setActiveCollection}>
          <SelectTrigger className="w-64 border-border/50 bg-card transition-colors hover:border-border">
            <SelectValue placeholder="Sélectionner une collection" />
          </SelectTrigger>
          <SelectContent className="border-border/50 bg-card">
            {collectionOrder.map((collectionId) => {
              const collection = collections[collectionId];
              const photoCount = collection?.photoIds?.length || 0;

              return (
                <SelectItem key={collectionId} value={collectionId}>
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="font-medium">
                      {collection?.name || 'Collection sans nom'}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-xs font-semibold"
                    >
                      {photoCount}
                    </Badge>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Badge variant="outline" className="px-3 py-1 text-xs font-medium">
          {activeCount} photo{activeCount > 1 ? 's' : ''}
        </Badge>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogToggle}>
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="default"
            onClick={handleOpenCreateDialog}
            className="font-medium"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle collection
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
            />
            <div className="rounded border border-border/60 bg-muted/20 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">
                  Sélection actuelle
                </span>
                <Badge variant="secondary" className="text-xs">
                  {selectedCount} photo{selectedCount > 1 ? 's' : ''}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Ajoutez instantanément les photos actuellement sélectionnées �
                la nouvelle collection.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Checkbox
                  id="include-selection"
                  checked={includeSelection && selectedCount > 0}
                  onCheckedChange={(checked) =>
                    setIncludeSelection(Boolean(checked))
                  }
                  disabled={selectedCount === 0}
                />
                <label
                  htmlFor="include-selection"
                  className="text-sm text-foreground"
                >
                  Inclure{' '}
                  {selectedCount > 0
                    ? `${selectedCount} photo${selectedCount > 1 ? 's' : ''}`
                    : 'la sélection actuelle'}
                </label>
              </div>
            </div>
            {creationMessage && (
              <p className="text-sm text-destructive">{creationMessage}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => handleCreateDialogToggle(false)}
              >
                Annuler
              </Button>
              <Button onClick={handleCreateCollection}>Créer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {collectionOrder.length > 1 && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              openRenameDialog(activeCollectionId, activeCollection?.name || '')
            }
            className="hover:bg-muted"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDeleteCollection(activeCollectionId)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Dialog open={isRenameDialogOpen} onOpenChange={handleRenameDialogToggle}>
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
            />
            {renameMessage && (
              <p className="text-sm text-destructive">{renameMessage}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => handleRenameDialogToggle(false)}
              >
                Annuler
              </Button>
              <Button onClick={handleRenameCollection}>Renommer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
    </motion.div>
  );
}
