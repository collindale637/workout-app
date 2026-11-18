/**
 * "Minimize" for a full-screen page: freeze a picture of it, navigate underneath, then slide the picture down off the
 * screen. A copy of the DOM is used rather than the browser's view transitions, because Safari left the fixed set
 * panel frozen in place and faded the rest; a plain moving layer behaves the same in every browser.
 *
 * `screen` is the page's root element. Fixed children (the set panel) stay put because the layer is itself fixed and
 * full-screen, so inside it "fixed" still means "bottom of the screen".
 */
export function slideAwayThen(screen: HTMLElement | null, navigate: () => void) {
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!screen || reduce || typeof screen.animate !== "function") return navigate();

  const bg = getComputedStyle(document.body).backgroundColor || "#0B0E1A";
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("inert", "");
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    zIndex: "1000",
    overflow: "hidden",
    pointerEvents: "none",
    // Transform from the start, so fixed children are placed against this layer (the full screen) the whole time.
    transform: "translateY(0)",
    willChange: "transform",
    boxShadow: "0 -12px 32px rgba(0,0,0,0.45)",
  });
  const copy = screen.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  Object.assign(copy.style, { background: bg, minHeight: "100dvh", transform: `translateY(${-window.scrollY}px)` });
  layer.appendChild(copy);
  document.body.appendChild(layer);

  navigate();

  // One frame so the page underneath can paint, then slide.
  requestAnimationFrame(() => {
    const anim = layer.animate([{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], {
      duration: 340,
      // Even ease-in-out: starts gently, so the whole slide is visible instead of jumping most of the way at once.
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards",
    });
    const done = () => layer.remove();
    anim.onfinish = done;
    anim.oncancel = done;
    setTimeout(done, 1000); // never leave it behind
  });
}
