// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// SVG element data for the Lucide icons used by this app, copied verbatim
// from lucide-static v1.57.0 (https://lucide.dev). Licence notices:
// ../../LICENSES/lucide.txt (ISC; icons derived from Feather, including
// search, x, info, arrow-up, arrow-down, arrow-left, are also MIT,
// Cole Bemis — both texts are in the licence file). Paths render as
// <path d>, circles as <circle cx cy r>. All icons share the 24x24
// viewBox, a 2px round stroke and currentColor (see <Icon />).
export type IconGeometry =
  | { readonly kind: 'path'; readonly d: string }
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number };

export type IconName =
  | 'plane'
  | 'search'
  | 'x'
  | 'info'
  | 'triangle-alert'
  | 'octagon-x'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-up-down'
  | 'arrow-left'
  | 'tower-control';

export const ICONS: Record<IconName, readonly IconGeometry[]> = {
  plane: [
    { kind: 'path', d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z' },
  ],
  search: [
    { kind: 'path', d: 'm21 21-4.34-4.34' },
    { kind: 'circle', cx: 11, cy: 11, r: 8 },
  ],
  x: [
    { kind: 'path', d: 'M18 6 6 18' },
    { kind: 'path', d: 'm6 6 12 12' },
  ],
  info: [
    { kind: 'circle', cx: 12, cy: 12, r: 10 },
    { kind: 'path', d: 'M12 16v-4' },
    { kind: 'path', d: 'M12 8h.01' },
  ],
  'triangle-alert': [
    { kind: 'path', d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' },
    { kind: 'path', d: 'M12 9v4' },
    { kind: 'path', d: 'M12 17h.01' },
  ],
  'octagon-x': [
    { kind: 'path', d: 'm15 9-6 6' },
    { kind: 'path', d: 'M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z' },
    { kind: 'path', d: 'm9 9 6 6' },
  ],
  'arrow-up': [
    { kind: 'path', d: 'm5 12 7-7 7 7' },
    { kind: 'path', d: 'M12 19V5' },
  ],
  'arrow-down': [
    { kind: 'path', d: 'M12 5v14' },
    { kind: 'path', d: 'm19 12-7 7-7-7' },
  ],
  'arrow-up-down': [
    { kind: 'path', d: 'm21 16-4 4-4-4' },
    { kind: 'path', d: 'M17 20V4' },
    { kind: 'path', d: 'm3 8 4-4 4 4' },
    { kind: 'path', d: 'M7 4v16' },
  ],
  'arrow-left': [
    { kind: 'path', d: 'm12 19-7-7 7-7' },
    { kind: 'path', d: 'M19 12H5' },
  ],
  'tower-control': [
    { kind: 'path', d: 'M18.2 12.27 20 6H4l1.8 6.27a1 1 0 0 0 .95.73h10.5a1 1 0 0 0 .96-.73Z' },
    { kind: 'path', d: 'M8 13v9' },
    { kind: 'path', d: 'M16 22v-9' },
    { kind: 'path', d: 'm9 6 1 7' },
    { kind: 'path', d: 'm15 6-1 7' },
    { kind: 'path', d: 'M12 6V2' },
    { kind: 'path', d: 'M13 2h-2' },
  ],
};
