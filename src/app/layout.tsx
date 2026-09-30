import type { Metadata } from "next";
import favicon from "@/asset/favicon-48x48.png";
import "./globals.css";

export const metadata: Metadata = {
  title: "NAGU BOT",
  description: "Spoon OAuth connection for NAGU BOT",
  icons: {
    icon: favicon.src,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
