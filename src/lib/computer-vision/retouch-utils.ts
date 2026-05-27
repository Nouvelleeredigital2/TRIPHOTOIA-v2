import { AutoRetouchPreset, RetouchOptions } from '../../types';

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const LUMINANCE_R = 0.2126;
const LUMINANCE_G = 0.7152;
const LUMINANCE_B = 0.0722;

export const applyToneAndPresenceAdjustments = (imageData: ImageData, options: RetouchOptions): ImageData => {
  const { data, width, height } = imageData;
  const length = data.length;

  const temperatureDelta = clamp((options.temperature / 100) * 30, -40, 40);
  const tintDelta = clamp((options.tint / 100) * 30, -40, 40);
  const highlights = options.highlights / 100;
  const shadows = options.shadows / 100;
  const whites = options.whites / 100;
  const blacks = options.blacks / 100;
  const clarity = options.clarity / 100;
  const texture = options.texture / 100;
  const dehaze = options.dehaze / 100;
  const vibrance = options.vibrance / 100;
  const midtoneContrast = options.midtoneContrast / 100;

  // Precompute simple blur for texture enhancement (3x3 box) using separable pass on luminance
  const luminance = new Float32Array(width * height);
  for (let i = 0, p = 0; i < length; i += 4, p++) {
    luminance[p] = data[i] * LUMINANCE_R + data[i + 1] * LUMINANCE_G + data[i + 2] * LUMINANCE_B;
  }

  const blurred = texture !== 0 ? boxBlur(luminance, width, height) : luminance;

  for (let idx = 0, p = 0; idx < length; idx += 4, p++) {
    let r = data[idx];
    let g = data[idx + 1];
    let b = data[idx + 2];

    if (temperatureDelta !== 0) {
      r = clamp(r + temperatureDelta, 0, 255);
      b = clamp(b - temperatureDelta, 0, 255);
    }

    if (tintDelta !== 0) {
      r = clamp(r + tintDelta, 0, 255);
      g = clamp(g - tintDelta * 0.5, 0, 255);
      b = clamp(b + tintDelta, 0, 255);
    }

    let lum = LUMINANCE_R * r + LUMINANCE_G * g + LUMINANCE_B * b;
    const normalized = lum / 255;

    const highlightWeight = normalized * normalized;
    const shadowWeight = (1 - normalized) * (1 - normalized);
    const whitesWeight = Math.pow(normalized, 4);
    const blacksWeight = Math.pow(1 - normalized, 4);
    const midtoneWeight = 1 - Math.abs(normalized - 0.5) * 2;

    const toneDelta =
      highlights * highlightWeight * 90 +
      shadows * shadowWeight * 90 +
      whites * whitesWeight * 140 +
      blacks * blacksWeight * 140;

    r = clamp(r + toneDelta, 0, 255);
    g = clamp(g + toneDelta, 0, 255);
    b = clamp(b + toneDelta, 0, 255);

    lum = LUMINANCE_R * r + LUMINANCE_G * g + LUMINANCE_B * b;
    const currentDetailR = r - lum;
    const currentDetailG = g - lum;
    const currentDetailB = b - lum;

    if (midtoneContrast !== 0) {
      const midtoneDelta = midtoneContrast * (normalized - 0.5) * 120;
      r = clamp(r + midtoneDelta, 0, 255);
      g = clamp(g + midtoneDelta, 0, 255);
      b = clamp(b + midtoneDelta, 0, 255);
      lum = LUMINANCE_R * r + LUMINANCE_G * g + LUMINANCE_B * b;
    }

    if (clarity !== 0) {
      const clarityDelta = clarity * midtoneWeight * 60;
      r = clamp(r + currentDetailR * clarityDelta, 0, 255);
      g = clamp(g + currentDetailG * clarityDelta, 0, 255);
      b = clamp(b + currentDetailB * clarityDelta, 0, 255);
    }

    if (texture !== 0) {
      const blurLum = blurred[p];
      const textureDetail = lum - blurLum;
      const textureDelta = textureDetail * texture * 0.8;
      r = clamp(r + textureDelta, 0, 255);
      g = clamp(g + textureDelta, 0, 255);
      b = clamp(b + textureDelta, 0, 255);
    }

    if (dehaze !== 0) {
      const hazeDelta = (0.5 - normalized) * dehaze * 180;
      r = clamp(r + hazeDelta, 0, 255);
      g = clamp(g + hazeDelta, 0, 255);
      b = clamp(b + hazeDelta * 0.9, 0, 255);
    }

    if (vibrance !== 0) {
      const satFactor = 1 + vibrance * (1 - normalized);
      r = clamp(lum + (r - lum) * satFactor, 0, 255);
      g = clamp(lum + (g - lum) * satFactor, 0, 255);
      b = clamp(lum + (b - lum) * satFactor, 0, 255);
    }

    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
  }

  return imageData;
};

