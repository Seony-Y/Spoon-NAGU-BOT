import { RouletteDistributionEditor } from "../game/roulette/roulette-distribution-editor";
import { RouletteKeepEditor } from "../game/roulette/roulette-keep-editor";
import { AutoRefresh } from "../refresh-live-button";
import { formatDateTime } from "./format";
import type { DashboardView } from "./load";

export function RoulettePanel({ view }: { view: DashboardView }) {
  const { params, previewConnected, rouletteSettings, rouletteItems, rouletteResults, rouletteKeepUsers, roulettePercentages } = view;
  return (
    <section className="game-panel roulette-panel" aria-labelledby="roulette-title">
      <AutoRefresh intervalMs={2000} />
      <div className="game-panel-heading">
        <div>
          <h3 id="roulette-title">룰렛</h3>
          <p>청취자가 1회 비용 이상을 한 번에 후원하면 룰렛이 자동으로 한 번 돌아갑니다.</p>
        </div>
        <span className={`game-state ${rouletteSettings?.enabled ? "is-active" : ""}`}>
          {rouletteSettings?.enabled ? "켜짐" : "꺼짐"}
        </span>
      </div>

      {params.roulette === "settings_saved" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>룰렛 설정을 저장했습니다.</strong></div>}
      {params.roulette === "distribution_saved" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>룰렛 확률표를 저장했습니다.</strong></div>}
      {params.roulette === "item_deleted" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>경품을 삭제하고 해당 확률을 꽝 확률에 반영했습니다.</strong></div>}
      {params.roulette === "keeps_updated" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>선택한 킵 수량을 수정했습니다.</strong></div>}
      {params.roulette === "keeps_deleted" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>선택한 킵을 삭제했습니다.</strong></div>}
      {params.roulette === "invalid_keeps" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>수정할 킵 항목과 수량을 다시 확인해 주세요.</strong></div>}
      {params.roulette === "invalid_distribution" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>경품 당첨 확률 합계는 100% 이하여야 하며 같은 경품명은 한 번만 사용할 수 있습니다.</strong></div>}
      {params.roulette === "invalid_settings" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>룰렛 입력값을 확인해 주세요.</strong></div>}

      {rouletteSettings && (
        <form className="roulette-settings-form" action="/game/roulette" method="post">
          <input type="hidden" name="action" value="settings" />
          <label className="feature-enabled roulette-enabled"><input type="checkbox" role="switch" name="enabled" defaultChecked={rouletteSettings.enabled} /> 후원 룰렛 사용</label>
          <label>1회 비용<input type="number" name="cost" min={1} max={1_000_000} defaultValue={rouletteSettings.cost} required /><span>스푼</span></label>
          <button type="submit">설정</button>
        </form>
      )}

      <RouletteDistributionEditor
        editing={params.rouletteEdit === "1"}
        items={rouletteItems.map((item) => ({
          id: item.id,
          label: item.label,
          percentage: roulettePercentages.get(String(item.id)) ?? "0",
        }))}
      />

      <div className="roulette-records">
        <section aria-labelledby="roulette-history-title">
          <div className="roulette-section-heading"><div><h4 id="roulette-history-title">당첨 이력</h4><p>최근 {rouletteResults.length}건</p></div></div>
          {rouletteResults.length > 0 ? <ol className="roulette-history-list">
            {rouletteResults.map((result) => <li key={result.id}>
              <div><strong>{result.nickname}</strong><time dateTime={new Date(result.createdAt).toISOString()}>{formatDateTime(result.createdAt)}</time></div>
              <span className={result.isMiss ? "is-miss" : "is-win"}>{result.isMiss ? "꽝" : result.itemLabel}</span>
              <small>{result.spoons.toLocaleString("ko-KR")}스푼</small>
            </li>)}
          </ol> : <p className="roulette-empty">아직 추첨 이력이 없습니다.</p>}
        </section>

        <section aria-labelledby="roulette-keeps-title">
          {rouletteKeepUsers.length > 0
            ? <RouletteKeepEditor users={rouletteKeepUsers} disabled={previewConnected} />
            : <><div className="roulette-section-heading"><div><h4 id="roulette-keeps-title">청취자별 킵</h4><p><code>!내 킵</code>으로 조회</p></div></div><p className="roulette-empty">저장된 킵이 없습니다.</p></>}
        </section>
      </div>
    </section>
  );
}
