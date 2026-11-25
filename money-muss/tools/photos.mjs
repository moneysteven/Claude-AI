// The only picture files this site may use. Shared by the build step and the audit.
//
// Drop each photo into /images with exactly these names (jpg, jpeg, png or webp).

export const PHOTOS = [
  'logo-clean',
  'exterior-clean',
  'patio-umbrellas',
  'lounge-clean',
  'gaming-machines',
  'staircase',
  'bar-clean',
  'drinks-red-stripe',
  'drinks-guinness-bucket',
];

// Extra treatments cut from the same real file. "duo" is the crimson two-tone used
// behind the big type in the bar section.
export const VARIANTS = { 'bar-clean': ['duo'] };

export const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
export const WIDTHS = [480, 768, 1080, 1440, 1920];
export const FORMATS = ['avif', 'webp', 'jpg'];

// Not photographs: two small repeating textures the build step draws from noise.
export const TEXTURES = ['brand/grain.png', 'brand/paper.webp'];
