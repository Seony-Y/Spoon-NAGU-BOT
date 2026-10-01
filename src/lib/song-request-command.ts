export type SongRequestCommand =
  | { kind: "add"; title: string; artist: string }
  | { kind: "list" }
  | { kind: "delete"; id: number }
  | { kind: "usage" };

export function parseSongRequestCommand(message: string): SongRequestCommand | null {
  const match = /^!신청곡(?:\s+(.+))?$/u.exec(message.trim());
  if (!match) return null;

  const argument = match[1]?.trim();
  if (!argument) return { kind: "usage" };
  if (argument === "목록") return { kind: "list" };

  const deleteMatch = /^삭제\s+(\d+)$/u.exec(argument);
  if (deleteMatch) {
    const id = Number(deleteMatch[1]);
    return Number.isSafeInteger(id) && id > 0 ? { kind: "delete", id } : { kind: "usage" };
  }

  const separator = argument.indexOf("-");
  if (separator < 1 || argument.length > 100) return { kind: "usage" };
  const title = argument.slice(0, separator).trim();
  const artist = argument.slice(separator + 1).trim();
  return title && artist ? { kind: "add", title, artist } : { kind: "usage" };
}