/**
 * Service d'analyse d'images avec Canvas API
 * Analyse r??elle des images pour d??tecter flou et doublons
 */

import { PhotoAnalysis } from '../../types';

export const simpleAnalysisService = {
  analyzePhotosBatch: async (files: File[]): Promise<PhotoAnalysis[]> => {
    console.log(`???? Analyse d'images de ${files.length} photo(s)...`);

    const results: PhotoAnalysis[] = [];

    for (const file of files) {
      try {
        console.log(`???? Analyse de ${file.name}...`);

        // Analyse r??elle de l'image avec Canvas
        const analysis = await analyzeImageWithCanvas(file);
        results.push(analysis);

        console.log(`??? ${file.name} analys??e`);
      } catch (error) {
        console.error(`??? Erreur pour ${file.name}:`, error);
        results.push({
          error: `Erreur d'analyse: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
        });
      }
    }

    console.log(`??? Analyse d'images termin??e: ${results.length} r??sultat(s)`);
    return results;
  }
};

async function analyzeImageWithCanvas(file: File): Promise<PhotoAnalysis> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Cr??er un canvas pour analyser l'image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          throw new Error('Impossible de cr??er le contexte Canvas');
        }

        // Redimensionner l'image pour l'analyse (max 800px)
        const maxSize = 800;
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Obtenir les donn??es de l'image
        const imageData = ctx.getImageData(0, 0, width, height);
        const { data } = imageData;

        // Analyser l'image
        const analysis = analyzeImageData(data, width, height, file);
        resolve(analysis);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('Impossible de charger l\'image'));
    img.src = URL.createObjectURL(file);
  });
}

function analyzeImageData(data: Uint8ClampedArray, width: number, height: number, file: File): PhotoAnalysis {
  // 1. D??tection de flou avec Laplacian
  const blurAnalysis = detectBlur(data, width, height);

  // 2. G??n??ration du hash perceptuel pour les doublons
  const perceptualHash = generatePerceptualHash(data, width, height);

  // 3. Analyse des couleurs
  const colorAnalysis = analyzeColors(data, width, height);

  // 4. D??tection d'yeux (simplifi??e)
  const hasOpenEyes = detectEyes(data, width, height);

  // 5. G??n??ration de tags
  const tags = generateTags(file, blurAnalysis, colorAnalysis);

  return {
    isBlurry: blurAnalysis.isBlurry,
    sharpnessScore: blurAnalysis.sharpnessScore,
    hasOpenEyes,
    tags,
    perceptualHash,
    suggestedRetouch: {
      brightness: colorAnalysis.brightness,
      contrast: colorAnalysis.contrast,
      saturation: colorAnalysis.saturation
    }
  };
}

function detectBlur(data: Uint8ClampedArray, width: number, height: number): { isBlurry: boolean; sharpnessScore: number } {
  // Utiliser plusieurs m??thodes pour une d??tection plus pr??cise

  // 1. Variance Laplacian (d??tection de contours)
  const laplacianVariance = calculateLaplacianVariance(data, width, height);

  // 2. Gradient Sobel (d??tection de bords)
  const sobelVariance = calculateSobelVariance(data, width, height);

  // 3. Analyse de fr??quence (FFT simplifi??)
  const frequencyScore = calculateFrequencyScore(data, width, height);

  // Combiner les scores de mani??re ??quilibr??e
  const combinedScore = (laplacianVariance + sobelVariance + frequencyScore) / 3;

  // Normaliser le score (0-1)
  const sharpnessScore = Math.min(Math.max(combinedScore, 0), 1);

  // Calculer un seuil dynamique bas?? sur la distribution des scores
  const imageSize = width * height;

  // Seuil bas?? sur la variance de l'image (plus l'image a de d??tails, plus le seuil doit ??tre ??lev??)
  const imageVariance = calculateImageVariance(data, width, height);
  const dynamicThreshold = imageVariance * 0.5; // Seuil proportionnel ?? la variance

  const isBlurry = sharpnessScore < dynamicThreshold;

  return { isBlurry, sharpnessScore };
}

function calculateLaplacianVariance(data: Uint8ClampedArray, width: number, height: number): number {
  let laplacianSum = 0;
  let laplacianSumSquared = 0;
  let count = 0;

  const laplacianKernel = [
    [0, -1, 0],
    [-1, 4, -1],
    [0, -1, 0]
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let laplacianValue = 0;

      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const pixelIndex = ((y + ky - 1) * width + (x + kx - 1)) * 4;
          const gray = getGrayValue(data, pixelIndex);
          laplacianValue += gray * laplacianKernel[ky][kx];
        }
      }

      laplacianSum += laplacianValue;
      laplacianSumSquared += laplacianValue * laplacianValue;
      count++;
    }
  }

  const mean = laplacianSum / count;
  const variance = (laplacianSumSquared / count) - (mean * mean);

  return Math.min(variance / 10000, 1.0); // Normalis?? bas?? sur la variance maximale th??orique
}

