import Image from "next/image";
import Link from "next/link";
import naguBotLogo from "@/asset/NAGU-BOT-LOGO.png";
import { isAdminConfigured } from "@/lib/admin-auth";
import { AdminConsole } from "./admin-console";

export default function AdminPage() {

  return (
    <div className="site-shell admin-shell">
      <header className="header">
        <Link className="wordmark" href="/" aria-label="NAGU BOT 홈">
          <Image className="wordmark-symbol" src={naguBotLogo} alt="" aria-hidden="true" sizes="34px" />
          <span>NAGU BOT</span>
        </Link>
        <span className="header-status">관리자 모드</span>
      </header>

      <main className="admin-main">
        <p className="section-label">ADMINISTRATION</p>
        <h1>연결 관리</h1>

        <AdminConsole configured={isAdminConfigured()} />
      </main>
    </div>
  );
}