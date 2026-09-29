# Motion design research for Marga Run Club

**Checked:** 2026-09-29  
**Scope:** Authoritative guidance for fitness/health-themed web motion and GSAP implementation. This note records research only; no application code was changed.

## Practical recommendations

For a run-club site, use motion to clarify hierarchy and progress rather than simulate intense exertion continuously. A restrained entrance sequence, route/progress visualization, subtle card reveals, and scroll-linked storytelling can support the training/community narrative. Keep the primary content, event details, registration controls, and navigation usable without animation. These product recommendations are an application of the cited platform and accessibility guidance, not claims made by the sources.

1. **Make reduced motion a first-class mode.** Detect `prefers-reduced-motion: reduce` and remove or replace non-essential movement. A dissolve, color, or static state is preferable to scaling, panning, parallax, or large rotations for users who request less motion. [MDN-PRM, W3C-2.3.3, W3C-SCR40]
2. **Treat auto-running motion separately from interaction motion.** If a marquee, ticker, or other moving content starts automatically, continues for more than five seconds, and appears alongside other content, provide a pause/stop/hide mechanism unless it is essential. [W3C-2.2.2]
3. **Use one GSAP media-query boundary for responsive and accessible variants.** `gsap.matchMedia()` runs setup only while a query matches and automatically reverts the animations and ScrollTriggers when it stops matching. Its conditions-object form can combine desktop/mobile and reduced-motion decisions in one setup. [GSAP-MM]
4. **In React, scope and clean up every animation.** GSAP recommends `useGSAP()` for React; it wraps `gsap.context()` so animations, ScrollTriggers, Draggables, and SplitText instances are reverted on teardown. Animations created later in event handlers must be wrapped with `contextSafe()`, and manually attached listeners must be removed in cleanup. [GSAP-React, GSAP-Context]
5. **Use timelines for purposeful sequences, not scattered delays.** A timeline is a controllable container for tweens and nested timelines; labels and the position parameter make overlap and sequencing explicit. This is useful for a short hero reveal or event-card entrance that can also be paused/reversed or replaced in reduced-motion mode. [GSAP-Timeline]
6. **Prefer native scrolling with ScrollTrigger rather than scroll hijacking.** ScrollTrigger can trigger, scrub, pin, and snap animations, and GSAP describes ScrollSmoother as built on native scroll technology to avoid accessibility issues associated with other smooth-scrolling libraries. For accessible pages, use scroll effects as optional decoration and keep document flow/content access intact. [GSAP-ScrollTrigger]
7. **Be conservative with pinning and layout-affecting effects.** ScrollTrigger pre-calculates measurements; its documentation warns not to animate the pinned element itself because this can invalidate measurements—animate descendants instead. Create triggers in document order, refresh when layout changes, and avoid unnecessary `pinReparent`, which the docs describe as potentially expensive. [GSAP-ScrollTrigger]

## Implementation patterns supported by the sources

### Reduced-motion setup with GSAP

The following is a documentation-derived pattern, not code added to the application:

```js
const mm = gsap.matchMedia();

mm.add(
  {
    desktop: "(min-width: 800px)",
    mobile: "(max-width: 799px)",
    reduceMotion: "(prefers-reduced-motion: reduce)",
  },
  ({ conditions }) => {
    const { desktop, reduceMotion } = conditions;

    gsap.to(".hero-art", {
      y: reduceMotion ? 0 : desktop ? -24 : -10,
      duration: reduceMotion ? 0 : 1.2,
    });
  },
);

// If the app exposes its own motion toggle, mm.revert() can be used when
// changing modes; gsap.matchMediaRefresh() can re-run currently matching setup.
```

GSAP explicitly documents `prefers-reduced-motion` conditions, setting duration to `0` to skip to an end state, automatic context reversion, and `gsap.matchMediaRefresh()` for re-running matching setups. [GSAP-MM]

### React lifecycle and interaction cleanup

Use a scoped `useGSAP(() => { ... }, { scope: container })` setup for mount-time animation. For click/hover handlers or timers created after the hook runs, wrap the callback with `contextSafe()`. If an event listener is manually registered, return cleanup that removes the exact listener. This prevents stale animations and listeners across route changes, Strict Mode cycles, and component unmounts. [GSAP-React]

### Motion policy checklist

- Does the page still communicate route, event date, price, CTA labels, and status when all motion is removed?
- Does the reduced-motion branch avoid large panning/scaling/parallax, rather than merely making it slower? [MDN-PRM]
- Can a user pause/stop/hide any automatically moving content that persists alongside content for more than five seconds? [W3C-2.2.2]
- If animation is triggered by a click, hover, or scroll interaction, is it non-essential or can it be disabled through the reduced-motion preference or a site control? [W3C-2.3.3]
- Are ScrollTriggers scoped, reverted on teardown, and free of unnecessary pinning or scroll hijacking? [GSAP-MM, GSAP-Context, GSAP-ScrollTrigger]
- Is motion used as a supplement to semantic HTML and visible focus states, not as the sole way to convey a health metric or action?

## Primary sources

- **[GSAP-MM]** GSAP, `gsap.matchMedia()`: media-query-specific setup, automatic reversion, conditions syntax, responsive/reduced-motion examples, and refresh behavior. <https://gsap.com/docs/v3/GSAP/gsap.matchMedia/>
- **[GSAP-Context]** GSAP, `gsap.context()`: animation/ScrollTrigger collection, selector scoping, `revert()`, and cleanup functions. <https://gsap.com/docs/v3/GSAP/gsap.context/>
- **[GSAP-React]** GSAP, React / `useGSAP()`: React cleanup, scope, `contextSafe()`, and event-listener cleanup. <https://gsap.com/resources/React/>
- **[GSAP-Timeline]** GSAP, Timeline: sequencing, labels, position parameters, nesting, control, and defaults. <https://gsap.com/docs/v3/GSAP/Timeline/>
- **[GSAP-ScrollTrigger]** GSAP, ScrollTrigger: trigger/scrub/pin/snap behavior, refresh, cleanup, pinning cautions, and native-scroll note. <https://gsap.com/docs/v3/Plugins/ScrollTrigger/>
- **[MDN-PRM]** MDN Web Docs, `prefers-reduced-motion`: user preference semantics, vestibular-motion risk, and toned-down-animation example. <https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion>
- **[W3C-2.3.3]** W3C WAI, WCAG 2.2 Understanding SC 2.3.3 “Animation from Interactions” (Level AAA): disable non-essential interaction-triggered motion or honor reduced-motion preferences. <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html>
- **[W3C-SCR40]** W3C WAI, Technique SCR40: evaluate `prefers-reduced-motion` in JavaScript and suppress non-essential motion. <https://www.w3.org/WAI/WCAG22/Techniques/client-side-script/SCR40>
- **[W3C-2.2.2]** W3C WAI, WCAG 2.2 Understanding SC 2.2.2 “Pause, Stop, Hide” (Level A): controls for automatically moving/blinking/scrolling content. <https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html>

W3C Understanding documents and Techniques are informative guidance/examples; the normative WCAG success criteria remain the conformance authority. [W3C-2.3.3, W3C-2.2.2, W3C-SCR40]
