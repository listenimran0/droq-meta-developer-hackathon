import { dataUriToBase64, detectImageKind, foundCardFileName } from '../utils/imageShare';

describe('detectImageKind', () => {
  it('detects WebP (RIFF), PNG and JPEG', () => {
    expect(detectImageKind('UklGRoLNBQBXRUJQ').ext).toBe('webp');
    expect(detectImageKind('UklGRoLN').uti).toBe('org.webmproject.webp');
    expect(detectImageKind('data:image/png;base64,UklGRoLN').mime).toBe('image/webp');
    expect(detectImageKind('iVBORw0KGgo=').ext).toBe('png');
    expect(detectImageKind('/9j/4AAQSkZJRg==').mime).toBe('image/jpeg');
  });
  it('falls back to png', () => {
    expect(detectImageKind('????').ext).toBe('png');
  });
});

describe('dataUriToBase64', () => {
  it('extracts base64 and strips whitespace', () => {
    expect(dataUriToBase64('data:image/png;base64,AB CD==')).toBe('ABCD==');
  });
  it('rejects non-data and non-base64 URIs', () => {
    expect(dataUriToBase64('https://x.test/a.png')).toBeNull();
    expect(dataUriToBase64('data:text/plain,hello')).toBeNull();
  });
});

describe('foundCardFileName', () => {
  it('sanitizes the drop id', () => {
    expect(foundCardFileName('ab-12/../x', 'webp')).toBe('droq-found-ab-12x.webp');
    expect(foundCardFileName('///', 'png')).toBe('droq-found-card.png');
  });
});
