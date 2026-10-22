# EV Grid responsive audit

Baseline: deployed https://ev-grid-eta.vercel.app/, inspected before application edits on 11 October 2026. An isolated Edge/Chromium browser produced the valid baseline below. Generated screenshots and raw measurement/Lighthouse reports were removed after verification at the user's request.

| Component | Viewport | Issue | Severity | Fix |
| --- | --- | --- | --- | --- |
| Hero orbit | 844×390 | Document width 875px at 844px viewport. Exact contributing element: `.visual-orbit.orbit-two` (500px fixed diameter). `.hero-map-line` extends geometrically but is clipped inside `.hero-grid` and does not itself cause document scrolling. | High | Bound decorative orbit to its container; stack hero below desktop. |
| Header | 1024×768, 844×390 | Five links plus account actions use desktop navigation; compact spacing and text leave little room for text enlargement. | High | Collapse public navigation below 1280px based on the width required by readable links and 44px targets. |
| Public menu | Phones, 768×1024 | Source locks body only in workspace mode; public menu can scroll the underlying page. Focus trapping and Escape exist, but baseline automated click did not establish hydration readiness, so interaction result is inconclusive. | High | Lock both menus, use a consistent collapse breakpoint, filter hidden focus targets, verify focus return after hydration. |
| Tap targets | 1024×768, 1280×800, 1440×900, 844×390 | 33 visible controls below 44px in one or both dimensions, including header, favorites, Details/Book, FAQ and footer. Mobile baseline controls pass size measurement. | High | Apply target sizing globally and keep 8px gaps. |
| Hero decorations | 320×568, 360×800, 390×844, 414×896 | Absolute floating cards and tiny captions crowd the illustration; fake initials AR/SK/AM appear as placeholder social proof. | Med | Hide decorative illustration under 768px, keep useful proof in normal flow, remove initials. |
| Hero CTAs | 360×640 | Both CTAs already fit (bottom 413px), but long copy competes with proof and graphic. | Low | Preserve above-fold actions with fluid type and spacing; no fixed height on text. |
| Station cards | All nine sizes | Address/body fonts 10–14px; tiny chips; price/rating compete with action buttons on desktop. Host badge is disconnected above the title. | High | Host badge beside title; separate wrapping chips, price/rating row, and full-width actions. |
| Feature / steps grids | 768×1024 | Two columns leave the third card orphaned. Landscape uses narrow three-column cards. | Med | Use content-driven grid sizing and span the final card in two-column three-item grids. |
| Stats strip | Phone sizes | Two-by-two structure works, but labels are 9px and long text is cramped. Desktop labels 11px. | Med | Readable wrapping labels, min-width:0, fluid padding; two-by-two then four columns. |
| FAQ / footer | All nine sizes | Body text small; summary and footer targets too short above 800px. Two footer columns on 390/414px squeeze long paragraphs. | Med | 16px body, 44px targets, one column first, auto-fit wider columns. |
| Performance / images | All sizes | 302,560-byte logo rendered around 47×33px without intrinsic dimensions; Google Fonts and Leaflet CSS use remote CSS imports; Recharts is eagerly included on the landing page. | High | Size and optimize logo, self-host same fonts, bundle map CSS, lazy-load charts. |
| Reduced motion / safe areas / zoom | All sizes | Reduced-motion rule exists; several fixed sizes and nowrap rules resist 200% text enlargement. Safe-area coverage is inconsistent at desktop/tablet. | Med | Relative type, wrapping, intrinsic grids, safe-area padding and reduced-motion map behavior. |
| Loading metrics | All sizes | No valid Lighthouse/CLS/LCP baseline yet. Observed initial stylesheet/loading delay cannot establish a production metric. | Med | Run production Lighthouse and report actual values, never infer scores from CSS. |

Baseline document width equals viewport at 320, 360, 390, 414, 768, 1024, 1280 and 1440px; only 844px landscape overflows. Phone body paragraph measurements include 12/14/16px; desktop includes 10/11/12/13/15px. Screenshots confirm long desktop headline wrapping in landscape.

