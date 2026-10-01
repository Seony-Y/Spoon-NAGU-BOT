"use client";

import { type FormEvent, useState } from "react";

type OAuthLoginGateProps = {
  label: string;
};

const errorMessages: Record<string, string> = {
  invalid: "입장코드가 올바르지 않습니다.",
  rate_limited: "입력 횟수를 초과했습니다. 10분 뒤 다시 시도해 주세요.",
  configuration: "입장코드가 설정되지 않았습니다. 운영자에게 문의해 주세요.",
};

export function OAuthLoginGate({ label }: OAuthLoginGateProps) {
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim() || pending) return;
    setPending(true);
    setMessage("");

    try {
      const response = await fetch("/oauth/access", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code }),
      });
      const result = await response.json() as { verified?: boolean; error?: string };
      if (!response.ok || !result.verified) {
        setVerified(false);
        setMessage(errorMessages[result.error ?? ""] ?? "입장코드를 확인하지 못했습니다.");
        return;
      }
      setVerified(true);
      setMessage("입장코드가 확인되었습니다.");
    } catch {
      setVerified(false);
      setMessage("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="oauth-login-gate">
      <form action="/oauth/connect" method="get">
        <button className="connect" type="submit" disabled={!verified}>{label}</button>
      </form>
      <form className="access-code-form" onSubmit={verify}>
        <label htmlFor="access-code">입장코드</label>
        <div>
          <input
            id="access-code"
            name="code"
            type="password"
            value={code}
            maxLength={100}
            autoComplete="one-time-code"
            placeholder="입장코드 입력"
            onChange={(event) => {
              setCode(event.target.value);
              setVerified(false);
              setMessage("");
            }}
          />
          <button type="submit" disabled={!code.trim() || pending}>
            {pending ? "확인 중" : "확인"}
          </button>
        </div>
        {message && <p className={verified ? "is-success" : "is-error"} role={verified ? "status" : "alert"}>{message}</p>}
      </form>
    </div>
  );
}