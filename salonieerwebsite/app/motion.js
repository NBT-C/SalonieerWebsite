/* One quiet transition per page/dialog, implemented in refinement.css.
   No staggered cards, zoom, bounce, confetti, or continuous decorative motion. */
window.SalonMotion = { reduced: () => matchMedia("(prefers-reduced-motion: reduce)").matches };
