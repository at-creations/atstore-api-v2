/**
 * Normalizes Vietnamese text by replacing accented characters with their non-accented equivalents.
 * This is useful for search functionality and text comparison.
 *
 * @param str - The Vietnamese string to normalize
 * @returns A normalized string with accents removed
 */
export const normalizeVietnamese = (str: string): string => {
  if (!str) return "";

  return str
    .toLowerCase()
    .replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a")
    .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e")
    .replace(/ì|í|ị|ỉ|ĩ/g, "i")
    .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o")
    .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u")
    .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Generates a URL-friendly slug from a string
 *
 * @param str - The string to convert to a slug
 * @returns A URL-friendly slug
 */
export const generateSlug = (str: string): string => {
  // First normalize any Vietnamese characters
  const normalized = normalizeVietnamese(str);

  // Then create the slug by replacing spaces with hyphens and removing special characters
  return normalized
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/--+/g, "-") // Replace multiple hyphens with a single hyphen
    .trim();
};
