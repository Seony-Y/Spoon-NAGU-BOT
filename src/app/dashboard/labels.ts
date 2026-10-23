import { type BotConnectionState } from "@/lib/bot-runtime";

export const errorMessages: Record<string, string> = {
  access_denied: "연동 요청이 취소되었습니다.",
  invalid_scope: "로그인 중 문제가 생겼습니다. 다시 로그인해 주세요.",
  all_scopes_required: "NAGU BOT에 필요한 권한을 모두 허용해야 로그인할 수 있습니다. 권한 다시 허용하기를 눌러 모든 권한을 선택해 주세요.",
  access_code_required: "입장코드를 확인한 뒤 Spoon DJ 계정으로 로그인해 주세요.",
  missing_code: "로그인 중 문제가 생겼습니다. 다시 로그인해 주세요.",
  state_mismatch: "다른 로그인 시도와 엇갈렸습니다. 탭 하나에서 처음부터 다시 로그인해 주세요.",
  state_missing: "이 주소에서 시작한 로그인을 찾지 못했습니다. 로그인을 다른 주소(예: 로컬)에서 시작했거나 10분이 지났습니다. 이 주소에서 처음부터 다시 로그인해 주세요.",
  token_exchange_failed: "로그인을 완료하지 못했습니다. 다시 로그인해 주시고, 계속되면 운영자에게 문의해 주세요.",
  disconnect_failed: "연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  authentication_required: "인증이 만료되었습니다. Spoon 계정을 다시 연결해 주세요.",
  events_scope_required: "‘실시간 채팅·입장·하트·후원’ 권한을 먼저 허용해 주세요.",
  bot_start_failed: "봇을 입장시키지 못했습니다. 다시 시도해 주세요.",
  account_blocked: "관리자가 이 DJ 연결을 차단했습니다.",
  server_configuration: "서비스 준비 중입니다. 운영자에게 문의해 주세요.",
};

// Badge order and wording follow the dashboard (required scopes first, then
// the optional ones); the event labels are also used in the recent-activity list.
export const scopeLabels: Record<string, string> = {
  "live.read": "방송 정보",
  "events.chat": "실시간 채팅",
  "events.presence": "청취자 입장",
  "events.like": "하트",
  "events.donation": "후원",
  "chat.send": "봇 채팅",
  "listeners.read": "청취자 목록",
  "fans.read": "팬 랭킹",
  "me.read": "DJ 식별",
  "events.follow": "팔로우",
  "dj.follow": "DJ 팔로우",
  "donations.read": "후원 기록",
};

export const scopeOrder = Object.keys(scopeLabels);

export const PREVIEW_FUTURE_TIMESTAMP = 4_102_444_800_000;

export const PREVIEW_EVENT_TIMESTAMP = 1_735_689_600_000;

export const botStateLabels: Record<BotConnectionState, string> = {
  stopped: "꺼짐",
  starting: "시작 중",
  waiting: "방송 대기",
  connecting: "연결 중",
  connected: "입장 중",
  reconnecting: "재연결 중",
  authentication_required: "재연결 필요",
  permission_required: "권한 필요",
  duplicate_connection: "다른 곳에서 연결됨",
  blocked: "입장 차단",
  error: "연결 오류",
};

export const chatNotices: Record<string, { tone: "success" | "error"; title: string; detail: string }> = {
  sent: { tone: "success", title: "채팅 전송 완료", detail: "Spoon 방송 채팅에 메시지를 보냈습니다." },
  invalid_message: { tone: "error", title: "메시지를 입력해 주세요", detail: "공백만 있는 메시지는 보낼 수 없습니다." },
  message_too_long: { tone: "error", title: "메시지가 너무 깁니다", detail: "채팅은 200자까지 보낼 수 있습니다. (이모지는 2자로 계산)" },
  authentication_required: { tone: "error", title: "계정 재연결 필요", detail: "Spoon 인증이 만료되었습니다." },
  missing_scope: { tone: "error", title: "채팅 권한 필요", detail: "다시 로그인해 '봇 채팅' 권한을 허용해 주세요." },
  chat_blocked: { tone: "error", title: "채팅 전송 제한", detail: "채팅이 잠겨 있거나 봇이 채팅 금지 상태입니다. Spoon 방송 설정을 확인해 주세요." },
  bot_blocked: { tone: "error", title: "방송 입장 차단", detail: "Spoon 방송 설정의 차단 목록에서 NAGU BOT을 해제해 주세요." },
  offline: { tone: "error", title: "방송 전입니다", detail: "방송을 시작한 뒤 다시 보내 주세요." },
  rate_limited: { tone: "error", title: "채팅이 혼잡합니다", detail: "잠시 기다린 뒤 다시 보내 주세요." },
  daily_limited: { tone: "error", title: "오늘 채팅 한도 초과", detail: "Spoon이 정한 하루 사용량을 모두 썼습니다. 자정이 지나면 다시 보낼 수 있습니다." },
  unavailable: { tone: "error", title: "채팅 전송 실패", detail: "일시적인 오류입니다. 잠시 후 다시 시도해 주세요." },
};

