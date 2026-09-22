"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipState = {
  label: string;
  left: number;
  top: number;
};

const navigationSelector = ".sidebar-compact #fornost-navigation button[aria-label]";
const activeSelector = ".sidebar-compact #fornost-navigation button[data-fornost-sidebar-tooltip]";
const tooltipId = "fornost-sidebar-icon-tooltip";

export default function SidebarIconTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const sourceRef = useRef<HTMLButtonElement | null>(null);
  const previousDescribedByRef = useRef<string | null>(null);

  useEffect(() => {
    const restoreSource = () => {
      const source = sourceRef.current;
      if (source) {
        const nativeTitle = source.dataset.fornostSidebarNativeTitle;
        if (nativeTitle && !source.hasAttribute("title")) source.setAttribute("title", nativeTitle);
        delete source.dataset.fornostSidebarNativeTitle;
        delete source.dataset.fornostSidebarTooltip;

        const previous = previousDescribedByRef.current;
        if (previous) source.setAttribute("aria-describedby", previous);
        else source.removeAttribute("aria-describedby");
      }
      sourceRef.current = null;
      previousDescribedByRef.current = null;
      setTooltip(null);
    };

    const show = (button: HTMLButtonElement) => {
      const label = button.getAttribute("aria-label") || button.getAttribute("title") || "";
      if (!label) return;
      if (sourceRef.current && sourceRef.current !== button) restoreSource();

      const nativeTitle = button.getAttribute("title");
      if (nativeTitle) {
        button.dataset.fornostSidebarNativeTitle = nativeTitle;
        button.removeAttribute("title");
      }
      button.dataset.fornostSidebarTooltip = label;
      previousDescribedByRef.current = button.getAttribute("aria-describedby");
      button.setAttribute("aria-describedby", tooltipId);
      sourceRef.current = button;

      const rect = button.getBoundingClientRect();
      setTooltip({
        label,
        left: Math.min(rect.right + 12, window.innerWidth - 28),
        top: Math.max(24, Math.min(rect.top + rect.height / 2, window.innerHeight - 24)),
      });
    };

    const buttonFrom = (target: EventTarget | null, selector: string) =>
      target instanceof Element ? target.closest<HTMLButtonElement>(selector) : null;

    const onPointerOver = (event: PointerEvent) => {
      const button = buttonFrom(event.target, navigationSelector);
      if (button) show(button);
    };
    const onPointerOut = (event: PointerEvent) => {
      const button = buttonFrom(event.target, activeSelector);
      if (!button) return;
      if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
      restoreSource();
    };
    const onFocusIn = (event: FocusEvent) => {
      const button = buttonFrom(event.target, navigationSelector);
      if (button) show(button);
    };
    const onFocusOut = (event: FocusEvent) => {
      const button = buttonFrom(event.target, activeSelector);
      if (!button) return;
      if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
      restoreSource();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") restoreSource();
    };
    const onViewportChange = () => restoreSource();

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      restoreSource();
    };
  }, []);

  if (!tooltip || typeof document === "undefined") return null;

  return createPortal(
    <div
      id={tooltipId}
      className="sidebar-icon-tooltip"
      role="tooltip"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      {tooltip.label}
    </div>,
    document.body,
  );
}
