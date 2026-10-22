import type { Metadata } from "next";
import favicon from "@/asset/favicon-48x48.png";
// Global styles, in cascade order: later files override earlier ones.
import "./globals.css";
import "./styles/game.css";
import "./styles/dashboard-cards.css";
import "./styles/connection-info.css";
import "./styles/responsive.css";
import "./styles/settings.css";
import "./styles/admin.css";
import "./styles/features.css";

export const metadata: Metadata = {
  title: "NAGU BOT",
  description: "Spoon DJ를 위한 방송 도우미 봇 NAGU BOT",
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
