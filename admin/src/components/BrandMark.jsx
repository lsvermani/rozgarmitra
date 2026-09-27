const logoSrc = `${import.meta.env.BASE_URL}logo-small.svg`;

/**
 * Small RM magnifier logo used wherever a brand mark is required.
 * `size` is the rendered square size in px (default 32).
 * Keeps the wordmark text next to the mark so existing headings stay intact.
 */
export default function BrandMark({ size = 32, className = '', imgClassName = '' }) {
  const px = Number(size) || 32;
  return (
    <span
      className={`rm-brand-mark ${className}`.trim()}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <img
        className={`rm-brand-mark__img ${imgClassName}`.trim()}
        src={logoSrc}
        alt="RozgarMitra logo"
        width={px}
        height={px}
        style={{ width: px, height: px, objectFit: 'contain', flex: 'none' }}
        loading="eager"
      />
    </span>
  );
}
