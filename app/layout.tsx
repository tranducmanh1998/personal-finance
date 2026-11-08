import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quản lý tài chính cá nhân",
  description: "Ứng dụng quản lý tài chính cá nhân",
  applicationName: "Quản lý tài chính cá nhân",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
