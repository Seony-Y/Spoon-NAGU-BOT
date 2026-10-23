import Link from "next/link";
import { AutomationToggle } from "../bot/automation-toggle";
import { ConfirmButton } from "../confirm-button";
import { AutoRefresh } from "../refresh-live-button";
import { formatDateTime } from "./format";
import { automationTabs } from "./labels";
import type { DashboardView } from "./load";

export function AutomationSettings({ view }: { view: DashboardView }) {
  const { automationTab, scopes, bot, settingsNotice, botSettings, botCommands, botCounters, songRequests } = view;
  if (!bot) return null;
  if (!botSettings) return null;
  return (
    <section className="automation-settings" aria-labelledby="automation-title">
      <div className="automation-heading">
        <div>
          <p className="section-label">운영 설정</p>
          <h3 id="automation-title">방송 자동화 설정</h3>
        </div>
        <span>켜기·끄기는 바로 적용 · 문구는 [저장]을 눌러야 적용</span>
      </div>

      {settingsNotice && (
        <div className={`settings-notice is-${settingsNotice.tone}`} role={settingsNotice.tone === "error" ? "alert" : "status"}>
          <span aria-hidden="true">{settingsNotice.tone === "success" ? "✓" : "!"}</span>
          <strong>{settingsNotice.text}</strong>
        </div>
      )}

      <form className="dj-name-form" action="/bot/settings" method="post">
        <input type="hidden" name="mode" value="dj_nickname" />
        <input type="hidden" name="automation" value={automationTab} />
        <div>
          <label htmlFor="dj-display-name">DJ 표시 이름 <span>선택</span></label>
          <p>봇 인사말에 쓸 DJ 이름입니다. 비워 두면 <strong>DJ</strong>로 표시합니다. 봇이 방송에 들어가 있을 때 DJ가 <strong>Spoon 앱의 방송 채팅</strong>에 글을 쓰면 그 닉네임으로 자동으로 채워지고, 새로고침하면 여기에 보입니다. 대시보드 채팅창으로 보낸 메시지는 Spoon이 봇에게 다시 알려 주지 않아 채워지지 않습니다.</p>
        </div>
        <div className="dj-name-field">
          <input id="dj-display-name" name="djNickname" defaultValue={botSettings.djNickname} maxLength={50} placeholder="DJ" />
          <button type="submit">저장</button>
        </div>
      </form>

      <nav className="automation-tabs" aria-label="자동화 설정">
        {automationTabs.map(([key, label]) => (
          <Link scroll={false} key={key} className={automationTab === key ? "is-active" : ""} href={`/?tab=bot&automation=${key}`}>
            {label}
          </Link>
        ))}
      </nav>

      {automationTab === "welcome" && (
        <form className="automation-feature-form" action="/bot/settings" method="post">
          <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="welcome" />
          <AutomationToggle feature="welcome" initialEnabled={botSettings.welcomeEnabled} label="입장 환영" />
          <label htmlFor="welcome-message">입장 인사말</label>
          <textarea id="welcome-message" name="message" defaultValue={botSettings.greetingMessage} maxLength={200} rows={3} required />
          <p><code>{"{name}"}</code>은 DJ, <code>{"{nickname}"}</code>은 청취자 닉네임입니다.</p><button type="submit">입장 환영 저장</button>
        </form>
      )}

      {automationTab === "donation" && (
        <form className="automation-feature-form" action="/bot/settings" method="post">
          <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="donation" />
          <AutomationToggle feature="donation" initialEnabled={botSettings.donationEnabled} label="후원 감사" />
          <label htmlFor="donation-message">후원 감사말</label>
          <textarea id="donation-message" name="message" defaultValue={botSettings.donationMessage} maxLength={200} rows={3} required />
          <p><code>{"{nickname}"}</code>은 후원자, <code>{"{amount}"}</code>는 스푼 수입니다.</p><button type="submit">후원 감사 저장</button>
        </form>
      )}

      {automationTab === "heart" && (
        <form className="automation-feature-form" action="/bot/settings" method="post">
          <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="heart" />
          <AutomationToggle feature="heart" initialEnabled={botSettings.heartEnabled} label="하트 감사" />
          <label htmlFor="heart-message">하트 감사말</label>
          <textarea id="heart-message" name="message" defaultValue={botSettings.heartMessage} maxLength={200} rows={3} required />
          <p><code>{"{nickname}"}</code>은 하트를 보낸 청취자, <code>{"{milestone}"}</code>은 보낸 하트 수입니다.</p><button type="submit">하트 감사 저장</button>
        </form>
      )}

      {automationTab === "follow" && (
        <form className="automation-feature-form" action="/bot/settings" method="post">
          <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="follow" />
          {!scopes.includes("events.follow") && (
            <p className="feature-unavailable">이 기능은 운영자가 Spoon에서 ‘팔로우’ 권한을 켠 뒤, 다시 로그인하면 사용할 수 있습니다.</p>
          )}
          <AutomationToggle feature="follow" initialEnabled={botSettings.followEnabled} label="팔로우 감사" />
          <label htmlFor="follow-message">팔로우 감사말</label>
          <textarea id="follow-message" name="message" defaultValue={botSettings.followMessage} maxLength={200} rows={3} required />
          <p><code>{"{nickname}"}</code>은 팔로우한 청취자입니다. 방송 중 처음 팔로우한 경우에만 인사하며, 봇이 매니저로 지정되어 있어야 합니다.</p><button type="submit">팔로우 감사 저장</button>
        </form>
      )}

      {automationTab === "repeat" && (
        <form className="automation-feature-form" action="/bot/settings" method="post">
          <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="repeat" />
          <AutomationToggle feature="repeat" initialEnabled={botSettings.repeatEnabled} label="반복 공지" />
          <label htmlFor="repeat-interval">반복 간격</label>
          <div className="interval-field"><input id="repeat-interval" type="number" name="intervalMinutes" min={1} max={1440} defaultValue={botSettings.repeatIntervalMinutes} required /><span>분마다</span></div>
          <label htmlFor="repeat-message">반복 멘트</label>
          <textarea id="repeat-message" name="message" defaultValue={botSettings.repeatMessage} maxLength={200} rows={3} required />
          <p><code>{"{name}"}</code>을 DJ 닉네임으로 바꿉니다. 설정 변경은 1분 이내 반영됩니다.</p><button type="submit">반복 멘트 저장</button>
        </form>
      )}

      {automationTab === "counters" && <div className="counter-editor">
        <AutoRefresh />
        <div className="counter-guide">
          <h4>카운터 관리</h4>
          <p><code>!실드</code> 조회는 누구나 사용할 수 있고, <code>!실드 +2</code> 또는 <code>!실드 -1</code> 증감은 DJ만 사용할 수 있습니다. 이 규칙은 추가한 모든 카운터에 동일하게 적용됩니다.</p>
          <p><strong>펀딩</strong>: 카운터에 목표 스푼을 입력하면 그 카운터 명령어(예: 이름이 펀딩이면 <code>!펀딩</code>)에 <code>펀딩 [1,200 / 5,000 스푼]</code>처럼 답합니다. 후원 자동 반영을 켜 두면 방송 중 받은 스푼이 자동으로 더해지고, 후원으로 목표를 넘는 순간 채팅으로 알립니다. 목표를 비워 두면 일반 카운터이고 후원 자동 반영은 쓰이지 않습니다.</p>
        </div>
        {botCounters.length > 0 && <div className="counter-list">
          {botCounters.map((counter) => <section key={counter.id} className="counter-item">
            <form action="/bot/settings" method="post">
              <input type="hidden" name="mode" value="save_counter" /><input type="hidden" name="id" value={counter.id} /><input type="hidden" name="originalValue" value={counter.value} />
              <label>이름<input name="name" defaultValue={counter.name} maxLength={20} readOnly={counter.name === "실드"} required /></label>
              <label>{counter.goal === null ? "개수" : "받은 스푼"}<input type="number" name="value" min={0} max={1000000} defaultValue={counter.value} required /></label>
              <label>목표 스푼<input type="number" name="goal" min={1} max={1000000} defaultValue={counter.goal ?? ""} placeholder="펀딩일 때만" /></label>
              <label className="counter-auto"><input type="checkbox" name="autoSpoons" defaultChecked={counter.goal === null || counter.autoSpoons} />후원 자동 반영</label>
              <button type="submit">수정</button>
            </form>
            {counter.name !== "실드" && <div className="counter-actions">
              <form action="/bot/settings" method="post"><input type="hidden" name="mode" value="delete_counter" /><input type="hidden" name="id" value={counter.id} /><ConfirmButton className="is-danger" type="submit" message={`${counter.name} 카운터를 삭제할까요?`}>삭제</ConfirmButton></form>
            </div>}
          </section>)}
        </div>}
        <form className="counter-create-form" action="/bot/settings" method="post">
          <input type="hidden" name="mode" value="save_counter" />
          <label htmlFor="counter-name">새 이름</label><input id="counter-name" name="name" placeholder="실드" maxLength={20} required />
          <label htmlFor="counter-value">개수</label><input id="counter-value" type="number" name="value" min={0} max={1000000} defaultValue={0} required />
          <label htmlFor="counter-goal">목표 스푼</label><input id="counter-goal" type="number" name="goal" min={1} max={1000000} placeholder="펀딩일 때만" />
          <label className="counter-auto"><input type="checkbox" name="autoSpoons" defaultChecked />후원 자동 반영</label>
          <button type="submit">카운터 추가</button>
        </form>
      </div>}

      {automationTab === "commands" && <div className="command-editor">
        <h4>명령어 관리</h4>
        <h5 className="command-group-title">기본 명령어 · 누구나 사용</h5>
        <ul>
          <li><div><strong>!명령어</strong><span>지금 쓸 수 있는 명령어 보기</span></div></li>
          <li><div><strong>!안녕</strong><span>청취자 닉네임으로 인사 · 모두 사용 가능</span></div></li>
          <li><div><strong>!가위바위보 가위·바위·보</strong><span>진행 중인 가위바위보에 한 번 참여</span></div></li>
          <li><div><strong>!참여</strong><span>진행 중인 추첨에 계정당 한 번 참여 · 모두 사용 가능</span></div></li>
          <li><div><strong>!정답 정답내용</strong><span>진행 중인 퀴즈에 답안 제출 · 다른 답안으로 다시 제출 가능</span></div></li>
          <li><div><strong>!신청곡 곡명-가수</strong><span>곡명과 가수로 신청 · 모두 사용 가능</span></div></li>
          <li><div><strong>!신청곡 목록</strong><span>접수된 신청곡 번호·곡명·가수 조회 · 모두 사용 가능</span></div></li>
          <li><div><strong>!내 킵</strong><span>내 룰렛 당첨 항목과 수량 조회</span></div></li>
        </ul>
        {botCounters.length > 0 && (
          <>
            <h5 className="command-group-title">카운터 명령어 · 조회는 누구나</h5>
            <ul>
              {botCounters.map((counter) => (
                <li key={`counter-${counter.id}`}>
                  <div>
                    <strong>!{counter.name}</strong>
                    <span>현재 {counter.name} 개수({counter.value.toLocaleString("ko-KR")}개) 보기 · 누구나</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <h5 className="command-group-title is-dj-only">DJ 전용</h5>
        <ul>
          {botCounters.map((counter) => (
            <li key={`counter-dj-${counter.id}`}>
              <div><strong>!{counter.name} +N/-N</strong><span>개수 증가·감소 · DJ만 사용 가능</span></div>
            </li>
          ))}
          <li><div><strong>!신청곡 삭제 번호</strong><span>접수된 신청곡 삭제 · DJ만 사용 가능</span></div></li>
          <li><div><strong>!킵 삭제 닉네임 / 항목명 / 수량</strong><span>사용자 킵을 지정 수량만큼 삭제 · 수량 생략 시 1개</span></div></li>
        </ul>
        <h5 className="command-group-title">사용자 정의 명령어 · 누구나 사용</h5>
        {botCommands.some((item) => !["!명령어", "!안녕"].includes(item.command)) && (
          <ul>
            {botCommands.filter((item) => !["!명령어", "!안녕"].includes(item.command)).map((item) => (
              <li className="command-custom-item" key={item.command}>
                <form className="command-update-form" action="/bot/settings" method="post">
                  <input type="hidden" name="mode" value="update_command" />
                  <input type="hidden" name="originalCommand" value={item.command} />
                  <input name="command" defaultValue={item.command} maxLength={20} aria-label={`${item.command} 명령어 이름`} required />
                  <input name="response" defaultValue={item.response} maxLength={200} aria-label={`${item.command} 응답`} required />
                  <button type="submit">수정</button>
                </form>
                <form className="command-delete-form" action="/bot/settings" method="post">
                  <input type="hidden" name="mode" value="delete_command" />
                  <input type="hidden" name="command" value={item.command} />
                  <ConfirmButton type="submit" aria-label={`${item.command} 삭제`} message={`${item.command} 명령어를 삭제할까요?`}>삭제</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form className="command-form" action="/bot/settings" method="post">
          <input type="hidden" name="mode" value="upsert_command" />
          <label htmlFor="command-name">명령어<input id="command-name" name="command" placeholder="!규칙" maxLength={20} required /></label>
          <label htmlFor="command-response">응답 메시지<input id="command-response" name="response" placeholder="추가할 응답 메시지" maxLength={200} required /></label>
          <button type="submit">추가</button>
        </form>
      </div>}

      {automationTab === "requests" && <div className="song-request-editor">
        <div className="counter-guide">
          <h4>신청곡 관리</h4>
          <p>청취자는 <code>!신청곡 곡명-가수</code>로 신청하고 <code>!신청곡 목록</code>으로 전체 목록을 확인할 수 있습니다. DJ는 채팅의 <code>!신청곡 삭제 번호</code> 또는 여기서 삭제할 수 있습니다.</p>
        </div>
        {songRequests.length > 0 ? <ol className="song-request-list">
          {songRequests.map((request) => <li key={request.id}>
            <span className="song-request-number">#{request.number}</span>
            <div><strong>{request.artist ? `${request.title} - ${request.artist}` : request.title}</strong><span>{request.requesterNickname} · {formatDateTime(request.createdAt)}</span></div>
            <form action="/bot/settings" method="post">
              <input type="hidden" name="mode" value="delete_song_request" />
              <input type="hidden" name="id" value={request.id} />
              <ConfirmButton type="submit" aria-label={`${request.title}${request.artist ? ` - ${request.artist}` : ""} 신청곡 삭제`} message={`${request.title} 신청곡을 삭제할까요?`}>삭제</ConfirmButton>
            </form>
          </li>)}
        </ol> : <p className="song-request-empty">접수된 신청곡이 없습니다.</p>}
        {songRequests.length > 0 && <form className="song-request-clear" action="/bot/settings" method="post">
          <input type="hidden" name="mode" value="clear_song_requests" />
          <ConfirmButton type="submit" message={`신청곡 ${songRequests.length}개를 모두 지울까요?`}>전체 비우기</ConfirmButton>
        </form>}
      </div>}
    </section>
  );
}
