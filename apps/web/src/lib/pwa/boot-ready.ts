/**
 * The cold-start splash (#pwa-boot-splash) used to wait for React to hydrate
 * (a useEffect in SignalPwaBootReady) even though the server-rendered UI was
 * already painted underneath it. This script hides it as soon as the route's
 * essential UI is in the DOM instead.
 *
 * <SignalPwaBootReady /> renders a hidden `[data-boot-ready]` marker. The
 * splash goes once a marker is "ready", which keeps the rule that a route
 * never drops the splash on a bare first paint:
 *  - a marker that comes AFTER some content (it has a previous sibling) means
 *    "the UI before me is parsed" — used by the landing, right after the hero;
 *  - a marker that leads its container says nothing about the content that
 *    follows, so it waits until the whole HTML document is parsed
 *    (DOMContentLoaded — scripts are async, so this does not wait for JS);
 *  - a marker inside a not-yet-revealed Suspense boundary (`[hidden]`
 *    ancestor) is ignored until React swaps it into the page.
 * Images are deliberately not waited for: the hero frame has a fixed aspect
 * ratio, so the photo fills in progressively without moving anything.
 *
 * Hydration-based hiding in PwaSplashDismiss stays as the fallback.
 */
export const BOOT_READY_ATTR = "data-boot-ready";

export function bootReadyScript(): string {
  const attr = JSON.stringify(`[${BOOT_READY_ATTR}]`);
  return `(()=>{try{var d=document,done=false,obs=null;function hide(){var s=d.getElementById("pwa-boot-splash");if(!s||s.dataset.dismissed==="true")return;s.dataset.dismissed="true";s.style.opacity="0";s.style.pointerEvents="none";s.style.transition="opacity 0.28s ease";s.setAttribute("aria-hidden","true");s.removeAttribute("aria-live");s.removeAttribute("role");if(d.documentElement.dataset.resolvedTheme==="light"){d.documentElement.style.backgroundColor="#e8e0d4";d.documentElement.style.color="#1a1612"}}function fire(){requestAnimationFrame(function(){requestAnimationFrame(hide)})}function go(){if(done)return;done=true;if(obs)obs.disconnect();d.removeEventListener("DOMContentLoaded",check);fire()}function check(){var ms=d.querySelectorAll(${attr});for(var i=0;i<ms.length;i++){var m=ms[i],p=m.parentElement;if(p&&p.closest("[hidden]"))continue;if(!m.previousElementSibling&&d.readyState==="loading")continue;go();return}}obs=new MutationObserver(check);obs.observe(d.documentElement,{childList:true,subtree:true});d.addEventListener("DOMContentLoaded",check);check()}catch(_){}})();`;
}
