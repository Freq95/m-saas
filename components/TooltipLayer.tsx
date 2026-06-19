'use client';

import { useEffect, useState } from 'react';

type TooltipState = {
  text: string;
  x: number;
  y: number;
  placement: 'top' | 'bottom';
} | null;

const GAP = 8;
const EDGE_PADDING = 12;
const ESTIMATED_MAX_WIDTH = 220;

function getTooltipText(target: EventTarget | null): { text: string; element: HTMLElement } | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>('[data-tooltip]');
  const text = element?.dataset.tooltip?.trim();
  if (!element || !text) return null;
  return { text, element };
}

function positionFor(element: HTMLElement, text: string): TooltipState {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const estimatedHeight = 34;
  const placement = rect.bottom + GAP + estimatedHeight > viewportHeight ? 'top' : 'bottom';
  const rawX = rect.left + rect.width / 2;
  const x = Math.min(
    viewportWidth - EDGE_PADDING,
    Math.max(EDGE_PADDING, rawX),
  );
  const y = placement === 'top' ? rect.top - GAP : rect.bottom + GAP;

  return {
    text,
    x: Math.min(viewportWidth - EDGE_PADDING - ESTIMATED_MAX_WIDTH / 2, Math.max(EDGE_PADDING + ESTIMATED_MAX_WIDTH / 2, x)),
    y,
    placement,
  };
}

export default function TooltipLayer() {
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  useEffect(() => {
    let activeElement: HTMLElement | null = null;

    const show = (target: EventTarget | null) => {
      const next = getTooltipText(target);
      if (!next) return;
      activeElement = next.element;
      setTooltip(positionFor(next.element, next.text));
    };

    const hide = (target: EventTarget | null) => {
      if (!activeElement) return;
      if (target instanceof Element && activeElement.contains(target)) return;
      activeElement = null;
      setTooltip(null);
    };

    const refresh = () => {
      if (!activeElement) return;
      const text = activeElement.dataset.tooltip?.trim();
      if (!text) {
        setTooltip(null);
        return;
      }
      setTooltip(positionFor(activeElement, text));
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      show(event.target);
    };
    const onPointerOut = (event: PointerEvent) => hide(event.relatedTarget);
    const onFocusIn = (event: FocusEvent) => show(event.target);
    const onFocusOut = () => {
      activeElement = null;
      setTooltip(null);
    };

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);

    return () => {
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
    };
  }, []);

  if (!tooltip) return null;

  return (
    <div
      className="tooltip-layer"
      data-placement={tooltip.placement}
      style={{ left: tooltip.x, top: tooltip.y }}
      role="tooltip"
    >
      {tooltip.text}
    </div>
  );
}
