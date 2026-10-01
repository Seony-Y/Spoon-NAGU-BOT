import Image from "next/image";
import Link from "next/link";
import naguBotLogo from "@/asset/NAGU-BOT-LOGO.png";

type SiteHeaderProps = {
  connectionStatus?: "connected" | "waiting";
};

export function SiteHeader({ connectionStatus }: SiteHeaderProps) {
  return (
    <header className="header">
      <Link className="wordmark" href="/" aria-label="NAGU BOT 홈">
        <Image
          className="wordmark-symbol"
          src={naguBotLogo}
          alt=""
          aria-hidden="true"
          sizes="34px"
        />
        <span>NAGU BOT</span>
      </Link>
      <div className="header-side">
        <nav className="header-links" aria-label="서비스 안내">
          <Link href="/guide">사용방법</Link>
        </nav>
        {connectionStatus && (
          <span className={`header-status ${connectionStatus === "connected" ? "is-connected" : ""}`}>
            <span className="status-dot" aria-hidden="true" />
            {connectionStatus === "connected" ? "연결됨" : "연결 대기"}
          </span>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div>
        <strong>© 2026 NAGU BOT. All rights reserved.</strong>
        <span>운영자 나구링 · NAGU BOT v1.0.0</span>
      </div>
      <div className="footer-links">
        <nav aria-label="정책 및 문의">
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보처리방침</Link>
          <a href="https://open.kakao.com/o/sYjAHqPf" target="_blank" rel="noreferrer">오픈카톡 문의</a>
          <a href="mailto:seony1107@gmail.com">이메일 문의</a>
        </nav>
      </div>
    </footer>
  );
}
