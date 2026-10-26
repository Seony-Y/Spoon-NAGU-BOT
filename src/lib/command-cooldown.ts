// Listener commands that make the bot reply are throttled per listener and
// command word: replies go out with the DJ's token, so a listener repeating
// `!명령어` could otherwise use up the DJ's daily chat limit. Game entries are
// exempt (a quiz guess right after a wrong one must still count), and so is the
// DJ.

export const COMMAND_COOLDOWN_MS = 2_000;

const EXEMPT_COMMANDS = new Set(["!정답", "!참여", "!가위바위보", "!팀"]);
const MAX_ENTRIES = 5_000;

// The command word of a `!` message ("!신청곡 목록" → "!신청곡"), or null.
export function getCooldownCommand(message: string) {
  const word = message.trim().split(/\s+/u)[0]?.toLocaleLowerCase("ko-KR") ?? "";
  if (!word.startsWith("!") || word.length < 2 || EXEMPT_COMMANDS.has(word)) return null;
  return word;
}

export function createCommandCooldown(cooldownMs = COMMAND_COOLDOWN_MS) {
  const lastUsedAt = new Map<string, number>();

  return {
    // True when this command may run now (and starts its cooldown).
    allow(scope: string, userId: string, message: string, now = Date.now()) {
      const command = getCooldownCommand(message);
      if (!command) return true;
      const key = `${scope}\n${userId}\n${command}`;
      const last = lastUsedAt.get(key);
      if (last !== undefined && now - last < cooldownMs) return false;
      if (lastUsedAt.size >= MAX_ENTRIES) {
        for (const [entry, at] of lastUsedAt) {
          if (now - at >= cooldownMs) lastUsedAt.delete(entry);
        }
        if (lastUsedAt.size >= MAX_ENTRIES) lastUsedAt.clear();
      }
      lastUsedAt.set(key, now);
      return true;
    },
  };
}
