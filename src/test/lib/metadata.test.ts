import { describe, it, expect } from 'vitest';
import {
  buildXmpSidecar,
  hasEditableMetadata,
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
});
