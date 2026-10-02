export type ChatValidationError = "invalid_message" | "message_too_long";

export function validateChatMessage(message: string): ChatValidationError | null {
  if (!message.trim()) return "invalid_message";
  if (message.length > 200) return "message_too_long";
  return null;
}

export function formatMultilineMessages(
  heading: string,
  continuationHeading: string,
  lines: string[],
) {
  if (lines.length === 0) return [heading];
  const messages: string[] = [];
  for (const line of lines) {
    const current = messages.at(-1);
    if (current && `${current}\n${line}`.length <= 200) {
      messages[messages.length - 1] = `${current}\n${line}`;
      continue;
    }
    const messageHeading = messages.length === 0 ? heading : continuationHeading;
    messages.push(`${messageHeading}\n${line}`);
  }
  return messages;
}

export function getCommandReply(message: string, nickname: string | null) {
  switch (message.trim().toLocaleLowerCase("ko-KR")) {
    case "!안녕": {
      const greeting = `${nickname?.trim() || "청취자"}님, 반가워요!`;
      return greeting.length <= 200 ? greeting : "반가워요!";
    }
    case "!명령어":
      return "사용 가능한 명령어: !안녕, !명령어";
    default:
      return null;
  }
}

export function resolveCommandFallback(
  message: string,
  nickname: string | null,
  configuredReply: string | null,
) {
  return configuredReply
    ?? getCommandReply(message, nickname)
    ?? (message.trim().startsWith("!")
      ? "등록되지 않은 명령어입니다. !명령어로 사용 가능한 명령어를 확인해 주세요."
      : null);
}