import Link from "next/link";
import { DJ_COMMAND_HELP } from "@/lib/dj-command";
import { QuizPanel } from "./quiz-panel";
import { RafflePanel } from "./raffle-panel";
import { RoulettePanel } from "./roulette-panel";
import { RpsPanel } from "./rps-panel";
import { SecretWordPanel } from "./secret-word-panel";
import { TeamBattlePanel } from "./team-battle-panel";
import type { DashboardView } from "./load";

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

      {gameTab === "roulette" && <RoulettePanel view={view} />}
    </article>
  );
}
