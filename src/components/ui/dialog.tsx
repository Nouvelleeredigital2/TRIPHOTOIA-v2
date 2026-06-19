import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in', className)}
      {...props}
    />
  )
);
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  // Convenience: renders an accessible (sr-only) description and wires
  // aria-describedby, for dialogs that have no visible description.
  description?: string;
};

// Détecte récursivement si le sous-arbre contient déjà une DialogDescription,
// afin de n'injecter le fallback sr-only que si AUCUNE description n'est fournie.
// (Sinon, un dialog avec sa propre DialogDescription — ex. ConfirmationDialog —
//  aurait deux descriptions, dont une redondante pour les lecteurs d'écran.)
function elementIsDescription(type: unknown): boolean {
  if (type == null) return false;
  if (type === DialogDescription || type === DialogPrimitive.Description) return true;
  const displayName = (type as { displayName?: string }).displayName;
  return displayName != null && displayName === DialogPrimitive.Description.displayName;
}

function subtreeHasDescription(node: React.ReactNode): boolean {
  let found = false;
  React.Children.forEach(node, (child) => {
    if (found || !React.isValidElement(child)) return;
    if (elementIsDescription(child.type)) {
      found = true;
      return;
    }
    const childChildren = (child.props as { children?: React.ReactNode })?.children;
    if (childChildren && subtreeHasDescription(childChildren)) {
      found = true;
    }
  });
  return found;
}

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, description, ...props }, ref) => {
    const generatedId = React.useId();
    const hasOwnDescription = React.useMemo(() => subtreeHasDescription(children), [children]);
    // On n'injecte un fallback que si rien d'autre ne décrit le dialog.
    const renderFallback = !description && !props['aria-describedby'] && !hasOwnDescription;
    const shouldRenderDescription = Boolean(description) || renderFallback;
    const fallbackText = description ?? 'Contenu de la boîte de dialogue.';
    // Si une DialogDescription enfant existe, Radix câble aria-describedby tout seul.
    const describedBy = props['aria-describedby'] ?? (shouldRenderDescription ? generatedId : undefined);
    const contentProps = describedBy ? { ...props, 'aria-describedby': describedBy } : props;

    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 grid w-full max-w-xl translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden rounded-lg border bg-popover p-6 text-popover-foreground shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in data-[state=open]:slide-in-from-bottom-2',
            className
          )}
          {...contentProps}
        >
          {shouldRenderDescription ? (
            <DialogPrimitive.Description id={generatedId} className="sr-only">
              {fallbackText}
            </DialogPrimitive.Description>
          ) : null}
          {children}
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">Fermer</span>
          </DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  }
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
  )
);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
