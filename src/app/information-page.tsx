import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./site-chrome";

type InformationPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  updatedAt: string;
  children: ReactNode;
};

export function InformationPage({ eyebrow, title, summary, updatedAt, children }: InformationPageProps) {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="information-main">
        <header className="information-intro">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{summary}</p>
          <time dateTime="2026-10-01">시행일 및 최종 수정: {updatedAt}</time>
        </header>
        <article className="information-content">{children}</article>
        <aside className="contact-band" aria-labelledby="contact-title">
          <div>
            <p className="section-label">CONTACT</p>
            <h2 id="contact-title">문의 및 연락</h2>
            <p>서비스 이용, 개인정보, 데이터 삭제 관련 문의는 운영자 나구링에게 보내주세요.</p>
          </div>
          <div>
            <a href="https://open.kakao.com/o/sYjAHqPf" target="_blank" rel="noreferrer">오픈카톡 문의</a>
            <a href="mailto:seony1107@gmail.com">seony1107@gmail.com</a>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
