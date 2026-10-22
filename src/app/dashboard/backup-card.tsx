import { ConfirmButton } from "../confirm-button";
import type { DashboardView } from "./load";

export function BackupCard({ view }: { view: DashboardView }) {
  const { settingsNotice } = view;
  return (
    <article className="bot-card backup-page" aria-labelledby="backup-title">
      <div className="bot-heading">
        <div>
          <p className="section-label">로컬 보관</p>
          <h2 id="backup-title">데이터 백업</h2>
        </div>
      </div>

      {settingsNotice && (
        <div className={`settings-notice is-${settingsNotice.tone}`} role={settingsNotice.tone === "error" ? "alert" : "status"}>
          <span aria-hidden="true">{settingsNotice.tone === "success" ? "✓" : "!"}</span>
          <strong>{settingsNotice.text}</strong>
        </div>
      )}

      <section className="backup-tools" aria-labelledby="backup-tools-title">
        <div>
          <h3 id="backup-tools-title">백업 다운로드 및 복원</h3>
          <p>로그인 정보는 백업에 포함되지 않습니다. 내려받은 파일은 안전한 곳에 보관해 주세요.</p>
        </div>
        <div className="backup-scope" aria-label="백업 데이터 범위">
          <section>
            <h4>운영 데이터</h4>
            <ul>
              <li>DJ 표시 이름과 자동화 문구·사용 여부·반복 간격</li>
              <li>사용자 명령어, 카운터, 신청곡 목록</li>
              <li>가위바위보·추첨·퀴즈 라운드와 참여 기록</li>
              <li>룰렛 설정·경품·당첨·킵 기록</li>
            </ul>
          </section>
          <section>
            <h4>청취자 기록 추가</h4>
            <ul>
              <li>청취자 ID·닉네임·최초/최근 확인 시각</li>
              <li>방송별 입장·하트·스푼 후원 이벤트</li>
              <li>현재 방송 스푼 랭킹 스냅샷</li>
            </ul>
          </section>
          <section>
            <h4>저장하지 않음</h4>
            <ul>
              <li>로그인 정보, 관리자 정보</li>
              <li>봇 입장 상태와 현재 방송 연결 상태</li>
              <li>대시보드의 최근 활동 목록</li>
            </ul>
          </section>
        </div>
        <div className="backup-downloads">
          <a href="/bot/backup">운영 데이터 다운로드</a>
          <a href="/bot/backup?audience=1">청취자 기록 포함 다운로드</a>
        </div>
        <form action="/bot/backup" method="post" encType="multipart/form-data">
          <label htmlFor="workspace-backup-file">백업 파일</label>
          <input id="workspace-backup-file" type="file" name="backup" accept="application/json,.json" required />
          <label className="backup-confirm">
            <input type="checkbox" required />
            <span>현재 운영 데이터를 백업 파일 내용으로 교체합니다.</span>
          </label>
          <ConfirmButton type="submit" message="현재 운영 데이터를 백업 파일 내용으로 바꿀까요? 되돌릴 수 없습니다.">백업 복원</ConfirmButton>
        </form>
        <p className="backup-privacy">두 백업 모두 신청곡·게임·룰렛 참여 닉네임을 포함할 수 있습니다. 청취자 기록 포함 백업에는 청취자 프로필과 후원 이벤트가 추가됩니다.</p>
        <p className="backup-privacy">복원하면 운영 데이터는 백업 시점 내용으로 교체됩니다. 운영 데이터 백업만 복원할 때는 서버의 기존 청취자 기록을 유지합니다.</p>
      </section>
    </article>
  );
}
