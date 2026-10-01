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
        <nav className="guide-nav" aria-label="사용방법 TAB 메뉴">
          <a href="#getting-started">시작하기</a>
          <a href="#dashboard">대시보드</a>
          <a href="#bot-operations">봇 운영</a>
          <a href="#game">Game</a>
          <a href="#disconnect">연결 해제</a>
        </nav>
        <div className="guide-sections">
          <details className="guide-accordion" id="getting-started" open>
            <summary><span className="guide-number">01</span><strong>시작하기</strong><span>계정 연결과 봇 참여 준비</span><i aria-hidden="true" /></summary>
            <div className="guide-accordion-content">
              <div className="guide-topic">
                <h3>최초 Spoon DJ 연결</h3>
                <p>NAGU BOT은 아직 TEST 운영 중이므로 별도의 입장코드가 필요합니다. 입장코드는 운영자 나구링(@gu._.ling)에게 문의해 주세요.</p>
                <ol>
                  <li>홈의 <strong>입장코드</strong>에 나구링(@gu._.ling)에게 받은 코드를 입력하고 확인을 누릅니다.</li>
                  <li>코드 확인 후 활성화된 <strong>Spoon DJ 계정으로 로그인</strong>을 누릅니다.</li>
                  <li>Spoon 로그인 화면에서 방송에 사용할 DJ 계정으로 로그인하고 요청 권한을 모두 승인합니다. 하나라도 승인하지 않으면 연결되지 않습니다.</li>
                  <li>NAGU BOT으로 돌아와 <strong>연결됨</strong> 상태인지 확인합니다.</li>
                </ol>
                <p>입장코드가 비어 있거나 올바르지 않으면 Spoon 로그인을 시작할 수 없습니다. NAGU BOT은 Spoon 비밀번호를 받거나 저장하지 않습니다.</p>
                <p>권한이 누락되면 발급된 토큰을 즉시 폐기하고 세션을 저장하지 않습니다. 화면의 <strong>권한 다시 승인하기</strong>를 눌러 모든 권한을 선택한 뒤 다시 승인합니다.</p>
              </div>
              <div className="guide-topic"><h3>방송 참여 준비</h3><p><strong>봇 운영</strong> TAB에서 봇 참여를 누릅니다. 방송 전에는 대기하고, 방송이 시작되면 자동으로 이벤트 스트림에 연결됩니다.</p></div>
            </div>
          </details>

          <details className="guide-accordion" id="dashboard">
            <summary><span className="guide-number">02</span><strong>대시보드</strong><span>방송 현황과 청취자 데이터 확인</span><i aria-hidden="true" /></summary>
            <div className="guide-accordion-content">
              <div className="guide-topic"><h3>방송 현황</h3><p>현재 방송 제목과 상태, 청취자 수를 확인합니다. 새 정보가 필요하면 해당 영역의 새로고침 버튼을 누릅니다.</p></div>
              <div className="guide-topic"><h3>청취자 및 팬 랭킹</h3><p>현재 청취자 목록과 Spoon API가 제공하는 현재 방송 후원 팬 랭킹을 확인합니다. 하트 합계는 봇 참여 이후 수신분만 집계합니다. 채팅에서 <code>!오늘의 스푼랭킹</code>은 현재 방송 후원 상위 10명을 보여줍니다. <code>!내정보</code>는 오늘의 스푼 순위만 보여주며 스푼 수치는 노출하지 않습니다.</p></div>
              <div className="guide-topic"><h3>최근 이벤트</h3><p>입장, 채팅, 하트, 후원 등 BOT이 실시간으로 수신한 방송 이벤트를 최근 순서로 확인합니다.</p></div>
              <div className="guide-topic"><h3>로컬 백업</h3><p>상단 데이터 백업 탭에서 DJ 표시 이름, 자동화 설정, 명령어, 카운터, 신청곡, 가위바위보·추첨·퀴즈·룰렛 데이터를 서명된 JSON 파일로 저장하고 복원할 수 있습니다. 청취자 ID·닉네임, 입장·하트·스푼 이벤트와 스푼 랭킹 스냅샷은 청취자 기록 포함 다운로드에서만 추가됩니다. OAuth 토큰, 로그인 쿠키, 관리자 정보, 봇 참여 상태와 최근 이벤트 목록은 백업하지 않습니다.</p></div>
            </div>
          </details>

          <details className="guide-accordion" id="bot-operations">
            <summary><span className="guide-number">03</span><strong>봇 운영</strong><span>자동화, 명령어, 카운터와 신청곡 관리</span><i aria-hidden="true" /></summary>
            <div className="guide-accordion-content">
              <div className="guide-topic"><h3>BOT 참여</h3><p>방송 참여와 퇴장을 관리합니다. Spoon에서 BOT을 매니저로 지정하면 채팅 명령어를 안정적으로 처리할 수 있습니다.</p></div>
              <div className="guide-topic"><h3>자동화</h3><p>입장 환영, 후원·하트 감사, 반복 멘트를 각각 설정합니다. 각 기능의 ON/OFF 토글은 클릭 즉시 다음 이벤트부터 반영되며, 메시지와 설정은 DJ 워크스페이스에 저장되어 재연결 후에도 복원됩니다.</p></div>
              <div className="guide-topic"><h3>채팅 명령어와 카운터</h3><p>채팅 명령어는 별도 사용 설정 없이 항상 활성화됩니다. 기본 명령어와 사용자 정의 명령어를 관리하고 <code>!명령어</code>로 현재 사용 가능한 명령어를 확인합니다. 카운터 조회는 모두 사용할 수 있고 증감은 DJ만 사용할 수 있습니다.</p></div>
              <div className="guide-topic"><h3>신청곡</h3><p>청취자는 <code>!신청곡 곡명-가수</code>로 신청하고 <code>!신청곡 목록</code>으로 대기 목록을 확인합니다. DJ는 화면이나 <code>!신청곡 삭제 번호</code>로 항목을 삭제합니다.</p></div>
            </div>
          </details>

          <details className="guide-accordion" id="game">
            <summary><span className="guide-number">04</span><strong>Game</strong><span>가위바위보, 추첨, 퀴즈와 룰렛 진행</span><i aria-hidden="true" /></summary>
            <div className="guide-accordion-content">
              <div className="guide-topic">
                <h3>가위바위보</h3>
                <p>DJ가 가위·바위·보를 비공개로 선택하고 라운드를 시작합니다. 청취자는 <code>!가위바위보 가위</code>처럼 한 번 참여하며, 종료하면 BOT 채팅과 화면에 결과가 공개됩니다.</p>
                <p>진행 중에는 실시간 참여자 수가 표시되고, 종료된 라운드는 최근 기록에서 참가자별 결과를 확인할 수 있습니다.</p>
              </div>
              <div className="guide-topic">
                <h3>추첨</h3>
                <p>DJ가 당첨 인원을 1명 이상, 상한 없이 정해 시작하면 청취자는 <code>!참여</code>로 계정당 한 번 참여합니다. 이미 참여한 계정에는 <strong>이미 참여했습니다.</strong>라고 안내합니다. DJ가 종료하면 참가자 중 설정 인원만큼 무작위로 당첨자를 확정하고 BOT 채팅에 공개합니다. 참가자가 설정 인원보다 적으면 모든 참가자가 당첨됩니다.</p>
                <p>진행 중에는 실시간 참여자 수가 표시되고, 최근 기록에서 전체 참가자와 당첨 여부를 확인할 수 있습니다.</p>
              </div>
              <div className="guide-topic">
                <h3>퀴즈</h3>
                <p>DJ가 문제와 정답을 등록하면 청취자는 <code>!정답 정답내용</code>으로 답안을 제출합니다. 같은 계정도 다른 답안을 다시 제출할 수 있으며, 이때 기존 답안과 제출 시각이 최신 값으로 바뀌어 제출 순서가 뒤로 이동합니다. 같은 답안을 다시 내면 <strong>이미 동일한 대답을 제출했습니다.</strong>라고 안내합니다.</p>
                <p>최초 정답이 들어와도 퀴즈는 계속 진행되어 다른 청취자도 정답을 제출할 수 있습니다. DJ가 화면의 <strong>퀴즈 종료 및 정답 공개</strong> 버튼을 누르면 BOT 채팅에 정답, 최초 정답자와 소요 시간, 전체 정답자 목록을 나누어 공개합니다. 이 결과는 최근 퀴즈 기록과 로컬 백업에도 저장됩니다.</p>
              </div>
              <div className="guide-topic">
                <h3>룰렛 설정</h3>
                <ol>
                  <li><strong>Game &gt; 룰렛</strong>에서 1회 비용을 스푼 단위로 설정합니다.</li>
                  <li><strong>룰렛 설정 &gt; 수정</strong>에서 당첨 내용과 당첨 확률을 입력합니다. 당첨 확률을 제외한 나머지는 꽝 확률로 자동 설정됩니다.</li>
                  <li>당첨 확률은 0.01% 단위까지 입력할 수 있으며, 꽝을 포함한 전체 확률은 100%를 넘을 수 없습니다.</li>
                  <li>경품을 개별 삭제하면 해당 경품 확률은 꽝 확률에 합산됩니다.</li>
                  <li>확률 저장 후 <strong>후원 룰렛 시작</strong>을 켜고 설정을 누릅니다. 기본 상태는 꺼짐입니다.</li>
                </ol>
              </div>
              <div className="guide-topic">
                <h3>자동 추첨과 킵</h3>
                <p>청취자가 1회 비용 이상을 한 번에 후원하면 해당 후원 건에서 룰렛을 한 번 자동 추첨하고 BOT이 결과를 채팅으로 알립니다. 같은 후원 이벤트가 다시 전달되어도 중복 추첨하지 않습니다.</p>
                <p>당첨 항목은 사용자 킵에 자동 저장되고 같은 항목에 다시 당첨되면 수량이 증가합니다. 꽝은 킵에 저장되지 않습니다. DJ 화면의 사용자별 킵에는 닉네임과 보유 항목이 계속 저장되어 재로그인 후에도 불러옵니다. 청취자는 채팅에 <code>!내 킵</code>을 입력하면 본인의 당첨 내역을 조회할 수 있습니다.</p>
              </div>
            </div>
          </details>

          <details className="guide-accordion" id="disconnect">
            <summary><span className="guide-number">05</span><strong>연결 해제</strong><span>인증 종료와 저장 데이터 안내</span><i aria-hidden="true" /></summary>
            <div className="guide-accordion-content">
              <div className="guide-topic"><h3>연결 종료</h3><p>사용을 마치면 홈에서 <strong>연결 해제</strong>를 누릅니다. BOT은 자동으로 퇴장하고 기존 OAuth 토큰은 폐기됩니다. 재연결 복원을 위한 운영 설정과 기록의 삭제는 운영자 나구링(@gu._.ling)에게 요청할 수 있습니다.</p></div>
              <div className="guide-topic">
                <h3>다른 Spoon 계정으로 전환</h3>
                <ol>
                  <li>NAGU BOT에서 <strong>연결 해제</strong>를 누릅니다.</li>
                  <li>Spoon 웹에서도 기존 계정을 로그아웃합니다.</li>
                  <li>연결할 다른 Spoon 계정으로 로그인합니다.</li>
                  <li>NAGU BOT에서 <strong>Spoon DJ 계정으로 로그인</strong>을 눌러 다시 연결합니다.</li>
                </ol>
                <p>Spoon 로그인 상태가 계속 유지되면 시크릿 창이나 별도 브라우저 프로필에서 연결합니다. 여러 계정을 동시에 운용하려면 계정마다 별도 브라우저 프로필 또는 기기를 사용해야 합니다.</p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </InformationPage>
  );
}
