import type { Metadata } from "next";
import { InformationPage } from "../information-page";

export const metadata: Metadata = {
  title: "사용 방법 | NAGU BOT",
  description: "NAGU BOT 연결, 방송 운영, 채팅 명령어와 게임 사용 방법",
};

export default function GuidePage() {
  return (
    <InformationPage
      eyebrow="GETTING STARTED"
      title="사용 방법"
      summary="아래 메뉴에서 필요한 기능을 선택해 Spoon DJ 연결부터 방송 운영과 게임 사용법까지 확인하세요."
      updatedAt="2026년 10월 22일"
    >
      <div className="guide-layout">
        <nav className="guide-nav" aria-label="사용 방법 메뉴">
          <a href="#getting-started">시작하기</a>
          <a href="#dashboard">대시보드</a>
          <a href="#bot-operations">봇 운영</a>
          <a href="#game">게임</a>
          <a href="#disconnect">연결 해제</a>
        </nav>
        <div className="guide-sections">
          <details className="guide-accordion" id="getting-started" open>
            <summary><span className="guide-number">01</span><strong>시작하기</strong><span>계정 로그인과 봇 입장 준비</span><i aria-hidden="true" /></summary>
            <div className="guide-accordion-content">
              <div className="guide-topic">
                <h3>최초 Spoon DJ 연결</h3>
                <p>NAGU BOT은 아직 시범 운영 중이라 별도의 입장코드가 필요합니다. 입장코드는 운영자 나구링(@gu._.ling)에게 문의해 주세요.</p>
                <ol>
                  <li>홈의 <strong>입장코드</strong>에 나구링(@gu._.ling)에게 받은 코드를 입력하고 확인을 누릅니다.</li>
                  <li>코드 확인 후 활성화된 <strong>Spoon DJ 계정으로 로그인</strong>을 누릅니다.</li>
                  <li>Spoon 로그인 화면에서 방송에 사용할 DJ 계정으로 로그인하고, 요청 권한을 모두 허용합니다.</li>
                  <li>NAGU BOT으로 돌아와 화면 위에 <strong>로그인됨</strong>이 보이는지 확인합니다.</li>
                </ol>
                <p>입장코드가 비어 있거나 올바르지 않으면 Spoon 로그인을 시작할 수 없습니다. 틀린 코드를 여러 번 입력하면 10분 동안 입력이 잠깁니다. NAGU BOT은 Spoon 비밀번호를 받거나 저장하지 않습니다.</p>
                <p>권한을 하나라도 빼고 허용하면 이번 로그인은 취소됩니다. 이미 로그인되어 있던 기기는 그대로 유지됩니다. 화면의 <strong>권한 다시 허용하기</strong>를 눌러 모든 권한을 선택한 뒤 다시 로그인해 주세요.</p>
                <p>로그인 버튼을 누른 뒤 10분 안에 로그인을 마쳐야 합니다. 시간이 지나면 처음부터 다시 진행해 주세요.</p>
              </div>
              <div className="guide-topic">
                <h3>여러 기기에서 쓰기</h3>
                <p>PC와 휴대폰처럼 여러 기기에서 같은 DJ 계정으로 로그인하면, 저장해 둔 설정과 기록을 바로 불러옵니다. 봇은 계정당 하나만 동작하고, 어느 기기에서 조작해도 같은 봇이 움직입니다.</p>
                <p>화면 위에 <strong>이전에 저장한 설정을 아직 불러오지 않았습니다</strong>라는 안내가 보이면, 방송 중 DJ 계정으로 채팅을 한 번 입력해 주세요. 저장된 설정과 기록을 자동으로 불러옵니다.</p>
              </div>
              <div className="guide-topic"><h3>방송 입장 준비</h3><p>화면 위 봇 상태 바나 <strong>봇 운영</strong> 탭에서 <strong>봇 입장</strong>을 누릅니다. 방송 전에는 기다렸다가, 방송이 시작되면 자동으로 들어갑니다.</p></div>
            </div>
          </details>

          <details className="guide-accordion" id="dashboard">
            <summary><span className="guide-number">02</span><strong>대시보드</strong><span>방송 현황과 청취자 데이터 확인</span><i aria-hidden="true" /></summary>
            <div className="guide-accordion-content">
              <div className="guide-topic"><h3>봇 상태 바</h3><p>모든 탭 위에 봇 상태(입장 중, 방송 대기, 꺼짐 등)와 <strong>봇 입장</strong>·<strong>봇 퇴장</strong> 버튼, <strong>휴대폰 리모컨</strong> 링크가 표시됩니다. 봇 퇴장처럼 되돌리기 어려운 동작은 한 번 더 확인합니다.</p></div>
              <div className="guide-topic"><h3>방송 현황</h3><p>현재 방송 제목과 상태, 청취자 수를 확인합니다. 새 정보가 필요하면 해당 영역의 새로고침 버튼을 누릅니다.</p></div>
              <div className="guide-topic"><h3>청취자 및 팬 랭킹</h3><p>현재 청취자 목록과 현재 방송의 후원 팬 랭킹을 확인합니다. 구독 중인 청취자에게는 <strong>구독</strong> 표시가 붙습니다. 하트 합계는 봇이 입장한 뒤 받은 것만 셉니다.</p></div>
              <div className="guide-topic"><h3>최근 활동</h3><p>입장, 채팅, 하트, 후원, 팔로우 등 봇이 실시간으로 받은 방송 활동을 최근 순서로 확인합니다.</p></div>
              <div className="guide-topic"><h3>데이터 저장과 백업</h3><p>설정과 기록은 서버에 자동으로 저장됩니다. 새로고침, 창 닫기, 방송 종료, 서버 재시작, 연결 해제 후 다시 로그인해도 그대로 이어서 쓸 수 있습니다.</p><p>상단 <strong>데이터 백업</strong> 탭은 다른 계정으로 옮기거나 만일에 대비할 때 씁니다. DJ 표시 이름, 자동화 설정, 명령어, 카운터, 신청곡, 가위바위보·추첨·퀴즈(대기 문제 포함)·비밀 단어·팀 대항전·룰렛 데이터와 출석 설정을 백업 파일로 저장하고 복원할 수 있습니다. 청취자 ID·닉네임, 입장·하트·스푼 기록, 스푼 랭킹과 출석 기록은 청취자 기록 포함 다운로드에서만 추가됩니다. 로그인 정보, 관리자 정보, 봇 입장 상태와 최근 활동 목록은 백업하지 않습니다.</p><p>같은 탭 아래쪽의 <strong>모든 데이터 초기화</strong>는 백업에 들어가는 데이터를 진행 중인 게임까지 전부 지우고 설정을 기본값으로 되돌립니다. 로그인과 봇 입장 상태는 유지됩니다. 실수를 막기 위해 <code>초기화</code>를 직접 입력하고, 한 번 더 확인 창에서 승인해야 실행됩니다. 되돌릴 수 없으니 먼저 청취자 기록 포함 백업을 내려받아 두세요.</p></div>
            </div>
          </details>

          <details className="guide-accordion" id="bot-operations">
            <summary><span className="guide-number">03</span><strong>봇 운영</strong><span>자동화, 명령어, 카운터와 신청곡 관리</span><i aria-hidden="true" /></summary>
            <div className="guide-accordion-content">
              <div className="guide-topic">
                <h3>봇 입장과 퇴장</h3>
                <p><strong>봇 입장</strong>·<strong>봇 퇴장</strong>으로 관리합니다. 봇은 한 DJ 계정에 하나만 동작하며, 다른 기기에서 봇을 입장시키면 그 기기가 봇을 넘겨받습니다. 휴대폰 리모컨은 PC에서 입장시킨 봇을 그대로 조작합니다.</p>
                <p>연결이 잠시 끊기거나 서버가 다시 시작되어도 봇이 알아서 다시 연결하고, 이미 인사한 청취자에게는 다시 인사하지 않습니다. 봇이 자리를 비운 사이 들어온 후원은 다시 연결되면 모아서 한 번에 감사 인사를 보내고, 룰렛도 진행합니다.</p>
                <p>방송 중 NAGU BOT을 매니저로 지정하거나 해제하면 다시 연결하지 않아도 1분 안에 반영됩니다.</p>
              </div>
              <div className="guide-topic">
                <h3>고정 매니저 지정 순서</h3>
                <p>입장 환영과 팔로우 감사는 봇이 매니저일 때만 동작합니다.</p>
                <ol>
                  <li>방송 중에 봇 운영 탭의 <strong>봇이 DJ 팔로우하기</strong>를 누릅니다. 버튼이 보이지 않으면 이 단계는 건너뜁니다.</li>
                  <li>방송이 끝난 뒤 Spoon에서 봇을 고정 매니저로 지정합니다.</li>
                </ol>
              </div>
              <div className="guide-topic">
                <h3>자동화</h3>
                <ul>
                  <li><strong>입장 환영</strong>: 청취자가 들어오면 인사합니다. 1위 팬·매니저·구독자·단골 청취자에게는 호칭을 붙입니다(예: 단골 철수님).</li>
                  <li><strong>후원 감사</strong>: 후원마다 감사 인사를 보냅니다.</li>
                  <li><strong>하트 감사</strong>: 같은 청취자가 하트를 연달아 보내면 몇 초씩 모아 한 번에 감사합니다. 다른 청취자끼리는 묶지 않습니다.</li>
                  <li><strong>팔로우 감사</strong>: 방송 중 처음 팔로우한 청취자에게 인사합니다.</li>
                  <li><strong>반복 공지</strong>: 정한 간격(1~1440분)마다 같은 안내를 보냅니다.</li>
                </ul>
                <p>각 기능의 켜기·끄기 스위치는 누르는 즉시 반영되고, 문구는 <strong>저장</strong>을 눌러야 반영됩니다. 방송 채팅에서 <code>!환영</code>·<code>!후원</code>·<code>!하트</code>·<code>!팔로우</code>·<code>!공지</code> 뒤에 <code>켜기</code>/<code>끄기</code>를 붙여도 됩니다.</p>
              </div>
              <div className="guide-topic"><h3>채팅 명령어와 카운터</h3><p>기본 명령어와 사용자 정의 명령어를 관리하고, 청취자는 <code>!명령어</code>로 지금 쓸 수 있는 명령어를 확인합니다. 카운터(기본 이름 실드)는 누구나 <code>!실드</code>로 조회할 수 있고, 늘리고 줄이는 것(<code>!실드 +2</code>, <code>!실드 -1</code>)은 DJ만 할 수 있습니다. 기본 명령어나 등록된 명령어와 같은 이름의 카운터는 만들 수 없습니다.</p><p><code>!팀</code>, <code>!출석</code>처럼 봇 기능이 쓰는 이름은 새로 등록할 수 없습니다. 기능이 생기기 전에 같은 이름으로 만들어 둔 명령어는 봇 기능이 먼저 응답하므로, 명령어 목록에서 삭제해 주세요.</p></div>
              <div className="guide-topic"><h3>신청곡</h3><p>청취자는 <code>!신청곡 곡명-가수</code>(예: <code>!신청곡 밤편지-아이유</code>)로 신청하고 <code>!신청곡 목록</code>으로 대기 목록을 확인합니다. DJ는 화면이나 <code>!신청곡 삭제 번호</code>로 항목을 삭제합니다.</p></div>
            </div>
          </details>

          <details className="guide-accordion" id="game">
            <summary><span className="guide-number">04</span><strong>게임</strong><span>가위바위보, 추첨, 퀴즈, 비밀 단어, 팀 대항전, 출석과 룰렛</span><i aria-hidden="true" /></summary>
            <div className="guide-accordion-content">
              <div className="guide-topic">
                <h3>방송 채팅으로 진행하기 (DJ 전용)</h3>
                <p>방송 모니터링 화면을 벗어나지 않아도 DJ 계정으로 채팅에 입력하면 대시보드 버튼과 똑같이 동작합니다. <code>!봇</code>으로 명령어 목록을, <code>!봇 상태</code>로 진행 중인 게임과 자동 기능 켜짐 여부를 확인합니다.</p>
                <p><code>!가위바위보 시작</code> · <code>!가위바위보 종료</code> (DJ 선택은 랜덤), <code>!추첨 시작 3</code> · <code>!추첨 종료</code>, <code>!퀴즈 시작</code> · <code>!퀴즈 종료</code>, <code>!비밀단어 시작</code> · <code>힌트</code> · <code>종료</code>, <code>!팀전 시작</code> · <code>상태</code> · <code>종료</code>, <code>!룰렛 켜기</code> · <code>!룰렛 끄기</code>, <code>!환영</code> · <code>!후원</code> · <code>!하트</code> · <code>!팔로우</code> · <code>!공지</code> + <code>켜기</code>/<code>끄기</code></p>
                <p>채팅은 청취자에게도 보이므로 퀴즈 정답과 비밀 단어는 방송 전에 대시보드에 등록해 둡니다. 퀴즈 정답은 방송 전에 게임 &gt; 퀴즈의 <strong>대기 문제</strong>에 등록해 두고, 방송 중에는 <code>!퀴즈 시작</code>으로 위에서부터 출제합니다.</p>
              </div>
              <div className="guide-topic">
                <h3>휴대폰 리모컨</h3>
                <p>PC로 방송한다면 휴대폰에서 대시보드의 <strong>휴대폰 리모컨</strong>을 열어 옆에 두고 쓸 수 있습니다. 휴대폰에서도 한 번 로그인해야 합니다. 위의 <strong>게임 · 카운터 · 자동 기능</strong> 버튼으로 화면을 바꿔 가며, 큰 버튼으로 게임(비밀 단어·팀 대항전 포함)을 시작·종료하고, 카운터 값을 직접 입력해 바꾸고(채팅에 알림), 룰렛과 자동 기능을 켜고 끕니다. 진행 중인 퀴즈 정답과 비밀 단어는 리모컨 화면에만 보입니다.</p>
                <p>게임은 방송 중일 때만 시작할 수 있습니다. 비밀 단어나 팀 대항전을 끝내지 않고 방송을 마치면 자동으로 종료되고 결과는 최근 기록에만 남습니다(채팅 발표는 없음).</p>
              </div>
              <div className="guide-topic">
                <h3>참여 안내</h3>
                <p>청취자가 참여·응모·답 제출을 하면 봇이 몇 초씩 모아 한 번에 안내합니다(예: [추첨] 응모 완료! (A, B)). 참여자가 많아도 채팅이 봇 메시지로 덮이지 않고, 게임을 종료하면 남은 안내를 결과보다 먼저 보냅니다.</p>
              </div>
              <div className="guide-topic">
                <h3>가위바위보</h3>
                <p>DJ가 가위·바위·보 중 하나를 고르거나 랜덤으로 정하고 라운드를 시작합니다. 청취자는 <code>!가위바위보 가위</code>처럼 한 번 참여하며, 종료하면 봇 채팅과 화면에 결과가 공개됩니다.</p>
                <p>진행 중에는 실시간 참여자 수가 표시되고, 종료된 라운드는 최근 기록에서 참가자별 결과를 확인할 수 있습니다.</p>
              </div>
              <div className="guide-topic">
                <h3>추첨</h3>
                <p>DJ가 당첨 인원(1~100,000명)을 정해 시작하면 청취자는 <code>!참여</code>로 계정당 한 번 응모합니다. 이미 응모한 계정에는 <strong>이미 응모했어요.</strong>라고 안내합니다. DJ가 종료하면 응모자 중 설정 인원만큼 무작위로 당첨자를 정해 봇 채팅에 공개합니다. 응모자가 설정 인원보다 적으면 모두 당첨됩니다.</p>
                <p>진행 중에는 실시간 응모자 수가 표시되고, 최근 기록에서 전체 응모자와 당첨 여부를 확인할 수 있습니다.</p>
              </div>
              <div className="guide-topic">
                <h3>퀴즈</h3>
                <ol>
                  <li>게임 &gt; 퀴즈에서 문제와 정답을 입력하고 <strong>대기 목록에 추가</strong>를 누릅니다(Enter도 같은 동작). 바로 내고 싶을 때만 <strong>지금 바로 출제</strong>를 누릅니다.</li>
                  <li>방송 중에 <code>!퀴즈 시작</code>이나 <strong>다음 대기 문제 출제</strong>로 위에서부터 출제합니다.</li>
                  <li>청취자는 <code>!정답 (답)</code>으로 답을 냅니다. 다시 내면 마지막 답으로 바뀌고, 같은 답을 다시 내면 <strong>같은 답을 이미 냈어요</strong>라고 안내합니다. 한 번 맞힌 청취자는 정답자로 남습니다.</li>
                  <li>정답이 나와도 퀴즈는 계속 진행됩니다. <strong>퀴즈 종료 및 정답 공개</strong>나 <code>!퀴즈 종료</code>를 누르면 봇 채팅에 정답, 첫 정답자와 걸린 시간, 다른 정답자를 공개합니다.</li>
                </ol>
                <p>결과는 최근 퀴즈 기록과 백업에도 저장됩니다.</p>
              </div>
              <div className="guide-topic">
                <h3>비밀 단어 찾기</h3>
                <ol>
                  <li><strong>게임 &gt; 비밀 단어</strong>에서 단어(최대 20자)와 힌트를 대기 목록에 등록합니다. 최대 30개까지 둘 수 있습니다.</li>
                  <li>방송 중에 <code>!비밀단어 시작</code>이나 화면의 시작 버튼을 누르면 위에서부터 한 단어가 출제되고, 봇은 글자 수만 알립니다. 단어는 대시보드와 리모컨 화면에만 보입니다.</li>
                  <li>청취자가 평소처럼 채팅하다가 그 단어가 들어간 말을 처음 한 사람이 찾은 사람이 됩니다. 띄어쓰기·문장부호·대소문자는 무시하고, DJ의 채팅은 세지 않습니다.</li>
                  <li>막히면 <code>!비밀단어 힌트</code>로 힌트를 공개하고, 아무도 못 찾으면 <code>!비밀단어 종료</code>로 정답을 공개합니다.</li>
                </ol>
              </div>
              <div className="guide-topic">
                <h3>팀 대항전</h3>
                <ol>
                  <li><strong>게임 &gt; 팀 대항전</strong>에서 팀 이름(2~4개), 점수 기준(하트+후원 · 하트만 · 후원만), 목표 점수(없음 또는 100~100,000점 중 선택)를 정합니다. 하트+후원은 스푼 1개를 10점으로 계산합니다.</li>
                  <li><strong>이 설정으로 시작</strong>이나 <code>!팀전 시작</code>으로 엽니다. 청취자는 <code>!팀 1</code>이나 <code>!팀 A팀</code>처럼 팀을 고르며, 한 번 고른 팀은 바꿀 수 없습니다.</li>
                  <li>참여한 뒤 보낸 하트·후원만 팀 점수가 됩니다. 선두가 바뀌면 봇이 알리고(1분에 한 번까지), <code>!팀전 상태</code>로 현재 점수를 채팅에 띄울 수 있습니다.</li>
                  <li>목표 점수에 먼저 도달한 팀이 나오면 자동으로 끝나고, 아니면 <code>!팀전 종료</code>로 끝냅니다. 봇이 순위와 가장 많이 기여한 MVP를 발표합니다.</li>
                </ol>
              </div>
              <div className="guide-topic">
                <h3>출석 스탬프</h3>
                <p>봇이 방송에 있는 동안 입장(봇이 매니저가 아니면 청취자 목록으로 확인)·채팅·하트·후원·팔로우한 청취자는 방송마다 한 번씩 자동으로 출석됩니다. 연속 출석은 달력 날짜가 아니라 DJ의 방송 횟수로 세므로, 방송을 쉬는 날에는 끊기지 않습니다.</p>
                <p>누적 10·30·50·100번째 등, 연속 5·10·20회 등에 도달하면 봇이 채팅으로 축하합니다. <strong>게임 &gt; 출석</strong>에서 축하 메시지를 끄고, 이번 달·전체 출석 순위를 확인합니다. 청취자는 <code>!출석</code>으로 출석 확인과 연속·누적 횟수를 보고(방송 중 처음이면 “출석 완료!”, 다시 입력하면 “이미 출석했어요.”), <code>!출석왕</code>으로 이번 달 TOP 5를 봅니다.</p>
              </div>
              <div className="guide-topic">
                <h3>게임 기록 초기화</h3>
                <p>게임 탭마다 아래쪽의 <strong>기록 초기화</strong>로 그 게임의 지난 기록을 지울 수 있습니다. 진행 중인 게임, 퀴즈 대기 문제와 비밀 단어 대기 목록, 팀 설정, 룰렛 경품과 청취자 킵은 지워지지 않습니다. 출석은 전체 출석 기록이, 룰렛은 당첨 이력만 지워집니다. 되돌릴 수 없으니 필요하면 먼저 데이터 백업을 받아 두세요.</p>
              </div>
              <div className="guide-topic">
                <h3>룰렛 설정</h3>
                <ol>
                  <li><strong>게임 &gt; 룰렛</strong>에서 1회 비용을 스푼 단위로 설정합니다.</li>
                  <li><strong>룰렛 경품 및 확률</strong>에서 새 경품을 바로 추가하거나 <strong>기존 경품 수정</strong>으로 저장된 항목을 변경합니다. 당첨 확률을 뺀 나머지는 꽝 확률로 자동 계산됩니다.</li>
                  <li>당첨 확률은 0.01% 단위까지 입력할 수 있으며, 꽝을 포함한 전체 확률은 100%를 넘을 수 없습니다.</li>
                  <li>경품을 삭제하면 그 경품의 확률은 꽝 확률에 합산됩니다.</li>
                  <li>확률을 저장한 뒤 <strong>후원 룰렛 사용</strong>을 체크하고 <strong>설정</strong>을 누릅니다. 기본 상태는 꺼짐이며, <code>!룰렛 켜기</code>나 리모컨으로도 켤 수 있습니다.</li>
                </ol>
              </div>
              <div className="guide-topic">
                <h3>자동 추첨과 킵</h3>
                <p>청취자가 1회 비용 이상을 한 번에 후원하면 그 후원으로 룰렛을 한 번 자동으로 돌리고 봇이 결과를 채팅으로 알립니다. 같은 후원이 다시 전달되어도 중복으로 돌리지 않습니다.</p>
                <p>당첨된 경품은 청취자 킵에 자동 저장되고, 같은 경품에 다시 당첨되면 수량이 늘어납니다. 꽝은 킵에 저장되지 않습니다. DJ는 청취자별 킵에서 여러 항목의 수량을 함께 수정하거나 선택 삭제할 수 있습니다. 채팅에서는 <code>!킵 삭제 닉네임 / 경품 이름 / 수량</code>으로 삭제하며, 수량을 빼면 1개를 삭제합니다. 청취자는 <code>!내 킵</code>으로 본인의 당첨 내역을 볼 수 있습니다.</p>
              </div>
            </div>
          </details>

          <details className="guide-accordion" id="disconnect">
            <summary><span className="guide-number">05</span><strong>연결 해제</strong><span>로그아웃과 계정 전환</span><i aria-hidden="true" /></summary>
            <div className="guide-accordion-content">
              <div className="guide-topic"><h3>연결 종료</h3><p>사용을 마치면 홈에서 <strong>연결 해제</strong>를 누릅니다. 봇은 자동으로 퇴장하고 로그인 정보는 바로 삭제되며, 같은 DJ 계정으로 로그인한 다른 기기에서도 함께 로그아웃됩니다. 저장된 설정과 기록은 그대로 남아 다시 로그인하면 이어서 쓸 수 있습니다. 저장된 설정과 기록의 삭제는 운영자 나구링(@gu._.ling)에게 요청할 수 있습니다.</p></div>
              <div className="guide-topic">
                <h3>다른 Spoon 계정으로 전환</h3>
                <p>Spoon 로그인 화면은 브라우저에 남은 Spoon·구글 로그인 상태를 그대로 사용합니다. 이미 권한을 허용한 계정은 동의 화면 없이 바로 돌아오기 때문에, 그대로는 다른 계정을 고를 수 없습니다.</p>
                <ol>
                  <li>가장 쉬운 방법은 <strong>시크릿 창</strong>이나 계정별 <strong>브라우저 프로필</strong>에서 NAGU BOT을 여는 것입니다.</li>
                  <li>지금 브라우저에서 바꾸려면 NAGU BOT에서 <strong>연결 해제</strong>를 누릅니다.</li>
                  <li>브라우저 설정의 사이트 데이터에서 <code>spooncast.net</code>과 <code>developers.spooncast.net</code>의 데이터를 삭제합니다.</li>
                  <li>구글 계정 선택 화면이 바로 넘어가면 구글에서 로그아웃하거나 <strong>다른 계정 사용</strong>을 고릅니다.</li>
                  <li>NAGU BOT에서 <strong>Spoon DJ 계정으로 로그인</strong>을 눌러 다른 계정으로 연결합니다.</li>
                </ol>
                <p>같은 브라우저에서 다른 DJ 계정으로 로그인해도 설정과 기록은 섞이지 않습니다. 원래 계정으로 다시 로그인하면 그 계정의 설정을 그대로 불러옵니다.</p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </InformationPage>
  );
}
