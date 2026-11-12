import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "하늘빛창호 콘텐츠 스튜디오",
  description: "하늘빛창호 시공 사진으로 SNS 콘텐츠를 만들고 검토·승인하는 공간"
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}