Assumption: keep the existing local station dataset, label it “Station listings” rather than implying verified live availability. No backend integration or deployment is included in this responsiveness change.

## Final verification

Production build, lint and TypeScript checks passed. The local production build was tested in headless Edge at every requested size and additionally 360×640.

| Viewport | Before document width | After document width | After undersized targets | After gaps under 8px |
| --- | --- | --- | --- | --- |
| 320×568 | 320 | 320 | 0 | 0 |
| 360×800 | 360 | 360 | 0 | 0 |
| 390×844 | 390 | 390 | 0 | 0 |
| 414×896 | 414 | 414 | 0 | 0 |
| 768×1024 | 768 | 768 | 0 | 0 |
| 1024×768 | 1024 | 1024 | 0 | 0 |
| 1280×800 | 1280 | 1280 | 0 | 0 |
| 1440×900 | 1440 | 1440 | 0 | 0 |
| 844×390 | 875 | 844 | 0 | 0 |
| 360×640 | 360 | 360 | 0 | 0 |

Both hero CTAs end at 404px on 360×640, comfortably above the fold. All measured landing-page paragraphs are now 16px. At 1024px, a decorative map line extends geometrically outside its box but remains clipped and produces no document overflow.

Public Find Chargers, Contact and Login passed width and 44px target checks at all nine requested viewports. Home and Host Add Charger passed document-width checks with the root font enlarged to 200% at all nine sizes. This tests text enlargement in a browser, not physical Android devices.

Public and workspace navigation passed open/close, aria-expanded, body scroll lock, Escape, focus containment and focus restoration checks. Two-column three-card sections span the final card, and footer columns progress one → two → four.

Final Lighthouse 12.3 mobile audit against the local production server, using default mobile throttling: Performance **87**, Accessibility **100**, LCP **2.75s**, CLS **0**, total blocking time **288ms**. Accessibility and CLS meet the requested thresholds; Performance ≥90 and LCP <2.5s remain unmet. No original Lighthouse baseline was established, and these local lab results do not certify the deployed Vercel site. Redeploy and remeasure before treating the performance targets as achieved.

First-load JavaScript decreased from approximately 227kB to 128kB; the logo decreased from 302,560 to 6,736 bytes. No application dependencies were added.

## Non-obvious changes

- An 80rem header container threshold preserves room for readable navigation and responds to enlarged text.
- Final odd cards span both columns to prevent orphaned cards at tablet widths.
- The original brand fonts are self-hosted and preloaded to remove external stylesheet requests.
- Public navigation stores its collapse state in a ref to avoid an unnecessary full-page hydration render.
- Content visibility defers below-fold rendering while intrinsic sizes reserve space.
- Charts load only when needed, and Leaflet styles load with the map component.
- Reduced-motion preferences also disable map fly-to animation.
- Explicit logo dimensions reserve space; next/image supplies responsive optimized output.

## Files changed

- `frontend/app/globals.css`
- `frontend/app/responsive.css` (new)
- `frontend/app/layout.tsx`
- `frontend/components/App.tsx`
- `frontend/components/StationMap.tsx`
- `frontend/components/RevenueChart.tsx` (new)
- `frontend/next.config.mjs` (new)
- `frontend/public/ev-grid-logo.webp` (new)
- `frontend/public/fonts/dm-sans-latin.woff2` (new)
- `frontend/public/fonts/manrope-latin.woff2` (new)
- `frontend/public/fonts/DM-Sans-OFL.txt` (new)
- `frontend/public/fonts/Manrope-OFL.txt` (new)
- `scripts/responsive-audit.cjs` (new; repeatable browser verification)
- `scripts/responsive-interactions.cjs` (new; repeatable interaction/zoom verification)
- `docs/responsive-audit.md` (new; this retained summary)

The verification scripts can regenerate measurements and screenshots when explicitly rerun. Generated screenshots and raw reports are not retained in this change.
