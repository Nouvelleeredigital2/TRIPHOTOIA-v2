import type { EditableMetadata } from '../types';

// Métadonnées : construction d'un sidecar XMP (Dublin Core) à joindre à l'export.
// L'export ré-encode les images via <canvas>, ce qui efface l'EXIF/IPTC binaire ;
// un sidecar .xmp standard (lisible par Lightroom/Bridge/ExifTool) préserve les
// champs éditables sans réinjection binaire fragile.

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
  const lis = items.map((k) => `    <rdf:li>${xmlEscape(k)}</rdf:li>`).join('\n');
  return `   <${tag}><rdf:Bag>\n${lis}\n   </rdf:Bag></${tag}>`;
};

/** True si au moins un champ éditable est renseigné (sinon, pas de sidecar). */
export const hasEditableMetadata = (meta?: EditableMetadata | null): boolean => {
  if (!meta) return false;
  return Boolean(
    meta.title?.trim() ||
      meta.caption?.trim() ||
      meta.copyright?.trim() ||
      meta.creator?.trim() ||
      (meta.keywords ?? []).some((k) => k.trim()),
  );
};

/** Construit un paquet XMP (Dublin Core) à partir des champs éditables. */
export const buildXmpSidecar = (meta: EditableMetadata): string => {
  const fields = [
    altField('dc:title', meta.title),
    altField('dc:description', meta.caption),
    bagField('dc:subject', meta.keywords),
    altField('dc:rights', meta.copyright),
    seqField('dc:creator', meta.creator),
  ].filter((f): f is string => f !== null);

  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    ...fields,
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
