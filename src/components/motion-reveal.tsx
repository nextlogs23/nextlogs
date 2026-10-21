"use client";

import { useEffect } from "react";

export function MotionReveal() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>("main > section:not(:first-of-type)"));
    targets.forEach((target, index) => {
      target.classList.add("reveal-section");
      target.style.setProperty("--reveal-delay", `${Math.min(index * 45, 180)}ms`);
    });

    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -6%" },
    );

    targets.forEach(target => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return null;
}
