import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NAGU BOT",
  description: "Spoon OAuth connection for NAGU BOT",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
