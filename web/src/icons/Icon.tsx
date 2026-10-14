// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Renders a Lucide icon by name from the verbatim path data in paths.ts
// (see ../../LICENSES/lucide.txt for the ISC/MIT licence notices).
// 24x24 viewBox, 2px round stroke, currentColor; decorative by default
// (aria-hidden) — buttons/links keep their accessible names, which is
// why this component takes no label.
import React from 'react';
import { ICONS, type IconName } from './paths';

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 24, className }: IconProps): React.ReactElement {
  const geometry = ICONS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {geometry.map((g, i): React.ReactElement =>
        g.kind === 'circle' ? (
          <circle key={i} cx={g.cx} cy={g.cy} r={g.r} />
        ) : (
          <path key={i} d={g.d} />
        ),
      )}
    </svg>
  );
}

export default Icon;
