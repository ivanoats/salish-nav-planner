/** Normalizes a display name for fuzzy matching (e.g. matching a "To" cell against a known location name). */
export const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const NM_FOLDERS_LINK = /(?:ca-)?nm_folders\/([a-z0-9_-]+)\.html/i;

/** Derives a URL-safe slug from an nwcruising.net `nm_folders/<slug>.html` link. */
export const slugFromHref = (href: string): string => {
  const found = NM_FOLDERS_LINK.exec(href);
  if (found === null) {
    throw new Error(`Not an nm_folders link: ${href}`);
  }
  const [, slug] = found;
  if (slug === undefined) {
    throw new Error(`Not an nm_folders link: ${href}`);
  }
  return slug.toLowerCase();
};
