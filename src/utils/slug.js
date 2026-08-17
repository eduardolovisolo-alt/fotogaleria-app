const galleryModel = require('../models/galleryModel');

function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(name) {
  const base = slugify(name) || 'galeria';
  let candidate = base;
  let suffix = 1;

  while (await galleryModel.slugExists(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}

module.exports = { slugify, uniqueSlug };
