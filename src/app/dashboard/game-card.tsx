import Link from "next/link";
import { DJ_COMMAND_HELP } from "@/lib/dj-command";
import { QuizPanel } from "./quiz-panel";
import { RafflePanel } from "./raffle-panel";
import { RoulettePanel } from "./roulette-panel";
import { RpsPanel } from "./rps-panel";
import { SecretWordPanel } from "./secret-word-panel";
import { TeamBattlePanel } from "./team-battle-panel";
import { AttendancePanel } from "./attendance-panel";
import type { DashboardView } from "./load";
import { ConfirmButton } from "../confirm-button";

const RESET_TARGETS: Record<string, { game: string; label: string; detail: string }> = {
  rps: { game: "rps", label: "가위바위보 기록", detail: "종료된 라운드와 참가 기록" },
  raffle: { game: "raffle", label: "추첨 기록", detail: "종료된 추첨과 응모·당첨 기록" },
  quiz: { game: "quiz", label: "퀴즈 기록", detail: "종료된 퀴즈와 제출 기록 (대기 문제는 유지)" },
  secret: { game: "secret", label: "비밀 단어 기록", detail: "종료된 라운드 기록 (대기 단어는 유지)" },
  team: { game: "team", label: "팀 대항전 기록", detail: "종료된 대항전과 팀원 점수 (팀 설정은 유지)" },
  attendance: { game: "attendance", label: "출석 기록", detail: "모든 청취자의 출석·연속 출석 횟수" },
  roulette: { game: "roulette", label: "룰렛 당첨 이력", detail: "당첨 이력 (청취자 킵과 경품 설정은 유지)" },
};

export function GameCard({ view }: { view: DashboardView }) {
  const { gameTab } = view;
  return (
    <article className="game-card" aria-labelledby="game-title">
      <div className="game-heading">
        <div>
          <p className="section-label">방송 게임</p>
          <h2 id="game-title">게임</h2>
        </div>
        <Link className="remote-link" href="/remote">휴대폰 리모컨 열기</Link>
      </div>

      <nav className="game-tabs" aria-label="게임 선택">
        <Link scroll={false} className={gameTab === "rps" ? "is-active" : ""} href="/?tab=game&game=rps">가위바위보</Link>
        <Link scroll={false} className={gameTab === "raffle" ? "is-active" : ""} href="/?tab=game&game=raffle">추첨</Link>
        <Link scroll={false} className={gameTab === "quiz" ? "is-active" : ""} href="/?tab=game&game=quiz">퀴즈</Link>
        <Link scroll={false} className={gameTab === "secret" ? "is-active" : ""} href="/?tab=game&game=secret">비밀 단어</Link>
        <Link scroll={false} className={gameTab === "team" ? "is-active" : ""} href="/?tab=game&game=team">팀 대항전</Link>
        <Link scroll={false} className={gameTab === "attendance" ? "is-active" : ""} href="/?tab=game&game=attendance">출석</Link>
        <Link scroll={false} className={gameTab === "roulette" ? "is-active" : ""} href="/?tab=game&game=roulette">룰렛</Link>
      </nav>

      <details className="dj-command-help">
        <summary>방송 화면을 벗어나지 않고 채팅으로 진행하기 (DJ 전용 명령어)</summary>
        <p>DJ 계정으로 방송 채팅에 입력하면 이 화면의 버튼과 똑같이 동작합니다. 봇이 방송에 입장해 있어야 합니다. PC로 방송한다면 휴대폰에서 <Link href="/remote">리모컨</Link>을 열어 써도 됩니다.</p>
        <ul>
          {DJ_COMMAND_HELP.map((line) => <li key={line}><code>{line}</code></li>)}
        </ul>
      </details>

      {gameTab === "rps" && <RpsPanel view={view} />}

      {gameTab === "raffle" && <RafflePanel view={view} />}

      {gameTab === "quiz" && <QuizPanel view={view} />}

      {gameTab === "secret" && <SecretWordPanel view={view} />}

      {gameTab === "team" && <TeamBattlePanel view={view} />}

      {gameTab === "attendance" && <AttendancePanel view={view} />}

      {gameTab === "roulette" && <RoulettePanel view={view} />}

      {view.params.reset === "done" && (
        <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>{RESET_TARGETS[gameTab]?.label ?? "기록"}을 초기화했습니다.</strong></div>
      )}
      {RESET_TARGETS[gameTab] && view.bot && !view.previewConnected && (
        <form className="game-reset" action="/game/reset" method="post">
          <input type="hidden" name="game" value={RESET_TARGETS[gameTab].game} />
          <div>
            <strong>{RESET_TARGETS[gameTab].label} 초기화</strong>
            <span>{RESET_TARGETS[gameTab].detail}을 지웁니다. 진행 중인 게임은 그대로 둡니다.</span>
          </div>
          <ConfirmButton type="submit" message={`${RESET_TARGETS[gameTab].label}을 모두 지울까요? 되돌릴 수 없습니다. 필요하면 먼저 데이터 백업을 받아 두세요.`}>기록 초기화</ConfirmButton>
        </form>
      )}
    </article>
  );
}
