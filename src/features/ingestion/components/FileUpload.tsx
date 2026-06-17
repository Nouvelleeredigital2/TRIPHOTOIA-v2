import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { FolderOpen, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

// P1-4 : uniquement les formats réellement décodés par le pipeline navigateur
// (HTMLImageElement/Canvas). HEIC/HEIF/TIFF/RAW étaient acceptés mais échouaient
// au preview/analyse/export — on les retire tant qu'aucun décodeur dédié n'est intégré.
const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.webp',
  '.avif',
]);

/** Recursively collect image files from a FileSystemDirectoryHandle.
 *  `stats.skippedDeep` compte les sous-dossiers ignorés car trop profonds (A-16). */
async function collectImagesFromDir(
  dirHandle: FileSystemDirectoryHandle,
  stats: { skippedDeep: number },
  depth = 0
): Promise<File[]> {
  if (depth > 5) {
    stats.skippedDeep += 1; // arbre trop profond — on signale plutôt que d'ignorer en silence
    return [];
  }
  const files: File[] = [];
  for await (const entry of dirHandle as unknown as AsyncIterable<FileSystemHandle>) {
    if (entry.kind === 'file') {
      const ext = '.' + entry.name.split('.').pop()?.toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        const file = await (entry as FileSystemFileHandle).getFile();
        files.push(file);
      }
    } else if (entry.kind === 'directory') {
      const subFiles = await collectImagesFromDir(
        entry as FileSystemDirectoryHandle,
        stats,
        depth + 1
      );
      files.push(...subFiles);
    }
  }
  return files;
}

/** Check if the File System Access API directory picker is available */
const canPickDirectory =
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function FileUpload({ onFilesSelected, disabled }: FileUploadProps) {
  const [isImportingDir, setIsImportingDir] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onFilesSelected(acceptedFiles);
    },
    [onFilesSelected]
  );

  // A-15 : signaler les fichiers refusés (format non supporté) au lieu de les ignorer.
  const onDropRejected = useCallback((rejections: { file: File }[]) => {
    if (rejections.length > 0) {
      toast.error(
        `${rejections.length} fichier${rejections.length > 1 ? 's' : ''} ignoré${rejections.length > 1 ? 's' : ''} (format non supporté)`
      );
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.bmp', '.webp', '.avif'],
    },
    multiple: true,
    disabled,
  });

  const handleImportDirectory = useCallback(async () => {
    if (!canPickDirectory) {
      toast.error(
        "Votre navigateur ne supporte pas l'import de dossier. Utilisez Chrome ou Edge."
      );
      return;
    }
    try {
      setIsImportingDir(true);
      // showDirectoryPicker n'est pas encore dans toutes les définitions TS :
      // accès typé local plutôt qu'une directive @ts-expect-error fragile.
      const showDirectoryPicker = (
        window as unknown as {
          showDirectoryPicker: (options: {
            mode: 'read';
          }) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker;
      const dirHandle: FileSystemDirectoryHandle = await showDirectoryPicker({
        mode: 'read',
      });
      const toastId = toast.loading('Lecture du dossier…');
      const stats = { skippedDeep: 0 };
      const files = await collectImagesFromDir(dirHandle, stats);
      toast.dismiss(toastId);
      if (files.length === 0) {
        toast.error('Aucune image trouvée dans ce dossier.');
      } else {
        toast.success(
          `${files.length} photo${files.length > 1 ? 's' : ''} trouvée${files.length > 1 ? 's' : ''}`
        );
        onFilesSelected(files);
        if (stats.skippedDeep > 0) {
          // A-16 : prévenir que des sous-dossiers très profonds ont été ignorés.
          toast("Certains sous-dossiers très profonds n'ont pas été lus.", {
            icon: '⚠️',
          });
        }
      }
    } catch (err) {
      // User cancelled the picker — no error needed
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Impossible de lire le dossier.');
      }
    } finally {
      setIsImportingDir(false);
    }
  }, [onFilesSelected]);

  return (
    <Card className="w-full">
      <CardContent className="p-8">
        <div
          {...getRootProps()}
          className={cn(
            'cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors',
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <input {...getInputProps()} />
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <svg
                className="h-6 w-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {isDragActive
                  ? 'Déposez vos photos ici'
                  : 'Glissez-déposez vos photos'}
              </h3>
              <p className="mt-2 text-muted-foreground">
                ou cliquez pour sélectionner des fichiers
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                JPEG · PNG · WebP · GIF · BMP · AVIF
              </p>
            </div>
            <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Sélectionner des fichiers
              </Button>

              {/* Directory import — only shown if API is supported */}
              {canPickDirectory && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled || isImportingDir}
                  className="gap-2"
                  onClick={(e) => {
                    e.stopPropagation(); // don't open the file input
                    handleImportDirectory();
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                  {isImportingDir ? 'Lecture…' : 'Importer un dossier'}
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      </CardContent>
    </Card>
  );
}
