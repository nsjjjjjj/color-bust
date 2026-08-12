"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isAppleMobile, setIsAppleMobile] = useState(false);
  const [showAppleGuide, setShowAppleGuide] = useState(false);

  useEffect(() => {
    const isStandalone = () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    setIsAppleMobile(appleMobile);
    if (appleMobile && !isStandalone()) setVisible(true);

    // Android/Chrome obey the manifest at launch. This is an extra guard for
    // installed browsers that expose the Screen Orientation API.
    const lockLandscape = () => {
      if (!isStandalone()) return;
      const orientation = screen.orientation as (ScreenOrientation & {
        lock?: (orientation: "landscape" | "landscape-primary" | "landscape-secondary") => Promise<void>;
      }) | undefined;
      void orientation?.lock?.("landscape").catch(() => undefined);
    };
    lockLandscape();

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

  if (!visible || (!installPrompt && !isAppleMobile)) return null;

  const requestInstall = async () => {
    if (!installPrompt) {
      setShowAppleGuide(true);
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setVisible(false);
    setInstallPrompt(null);
  };

  return (
    <aside className="install-toast" aria-label="앱 설치 안내">
      <div>
        <strong>DECK MAYHEM 설치</strong>
        <span>{showAppleGuide ? "Safari 공유 버튼 → ‘홈 화면에 추가’를 누르세요." : "홈 화면에서 가로 화면으로 바로 플레이하세요."}</span>
      </div>
      <button
        type="button"
        onClick={() => void requestInstall()}
      >
        {isAppleMobile && !installPrompt ? "방법 보기" : "홈에 추가"}
      </button>
      <button type="button" aria-label="설치 안내 닫기" onClick={() => setVisible(false)}>
        ×
      </button>
    </aside>
  );
}
