"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

function isInFirstScreen(node: Element): boolean {
  const rect = node.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}

/**
 * Scroll-in animation for `[data-reveal]`.
 * On-screen blocks stay visible immediately; only off-screen ones wait to appear.
 */
export function RevealOnScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const nodes = document.querySelectorAll("[data-reveal]");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((node) => {
        node.classList.add("reveal-instant");
        node.classList.remove("reveal-pending");
      });
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.remove("reveal-pending");
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" },
    );

    nodes.forEach((node) => {
      if (node.classList.contains("is-visible")) return;
      if (isInFirstScreen(node)) {
        node.classList.add("reveal-instant");
        node.classList.remove("reveal-pending");
        return;
      }
      node.classList.add("reveal-pending");
      io.observe(node);
    });

    return () => io.disconnect();
  }, [pathname]);

  return null;
}
