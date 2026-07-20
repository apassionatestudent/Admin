// => utils/slugify.js
// => Converts a title into a URL-safe, SEO-friendly slug.
// => "Bread and Pastry Production NCII" -> "bread-and-pastry-production-ncii"

export function slugify(text) {
  return (text || '')
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // => strip accents (é -> e)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // => collapse anything non-alphanumeric into a single hyphen
    .replace(/^-+|-+$/g, ''); // => trim leading/trailing hyphens
}
