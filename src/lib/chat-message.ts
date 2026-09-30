export type ChatValidationError = "invalid_message" | "message_too_long";

export function validateChatMessage(message: string): ChatValidationError | null {
  if (!message.trim()) return "invalid_message";
  if (message.length > 200) return "message_too_long";
  return null;
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