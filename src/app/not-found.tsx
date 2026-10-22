import Link from "next/link";

export default function NotFound() {
  return (
    <main className="error-page">
      <h1>페이지를 찾을 수 없습니다.</h1>
      <p>주소가 바뀌었거나 없는 페이지입니다.</p>
      <div className="error-page-actions">
        <Link href="/">처음 화면으로</Link>
        <Link href="/remote">휴대폰 리모컨</Link>
      </div>
    </main>
  );
}
