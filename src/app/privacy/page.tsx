import type { Metadata } from "next";
import { InformationPage } from "../information-page";

export const metadata: Metadata = {
  title: "개인정보처리방침 | NAGU BOT",
  description: "NAGU BOT 개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <InformationPage eyebrow="PRIVACY POLICY" title="개인정보처리방침" summary="NAGU BOT이 어떤 정보를 왜 처리하고 어떻게 보호하는지 안내합니다." updatedAt="2026년 10월 1일">
      <section><span>01</span><div><h2>처리하는 정보</h2><p>Spoon OAuth 토큰과 승인 권한, DJ의 Spoon 사용자 ID·닉네임, 불투명 세션 식별자, 방송 및 청취자 이벤트에 포함된 사용자 ID·닉네임, 하트·후원·애청온도와 채팅 명령 처리 정보를 처리할 수 있습니다.</p><p>이용자가 입력한 자동화 설정, 명령어, 카운터, 신청곡과 게임 참여·결과 기록도 저장됩니다. Spoon 비밀번호는 수집하거나 저장하지 않습니다.</p></div></section>
      <section><span>02</span><div><h2>이용 목적</h2><p>계정 인증, 방송 상태 및 청취자 정보 표시, BOT 채팅 전송, 자동 응답과 랭킹 계산, 신청곡·게임 운영, 설정 복원, 오류 대응과 서비스 보안을 위해 정보를 이용합니다.</p></div></section>
      <section><span>03</span><div><h2>쿠키와 세션</h2><p>브라우저에는 로그인 상태 유지를 위한 불투명 HttpOnly 세션 쿠키만 저장합니다. OAuth 토큰은 서버에서 암호화해 보관하며 브라우저에 직접 저장하지 않습니다.</p></div></section>
      <section><span>04</span><div><h2>보관과 삭제</h2><p>OAuth 토큰은 연결 해제 시 즉시 폐기합니다. DJ 운영 설정과 방송·랭킹·게임 기록은 재연결 복원을 위해 안정적인 DJ 사용자 ID 기준으로 보관됩니다. 전체 삭제는 아래 문의 채널로 요청할 수 있으며 법령상 보존 의무가 없는 정보는 확인 후 삭제합니다.</p></div></section>
      <section><span>05</span><div><h2>외부 서비스와 처리 환경</h2><p>서비스 제공을 위해 Spoon OAuth 및 API와 통신하며 애플리케이션과 데이터베이스는 Railway 환경에서 운영될 수 있습니다. 각 외부 서비스에는 해당 사업자의 정책이 적용됩니다.</p></div></section>
      <section><span>06</span><div><h2>안전성 확보</h2><p>OAuth 토큰 암호화, HttpOnly 쿠키, 접근 범위 제한, 이벤트 중복 방지와 데이터베이스 접근 통제를 적용합니다. 운영 환경과 비밀 값은 소스 코드와 분리해 관리합니다.</p></div></section>
      <section><span>07</span><div><h2>이용자의 권리</h2><p>이용자는 자신의 정보에 대한 열람, 정정, 삭제 또는 처리 중지를 요청할 수 있습니다. 요청자의 계정과 데이터 소유 관계를 확인한 후 처리 결과를 안내합니다.</p></div></section>
      <section><span>08</span><div><h2>개인정보 문의</h2><p>개인정보 관련 문의는 운영자 나구링에게 오픈카톡 또는 <a href="mailto:seony1107@gmail.com">seony1107@gmail.com</a>으로 보낼 수 있습니다.</p></div></section>
      <section><span>09</span><div><h2>방침 변경</h2><p>처리 항목이나 운영 방식이 달라지는 경우 본 방침을 수정하고 시행일을 서비스 화면에 표시합니다.</p></div></section>
    </InformationPage>
  );
}
