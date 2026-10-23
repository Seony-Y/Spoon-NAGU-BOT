import type { Metadata } from "next";
import type { ReactNode } from "react";
import { InformationPage } from "../information-page";
import { GuideNav } from "./guide-nav";

export const metadata: Metadata = {
  title: "사용 방법 | NAGU BOT",
  description: "NAGU BOT 연결, 방송 운영, 채팅 명령어와 게임 사용 방법",
};

type CommandRow = [command: string, description: string];

const LISTENER_COMMANDS: CommandRow[] = [
  ["!명령어", "지금 쓸 수 있는 명령어 보기"],
  ["!안녕", "인사 (DJ가 만든 명령어도 같은 방식)"],
  ["!실드", "카운터 값 보기 (카운터 이름마다, 예: !펀딩)"],
  ["!신청곡 밤편지-아이유", "신청곡 신청 (곡명-가수)"],
  ["!신청곡 목록", "신청곡 대기 목록 보기"],
  ["!출석", "출석 확인과 연속·누적 횟수"],
  ["!출석왕", "이번 달 출석 TOP 5"],
  ["!가위바위보 가위", "가위바위보 참여 (가위·바위·보)"],
  ["!참여", "추첨 응모"],
  ["!정답 (답)", "퀴즈 답 제출"],
  ["!팀 1  ·  !팀 A팀", "팀 대항전 참여 (번호나 이름)"],
  ["!내 킵", "내 룰렛 당첨 내역 보기"],
];

const DJ_COMMANDS: CommandRow[] = [
  ["!봇  ·  !봇 상태", "DJ 명령어 목록 · 진행 중인 게임과 자동 기능 상태"],
  ["!가위바위보 시작 / 종료", "가위바위보 (DJ 선택은 랜덤)"],
  ["!추첨 시작 3 / 종료", "추첨 (당첨 인원, 빼면 1명)"],
  ["!퀴즈 시작 / 종료", "대기 문제를 위에서부터 출제 · 정답 공개"],
  ["!비밀단어 시작 / 힌트 / 종료", "대기 단어 출제 · 힌트 공개 · 정답 공개"],
  ["!팀전 시작 / 상태 / 종료", "대시보드의 팀 설정으로 시작 · 점수 · 결과"],
  ["!룰렛 켜기 / 끄기", "후원 룰렛 켜고 끄기"],
  ["!환영 · !후원 · !하트 · !팔로우 · !공지 켜기 / 끄기", "자동 기능 켜고 끄기"],
  ["!실드 +2  ·  !실드 -1", "카운터 늘리기·줄이기 (0 아래로는 안 내려감)"],
  ["!신청곡 삭제 2", "신청곡 목록의 2번 삭제"],
  ["!킵 삭제 닉네임 / 경품 / 수량", "청취자 킵 삭제 (수량을 빼면 1개)"],
];

