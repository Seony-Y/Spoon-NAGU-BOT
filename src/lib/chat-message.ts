export type ChatValidationError = "invalid_message" | "message_too_long";

export function validateChatMessage(message: string): ChatValidationError | null {
  if (!message.trim()) return "invalid_message";
  if (message.length > 200) return "message_too_long";
  return null;
}

// Cuts to Spoon's 200 UTF-16 code unit limit without splitting a surrogate pair.
export function truncateChatMessage(message: string, maxLength = 200) {
  if (message.length <= maxLength) return message;
  const lastCode = message.charCodeAt(maxLength - 1);
  const end = lastCode >= 0xd800 && lastCode <= 0xdbff ? maxLength - 1 : maxLength;
  return message.slice(0, end);
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

// Like formatMultilineMessages, but at most maxMessages messages: lines that do
// not fit are dropped and summarized by a last line from moreLine(count).
export function formatLimitedMultilineMessages(
  heading: string,
  continuationHeading: string,
  lines: string[],
  maxMessages: number,
  moreLine: (remaining: number) => string,
) {
  for (let shown = lines.length; shown > 0; shown -= 1) {
    const kept = shown === lines.length ? lines : [...lines.slice(0, shown), moreLine(lines.length - shown)];
    const messages = formatMultilineMessages(heading, continuationHeading, kept);
    if (messages.length <= maxMessages) return messages;
  }
  return formatMultilineMessages(heading, continuationHeading, [moreLine(lines.length)]);
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
  // Unknown `!` messages get no reply: listeners often type `!!!` or `!ㅋㅋ` as
  // plain reactions, and `!명령어` already lists what is available.
  return configuredReply ?? getCommandReply(message, nickname);
}