function calculateSobelVariance(data: Uint8ClampedArray, width: number, height: number): number {
  let sobelSum = 0;
  let sobelSumSquared = 0;
  let count = 0;

  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1]
  ];

  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1]
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;

      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const pixelIndex = ((y + ky - 1) * width + (x + kx - 1)) * 4;
          const gray = getGrayValue(data, pixelIndex);
          gx += gray * sobelX[ky][kx];
          gy += gray * sobelY[ky][kx];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      sobelSum += magnitude;
      sobelSumSquared += magnitude * magnitude;
      count++;
    }
  }

  const mean = sobelSum / count;
  const variance = (sobelSumSquared / count) - (mean * mean);

  return Math.min(variance / 5000, 1.0); // Normalis?? bas?? sur la variance maximale th??orique
}

function calculateFrequencyScore(data: Uint8ClampedArray, width: number, height: number): number {
  // Analyse simplifi??e des hautes fr??quences
  let highFreqSum = 0;
  let count = 0;

  // ??chantillonner tous les 4 pixels pour la performance
  for (let y = 2; y < height - 2; y += 2) {
    for (let x = 2; x < width - 2; x += 2) {
      const centerIndex = (y * width + x) * 4;
      const centerGray = getGrayValue(data, centerIndex);

      // Calculer la diff??rence avec les voisins
      let neighborSum = 0;
      let neighborCount = 0;

      for (let dy = -2; dy <= 2; dy += 2) {
        for (let dx = -2; dx <= 2; dx += 2) {
          if (dy === 0 && dx === 0) continue;
          const neighborIndex = ((y + dy) * width + (x + dx)) * 4;
          if (neighborIndex >= 0 && neighborIndex < data.length) {
            neighborSum += getGrayValue(data, neighborIndex);
            neighborCount++;
          }
        }
      }

      if (neighborCount > 0) {
        const avgNeighbor = neighborSum / neighborCount;
        const difference = Math.abs(centerGray - avgNeighbor);
        highFreqSum += difference;
        count++;
      }
    }
  }

  return count > 0 ? Math.min(highFreqSum / (count * 255), 1.0) : 0;
}

function calculateImageVariance(data: Uint8ClampedArray, width: number, height: number): number {
  let sum = 0;
  let sumSquared = 0;
  let count = 0;

  // ??chantillonner l'image pour la performance
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const pixelIndex = (y * width + x) * 4;
      const gray = getGrayValue(data, pixelIndex);
      sum += gray;
      sumSquared += gray * gray;
      count++;
    }
  }

  if (count === 0) return 0;

  const mean = sum / count;
  const variance = (sumSquared / count) - (mean * mean);

  return Math.min(variance / (255 * 255), 1.0); // Normalis??
}

function calculateAverageBrightness(data: Uint8ClampedArray, width: number, height: number): number {
  let sum = 0;
  let count = 0;

  // ??chantillonner l'image pour la performance
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const pixelIndex = (y * width + x) * 4;
      const gray = getGrayValue(data, pixelIndex);
      sum += gray;
      count++;
    }
  }

  return count > 0 ? sum / count : 128;
}

function generatePerceptualHash(data: Uint8ClampedArray, width: number, height: number): string {
  // Redimensionner ?? 8x8 pour le hash
  const hashSize = 8;
  const resizedData = resizeImageData(data, width, height, hashSize, hashSize);

  // Calculer la moyenne
  let sum = 0;
  for (let i = 0; i < resizedData.length; i += 4) {
    sum += getGrayValue(resizedData, i);
  }
  const average = sum / (resizedData.length / 4);

  // G??n??rer le hash binaire
  let hash = '';
  for (let i = 0; i < resizedData.length; i += 4) {
    const gray = getGrayValue(resizedData, i);
    hash += gray > average ? '1' : '0';
  }

  return hash;
}