function CommandTable({ caption, rows }: { caption: string; rows: CommandRow[] }) {
  return (
    <table className="guide-commands">
      <caption>{caption}</caption>
      <thead><tr><th scope="col">입력</th><th scope="col">하는 일</th></tr></thead>
      <tbody>
        {rows.map(([command, description]) => (
          <tr key={command}><td><code>{command}</code></td><td>{description}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ id, number, title, summary, open = false, children }: {
  id: string;
  number: string;
  title: string;
  summary: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="guide-accordion" id={id} open={open}>
      <summary><span className="guide-number">{number}</span><strong>{title}</strong><span>{summary}</span><i aria-hidden="true" /></summary>
      <div className="guide-accordion-content">{children}</div>
    </details>
  );
}

// 준비 / 진행 / 결과 for one game.
function GameSteps({ title, steps }: { title: string; steps: Array<[label: string, body: ReactNode]> }) {
  return (
    <div className="guide-topic">
      <h3>{title}</h3>
      <dl className="guide-steps">
        {steps.map(([label, body]) => (
          <div key={label}><dt>{label}</dt><dd>{body}</dd></div>
        ))}
      </dl>
    </div>
  );
}

export default function GuidePage() {
  return (
    <InformationPage
      eyebrow="GETTING STARTED"
      title="사용 방법"
      summary="Spoon DJ 연결부터 방송 운영과 게임까지, 필요한 부분을 메뉴에서 골라 보세요."
      updatedAt="2026년 10월 23일"
    >
      <ol className="guide-quickstart" aria-label="빠른 시작">
        <li><strong>입장코드 입력</strong><span>운영자 나구링(@gu._.ling)에게 받은 코드를 홈에 입력합니다.</span></li>
        <li><strong>Spoon DJ 계정으로 로그인</strong><span>방송하는 계정으로 로그인하고 요청 권한을 모두 허용합니다.</span></li>
        <li><strong>봇 입장</strong><span>방송 전에 눌러 두면 방송이 시작될 때 봇이 자동으로 들어갑니다.</span></li>
      </ol>

      <div className="guide-layout">
        <GuideNav />
        <div className="guide-sections">
          <Section id="getting-started" number="01" title="시작하기" summary="로그인, 여러 기기, 매니저 지정" open>
            <div className="guide-topic">
              <h3>처음 연결하기</h3>
              <ol>
                <li>홈의 <strong>입장코드</strong>에 코드를 입력하고 확인을 누릅니다. NAGU BOT은 시범 운영 중이라 코드가 있어야 로그인할 수 있습니다.</li>
                <li><strong>Spoon DJ 계정으로 로그인</strong>을 누르고, 방송에 쓰는 계정으로 로그인합니다.</li>
                <li>요청 권한을 <strong>모두</strong> 허용합니다. 하나라도 빼면 로그인이 취소되니, <strong>권한 다시 허용하기</strong>로 다시 진행하세요.</li>
                <li>화면 위에 <strong>로그인됨</strong>이 보이면 끝입니다.</li>
              </ol>
              <p className="guide-note">로그인 버튼을 누른 뒤 10분 안에 마쳐야 하고, 틀린 입장코드를 여러 번 넣으면 10분 동안 잠깁니다. NAGU BOT은 Spoon 비밀번호를 받거나 저장하지 않습니다.</p>
            </div>
            <div className="guide-topic">
              <h3>여러 기기에서 쓰기</h3>
              <p>PC와 휴대폰에서 같은 계정으로 로그인하면 설정과 기록을 함께 씁니다. 봇은 계정당 하나라서 어느 기기에서 조작해도 같은 봇이 움직이고, 다른 기기에서 <strong>봇 입장</strong>을 누르면 그 기기가 봇을 넘겨받습니다.</p>
              <p className="guide-note"><strong>이전에 저장한 설정을 아직 불러오지 않았습니다</strong>라는 안내가 보이면, 방송 중 DJ 계정으로 채팅을 한 번 입력하세요. 저장된 설정을 자동으로 불러옵니다.</p>
            </div>
            <div className="guide-topic">
              <h3>봇을 고정 매니저로 지정하기</h3>
              <p>입장 환영과 팔로우 감사는 봇이 매니저일 때만 동작합니다.</p>
              <ol>
                <li>방송 중에 봇 운영 탭의 <strong>봇이 DJ 팔로우하기</strong>를 누릅니다. 버튼이 없으면 건너뜁니다.</li>
                <li>방송이 끝난 뒤 Spoon에서 봇을 고정 매니저로 지정합니다.</li>
              </ol>
              <p className="guide-note">방송 중에 매니저로 지정하거나 해제해도 1분 안에 반영됩니다.</p>
            </div>
          </Section>

          <Section id="commands" number="02" title="명령어" summary="청취자 명령어와 DJ 전용 명령어 한눈에 보기">
            <CommandTable caption="청취자 (누구나)" rows={LISTENER_COMMANDS} />
            <CommandTable caption="DJ 전용 (DJ 계정으로 방송 채팅에 입력)" rows={DJ_COMMANDS} />
            <p className="guide-note">DJ 명령어는 봇이 방송에 있을 때 동작하고, 대시보드 버튼과 똑같은 일을 합니다. 대시보드 채팅창에 입력해도 됩니다. 채팅은 청취자에게도 보이므로 퀴즈 정답과 비밀 단어는 방송 전에 대시보드에 등록해 두세요.</p>
          </Section>

          <Section id="dashboard" number="03" title="대시보드" summary="화면 구성과 휴대폰 리모컨">
            <div className="guide-topic">
              <h3>화면 구성</h3>
              <ul>
                <li><strong>봇 상태 바</strong> (모든 탭 위): 봇 상태, <strong>봇 입장</strong>·<strong>봇 퇴장</strong>, 휴대폰 리모컨 링크</li>
                <li><strong>대시보드</strong>: 방송 현황, 청취자와 후원 팬 랭킹(구독자 표시), 최근 활동</li>
                <li><strong>봇 운영</strong>: 자동화 문구, 카운터, 채팅 명령어, 신청곡</li>
                <li><strong>게임</strong>: 가위바위보, 추첨, 퀴즈, 비밀 단어, 팀 대항전, 출석, 룰렛</li>
                <li><strong>데이터 백업</strong>: 백업 내려받기·복원, 모든 데이터 초기화</li>
              </ul>
              <p className="guide-note">탭이 한 줄에 다 보이지 않으면 옆으로 밀거나 양쪽 <strong>‹ ›</strong> 버튼을 누릅니다. 방송 중에 봇 퇴장을 하면 봇이 나간다고 채팅으로 먼저 알립니다.</p>
            </div>
            <div className="guide-topic">
              <h3>휴대폰 리모컨</h3>
              <p>PC로 방송한다면 휴대폰에서 <strong>휴대폰 리모컨</strong>을 열어 옆에 두세요(휴대폰에서도 한 번 로그인 필요). <strong>게임 · 카운터 · 자동 기능</strong> 버튼으로 화면을 바꿔 가며 게임을 시작·종료하고, 카운터 값을 입력하고, 룰렛과 자동 기능을 켜고 끕니다. 진행 중인 퀴즈 정답과 비밀 단어는 리모컨 화면에만 보입니다.</p>
            </div>
          </Section>

          <Section id="bot-operations" number="04" title="봇 운영" summary="자동화, 카운터·펀딩, 명령어, 신청곡">
            <div className="guide-topic">
              <h3>자동화</h3>
              <ul>
                <li><strong>입장 환영</strong>: 들어온 청취자에게 방송마다 한 번 인사합니다. 1위 팬·매니저·구독자·단골에게는 호칭을 붙입니다(예: 단골 철수님).</li>
                <li><strong>후원 감사</strong>: 후원마다 감사 인사를 보냅니다.</li>
                <li><strong>하트 감사</strong>: 같은 청취자가 연달아 보낸 하트를 몇 초씩 모아 한 번에 감사합니다.</li>
                <li><strong>팔로우 감사</strong>: 방송 중 처음 팔로우한 청취자에게 인사합니다.</li>
                <li><strong>반복 공지</strong>: 정한 간격(1~1440분, 기본 10분)마다 안내를 보냅니다.</li>
              </ul>
              <p className="guide-note">켜기·끄기 스위치는 바로 반영되고, 문구는 <strong>저장</strong>을 눌러야 반영됩니다. 봇이 잠시 끊긴 사이 들어온 후원은 다시 연결되면 모아서 감사 인사를 보내고 룰렛도 돌립니다.</p>
            </div>
            <div className="guide-topic">
              <h3>DJ 표시 이름</h3>
              <p>인사말의 <code>{"{name}"}</code>에 들어갈 이름입니다. 비워 두면 <strong>DJ</strong>로 나옵니다. 봇이 방송에 있을 때 Spoon 앱 방송 채팅에 DJ가 한 번 글을 쓰면 자동으로 채워집니다(대시보드 채팅창으로는 채워지지 않음).</p>
            </div>
            <div className="guide-topic">
              <h3>카운터와 펀딩</h3>
              <p>카운터(기본 이름 실드)는 누구나 <code>!실드</code>로 보고, DJ만 <code>!실드 +2</code>처럼 바꿉니다. 리모컨에서 값을 직접 입력해도 됩니다.</p>
              <p><strong>목표 스푼</strong>을 넣으면 펀딩 카운터가 되어 <code>펀딩 [1,200 / 5,000 스푼]</code>처럼 답합니다. <strong>후원 자동 반영</strong>을 켜면 방송 중 받은 스푼이 자동으로 더해지고, 목표를 넘는 순간 채팅으로 알립니다.</p>
            </div>
            <div className="guide-topic">
              <h3>채팅 명령어 만들기</h3>
              <p><code>!안녕</code>처럼 명령어와 답을 등록합니다. 기본 명령어, 카운터, <code>!팀</code>·<code>!출석</code>처럼 봇 기능이 쓰는 이름은 쓸 수 없습니다. 예전에 같은 이름으로 만든 명령어가 있다면 봇 기능이 먼저 답하니 목록에서 지워 주세요.</p>
            </div>
            <div className="guide-topic">
              <h3>신청곡</h3>
              <p>청취자가 <code>!신청곡 곡명-가수</code>로 신청하면 목록에 쌓입니다. DJ는 화면이나 <code>!신청곡 삭제 번호</code>로 지웁니다. 번호는 지금 목록 순서라서 앞 번호를 지우면 뒤 번호가 당겨집니다.</p>
            </div>
          </Section>

          <Section id="game" number="05" title="게임" summary="게임별 준비 · 진행 · 결과">
            <div className="guide-topic">
              <h3>모든 게임 공통</h3>
              <ul>
                <li>게임은 <strong>봇이 방송에 있을 때만</strong> 시작할 수 있습니다.</li>
                <li>참여·응모 안내는 몇 초씩 모아 한 번에 보냅니다(예: [추첨] 응모 완료! (A, B)). 채팅이 봇 메시지로 덮이지 않습니다.</li>
                <li>비밀 단어나 팀 대항전을 끝내지 않고 방송을 마치면 자동으로 종료되고 결과는 기록에만 남습니다.</li>
                <li>게임 탭 아래 <strong>기록 초기화</strong>는 그 게임의 지난 기록만 지웁니다. 진행 중인 게임, 대기 목록, 팀 설정, 룰렛 경품과 킵은 남습니다.</li>
              </ul>
            </div>
            <GameSteps title="가위바위보" steps={[
              ["준비", "DJ가 가위·바위·보 중 하나를 고르거나 랜덤으로 정해 시작합니다."],
              ["진행", <>청취자가 <code>!가위바위보 가위</code>처럼 한 번 참여합니다.</>],
              ["결과", "종료하면 채팅과 화면에 결과를 공개합니다."],
            ]} />
            <GameSteps title="추첨" steps={[
              ["준비", "당첨 인원(1~100,000명)을 정해 시작합니다."],
              ["진행", <>청취자가 <code>!참여</code>로 한 번 응모합니다.</>],
              ["결과", "종료하면 무작위로 당첨자를 뽑아 공개합니다. 응모자가 인원보다 적으면 모두 당첨입니다."],
            ]} />
            <GameSteps title="퀴즈" steps={[
              ["준비", <>방송 전에 문제와 정답을 <strong>대기 목록</strong>에 넣습니다(Enter도 가능). 바로 내려면 <strong>지금 바로 출제</strong>.</>],
              ["진행", <><code>!퀴즈 시작</code>으로 위에서부터 출제하고, 청취자는 <code>!정답 (답)</code>으로 답합니다. 다시 내면 마지막 답으로 바뀌고, 한 번 맞힌 사람은 정답자로 남습니다.</>],
              ["결과", <>정답이 나와도 계속 진행되며, <code>!퀴즈 종료</code>로 정답·첫 정답자와 걸린 시간·다른 정답자를 공개합니다.</>],
            ]} />
            <GameSteps title="비밀 단어" steps={[
              ["준비", "단어(최대 20자)와 힌트를 대기 목록에 넣습니다. 최대 30개."],
              ["진행", <><code>!비밀단어 시작</code>으로 출제하면 봇은 글자 수만 알립니다. 그 단어가 들어간 채팅을 처음 한 청취자가 찾은 사람입니다(띄어쓰기·문장부호·대소문자 무시, DJ 채팅 제외). 막히면 <code>!비밀단어 힌트</code>.</>],
              ["결과", <>찾으면 봇이 걸린 시간과 함께 발표하고, 아무도 못 찾으면 <code>!비밀단어 종료</code>로 정답을 공개합니다.</>],
            ]} />
            <GameSteps title="팀 대항전" steps={[
              ["준비", "팀 이름(2~4개), 점수 기준(하트+후원 · 하트만 · 후원만), 목표 점수(없음 또는 100~100,000)를 정합니다. 스푼 1개는 10점입니다."],
              ["진행", <><code>!팀전 시작</code> 후 청취자가 <code>!팀 1</code>로 팀을 고릅니다(변경 불가). 참여한 뒤 보낸 하트·후원만 점수가 되고, 선두가 바뀌면 1분에 한 번까지 알립니다.</>],
              ["결과", <>목표에 먼저 닿은 팀이 나오면 자동 종료, 아니면 <code>!팀전 종료</code>. 순위와 MVP를 발표합니다.</>],
            ]} />
            <GameSteps title="출석" steps={[
              ["자동", "봇이 방송에 있는 동안 입장·채팅·하트·후원·팔로우한 청취자는 방송마다 한 번 자동 출석됩니다. 연속 출석은 날짜가 아니라 방송 횟수로 셉니다."],
              ["확인", <>청취자는 <code>!출석</code>으로 연속·누적 횟수를, <code>!출석왕</code>으로 이번 달 TOP 5를 봅니다.</>],
              ["축하", "누적 10·30·50·100회, 연속 5·10·20회 등에 닿으면 봇이 축하합니다. 게임 > 출석에서 끄고 순위를 볼 수 있습니다."],
            ]} />
            <GameSteps title="룰렛" steps={[
              ["준비", <>1회 비용(스푼)과 경품별 확률(0.01% 단위)을 정합니다. 남는 확률은 꽝입니다. 저장한 뒤 <strong>후원 룰렛 사용</strong>을 켭니다(기본은 꺼짐).</>],
              ["진행", "1회 비용 이상을 한 번에 후원하면 룰렛이 자동으로 한 번 돌고 결과를 채팅으로 알립니다."],
              ["킵", <>당첨 경품은 청취자 킵에 쌓입니다(꽝 제외). 청취자는 <code>!내 킵</code>으로 확인하고, DJ는 화면이나 <code>!킵 삭제</code>로 정리합니다.</>],
            ]} />
          </Section>

          <Section id="data" number="06" title="데이터와 연결 해제" summary="자동 저장, 백업, 초기화, 계정 전환">
            <div className="guide-topic">
              <h3>자동 저장</h3>
              <p>설정과 기록은 서버에 자동으로 저장됩니다. 새로고침, 방송 종료, 서버 재시작, 연결 해제 후 다시 로그인해도 그대로 이어집니다.</p>
            </div>
            <div className="guide-topic">
              <h3>백업과 복원</h3>
              <p><strong>데이터 백업</strong> 탭에서 설정, 명령어, 카운터, 신청곡, 게임·룰렛 기록과 출석 설정을 파일로 내려받고 복원합니다. 청취자 기록(입장·하트·스푼, 랭킹, 출석 기록)은 <strong>청취자 기록 포함</strong>으로 받을 때만 들어갑니다. 로그인 정보와 봇 입장 상태는 백업하지 않습니다.</p>
            </div>
            <div className="guide-topic">
              <h3>모든 데이터 초기화</h3>
              <p>백업에 들어가는 데이터를 진행 중인 게임까지 모두 지우고 설정을 기본값으로 되돌립니다. 로그인과 봇 입장 상태는 유지되고, 방송 중이면 봇이 채팅으로 알립니다. <code>초기화</code>를 입력하고 한 번 더 확인해야 실행됩니다.</p>
              <p className="guide-note guide-warning">되돌릴 수 없습니다. 먼저 청취자 기록 포함 백업을 받아 두세요.</p>
            </div>
            <div className="guide-topic">
              <h3>연결 해제</h3>
              <p>홈의 <strong>연결 해제</strong>를 누르면 봇이 퇴장하고 같은 계정의 모든 기기에서 로그아웃됩니다. 저장된 설정과 기록은 남아 다시 로그인하면 이어서 씁니다. 지우고 싶다면 먼저 <strong>모든 데이터 초기화</strong>를 하거나 운영자 나구링(@gu._.ling)에게 요청하세요.</p>
            </div>
            <div className="guide-topic">
              <h3>다른 Spoon 계정으로 바꾸기</h3>
              <p>Spoon 로그인은 브라우저에 남은 로그인 상태를 그대로 써서, 그냥은 다른 계정을 고를 수 없습니다.</p>
              <ol>
                <li>가장 쉬운 방법: <strong>시크릿 창</strong>이나 계정별 <strong>브라우저 프로필</strong>에서 NAGU BOT을 엽니다.</li>
                <li>지금 브라우저에서 바꾸려면 <strong>연결 해제</strong> 후, 브라우저 설정에서 <code>spooncast.net</code>·<code>developers.spooncast.net</code> 사이트 데이터를 지웁니다.</li>
                <li>구글 계정 선택이 바로 넘어가면 구글에서 로그아웃하거나 <strong>다른 계정 사용</strong>을 고른 뒤 다시 로그인합니다.</li>
              </ol>
              <p className="guide-note">같은 브라우저에서 계정을 바꿔도 설정과 기록은 섞이지 않습니다.</p>
            </div>
          </Section>
        </div>
      </div>
    </InformationPage>
  );
}
