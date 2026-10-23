import "server-only";

import { formatMultilineMessages } from "../chat-message";
import {
  getRpsResult,
  parseRpsCommand,
  type RpsChoice,
  type RpsResult,
} from "../rock-paper-scissors";
import { selectRaffleWinners } from "../raffle";
import { getDatabase, getSessionKey, getWorkspaceKey } from "./db";

export type RpsEntry = {
  userId: string;
  nickname: string;
  choice: RpsChoice;
  result: RpsResult;
};

export type RpsRound = {
  roundId: number;
  active: boolean;
  djChoice: RpsChoice;
  startedAt: number;
  endedAt: number | null;
  entries: RpsEntry[];
};

export type RaffleEntry = {
  userId: string;
  nickname: string;
  winner: boolean;
};

export type RaffleRound = {
  roundId: number;
  active: boolean;
  winnerCount: number;
  startedAt: number;
  endedAt: number | null;
  entries: RaffleEntry[];
};

export type QuizSubmission = {
  userId: string;
  nickname: string;
  answer: string;
  submittedAt: number;
  correct: boolean;
  correctAt: number | null;
};

export type QuizRound = {
  roundId: number;
  active: boolean;
  question: string;
  answer: string;
  startedAt: number;
  endedAt: number | null;
  winnerUserId: string | null;
  winnerNickname: string | null;
  elapsedMs: number | null;
  submissions: QuizSubmission[];
};

export type QuizQueueItem = {
  id: number;
  question: string;
  answer: string;
};

export function getRpsRoundByKey(sessionKey: string): RpsRound | null {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const row = getDatabase().prepare(`
    SELECT round_id, dj_choice, active, started_at, ended_at
    FROM rps_rounds WHERE workspace_key = ?
    ORDER BY active DESC, round_id DESC LIMIT 1
  `).get(workspaceKey) as {
    round_id: number;
    dj_choice: RpsChoice;
    active: number;
    started_at: number;
    ended_at: number | null;
  } | undefined;
  if (!row) return null;
  const entries = getDatabase().prepare(`
    SELECT user_id, nickname, choice, result
    FROM rps_entries
    WHERE workspace_key = ? AND round_id = ?
    ORDER BY created_at, user_id
  `).all(workspaceKey, row.round_id).map((entry) => {
    const value = entry as {
      user_id: string;
      nickname: string;
      choice: RpsChoice;
      result: RpsResult;
    };
    return {
      userId: value.user_id,
      nickname: value.nickname,
      choice: value.choice,
      result: value.result,
    };
  });
  return {
    roundId: row.round_id,
    active: row.active === 1,
    djChoice: row.dj_choice,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    entries,
  };
}

export function getRpsRound(sessionId: string) {
  return getRpsRoundByKey(getSessionKey(sessionId));
}

export function listRpsRounds(sessionId: string, limit = 10) {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const rows = getDatabase().prepare(`
    SELECT round_id, dj_choice, active, started_at, ended_at
    FROM rps_rounds WHERE workspace_key = ?
    ORDER BY round_id DESC LIMIT ?
  `).all(workspaceKey, Math.max(1, Math.min(limit, 50))) as Array<{
    round_id: number;
    dj_choice: RpsChoice;
    active: number;
    started_at: number;
    ended_at: number | null;
  }>;
  const entriesStatement = getDatabase().prepare(`
    SELECT user_id, nickname, choice, result
    FROM rps_entries WHERE workspace_key = ? AND round_id = ?
    ORDER BY created_at, user_id
  `);
  return rows.map((row) => ({
    roundId: row.round_id,
    active: row.active === 1,
    djChoice: row.dj_choice,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    entries: entriesStatement.all(workspaceKey, row.round_id).map((entry) => {
      const value = entry as {
        user_id: string;
        nickname: string;
        choice: RpsChoice;
        result: RpsResult;
      };
      return {
        userId: value.user_id,
        nickname: value.nickname,
        choice: value.choice,
        result: value.result,
      };
    }),
  } satisfies RpsRound));
}

export function startRpsRound(sessionId: string, djChoice: RpsChoice) {
  return startRpsRoundByKey(getSessionKey(sessionId), djChoice);
}

