import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Neo Atlas · 你的网络坐标",
  description: "个人网站导航与收藏管理",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
