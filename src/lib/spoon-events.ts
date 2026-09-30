export type EventUser = {
  id: string;
  nickname: string | null;
};

export type ChatEvent = {
  user: EventUser;
  isDj: boolean;
  message: string;
  sentTime: string;
};

export type PresenceEvent = {
  user: EventUser;
  type: "JOIN";
  fanRank: number | null;
  isManager: boolean;
  favoriteTemperature: number | null;
  time: string;
};

export type LikeEvent = {
  user: EventUser;
  type: "FREE" | "PAID";
  totalAmount: number;
  amount: number;
  extraAmount: number;
  combo: number | null;
  time: string;
};

export type DonationEvent = {
  user: EventUser;
  amount: number;
  message: string | null;
  time: string;
};

export type StreamEndEvent = {
  reason: "LIVE_ENDED" | "TOKEN_EXPIRED" | "RECONNECT";
};

export type SpoonEventData = {
  chat: ChatEvent;
  presence: PresenceEvent;
  like: LikeEvent;
  donation: DonationEvent;
  end: StreamEndEvent;
};

export type SpoonEventName = keyof SpoonEventData;

export type ParsedSseEvent = {
  id?: string;
  event: SpoonEventName;
  data: SpoonEventData[SpoonEventName];
};

const eventNames = new Set<SpoonEventName>([
  "chat",
  "presence",
  "like",
  "donation",
  "end",
]);

export function extractSseFrames(buffer: string) {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  return {
    frames: frames.slice(0, -1),
    remainder: frames.at(-1) ?? "",
  };
}

export function parseSseFrame(frame: string): ParsedSseEvent | null {
  const lines = frame.split("\n");
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.slice(6)
    .trim() as SpoonEventName | undefined;
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!event || !eventNames.has(event) || !data) return null;

  try {
    return {
      id: lines.find((line) => line.startsWith("id:"))?.slice(3).trim(),
      event,
      data: JSON.parse(data) as SpoonEventData[SpoonEventName],
    };
  } catch {
    return null;
  }
}