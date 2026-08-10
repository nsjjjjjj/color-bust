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
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
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
        <strong>COLOR BUST 설치</strong>
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

