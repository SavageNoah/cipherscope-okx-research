import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "CipherScope｜OKX 加密资产投研终端",
  description: "可配置的 OKX 深跌资产筛选、X 动态研究与三个月情景分析工具。",
  openGraph: {
    title: "CipherScope｜OKX 加密资产投研终端",
    description: "实时筛选、X 动态研究与三个月情景分析。",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "CipherScope 加密资产投研终端" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CipherScope｜OKX 加密资产投研终端",
    description: "实时筛选、X 动态研究与三个月情景分析。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
