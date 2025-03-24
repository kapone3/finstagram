import { useEffect, useRef, useState } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  pullDistance?: number;
  resistance?: number;
}

export function usePullToRefresh({ onRefresh, pullDistance = 100, resistance = 3 }: PullToRefreshOptions) {
  const [isPulling, setIsPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const pullMoveY = useRef(0);
  const distanceRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtTopRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkIfAtTop = () => {
      isAtTopRef.current = window.scrollY <= 0;
    };

    const handleTouchStart = (e: TouchEvent) => {
      checkIfAtTop();
      if (!isAtTopRef.current) return;

      pullStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || !isAtTopRef.current) return;

      // Prevent default scrolling when pulling
      if (isAtTopRef.current && e.cancelable) {
        e.preventDefault();
      }

      pullMoveY.current = e.touches[0].clientY;
      const distance = (pullMoveY.current - pullStartY.current) / resistance;

      // Only allow pulling down
      if (distance > 0) {
        distanceRef.current = distance;
        if (container) {
          container.style.transform = `translateY(${distance}px)`;
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling) return;

      setIsPulling(false);
      const distance = distanceRef.current;
      distanceRef.current = 0;

      if (container) {
        container.style.transition = 'transform 0.3s ease-out';
        container.style.transform = 'translateY(0)';
      }

      if (distance >= pullDistance && isAtTopRef.current) {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }

      // Reset after animation
      setTimeout(() => {
        if (container) {
          container.style.transition = '';
        }
      }, 300);
    };

    // Add scroll event listener to track position
    window.addEventListener('scroll', checkIfAtTop, { passive: true });
    
    // Add touch event listeners with proper options
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('scroll', checkIfAtTop);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isPulling, onRefresh, pullDistance, resistance]);

  return {
    containerRef,
    refreshing,
  };
}