export function startRpsRoundByKey(sessionKey: string, djChoice: RpsChoice) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  const current = getRpsRoundByKey(sessionKey);
  if (current?.active) return false;
  const roundId = (current?.roundId ?? 0) + 1;
  database.prepare(`
    INSERT INTO rps_rounds (workspace_key, round_id, dj_choice, active, started_at, ended_at)
    VALUES (?, ?, ?, 1, ?, NULL)
  `).run(workspaceKey, roundId, djChoice, Date.now());
  return true;
}

export function finishRpsRound(sessionId: string) {
  return finishRpsRoundByKey(getSessionKey(sessionId));
}

export function finishRpsRoundByKey(sessionKey: string) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const result = getDatabase().prepare(`
    UPDATE rps_rounds SET active = 0, ended_at = ?
    WHERE workspace_key = ? AND active = 1
  `).run(Date.now(), workspaceKey);
  return result.changes > 0 ? getRpsRoundByKey(sessionKey) : null;
}

// With onAccepted, a successful entry is reported through the callback (so the
// bot can acknowledge many listeners in one message) and no reply is returned.
export function applyRpsCommand(
  sessionKey: string,
  message: string,
  isDj: boolean,
  userId: string,
  nickname: string | null,
  onAccepted?: (nickname: string) => void,
) {
  const choice = parseRpsCommand(message);
  if (!choice) return null;
  if (choice === "usage") return "사용법: !가위바위보 가위 (가위·바위·보 중 하나)";
  if (isDj) return "DJ는 '!가위바위보 시작'과 '!가위바위보 종료'로 진행해 주세요.";

  const round = getRpsRoundByKey(sessionKey);
  if (!round?.active) return "지금 진행 중인 가위바위보가 없어요.";
  const workspaceKey = getWorkspaceKey(sessionKey);
  const result = getRpsResult(choice, round.djChoice);
  const inserted = getDatabase().prepare(`
    INSERT OR IGNORE INTO rps_entries (
      workspace_key, round_id, user_id, nickname, choice, result, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    workspaceKey,
    round.roundId,
    userId,
    nickname?.trim().slice(0, 50) || "청취자",
    choice,
    result,
    Date.now(),
  );
  if (inserted.changes > 0 && onAccepted) {
    onAccepted(nickname?.trim() || "청취자");
    return null;
  }
  return inserted.changes > 0
    ? `${nickname?.trim() || "청취자"}님 참여 완료! 결과는 끝나고 알려 드려요.`
    : `${nickname?.trim() || "청취자"}님은 이미 참여했어요.`;
}

export function getRaffleRoundByKey(sessionKey: string): RaffleRound | null {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const row = getDatabase().prepare(`
    SELECT round_id, winner_count, active, started_at, ended_at
    FROM raffle_rounds WHERE workspace_key = ?
    ORDER BY active DESC, round_id DESC LIMIT 1
  `).get(workspaceKey) as {
    round_id: number;
    winner_count: number;
    active: number;
    started_at: number;
    ended_at: number | null;
  } | undefined;
  if (!row) return null;
  const entries = getDatabase().prepare(`
    SELECT user_id, nickname, winner
    FROM raffle_entries WHERE workspace_key = ? AND round_id = ?
    ORDER BY created_at, user_id
  `).all(workspaceKey, row.round_id).map((entry) => {
    const value = entry as { user_id: string; nickname: string; winner: number };
    return { userId: value.user_id, nickname: value.nickname, winner: value.winner === 1 };
  });
  return {
    roundId: row.round_id,
    active: row.active === 1,
    winnerCount: row.winner_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    entries,
  };
}

export function listRaffleRounds(sessionId: string, limit = 10) {
  const sessionKey = getSessionKey(sessionId);
  const workspaceKey = getWorkspaceKey(sessionKey);
  const rows = getDatabase().prepare(`
    SELECT round_id, winner_count, active, started_at, ended_at
    FROM raffle_rounds WHERE workspace_key = ?
    ORDER BY round_id DESC LIMIT ?
  `).all(workspaceKey, Math.max(1, Math.min(limit, 50))) as Array<{
    round_id: number;
    winner_count: number;
    active: number;
    started_at: number;
    ended_at: number | null;
  }>;
  const entriesStatement = getDatabase().prepare(`
    SELECT user_id, nickname, winner FROM raffle_entries
    WHERE workspace_key = ? AND round_id = ? ORDER BY created_at, user_id
  `);
  return rows.map((row) => ({
    roundId: row.round_id,
    active: row.active === 1,
    winnerCount: row.winner_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    entries: entriesStatement.all(workspaceKey, row.round_id).map((entry) => {
      const value = entry as { user_id: string; nickname: string; winner: number };
      return { userId: value.user_id, nickname: value.nickname, winner: value.winner === 1 };
    }),
  } satisfies RaffleRound));
}

export function startRaffleRound(sessionId: string, winnerCount: number) {
  return startRaffleRoundByKey(getSessionKey(sessionId), winnerCount);
}

export function startRaffleRoundByKey(sessionKey: string, winnerCount: number) {
  if (!Number.isSafeInteger(winnerCount) || winnerCount < 1) return false;
  const workspaceKey = getWorkspaceKey(sessionKey);
  const current = getRaffleRoundByKey(sessionKey);
  if (current?.active) return false;
  getDatabase().prepare(`
    INSERT INTO raffle_rounds (
      workspace_key, round_id, winner_count, active, started_at, ended_at
    ) VALUES (?, ?, ?, 1, ?, NULL)
  `).run(workspaceKey, (current?.roundId ?? 0) + 1, winnerCount, Date.now());
  return true;
}

export function applyRaffleCommand(
  sessionKey: string,
  message: string,
  isDj: boolean,
  userId: string,
  nickname: string | null,
  onAccepted?: (nickname: string) => void,
) {
  if (message.trim() !== "!참여") return null;
  if (isDj) return "DJ는 추첨에 응모할 수 없어요.";
  const round = getRaffleRoundByKey(sessionKey);
  if (!round?.active) return "지금 진행 중인 추첨이 없어요.";
  const displayName = nickname?.trim().slice(0, 50) || "청취자";
  const inserted = getDatabase().prepare(`
    INSERT OR IGNORE INTO raffle_entries (
      workspace_key, round_id, user_id, nickname, winner, created_at
    ) VALUES (?, ?, ?, ?, 0, ?)
  `).run(getWorkspaceKey(sessionKey), round.roundId, userId, displayName, Date.now());
  if (inserted.changes > 0 && onAccepted) {
    onAccepted(displayName);
    return null;
  }
  return inserted.changes > 0
    ? `${displayName}님 응모 완료!`
    : `${displayName}님은 이미 응모했어요.`;
}

export function finishRaffleRound(
  sessionId: string,
  pickIndex?: (maximum: number) => number,
) {
  return finishRaffleRoundByKey(getSessionKey(sessionId), pickIndex);
}

export function finishRaffleRoundByKey(
  sessionKey: string,
  pickIndex?: (maximum: number) => number,
) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const current = getRaffleRoundByKey(sessionKey);
  if (!current?.active) return null;
  const winners = selectRaffleWinners(current.entries, current.winnerCount, pickIndex);
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    const markWinner = database.prepare(`
      UPDATE raffle_entries SET winner = 1
      WHERE workspace_key = ? AND round_id = ? AND user_id = ?
    `);
    for (const winner of winners) markWinner.run(workspaceKey, current.roundId, winner.userId);
    database.prepare(`
      UPDATE raffle_rounds SET active = 0, ended_at = ?
      WHERE workspace_key = ? AND round_id = ? AND active = 1
    `).run(Date.now(), workspaceKey, current.roundId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return getRaffleRoundByKey(sessionKey);
}

function normalizeQuizAnswer(answer: string) {
  return answer.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");
}

function mapQuizRound(sessionKey: string, row: {
  round_id: number;
  question: string;
  answer: string;
  active: number;
  started_at: number;
  ended_at: number | null;
  winner_user_id: string | null;
  winner_nickname: string | null;
  elapsed_ms: number | null;
}): QuizRound {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const submissions = getDatabase().prepare(`
    SELECT user_id, nickname, answer, submitted_at, correct, correct_at
    FROM quiz_submissions
    WHERE workspace_key = ? AND round_id = ?
    ORDER BY submitted_at, user_id
  `).all(workspaceKey, row.round_id).map((submission) => {
    const value = submission as {
      user_id: string;
      nickname: string;
      answer: string;
      submitted_at: number;
      correct: number;
      correct_at: number | null;
    };
    return {
      userId: value.user_id,
      nickname: value.nickname,
      answer: value.answer,
      submittedAt: value.submitted_at,
      correct: value.correct === 1,
      correctAt: value.correct_at,
    };
  });
  return {
    roundId: row.round_id,
    active: row.active === 1,
    question: row.question,
    answer: row.answer,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    winnerUserId: row.winner_user_id,
    winnerNickname: row.winner_nickname,
    elapsedMs: row.elapsed_ms,
    submissions,
  };
}

export function getQuizRoundByKey(sessionKey: string): QuizRound | null {
  const row = getDatabase().prepare(`
    SELECT round_id, question, answer, active, started_at, ended_at,
           winner_user_id, winner_nickname, elapsed_ms
    FROM quiz_rounds WHERE workspace_key = ?
    ORDER BY active DESC, round_id DESC LIMIT 1
  `).get(getWorkspaceKey(sessionKey)) as {
    round_id: number;
    question: string;
    answer: string;
    active: number;
    started_at: number;
    ended_at: number | null;
    winner_user_id: string | null;
    winner_nickname: string | null;
    elapsed_ms: number | null;
  } | undefined;
  return row ? mapQuizRound(sessionKey, row) : null;
}

export function listQuizRounds(sessionId: string, limit = 10) {
  const sessionKey = getSessionKey(sessionId);
  const rows = getDatabase().prepare(`
    SELECT round_id, question, answer, active, started_at, ended_at,
           winner_user_id, winner_nickname, elapsed_ms
    FROM quiz_rounds WHERE workspace_key = ?
    ORDER BY round_id DESC LIMIT ?
  `).all(
    getWorkspaceKey(sessionKey),
    Math.max(1, Math.min(limit, 50)),
  ) as Array<{
    round_id: number;
    question: string;
    answer: string;
    active: number;
    started_at: number;
    ended_at: number | null;
    winner_user_id: string | null;
    winner_nickname: string | null;
    elapsed_ms: number | null;
  }>;
  return rows.map((row) => mapQuizRound(sessionKey, row));
}

export function startQuizRound(
  sessionId: string,
  question: string,
  answer: string,
  startedAt = Date.now(),
) {
  return startQuizRoundByKey(getSessionKey(sessionId), question, answer, startedAt);
}

export function isValidQuiz(question: string, answer: string) {
  const normalizedQuestion = question.trim();
  return Boolean(normalizedQuestion)
    && normalizedQuestion.length <= 180
    && Boolean(normalizeQuizAnswer(answer))
    && answer.trim().length <= 100;
}

export function startQuizRoundByKey(
  sessionKey: string,
  question: string,
  answer: string,
  startedAt = Date.now(),
) {
  if (!isValidQuiz(question, answer)) return false;
  const normalizedQuestion = question.trim();
  const normalizedAnswer = normalizeQuizAnswer(answer);
  const workspaceKey = getWorkspaceKey(sessionKey);
  const current = getQuizRoundByKey(sessionKey);
  if (current?.active) return false;
  getDatabase().prepare(`
    INSERT INTO quiz_rounds (
      workspace_key, round_id, question, answer, answer_normalized,
      active, started_at, ended_at, winner_user_id, winner_nickname, elapsed_ms
    ) VALUES (?, ?, ?, ?, ?, 1, ?, NULL, NULL, NULL, NULL)
  `).run(
    workspaceKey,
    (current?.roundId ?? 0) + 1,
    normalizedQuestion,
    answer.trim(),
    normalizedAnswer,
    startedAt,
  );
  return true;
}

export function finishQuizRound(sessionId: string, endedAt = Date.now()) {
  return finishQuizRoundByKey(getSessionKey(sessionId), endedAt);
}

export function finishQuizRoundByKey(sessionKey: string, endedAt = Date.now()) {
  const result = getDatabase().prepare(`
    UPDATE quiz_rounds SET active = 0, ended_at = ?
    WHERE workspace_key = ? AND active = 1
  `).run(endedAt, getWorkspaceKey(sessionKey));
  return result.changes > 0 ? getQuizRoundByKey(sessionKey) : null;
}

export const MAX_QUIZ_QUEUE_ITEMS = 50;

export function listQuizQueueByKey(sessionKey: string): QuizQueueItem[] {
  return getDatabase().prepare(`
    SELECT id, question, answer FROM quiz_queue
    WHERE workspace_key = ? ORDER BY created_at, id
  `).all(getWorkspaceKey(sessionKey)) as QuizQueueItem[];
}

export function listQuizQueue(sessionId: string) {
  return listQuizQueueByKey(getSessionKey(sessionId));
}

export function addQuizQueueItem(sessionId: string, question: string, answer: string) {
  if (!isValidQuiz(question, answer)) return "invalid" as const;
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const database = getDatabase();
  const { count } = database.prepare("SELECT COUNT(*) AS count FROM quiz_queue WHERE workspace_key = ?")
    .get(workspaceKey) as { count: number };
  if (count >= MAX_QUIZ_QUEUE_ITEMS) return "full" as const;
  database.prepare(`
    INSERT INTO quiz_queue (workspace_key, question, answer, created_at) VALUES (?, ?, ?, ?)
  `).run(workspaceKey, question.trim(), answer.trim(), Date.now());
  return "added" as const;
}

export function deleteQuizQueueItem(sessionId: string, id: number) {
  return getDatabase().prepare("DELETE FROM quiz_queue WHERE workspace_key = ? AND id = ?")
    .run(getWorkspaceKey(getSessionKey(sessionId)), id).changes > 0;
}

export function startNextQueuedQuizByKey(sessionKey: string, startedAt = Date.now()) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    const next = database.prepare(`
      SELECT id, question, answer FROM quiz_queue
      WHERE workspace_key = ? ORDER BY created_at, id LIMIT 1
    `).get(workspaceKey) as QuizQueueItem | undefined;
    if (!next) {
      database.exec("ROLLBACK");
      return { kind: "empty" } as const;
    }
    if (!startQuizRoundByKey(sessionKey, next.question, next.answer, startedAt)) {
      database.exec("ROLLBACK");
      return { kind: "already_active" } as const;
    }
    database.prepare("DELETE FROM quiz_queue WHERE id = ?").run(next.id);
    database.exec("COMMIT");
    return { kind: "started", question: next.question } as const;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function formatQuizElapsedTime(elapsedMs: number) {
  if (elapsedMs < 1000) return `${Math.max(0, elapsedMs)}ms`;
  const seconds = elapsedMs / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}초`;
}

export function formatQuizResultMessages(round: QuizRound) {
  const correctSubmissions = round.submissions
    .filter((submission) => submission.correct)
    .sort((left, right) => (left.correctAt ?? 0) - (right.correctAt ?? 0));
  const heading = `[퀴즈] 종료! 정답: ${round.answer}`;
  if (correctSubmissions.length === 0) return [`${heading}\n아쉽게도 정답자가 없어요.`];
  // Everyone tied for the earliest correct time is a first solver; the rest
  // are listed once each after them.
  const firstCorrectAt = correctSubmissions[0].correctAt ?? round.startedAt;
  const label = (submission: QuizSubmission) => {
    const elapsed = Math.max(0, (submission.correctAt ?? round.startedAt) - round.startedAt);
    return `${submission.nickname.slice(0, 50)} (${formatQuizElapsedTime(elapsed)})`;
  };
  const first = correctSubmissions.filter((submission) => submission.correctAt === firstCorrectAt);
  const others = correctSubmissions.filter((submission) => submission.correctAt !== firstCorrectAt);
  return formatMultilineMessages(heading, "[퀴즈] 결과 (이어서)", [
    ...first.map((submission) => `첫 정답: ${label(submission)}`),
    ...others.map((submission) => `정답: ${label(submission)}`),
  ]);
}

export function applyQuizCommand(
  sessionKey: string,
  message: string,
  isDj: boolean,
  userId: string,
  nickname: string | null,
  submittedAt = Date.now(),
  onAccepted?: (nickname: string) => void,
) {
  const matched = /^!정답(?:\s+(.+))?$/u.exec(message.trim());
  if (!matched) return null;
  const submittedAnswer = matched[1]?.trim() ?? "";
  if (!submittedAnswer) return "사용법: !정답 (답)";
  if (submittedAnswer.length > 100) return "답은 100자까지 적을 수 있어요.";
  if (isDj) return "DJ는 답을 낼 수 없어요.";

  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    const round = database.prepare(`
      SELECT round_id, answer_normalized, started_at
      FROM quiz_rounds WHERE workspace_key = ? AND active = 1
    `).get(workspaceKey) as {
      round_id: number;
      answer_normalized: string;
      started_at: number;
    } | undefined;
    if (!round) {
      database.exec("ROLLBACK");
      return "지금 진행 중인 퀴즈가 없어요.";
    }

    const answerNormalized = normalizeQuizAnswer(submittedAnswer);
    const previous = database.prepare(`
      SELECT answer_normalized, submitted_at FROM quiz_submissions
      WHERE workspace_key = ? AND round_id = ? AND user_id = ?
    `).get(workspaceKey, round.round_id, userId) as {
      answer_normalized: string;
      submitted_at: number;
    } | undefined;
    if (previous?.answer_normalized === answerNormalized) {
      database.exec("ROLLBACK");
      return `${nickname?.trim().slice(0, 50) || "청취자"}님, 같은 답을 이미 냈어요.`;
    }

    const displayName = nickname?.trim().slice(0, 50) || "청취자";
    const latest = database.prepare(`
      SELECT MAX(submitted_at) AS submitted_at FROM quiz_submissions
      WHERE workspace_key = ? AND round_id = ?
    `).get(workspaceKey, round.round_id) as { submitted_at: number | null };
    const orderedSubmittedAt = Math.max(submittedAt, (latest.submitted_at ?? submittedAt - 1) + 1);
    database.prepare(`
      INSERT INTO quiz_submissions (
        workspace_key, round_id, user_id, nickname, answer, answer_normalized,
        submitted_at, correct, correct_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)
      ON CONFLICT(workspace_key, round_id, user_id) DO UPDATE SET
        nickname = excluded.nickname,
        answer = excluded.answer,
        answer_normalized = excluded.answer_normalized,
        submitted_at = excluded.submitted_at
    `).run(
      workspaceKey,
      round.round_id,
      userId,
      displayName,
      submittedAnswer,
      answerNormalized,
      orderedSubmittedAt,
    );

    if (answerNormalized === round.answer_normalized) {
      const elapsedMs = Math.max(0, submittedAt - round.started_at);
      database.prepare(`
        UPDATE quiz_rounds
        SET winner_user_id = ?, winner_nickname = ?, elapsed_ms = ?
        WHERE workspace_key = ? AND round_id = ? AND active = 1 AND winner_user_id IS NULL
      `).run(
        userId,
        displayName,
        elapsedMs,
        workspaceKey,
        round.round_id,
      );
      database.prepare(`
        UPDATE quiz_submissions
        SET correct = 1, correct_at = COALESCE(correct_at, ?)
        WHERE workspace_key = ? AND round_id = ? AND user_id = ?
      `).run(submittedAt, workspaceKey, round.round_id, userId);
    }

    database.exec("COMMIT");
    if (onAccepted) {
      onAccepted(displayName);
      return null;
    }
    return `${displayName}님 답 접수!`;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

// ---- History reset (DJ) ---------------------------------------------------------
// Clears finished records of one game shown on the dashboard. Running rounds,
// queues, settings, and roulette keeps (prizes still owed) are never touched.

export type ResettableGame = "rps" | "raffle" | "quiz" | "secret" | "team" | "attendance" | "roulette";
export const RESETTABLE_GAMES: ResettableGame[] = ["rps", "raffle", "quiz", "secret", "team", "attendance", "roulette"];

const FINISHED_ROUND_TABLES: Partial<Record<ResettableGame, { rounds: string; id: string; children: string[] }>> = {
  rps: { rounds: "rps_rounds", id: "round_id", children: ["rps_entries"] },
  raffle: { rounds: "raffle_rounds", id: "round_id", children: ["raffle_entries"] },
  quiz: { rounds: "quiz_rounds", id: "round_id", children: ["quiz_submissions"] },
  secret: { rounds: "secret_word_rounds", id: "round_id", children: [] },
  team: { rounds: "team_battles", id: "battle_id", children: ["team_members"] },
};

export function resetGameHistory(sessionId: string, game: ResettableGame) {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const database = getDatabase();
  let removed = 0;
  database.exec("BEGIN IMMEDIATE");
  try {
    const rounds = FINISHED_ROUND_TABLES[game];
    if (rounds) {
      for (const child of rounds.children) {
        removed += Number(database.prepare(`
          DELETE FROM ${child} WHERE workspace_key = ? AND ${rounds.id} IN (
            SELECT ${rounds.id} FROM ${rounds.rounds} WHERE workspace_key = ? AND active = 0
          )
        `).run(workspaceKey, workspaceKey).changes);
      }
      removed += Number(database.prepare(`DELETE FROM ${rounds.rounds} WHERE workspace_key = ? AND active = 0`)
        .run(workspaceKey).changes);
    } else if (game === "attendance") {
      removed += Number(database.prepare("DELETE FROM attendance WHERE workspace_key = ?").run(workspaceKey).changes);
    } else if (game === "roulette") {
      removed += Number(database.prepare("DELETE FROM roulette_results WHERE workspace_key = ?").run(workspaceKey).changes);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return removed;
}
