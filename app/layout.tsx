import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

const description =
  "네 가지 색의 숫자 카드로 족보를 만들고, 플레이어가 제작한 UNO 카드로 한 수를 뒤집는 로그라이크 카드 게임.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", metadataBase).toString();
  return {
    metadataBase,
    title: "COLOR BUST — 커뮤니티 카드 로그라이크",
    description,
    manifest: "/manifest.webmanifest",
    applicationName: "COLOR BUST",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "COLOR BUST" },
    icons: { icon: "/icons/icon.svg", shortcut: "/icons/icon.svg", apple: "/icons/icon.svg" },
    openGraph: {
      type: "website",
      title: "COLOR BUST",
      description,
      images: [{ url: socialImage, width: 1734, height: 907, alt: "COLOR BUST 카드 게임" }],
    },
    twitter: { card: "summary_large_image", title: "COLOR BUST", description, images: [socialImage] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
