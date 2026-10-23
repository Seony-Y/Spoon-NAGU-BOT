import Link from "next/link";
import { CommandGuide } from "./command-guide";
import type { DashboardView } from "./load";

const NOTICES: Record<string, { tone: "success" | "error"; text: string }> = {
  announce_on: { tone: "success", text: "출석 기념 메시지를 켰습니다." },
  announce_off: { tone: "success", text: "출석 기념 메시지를 껐습니다. 출석 기록은 계속 쌓입니다." },
};

export function AttendancePanel({ view }: { view: DashboardView }) {
  const { params, bot, attendancePeriod, attendanceRanking, attendanceBroadcasts, attendanceAnnounce } = view;
  if (!bot) return null;
  const notice = params.attendance ? NOTICES[params.attendance] : null;
  return (
    <section className="game-panel" aria-labelledby="attendance-title">
      <div className="game-panel-heading">
        <div>
          <h3 id="attendance-title">출석 스탬프</h3>
          <p>봇이 방송에 있는 동안 입장·채팅·하트·후원·팔로우한 청취자를 방송마다 한 번씩 자동으로 출석 처리합니다. 연속 출석은 달력이 아니라 DJ의 방송 횟수 기준이라, 방송을 쉬는 날에는 끊기지 않습니다.</p>
        </div>
        <span className={`game-state ${attendanceAnnounce ? "is-active" : ""}`}>{attendanceAnnounce ? "기념 메시지 켬" : "기념 메시지 끔"}</span>
      </div>

      {notice && (
        <div className={`settings-notice is-${notice.tone}`} role="status">
          <span aria-hidden="true">✓</span><strong>{notice.text}</strong>
        </div>
      )}

      <form action="/game/attendance" method="post" className="secret-word-actions">
        <input type="hidden" name="announce" value={attendanceAnnounce ? "off" : "on"} />
        <button type="submit">{attendanceAnnounce ? "기념 메시지 끄기" : "기념 메시지 켜기"}</button>
      </form>
      <p className="attendance-summary">기념 메시지: 누적 10·30·50·100·200·300·500·1000번째, 연속 5·10·20·30·50·100회 출석 때 채팅으로 축하합니다.</p>

      <nav className="game-tabs" aria-label="출석 순위 기간">
        <Link scroll={false} className={attendancePeriod === "month" ? "is-active" : ""} href="/?tab=game&game=attendance">이번 달</Link>
        <Link scroll={false} className={attendancePeriod === "all" ? "is-active" : ""} href="/?tab=game&game=attendance&period=all">전체</Link>
      </nav>
      {attendancePeriod === "month" && <p className="attendance-summary">이번 달 방송 {attendanceBroadcasts.toLocaleString("ko-KR")}회</p>}

      {attendanceRanking.length === 0 ? (
        <p className="attendance-summary">아직 출석 기록이 없습니다. 봇을 방송에 입장시키면 자동으로 기록됩니다.</p>
      ) : (
        <ol className="attendance-ranking">
          {attendanceRanking.map((entry, index) => (
            <li key={entry.userId}>
              <span>{index + 1}</span>
              <strong>{entry.nickname}</strong>
              <span>{entry.count.toLocaleString("ko-KR")}회</span>
            </li>
          ))}
        </ol>
      )}

      <CommandGuide rows={[
        { who: "청취자", commands: [{ command: "!출석", description: "내 출석·연속 횟수" }, { command: "!출석왕", description: "이번 달 TOP 5" }] },
      ]} />
    </section>
  );
}