export const applyUnsharpMask = (imageData: ImageData, intensity: number): ImageData => {
  const { data, width, height } = imageData;
  const output = new ImageData(new Uint8ClampedArray(data), width, height);

  const kernel = [
    [0, -intensity * 0.5, 0],
    [-intensity * 0.5, 1 + intensity * 2, -intensity * 0.5],
    [0, -intensity * 0.5, 0],
  ];

  const side = kernel.length;
  const halfSide = Math.floor(side / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let cy = 0; cy < side; cy++) {
        for (let cx = 0; cx < side; cx++) {
          const scy = y + cy - halfSide;
          const scx = x + cx - halfSide;

          if (scy >= 0 && scy < height && scx >= 0 && scx < width) {
            const srcOff = (scy * width + scx) * 4;
            const wt = kernel[cy][cx];

            r += data[srcOff] * wt;
            g += data[srcOff + 1] * wt;
            b += data[srcOff + 2] * wt;
          }
        }
      }

      const dstOff = (y * width + x) * 4;
      output.data[dstOff] = clamp(Math.round(r), 0, 255);
      output.data[dstOff + 1] = clamp(Math.round(g), 0, 255);
      output.data[dstOff + 2] = clamp(Math.round(b), 0, 255);
      output.data[dstOff + 3] = data[dstOff + 3];
    }
  }

  return output;
};

const boxBlur = (source: Float32Array, width: number, height: number): Float32Array => {
  const radius = 1;
  const output = new Float32Array(source.length);

  // Horizontal pass
  const temp = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    let acc = 0;
    for (let x = -radius; x <= radius; x++) {
      const clampedX = Math.min(width - 1, Math.max(0, x));
      acc += source[y * width + clampedX];
    }
    temp[y * width] = acc / (radius * 2 + 1);
    for (let x = 1; x < width; x++) {
      const addIdx = Math.min(width - 1, x + radius);
      const subIdx = Math.max(0, x - radius - 1);
      acc += source[y * width + addIdx] - source[y * width + subIdx];
      temp[y * width + x] = acc / (radius * 2 + 1);
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) {
      const clampedY = Math.min(height - 1, Math.max(0, y));
      acc += temp[clampedY * width + x];
    }
    output[x] = acc / (radius * 2 + 1);
    for (let y = 1; y < height; y++) {
      const addIdx = Math.min(height - 1, y + radius);
      const subIdx = Math.max(0, y - radius - 1);
      acc += temp[addIdx * width + x] - temp[subIdx * width + x];
      output[y * width + x] = acc / (radius * 2 + 1);
    }
  }

  return output;
};

const percentileFromHistogram = (histogram: Uint32Array, total: number, percentile: number): number => {
  const target = total * percentile;
  let cumulative = 0;
  for (let i = 0; i < histogram.length; i++) {
    cumulative += histogram[i];
    if (cumulative >= target) {
      return i;
    }
  }
  return histogram.length - 1;
};

