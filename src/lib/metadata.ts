import type { ColorLabel, EditableMetadata } from '../types';

// Métadonnées : construction d'un sidecar XMP (Dublin Core + xmp:Rating/Label) à
// joindre à l'export. L'export ré-encode les images via <canvas>, ce qui efface
// l'EXIF/IPTC binaire ; un sidecar .xmp standard (lisible par Lightroom/Bridge/
// Capture One/ExifTool) préserve les champs éditables ET les décisions de tri
// (note étoiles, label couleur) — interop avec les outils pro.

/** Décisions de tri portables vers les outils pro (note + label couleur). */
export interface CullingDecisions {
  /** Note 0-5 → `xmp:Rating` (lue par Lightroom/Bridge/Capture One). */
  rating?: number;
  /** Label couleur → `xmp:Label` (nom standard Lightroom). */
  label?: ColorLabel | null;
}

// Lightroom/Bridge attendent un nom de label en clair (capitalisé). Les clés de
// l'app correspondent aux 5 labels par défaut de Lightroom.
const LIGHTROOM_LABELS: Record<ColorLabel, string> = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
};

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const altField = (tag: string, value?: string): string | null => {
  const v = value?.trim();
  if (!v) return null;
  return `   <${tag}><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(v)}</rdf:li></rdf:Alt></${tag}>`;
};

const seqField = (tag: string, value?: string): string | null => {
  const v = value?.trim();
  if (!v) return null;
  return `   <${tag}><rdf:Seq><rdf:li>${xmlEscape(v)}</rdf:li></rdf:Seq></${tag}>`;
};

const bagField = (tag: string, values?: string[]): string | null => {
  const items = (values ?? []).map((k) => k.trim()).filter(Boolean);
  if (items.length === 0) return null;
  const lis = items
    .map((k) => `    <rdf:li>${xmlEscape(k)}</rdf:li>`)
    .join('\n');
  return `   <${tag}><rdf:Bag>\n${lis}\n   </rdf:Bag></${tag}>`;
};

/** True si au moins un champ éditable est renseigné (sinon, pas de sidecar). */
export const hasEditableMetadata = (
  meta?: EditableMetadata | null
): boolean => {
  if (!meta) return false;
  return Boolean(
    meta.title?.trim() ||
    meta.caption?.trim() ||
    meta.copyright?.trim() ||
    meta.creator?.trim() ||
    (meta.keywords ?? []).some((k) => k.trim())
  );
};

/** True si une note (>0) ou un label sont présents (décisions de tri portables). */
export const hasCullingDecisions = (d?: CullingDecisions | null): boolean =>
  Boolean(d && ((d.rating ?? 0) > 0 || d.label));

/** True s'il y a quelque chose à exporter (champs éditables OU décisions de tri). */
export const hasExportableMetadata = (
  meta?: EditableMetadata | null,
  decisions?: CullingDecisions | null
): boolean => hasEditableMetadata(meta) || hasCullingDecisions(decisions);

/**
 * Construit un paquet XMP (Dublin Core + xmp:Rating/Label) à partir des champs
 * éditables et des décisions de tri. `meta` et `decisions` sont optionnels :
 * un sidecar peut ne contenir que la note/label (cas le plus fréquent en tri).
 */
export const buildXmpSidecar = (
  meta: EditableMetadata = {},
  decisions?: CullingDecisions
): string => {
  const dcFields = [
    altField('dc:title', meta.title),
    altField('dc:description', meta.caption),
    bagField('dc:subject', meta.keywords),
    altField('dc:rights', meta.copyright),
    seqField('dc:creator', meta.creator),
  ].filter((f): f is string => f !== null);

  const xmpFields: string[] = [];
  const rating = decisions?.rating ?? 0;
  if (rating > 0) {
    xmpFields.push(`   <xmp:Rating>${Math.round(rating)}</xmp:Rating>`);
  }
  if (decisions?.label) {
    xmpFields.push(
      `   <xmp:Label>${xmlEscape(LIGHTROOM_LABELS[decisions.label])}</xmp:Label>`
    );
  }

  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '  <rdf:Description rdf:about=""' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
      ' xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
    ...dcFields,
    ...xmpFields,
    '  </rdf:Description>',
    ' </rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n');
};

/** Nom du sidecar : `<base>.xmp` (remplace l'extension image). */
export const metadataSidecarFilename = (photoName: string): string => {
  const base = photoName.replace(/\.[^/.]+$/, '');
  return `${base || photoName}.xmp`;
};
