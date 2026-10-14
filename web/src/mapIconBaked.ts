// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Runtime side of the baked map icons: decode the generated RGBA and hand
// MapLibre a plain {width, height, data} object. No canvas, no <img>, no
// ImageBitmap: MapLibre runs the latter two through a canvas getImageData
// (maplibre-gl addImage), which privacy browsers (Mullvad, Tor,
// resistFingerprinting) noise.
import { MAP_ICON_PX, MAP_ICON_RGBA } from './mapIconData';
import type { RgbaImage } from './mapIconDraw';

export interface IconRegistry {
  hasImage: (id: string) => boolean;
  addImage: (id: string, image: RgbaImage, options?: { pixelRatio: number }) => void;
}

/** Decode one baked icon; throws if the id was never generated. */
export function bakedIcon(id: string): RgbaImage {
  const b64 = MAP_ICON_RGBA[id];
  if (b64 === undefined) throw new Error(`baked map icon missing: ${id} (run gen:icons)`);
  const bin = atob(b64);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  return { width: MAP_ICON_PX, height: MAP_ICON_PX, data };
}

/** Register the given baked icons on the map (2x), skipping existing ids. */
export function registerBakedIcons(map: IconRegistry, ids: readonly string[]): void {
  for (const id of ids) {
    if (!map.hasImage(id)) map.addImage(id, bakedIcon(id), { pixelRatio: 2 });
  }
}
