/* textures.js
   Define block metadata and optional texture sources in one place.
   - Exposes `window.BLOCKS` array.
   - Exposes `window.loadBlockTextures(tile)` which loads any `textureSrc` images
     and converts them to TILE-sized offscreen canvases assigned to `block.texture`.
   Edit this file to add/remove blocks or point `textureSrc` to image paths.
*/
(function(){
  const BLOCKS = [
    { id: 0, name: 'Air', solid: false, color: null, textureSrc: null },
    { id: 1, name: 'Dirt', solid: true, color: '#8B5A2B', textureSrc: 'textures/dirt.png' },
    { id: 2, name: 'Grass', solid: true, color: '#3FBF69', textureSrc: 'textures/grass.png' },
    { id: 3, name: 'Stone', solid: true, color: '#7D7D7D', textureSrc: 'textures/stone.png' }
  ];

  function loadBlockTextures(tile) {
    const promises = BLOCKS.map((b) => {
      if (!b.textureSrc) return Promise.resolve();
      return new Promise((res) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const oc = document.createElement('canvas');
          oc.width = tile; oc.height = tile;
          const occtx = oc.getContext('2d');
          const ratio = Math.max(tile / img.width, tile / img.height);
          const sw = tile / ratio, sh = tile / ratio;
          const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
          occtx.drawImage(img, sx, sy, sw, sh, 0, 0, tile, tile);
          b.texture = oc;
          res();
        };
        img.onerror = () => { res(); };
        img.src = b.textureSrc;
      });
    });
    return Promise.all(promises).then(() => BLOCKS);
  }

  window.BLOCKS = BLOCKS;
  window.loadBlockTextures = loadBlockTextures;
})();