export const computeAutoRetouchOptions = (imageData: ImageData): AutoRetouchPreset => {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  if (totalPixels === 0) {
    return { options: {}, confidence: 0 };
  }

  const histogram = new Uint32Array(256);
  let sumLum = 0;
  let sumLumSq = 0;
  let sumSat = 0;
  let sumEdge = 0;
  let sumTexture = 0;
  let tempAccum = 0;
  let tintAccum = 0;
  let prevLum = 0;
  let edgeCount = 0;

  const sampleStep = Math.max(1, Math.floor(totalPixels / 60000));

  for (let idx = 0, pixel = 0; idx < data.length; idx += 4, pixel++) {
    if (pixel % sampleStep !== 0) {
      continue;
    }

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const lum = LUMINANCE_R * r + LUMINANCE_G * g + LUMINANCE_B * b;
    histogram[Math.round(clamp(lum, 0, 255))]++;
    sumLum += lum;
    sumLumSq += lum * lum;

    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
    sumSat += saturation;

    tempAccum += r - b;
    tintAccum += r - g * 0.5 - b * 0.5;

    if (edgeCount > 0) {
      sumEdge += Math.abs(lum - prevLum);
      sumTexture += Math.abs((r - g) + (g - b));
    }
    prevLum = lum;
    edgeCount++;
  }

  const sampledPixels = Math.max(1, Math.floor(totalPixels / sampleStep));
  const meanLum = sumLum / sampledPixels;
  const variance = sumLumSq / sampledPixels - meanLum * meanLum;
  const stdLum = Math.sqrt(Math.max(variance, 0));
  const avgSat = sumSat / sampledPixels;
  const avgEdge = sumEdge / Math.max(1, edgeCount - 1);
  const avgTexture = sumTexture / Math.max(1, edgeCount - 1);

  const p10 = percentileFromHistogram(histogram, sampledPixels, 0.1);
  const p90 = percentileFromHistogram(histogram, sampledPixels, 0.9);
  const p2 = percentileFromHistogram(histogram, sampledPixels, 0.02);
  const p98 = percentileFromHistogram(histogram, sampledPixels, 0.98);

  const options: Partial<RetouchOptions> = {};
  let decisions = 0;

  const exposureAdj = clamp(((128 - meanLum) / 128) * 45, -35, 35);
  if (Math.abs(exposureAdj) > 3) {
    options.exposure = exposureAdj;
    decisions++;
  }

  const targetStd = 42;
  const contrastAdj = clamp(((targetStd - stdLum) / targetStd) * 60, -40, 40);
  if (Math.abs(contrastAdj) > 3) {
    options.contrast = contrastAdj;
    decisions++;
  }

  const shadowAdj = clamp(((70 - p10) / 255) * 80, -30, 40);
  if (Math.abs(shadowAdj) > 4) {
    options.shadows = shadowAdj;
    decisions++;
  }

  const highlightAdj = clamp(((p90 - 185) / 255) * -80, -40, 30);
  if (Math.abs(highlightAdj) > 4) {
    options.highlights = highlightAdj;
    decisions++;
  }

  const whitesAdj = clamp(((p98 - 235) / 255) * -100, -35, 0);
  if (Math.abs(whitesAdj) > 5) {
    options.whites = whitesAdj;
    decisions++;
  }

  const blacksAdj = clamp(((35 - p2) / 255) * 90, 0, 35);
  if (Math.abs(blacksAdj) > 5) {
    options.blacks = blacksAdj;
    decisions++;
  }

  const vibranceAdj = clamp((0.25 - avgSat) * 120, -25, 35);
  if (Math.abs(vibranceAdj) > 3) {
    options.vibrance = vibranceAdj;
    decisions++;
  }

  const clarityAdj = clamp((0.08 - avgEdge / 255) * 320, -20, 35);
  if (Math.abs(clarityAdj) > 2) {
    options.clarity = clarityAdj;
    decisions++;
  }

  const textureAdj = clamp((0.25 - avgTexture / 255) * 220, -20, 30);
  if (Math.abs(textureAdj) > 2) {
    options.texture = textureAdj;
    decisions++;
  }

  const dehazeAdj = clamp(((p90 - p10) < 110 ? 20 : 0) - ((p98 - p2) < 180 ? 10 : 0), -20, 25);
  if (Math.abs(dehazeAdj) > 3) {
    options.dehaze = dehazeAdj;
    decisions++;
  }

  const midtoneAdj = clamp((0.5 - meanLum / 255) * 90, -30, 30);
  if (Math.abs(midtoneAdj) > 3) {
    options.midtoneContrast = midtoneAdj;
    decisions++;
  }

  const temperatureAdj = clamp((tempAccum / sampledPixels) * 0.02, -30, 30);
  if (Math.abs(temperatureAdj) > 2) {
    options.temperature = temperatureAdj;
    decisions++;
  }

  const tintAdj = clamp((tintAccum / sampledPixels) * 0.02, -20, 20);
  if (Math.abs(tintAdj) > 2) {
    options.tint = tintAdj;
    decisions++;
  }

  const confidence = clamp(decisions / 10, 0, 1);
  return { options, confidence };
};
