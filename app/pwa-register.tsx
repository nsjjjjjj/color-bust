"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const localHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
      if (process.env.NODE_ENV !== "production" || localHost) {
        // A production service worker can outlive an earlier local preview and
        // cache Vite's CSS/HMR wrappers under the same URL. Remove both the
        // registration and DECK MAYHEM caches before continuing local work.
        void (async () => {
          const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
          const cacheKeys = "caches" in window ? await caches.keys().catch(() => []) : [];
          const gameCacheKeys = cacheKeys.filter((key) => key.startsWith("deck-mayhem-"));
          const hadLocalWorkerState = registrations.length > 0 || gameCacheKeys.length > 0;

          await Promise.all([
            ...registrations.map((registration) => registration.unregister()),
            ...gameCacheKeys.map((key) => caches.delete(key)),
          ]);

          const reloadKey = "deck-mayhem-local-sw-cleaned";
          if (hadLocalWorkerState && sessionStorage.getItem(reloadKey) !== "1") {
            sessionStorage.setItem(reloadKey, "1");
            window.location.reload();
          } else if (!hadLocalWorkerState) {
            sessionStorage.removeItem(reloadKey);
          }
        })().catch(() => undefined);
      } else {
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      }
    }
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  if (!visible || !installPrompt) return null;

  return (
    <aside className="install-toast" aria-label="앱 설치 안내">
      <div>
        <strong>DECK MAYHEM 설치</strong>
        <span>홈 화면에서 오프라인으로 바로 플레이하세요.</span>
      </div>
      <button
        type="button"
        onClick={async () => {
          await installPrompt.prompt();
          await installPrompt.userChoice;
          setVisible(false);
          setInstallPrompt(null);
        }}
      >
        추가
      </button>
      <button type="button" aria-label="설치 안내 닫기" onClick={() => setVisible(false)}>
        ×
      </button>
    </aside>
  );
}
