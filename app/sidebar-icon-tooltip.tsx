"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipState = {
  label: string;
  left: number;
  top: number;
};

const navigationSelector = ".sidebar-compact #fornost-navigation button[title]";
const activeSelector = ".sidebar-compact #fornost-navigation button[data-fornost-sidebar-tooltip]";

export default function SidebarIconTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const sourceRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const restoreTitle = () => {
      const source = sourceRef.current;
      if (source) {
        const label = source.dataset.fornostSidebarTooltip;
        if (label && !source.hasAttribute("title")) source.setAttribute("title", label);
        delete source.dataset.fornostSidebarTooltip;
      }
      sourceRef.current = null;
      setTooltip(null);
    };

    const show = (button: HTMLButtonElement) => {
      const label = button.getAttribute("title") || button.dataset.fornostSidebarTooltip || "";
      if (!label) return;
      if (sourceRef.current && sourceRef.current !== button) restoreTitle();

      button.dataset.fornostSidebarTooltip = label;
      button.removeAttribute("title");
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
      restoreTitle();
    };
    const onFocusIn = (event: FocusEvent) => {
      const button = buttonFrom(event.target, navigationSelector);
      if (button) show(button);
    };
    const onFocusOut = (event: FocusEvent) => {
      const button = buttonFrom(event.target, activeSelector);
      if (!button) return;
      if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
      restoreTitle();
    };
    const onViewportChange = () => restoreTitle();

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      restoreTitle();
    };
  }, []);

  if (!tooltip || typeof document === "undefined") return null;

  return createPortal(
    <div
      id="fornost-sidebar-icon-tooltip"
      className="sidebar-icon-tooltip"
      role="tooltip"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      {tooltip.label}
    </div>,
    document.body,
  );
}
