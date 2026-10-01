import type { Metadata } from "next";
import { InformationPage } from "../information-page";

export const metadata: Metadata = {
  title: "사용방법 | NAGU BOT",
  description: "NAGU BOT 연결, 방송 운영, 채팅 명령어와 게임 사용방법",
};

export default function GuidePage() {
  return (
    <InformationPage
      eyebrow="GETTING STARTED"
      title="사용방법"
      summary="왼쪽 메뉴에서 필요한 기능을 선택해 Spoon DJ 연결부터 방송 운영과 게임 사용법까지 확인하세요."
      updatedAt="2026년 10월 1일"
    >
      <div className="guide-layout">
        <nav className="guide-nav" aria-label="사용방법 기능 메뉴">
          <a href="#getting-started">시작하기</a>
          <a href="#dashboard">대시보드</a>
          <a href="#bot-operations">봇 운영</a>
          <a href="#commands">채팅 명령어</a>
          <a href="#song-requests">신청곡</a>
          <a href="#game">Game</a>
          <a href="#disconnect">연결 해제</a>
        </nav>
        <div className="guide-sections">
          <section id="getting-started"><span>01</span><div><h2>시작하기</h2><p>홈에서 방송에 사용하는 Spoon DJ 계정으로 로그인하고 요청 권한을 승인합니다. NAGU BOT은 Spoon 비밀번호를 받거나 저장하지 않습니다.</p><p><strong>봇 운영</strong>에서 봇 참여를 누르면 방송 전에는 대기하고, 방송 시작 후 자동으로 이벤트 스트림에 연결됩니다.</p></div></section>
          <section id="dashboard"><span>02</span><div><h2>대시보드</h2><p>현재 방송 상태, 청취자와 팬 랭킹, 하트·후원 집계 및 최근 이벤트를 확인합니다. 기간 탭으로 현재 방송·오늘·역대 랭킹을 전환할 수 있습니다.</p></div></section>
          <section id="bot-operations"><span>03</span><div><h2>봇 운영</h2><p>입장 환영, 후원·하트 감사, 반복 멘트와 카운터를 설정합니다. 설정은 해당 DJ의 워크스페이스에 저장되어 재연결 후에도 복원됩니다.</p></div></section>
          <section id="commands"><span>04</span><div><h2>채팅 명령어</h2><p>기본 명령어와 사용자 정의 명령어를 관리합니다. 카운터 조회는 모든 청취자가 사용할 수 있고 증감 명령은 DJ만 사용할 수 있습니다.</p><p><code>!명령어</code>를 입력하면 현재 사용할 수 있는 공개 명령어와 DJ 전용 명령어가 구분되어 안내됩니다.</p></div></section>
          <section id="song-requests"><span>05</span><div><h2>신청곡</h2><p>청취자는 <code>!신청곡 곡명-가수</code>로 신청하고 <code>!신청곡 목록</code>으로 대기 목록을 확인합니다. DJ는 관리 화면이나 <code>!신청곡 삭제 번호</code>로 항목을 삭제할 수 있습니다.</p></div></section>
          <section id="game"><span>06</span><div><h2>Game</h2><p>DJ가 가위·바위·보를 비공개로 선택하고 라운드를 시작합니다. 청취자는 <code>!가위바위보 가위</code>처럼 한 번 참여하며, 종료하면 BOT 채팅과 화면에 결과가 공개됩니다.</p><p>화면에는 실시간 참여자 수와 최근 10개 라운드 기록이 표시됩니다.</p></div></section>
          <section id="disconnect"><span>07</span><div><h2>연결 해제</h2><p>사용을 마치면 홈에서 연결 해제를 누릅니다. OAuth 토큰은 즉시 폐기되며, 재연결 복원을 위한 운영 설정과 기록의 삭제는 운영자 나구링에게 요청할 수 있습니다.</p></div></section>
        </div>
      </div>
    </InformationPage>
  );
}
