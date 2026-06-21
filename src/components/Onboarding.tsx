import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';
import { X } from 'lucide-react';

interface OnboardingStep {
  title: string;
  description: string;
  target?: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Bienvenue dans Tree Photo IA ! 👋',
    description:
      'Votre assistant intelligent pour trier et organiser vos photos. Laissez-nous vous guider à travers les fonctionnalités principales.',
  },
  {
    title: '1. Collections 📁',
    description:
      'Commencez par créer une collection pour regrouper vos photos. Nommez-la selon votre projet puis sélectionnez-la pour toutes les étapes suivantes.',
  },
  {
    title: '2. Ingestion 📸',
    description:
      "Glissez-déposez vos photos ou cliquez pour les sélectionner dans la collection active. L'IA analysera automatiquement chaque image pour détecter la qualité, le contenu et les doublons.",
  },
  {
    title: '3. Triage 🎯',
    description:
      'Examinez vos photos analysées, gérez les doublons détectés, rejetez les photos indésirables et sélectionnez celles à développer.',
  },
  {
    title: '4. Développement 🎨',
    description:
      'Retouchez vos photos avec 15 paramètres professionnels. Utilisez la synchronisation pour appliquer les mêmes réglages à plusieurs photos.',
  },
  {
    title: '5. Export 📦',
    description:
      'Exportez vos photos triées dans le format de votre choix (JPEG, PNG, WebP). Choisissez la qualité et les dimensions souhaitées.',
  },
  {
    title: 'Prêt à commencer ! 🚀',
    description:
      'Vous êtes maintenant prêt à utiliser Tree Photo IA. Commencez par créer votre première collection puis importer vos photos.',
  },
];

const ONBOARDING_KEY = 'treephoto-onboarding-completed';

export function Onboarding() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Vérifier si l'onboarding a déjà été complété
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      // Attendre un peu avant d'afficher l'onboarding
      const timer = setTimeout(() => setIsOpen(true), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setIsOpen(false);
  };

  const step = ONBOARDING_STEPS[currentStep];
  const progress = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={handleSkip}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2"
          >
            <div className="m-4 rounded-lg border border-border bg-card p-6 shadow-2xl">
              {/* Header */}
              <div className="mb-4 flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="mb-2 text-2xl font-bold text-foreground">
                    {step.title}
                  </h2>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      Étape {currentStep + 1} sur {ONBOARDING_STEPS.length}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleSkip}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Fermer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="mb-6 h-2 w-full rounded-full bg-secondary">
                <motion.div
                  className="h-2 rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Content */}
              <p className="mb-6 leading-relaxed text-muted-foreground">
                {step.description}
              </p>

              {/* Actions */}
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  onClick={handleSkip}
                  className="text-muted-foreground"
                >
                  Passer le tutoriel
                </Button>

                <div className="flex gap-2">
                  {currentStep > 0 && (
                    <Button variant="outline" onClick={handlePrevious}>
                      Précédent
                    </Button>
                  )}
                  <Button onClick={handleNext}>
                    {currentStep < ONBOARDING_STEPS.length - 1
                      ? 'Suivant'
                      : 'Commencer'}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Hook pour réinitialiser l'onboarding (utile pour le développement)
export function useResetOnboarding() {
  return () => {
    localStorage.removeItem(ONBOARDING_KEY);
    window.location.reload();
  };
}