export const settingsNotices: Record<string, { tone: "success" | "error"; text: string }> = {
  greeting_sent: { tone: "success", text: "인사말을 저장하고 현재 방송 채팅에 바로 보냈습니다." },
  feature_saved: { tone: "success", text: "자동화 설정을 저장했습니다. 다음 이벤트부터 적용됩니다." },
  nickname_saved: { tone: "success", text: "DJ 표시 이름을 저장했습니다." },
  command_saved: { tone: "success", text: "명령어를 추가했습니다." },
  command_updated: { tone: "success", text: "명령어를 수정했습니다." },
  command_deleted: { tone: "success", text: "명령어를 삭제했습니다." },
  invalid_greeting: { tone: "error", text: "인사말은 1자 이상 200자 이하로 입력해 주세요." },
  invalid_nickname: { tone: "error", text: "DJ 표시 이름은 50자 이하로 입력해 주세요." },
  invalid_command: { tone: "error", text: "명령어는 !로 시작해 20자 이하, 응답은 200자 이하로 입력해 주세요." },
  reserved_command: { tone: "error", text: "기본 명령어는 추가하거나 수정할 수 없습니다." },
  command_conflict: { tone: "error", text: "같은 이름의 명령어가 있거나 수정할 명령어를 찾지 못했습니다." },
  invalid_message: { tone: "error", text: "메시지는 1자 이상 200자 이하로 입력해 주세요." },
  invalid_interval: { tone: "error", text: "반복 간격은 1분 이상 1440분 이하로 입력해 주세요." },
  counter_saved: { tone: "success", text: "카운터를 저장했습니다." },
  counter_deleted: { tone: "success", text: "카운터를 삭제했습니다." },
  counter_missing: { tone: "error", text: "이미 삭제된 카운터입니다." },
  invalid_request: { tone: "error", text: "요청을 처리하지 못했습니다. 이미 삭제되었거나 바뀐 항목일 수 있으니 화면을 확인해 주세요." },
  counter_conflict: { tone: "error", text: "같은 이름의 카운터가 이미 있습니다." },
  counter_name_taken: { tone: "error", text: "기본 명령어나 등록된 채팅 명령어와 같은 이름은 쓸 수 없습니다." },
  command_counter_conflict: { tone: "error", text: "같은 이름의 카운터가 있어 명령어로 등록할 수 없습니다." },
  invalid_counter: { tone: "error", text: "이름은 공백 없이 20자 이하, 개수는 0~1,000,000으로 입력해 주세요." },
  song_request_deleted: { tone: "success", text: "신청곡을 삭제했습니다." },
  song_requests_cleared: { tone: "success", text: "신청곡 목록을 모두 비웠습니다." },
  backup_restored: { tone: "success", text: "로컬 백업을 복원했습니다." },
  data_reset: { tone: "success", text: "모든 데이터를 초기화했습니다. 설정은 기본값으로 돌아갔습니다." },
  data_reset_unconfirmed: { tone: "error", text: "확인 단어가 맞지 않아 초기화하지 않았습니다. \"초기화\"를 정확히 입력해 주세요." },
  data_reset_failed: { tone: "error", text: "초기화하지 못했습니다. 데이터는 그대로입니다. 잠시 후 다시 시도해 주세요." },
  backup_invalid: { tone: "error", text: "백업 파일이 올바르지 않습니다. NAGU BOT에서 내려받은 백업 파일인지 확인해 주세요." },
  backup_too_large: { tone: "error", text: "백업 파일은 10MB 이하만 복원할 수 있습니다." },
};

export const FOLLOW_NOTICES: Record<string, { tone: "success" | "error"; text: string }> = {
  followed: { tone: "success", text: "봇이 DJ를 팔로우했습니다. 방송이 끝나면 Spoon에서 봇을 고정 매니저로 지정해 주세요." },
  offline: { tone: "error", text: "방송 중에만 팔로우할 수 있습니다. 방송을 시작한 뒤 다시 눌러 주세요." },
  follow_rejected: { tone: "error", text: "봇 계정이 이 DJ를 팔로우할 수 없습니다. Spoon에서 봇을 차단하지 않았는지 확인해 주세요." },
  missing_scope: { tone: "error", text: "‘DJ 팔로우’ 권한이 없습니다. 다시 로그인해 권한을 허용해 주세요." },
  authentication_required: { tone: "error", text: "로그인이 만료되었습니다. 다시 로그인해 주세요." },
  unavailable: { tone: "error", text: "Spoon이 잠시 응답하지 않습니다. 잠시 후 다시 시도해 주세요." },
};

export const automationTabs = [
  ["welcome", "입장 환영"],
  ["donation", "후원 감사"],
  ["heart", "하트 감사"],
  ["follow", "팔로우 감사"],
  ["repeat", "반복 공지"],
  ["counters", "카운터"],
  ["commands", "채팅 명령어"],
  ["requests", "신청곡"],
] as const;