function analyzeColors(data: Uint8ClampedArray, width: number, height: number): { brightness: number; contrast: number; saturation: number } {
  let totalBrightness = 0;
  let totalContrast = 0;
  let totalSaturation = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Luminosit?? (moyenne pond??r??e)
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    totalBrightness += brightness;

    // Saturation (??cart type des couleurs)
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    totalSaturation += saturation;

    count++;
  }

  const avgBrightness = totalBrightness / count;
  const avgSaturation = totalSaturation / count;

  // Calcul du contraste (simplifi??)
  let contrastSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = getGrayValue(data, i);
    contrastSum += Math.abs(gray - (avgBrightness * 255));
  }
  const contrast = Math.min(contrastSum / (count * 255), 1.0);

  return {
    brightness: avgBrightness, // Valeur r??elle 0-1
    contrast: contrast, // Valeur r??elle 0-1
    saturation: avgSaturation // Valeur r??elle 0-1
  };
}

function detectEyes(data: Uint8ClampedArray, width: number, height: number): boolean {
  // Zone du haut de l'image (o?? sont g??n??ralement les yeux)
  const eyeRegionHeight = Math.floor(height * 0.3); // Zone plus petite et plus pr??cise
  const startY = 0;
  const endY = eyeRegionHeight;

  // Analyser plusieurs zones pour d??tecter les yeux
  const zones = [
    { startX: 0, endX: Math.floor(width * 0.4), startY: 0, endY: Math.floor(eyeRegionHeight * 0.6) }, // Zone gauche
    { startX: Math.floor(width * 0.6), endX: width, startY: 0, endY: Math.floor(eyeRegionHeight * 0.6) }, // Zone droite
  ];

  let totalEyeScore = 0;

  for (const zone of zones) {
    let darkPixels = 0;
    let totalPixels = 0;
    let edgePixels = 0;

    for (let y = zone.startY; y < zone.endY; y++) {
      for (let x = zone.startX; x < zone.endX; x++) {
        const pixelIndex = (y * width + x) * 4;
        const gray = getGrayValue(data, pixelIndex);

        // Pixels sombres (yeux) - seuil bas?? sur la luminosit?? moyenne
        const avgBrightness = calculateAverageBrightness(data, width, height);
        if (gray < avgBrightness * 0.6) {
          darkPixels++;
        }

        // D??tection de contours (bords des yeux)
        if (y > 0 && x > 0) {
          const topPixel = getGrayValue(data, ((y - 1) * width + x) * 4);
          const leftPixel = getGrayValue(data, (y * width + (x - 1)) * 4);
          const gradient = Math.abs(gray - topPixel) + Math.abs(gray - leftPixel);

          // Seuil de contour bas?? sur la variance de l'image
          const imageVariance = calculateImageVariance(data, width, height);
          const edgeThreshold = imageVariance * 100;
          if (gradient > edgeThreshold) {
            edgePixels++;
          }
        }

        totalPixels++;
      }
    }

    if (totalPixels > 0) {
      const darkRatio = darkPixels / totalPixels;
      const edgeRatio = edgePixels / totalPixels;

      // Score combin?? : pixels sombres + contours (??quilibr??)
      const zoneScore = (darkRatio + edgeRatio) / 2;
      totalEyeScore += zoneScore;
    }
  }

  // Moyenne des zones
  const avgEyeScore = totalEyeScore / zones.length;

  // Seuil dynamique bas?? sur la luminosit?? moyenne de la zone des yeux
  let eyeZoneBrightness = 0;
  let eyeZoneCount = 0;

  for (let y = 0; y < eyeRegionHeight; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * 4;
      const gray = getGrayValue(data, pixelIndex);
      eyeZoneBrightness += gray;
      eyeZoneCount++;
    }
  }

  const avgEyeZoneBrightness = eyeZoneCount > 0 ? eyeZoneBrightness / eyeZoneCount : 128;

  // Plus la zone est sombre, plus on s'attend ?? des yeux
  const dynamicThreshold = (255 - avgEyeZoneBrightness) / 255 * 0.2;

  return avgEyeScore > dynamicThreshold;
}

