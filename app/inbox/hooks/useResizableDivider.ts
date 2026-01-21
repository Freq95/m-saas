/**
 * Custom hook for resizable divider functionality
 */

import { useState, useEffect, useRef } from 'react';
import { INBOX_CONFIG } from '../constants';

export function useResizableDivider(initialWidth: number = INBOX_CONFIG.DEFAULT_LEFT_WIDTH) {
  const [leftWidth, setLeftWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth = e.clientX - containerRect.left;
      
      // Constrain within min/max bounds
      const maxLeftWidth = containerRect.width - INBOX_CONFIG.MIN_RIGHT_WIDTH;
      const constrainedWidth = Math.max(
        INBOX_CONFIG.MIN_LEFT_WIDTH,
        Math.min(newLeftWidth, maxLeftWidth)
      );
      
      setLeftWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return {
    leftWidth,
    isResizing,
    setIsResizing,
    containerRef,
  };
}

