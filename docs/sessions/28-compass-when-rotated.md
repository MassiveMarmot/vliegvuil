# Session 28 (plan): compass only when rotated

Row 28 in docs/BUILD.md section 4. Plan only; a coding agent implements it.

## Sources (maplibre-gl 6.14.0, per web/package.json)

[NavigationControl](https://github.com/maplibre/maplibre-gl-js/blob/v6.14.0/src/ui/control/navigation_control.ts): options only showCompass/showZoom/visualizePitch/visualizeRoll — no hide-at-0 option (confirms useMap.ts ~220); click calls resetNorth(). [camera.ts](https://github.com/maplibre/maplibre-gl-js/blob/v6.14.0/src/ui/camera.ts): resetNorth() = easeTo(bearing 0, 1000 ms); easeTo duration 0 under prefers-reduced-motion; programmatic jumpTo/setBearing fire rotatestart/rotate/rotateend; getBearing() reads it. [keyboard.ts](https://github.com/maplibre/maplibre-gl-js/blob/v6.14.0/src/ui/handler/keyboard.ts): Shift+←/→ = ±15° via easeTo → 'rotate' fires. Mouse/touch rotation goes through setBearing/easeTo → 'rotate'. Events: [Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/). UNVERIFIED: 6.14 canvas focusability — check map.getCanvas().tabIndex, else hand focus to .map-container.

## Behaviour/A11y

visible = Math.abs(getBearing()) >= 0.5 (epsilon). Hidden at start (bearing 0). Appears on any rotation; hides only when 'rotateend' reports 0 — i.e. after the 1 s reset finished (instant under reduced motion). Hidden = 'hidden' attribute on the portaled compassElement: display:none, not focusable, not announced (never opacity). If the focused compass hides, focus moves to the map region (canvas, else .map-container tabindex="-1"), never <body>. Keyboard rotation shows it. Keep the pop-in (vv-panel-pop, no-preference only); no new animation under prefers-reduced-motion.

## Edits (minimal, targeted)

- useMap.ts ~70, ~250-253 (after compassControl.onAdd): internal compassVisible state (public signature unchanged), EPSILON, one 'rotate' + one 'rotateend' listener, effect applying hidden + focus handoff; off() both in cleanup (~324-336).
- map-chrome.css ~138-140: '[hidden]{display:none}' guard for the compass group; pop-in block (~144-149) untouched.
- Map.tsx only if the canvas proves unfocusable: tabindex="-1" on .map-container (~327-330).
- New web/__tests__/compassVisibility.test.tsx (reuse the a11ySession26 fake-map harness; fire its registered listeners).

## Tests (DOM/state, not CSS text)

1. After init compassElement has hidden. 2. 'rotate' bearing 40 → hidden removed. 3. Then 'rotateend' bearing 0 → hidden again. 4. Focus the compass, hide → activeElement is the map region, never body. 5. Reduced motion (matchMedia stub): attribute-based toggling, no animation dependency.

## Do not touch

WebGL2 failure path, aircraft layers, noise overlay, units, useMap's public signature, existing tests, the compass portal (.map-compass-overlay) and the Firefox canvas-above-chrome fix (PRs #124/#126).

## Manual checks

Firefox (nightly + radeonsi), Mullvad Browser, touch two-finger rotate, keyboard Shift+arrow: compass appears when rotated, hides after reset.
