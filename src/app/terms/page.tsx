import type { Metadata } from "next";
import { InformationPage } from "../information-page";

export const metadata: Metadata = {
  title: "이용약관 | NAGU BOT",
  description: "NAGU BOT 서비스 이용약관",
};

export default function TermsPage() {
  return (
    <InformationPage eyebrow="TERMS OF SERVICE" title="이용약관" summary="NAGU BOT의 기본 운영 기준과 이용자의 권리·책임을 안내합니다." updatedAt="2026년 10월 1일">
      <section><span>01</span><div><h2>목적과 적용</h2><p>본 약관은 운영자 나구링이 제공하는 NAGU BOT과 관련 기능의 이용 조건을 정합니다. 서비스를 이용하면 본 약관과 개인정보처리방침을 확인하고 동의한 것으로 봅니다.</p></div></section>
      <section><span>02</span><div><h2>서비스 내용</h2><p>NAGU BOT은 Spoon DJ 계정 연동, 방송 상태·이벤트 조회, 채팅 자동화, 명령어, 랭킹, 신청곡 및 방송 게임 관리 기능을 제공합니다. 일부 기능은 Spoon API 권한과 방송 상태에 따라 제한될 수 있습니다.</p></div></section>
      <section><span>03</span><div><h2>계정과 권한</h2><p>이용자는 본인이 관리 권한을 가진 Spoon DJ 계정만 연결해야 합니다. OAuth 승인 범위와 Spoon 정책을 확인하고 계정 및 방송 운영에 관한 책임을 부담합니다.</p></div></section>
      <section><span>04</span><div><h2>금지 행위</h2><p>서비스 장애 유발, 타인의 계정 또는 개인정보 침해, 불법·유해 콘텐츠 전송, Spoon 또는 제3자의 정책과 권리를 위반하는 행위를 할 수 없습니다.</p></div></section>
      <section><span>05</span><div><h2>서비스 변경과 중단</h2><p>점검, 장애, 외부 API 변경 또는 운영상 필요에 따라 기능을 변경하거나 일시 중단할 수 있습니다. 중요한 변경은 가능한 범위에서 서비스 화면으로 안내합니다.</p></div></section>
      <section><span>06</span><div><h2>책임 범위</h2><p>NAGU BOT은 Spoon과 독립적으로 운영되는 보조 도구입니다. 외부 서비스 장애, 이용자의 설정이나 오사용, 불가항력으로 발생한 손해에 대해서는 관련 법령이 허용하는 범위에서 책임이 제한될 수 있습니다.</p></div></section>
      <section><span>07</span><div><h2>이용 종료와 데이터</h2><p>이용자는 언제든 Spoon 연결을 해제할 수 있습니다. 연결 해제 시 인증 토큰은 폐기되며, 운영 설정과 누적 기록의 전체 삭제는 운영자 나구링에게 오픈카톡 또는 이메일로 요청할 수 있습니다.</p></div></section>
      <section><span>08</span><div><h2>약관 변경</h2><p>약관이 변경되면 시행일과 변경 내용을 서비스 화면에 게시합니다. 변경 후 서비스를 계속 이용하는 경우 변경된 약관이 적용됩니다.</p></div></section>
    </InformationPage>
  );
}
