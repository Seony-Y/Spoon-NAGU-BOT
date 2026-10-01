export type SongRequestCommand =
  | { kind: "add"; title: string }
  | { kind: "delete"; id: number }
  | { kind: "usage" };

export function parseSongRequestCommand(message: string): SongRequestCommand | null {
  const match = /^!신청곡(?:\s+(.+))?$/u.exec(message.trim());
  if (!match) return null;

  const argument = match[1]?.trim();
  if (!argument) return { kind: "usage" };

  const deleteMatch = /^삭제\s+(\d+)$/u.exec(argument);
  if (deleteMatch) {
    const id = Number(deleteMatch[1]);
    return Number.isSafeInteger(id) && id > 0 ? { kind: "delete", id } : { kind: "usage" };
  }

  return argument.length <= 100 ? { kind: "add", title: argument } : { kind: "usage" };
}