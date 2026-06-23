import { describe, it, expect } from 'vitest';
import {
  buildXmpSidecar,
  hasCullingDecisions,
  hasEditableMetadata,
  hasExportableMetadata,
  metadataSidecarFilename,
} from '../../lib/metadata';

describe('metadata sidecar', () => {
  it('detects whether any editable field is set', () => {
    expect(hasEditableMetadata(undefined)).toBe(false);
    expect(hasEditableMetadata({})).toBe(false);
    expect(hasEditableMetadata({ keywords: ['', '  '] })).toBe(false);
    expect(hasEditableMetadata({ title: 'x' })).toBe(true);
    expect(hasEditableMetadata({ keywords: ['mariage'] })).toBe(true);
  });

  it('derives the sidecar filename by replacing the extension', () => {
    expect(metadataSidecarFilename('2Z9A4172.JPG')).toBe('2Z9A4172.xmp');
    expect(metadataSidecarFilename('photo.test.jpeg')).toBe('photo.test.xmp');
    expect(metadataSidecarFilename('noext')).toBe('noext.xmp');
  });

  it('builds a Dublin Core XMP packet with only the provided fields', () => {
    const xmp = buildXmpSidecar({
      title: 'Cérémonie',
      keywords: ['mariage', 'couple'],
      copyright: '© Studio',
    });
    expect(xmp).toContain('<?xpacket begin');
    expect(xmp).toContain('<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Cérémonie</rdf:li>');
    expect(xmp).toContain('<rdf:li>mariage</rdf:li>');
    expect(xmp).toContain('<rdf:li>couple</rdf:li>');
    expect(xmp).toContain('<dc:rights>');
    // Champs non fournis absents.
    expect(xmp).not.toContain('<dc:description>');
    expect(xmp).not.toContain('<dc:creator>');
  });

  it('XML-escapes special characters', () => {
    const xmp = buildXmpSidecar({ title: 'A & B <x> "q"' });
    expect(xmp).toContain('A &amp; B &lt;x&gt; &quot;q&quot;');
    expect(xmp).not.toContain('<x>');
  });

  describe('décisions de tri (interop Lightroom/Capture One)', () => {
    it('hasCullingDecisions / hasExportableMetadata', () => {
      expect(hasCullingDecisions(undefined)).toBe(false);
      expect(hasCullingDecisions({ rating: 0, label: null })).toBe(false);
      expect(hasCullingDecisions({ rating: 4 })).toBe(true);
      expect(hasCullingDecisions({ label: 'red' })).toBe(true);
      // exportable = éditable OU décisions
      expect(hasExportableMetadata(undefined, undefined)).toBe(false);
      expect(hasExportableMetadata({}, { rating: 5 })).toBe(true);
      expect(hasExportableMetadata({ title: 'x' }, undefined)).toBe(true);
    });

    it('écrit xmp:Rating (étoiles) lisible par Lightroom', () => {
      const xmp = buildXmpSidecar({}, { rating: 5 });
      expect(xmp).toContain('xmlns:xmp="http://ns.adobe.com/xap/1.0/"');
      expect(xmp).toContain('<xmp:Rating>5</xmp:Rating>');
    });

    it('mappe le label couleur vers le nom Lightroom (red → Red)', () => {
      expect(buildXmpSidecar({}, { label: 'red' })).toContain(
        '<xmp:Label>Red</xmp:Label>'
      );
      expect(buildXmpSidecar({}, { label: 'purple' })).toContain(
        '<xmp:Label>Purple</xmp:Label>'
      );
    });

    it('n’émet ni Rating (0) ni Label (null)', () => {
      const xmp = buildXmpSidecar({}, { rating: 0, label: null });
      expect(xmp).not.toContain('<xmp:Rating>');
      expect(xmp).not.toContain('<xmp:Label>');
    });

    it('combine champs éditables et décisions de tri dans un seul paquet', () => {
      const xmp = buildXmpSidecar(
        { title: 'Cérémonie', keywords: ['mariage'] },
        { rating: 4, label: 'green' }
      );
      expect(xmp).toContain('<dc:title>');
      expect(xmp).toContain('<xmp:Rating>4</xmp:Rating>');
      expect(xmp).toContain('<xmp:Label>Green</xmp:Label>');
    });
  });
});
