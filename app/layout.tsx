import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./game-ui.css";
import "./garage-ui.css";
import { PwaRegister } from "./pwa-register";

const description =
  "네 가지 색의 숫자 카드로 족보를 만들고, 플레이어가 제작한 메이헴 카드로 한 수를 뒤집는 로그라이크 카드 게임.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070b0e",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og-mayhem-ui.png", metadataBase).toString();
  return {
    metadataBase,
    title: "DECK MAYHEM — 커뮤니티 카드 로그라이크",
    description,
    manifest: "/manifest.webmanifest",
    applicationName: "DECK MAYHEM",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "DECK MAYHEM" },
    icons: { icon: "/icons/icon.svg", shortcut: "/icons/icon.svg", apple: "/icons/icon.svg" },
    openGraph: {
      type: "website",
      title: "DECK MAYHEM",
      description,
      images: [{ url: socialImage, width: 1732, height: 908, alt: "DECK MAYHEM 픽셀 카드 게임" }],
    },
    twitter: { card: "summary_large_image", title: "DECK MAYHEM", description, images: [socialImage] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
