"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, X } from "lucide-react";

export type TipsToastItem = {
  id: string;
  message: string;
};

const EXIT_MS = 320;

type TipsToastBubbleProps = {
  message: string;
  onClose: () => void;
  duration?: number;
};

export function TipsToastBubble({
  message,
  onClose,
  duration = 3000,
}: TipsToastBubbleProps) {
  const [exiting, setExiting] = useState(false);
  const closedRef = useRef(false);

  const beginClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setExiting(true);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(onClose, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting, onClose]);

  useEffect(() => {
    if (duration <= 0) return;
    const timer = window.setTimeout(beginClose, duration);
    return () => window.clearTimeout(timer);
  }, [duration, beginClose]);

  return (
    <div
      className={`pointer-events-auto relative w-fit min-w-[10rem] max-w-[min(calc(100vw-2rem),22rem)] ${
        exiting ? "tips-toast-exit" : "tips-toast-enter"
      }`}
    >
      <div
        className="relative rounded-2xl border border-amber-500/35 bg-card/92 px-4 py-2 shadow-[0_10px_36px_rgba(0,0,0,0.38),0_0_0_1px_rgba(251,191,36,0.08)_inset] backdrop-blur-md"
        role="status"
      >
        <button
          type="button"
          className="absolute right-1 top-1 z-10 rounded-md p-1 text-muted-foreground/70 transition hover:bg-amber-500/10 hover:text-foreground disabled:pointer-events-none"
          aria-label="关闭"
          disabled={exiting}
          onClick={beginClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-2 pr-5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
            <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </div>
          <p className="min-w-0 flex-1 text-center text-sm leading-snug text-foreground/90">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

type TipsToastStackProps = {
  items: TipsToastItem[];
  onDismiss: (id: string) => void;
  duration?: number;
};

export function TipsToastStack({ items, onDismiss, duration = 3000 }: TipsToastStackProps) {
  if (items.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <>
      <style>{`
        @keyframes tips-toast-in {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes tips-toast-out {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(-6px) scale(0.88);
          }
        }
        .tips-toast-enter {
          animation: tips-toast-in 0.22s ease-out forwards;
        }
        .tips-toast-exit {
          animation: tips-toast-out 0.32s ease-in forwards;
          pointer-events: none;
        }
      `}</style>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex flex-col items-center gap-2 p-4"
        role="alert"
        aria-live="assertive"
      >
        {items.map((item) => (
          <TipsToastBubble
            key={item.id}
            message={item.message}
            onClose={() => onDismiss(item.id)}
            duration={duration}
          />
        ))}
      </div>
    </>,
    document.body,
  );
}
