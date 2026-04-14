import { useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const SECTIONS = [
  "/financas",
  "/financas/transacoes",
  "/financas/cartoes",
  "/financas/orcamento",
  "/financas/configuracoes",
];

const SWIPE_THRESHOLD = 60;
const SWIPE_MAX_Y = 80;

export function useSwipeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!touchStart.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = Math.abs(touch.clientY - touchStart.current.y);
      touchStart.current = null;

      if (Math.abs(dx) < SWIPE_THRESHOLD || dy > SWIPE_MAX_Y) return;

      const currentIndex = SECTIONS.indexOf(location.pathname);
      if (currentIndex === -1) return;

      const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex >= 0 && nextIndex < SECTIONS.length) {
        navigate(SECTIONS[nextIndex]);
      }
    },
    [location.pathname, navigate]
  );

  useEffect(() => {
    // Only on mobile
    const mql = window.matchMedia("(max-width: 1023px)");
    if (!mql.matches) return;

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);
}
