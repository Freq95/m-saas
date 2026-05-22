'use client';

import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

type UseModalOptions = {
  isOpen: boolean;
  onClose: () => void;
  closeDisabled?: boolean;
  shouldCloseOnEscape?: () => boolean;
};

export function useModal<TDialog extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  closeDisabled = false,
  shouldCloseOnEscape,
}: UseModalOptions) {
  const dialogRef = useRef<TDialog | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const backdropPressStartedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (!dialog.contains(document.activeElement)) {
        dialog.focus({ preventScroll: true });
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      const opener = openerRef.current;
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
      openerRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return;
      if (closeDisabled || shouldCloseOnEscape?.() === false) return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeDisabled, isOpen, onClose, shouldCloseOnEscape]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    backdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeDisabled) return;
    const endedOnBackdrop = event.target === event.currentTarget;
    if (backdropPressStartedRef.current && endedOnBackdrop) {
      onClose();
    }
    backdropPressStartedRef.current = false;
  };

  return {
    dialogRef,
    overlayProps: {
      onPointerDown,
      onClick,
    },
    dialogProps: {
      ref: dialogRef,
      tabIndex: -1,
      onClick: (event: MouseEvent<TDialog>) => event.stopPropagation(),
    },
  };
}