function generateTags(file: File, blurAnalysis: { isBlurry: boolean; sharpnessScore: number }, colorAnalysis: { brightness: number; contrast: number; saturation: number }): string[] {
  const tags: string[] = [];
  const fileName = file.name.toLowerCase();
  const fileSize = file.size;

  // Tags bas??s sur la nettet?? (bas??s sur l'analyse r??elle)
  if (blurAnalysis.isBlurry) {
    if (blurAnalysis.sharpnessScore < 0.2) {
      tags.push('tr??s-flou', 'very-blurry');
    } else {
      tags.push('flou', 'blurry');
    }
  } else if (blurAnalysis.sharpnessScore > 0.8) {
    tags.push('tr??s-net', 'very-sharp');
  } else if (blurAnalysis.sharpnessScore > 0.5) {
    tags.push('net', 'sharp');
  } else {
    tags.push('moyennement-net', 'moderately-sharp');
  }

  // Tags bas??s sur les couleurs (valeurs r??elles 0-1)
  const brightnessThreshold = 0.5; // Seuil bas?? sur la luminosit?? moyenne
  if (colorAnalysis.brightness > brightnessThreshold + 0.3) {
    tags.push('tr??s-lumineux', 'very-bright');
  } else if (colorAnalysis.brightness > brightnessThreshold) {
    tags.push('lumineux', 'bright');
  } else if (colorAnalysis.brightness < brightnessThreshold - 0.3) {
    tags.push('tr??s-sombre', 'very-dark');
  } else if (colorAnalysis.brightness < brightnessThreshold - 0.1) {
    tags.push('sombre', 'dark');
  }

  const saturationThreshold = 0.5; // Seuil bas?? sur la saturation moyenne
  if (colorAnalysis.saturation > saturationThreshold + 0.3) {
    tags.push('tr??s-color??', 'very-colorful');
  } else if (colorAnalysis.saturation > saturationThreshold) {
    tags.push('color??', 'colorful');
  } else if (colorAnalysis.saturation < saturationThreshold - 0.3) {
    tags.push('d??satur??', 'desaturated');
  }

  // Tags bas??s sur le contraste
  const contrastThreshold = 0.5; // Seuil bas?? sur le contraste moyen
  if (colorAnalysis.contrast > contrastThreshold + 0.3) {
    tags.push('haut-contraste', 'high-contrast');
  } else if (colorAnalysis.contrast < contrastThreshold - 0.3) {
    tags.push('faible-contraste', 'low-contrast');
  }

  // Tags bas??s sur la taille (plus pr??cis)
  if (fileSize > 10 * 1024 * 1024) {
    tags.push('tr??s-haute-r??solution', 'very-high-resolution');
  } else if (fileSize > 5 * 1024 * 1024) {
    tags.push('haute-r??solution', 'high-resolution');
  } else if (fileSize > 2 * 1024 * 1024) {
    tags.push('moyenne-r??solution', 'medium-resolution');
  } else if (fileSize < 500 * 1024) {
    tags.push('basse-r??solution', 'low-resolution');
  }

  // Tags bas??s sur le nom de fichier (plus complets)
  if (fileName.includes('portrait') || fileName.includes('selfie') || fileName.includes('face')) {
    tags.push('portrait', 'selfie');
  }
  if (fileName.includes('landscape') || fileName.includes('paysage') || fileName.includes('nature')) {
    tags.push('landscape', 'paysage');
  }
  if (fileName.includes('macro') || fileName.includes('close')) {
    tags.push('macro', 'close-up');
  }
  if (fileName.includes('night') || fileName.includes('nuit')) {
    tags.push('nuit', 'night');
  }
  if (fileName.includes('sunset') || fileName.includes('sunrise') || fileName.includes('coucher')) {
    tags.push('coucher-soleil', 'sunset');
  }

  // Tags bas??s sur la qualit?? technique (valeurs r??elles)
  const qualityThreshold = 0.5; // Seuil bas?? sur la qualit?? moyenne
  if (blurAnalysis.sharpnessScore > qualityThreshold + 0.2 &&
      colorAnalysis.contrast > qualityThreshold + 0.2 &&
      colorAnalysis.saturation > qualityThreshold + 0.2) {
    tags.push('haute-qualit??', 'high-quality');
  } else if (blurAnalysis.sharpnessScore < qualityThreshold - 0.3 ||
             colorAnalysis.contrast < qualityThreshold - 0.3) {
    tags.push('qualit??-moyenne', 'medium-quality');
  }

  return tags.slice(0, 10); // Limiter ?? 10 tags
}

function getGrayValue(data: Uint8ClampedArray, index: number): number {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function resizeImageData(data: Uint8ClampedArray, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number): Uint8ClampedArray {
  const dstData = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;

  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.floor(x * xRatio);
      const srcY = Math.floor(y * yRatio);
      const srcIndex = (srcY * srcWidth + srcX) * 4;
      const dstIndex = (y * dstWidth + x) * 4;

      dstData[dstIndex] = data[srcIndex];
      dstData[dstIndex + 1] = data[srcIndex + 1];
      dstData[dstIndex + 2] = data[srcIndex + 2];
      dstData[dstIndex + 3] = data[srcIndex + 3];
    }
  }

  return dstData;
}


