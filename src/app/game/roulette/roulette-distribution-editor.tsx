"use client";

import { useState } from "react";
import Link from "next/link";

type DistributionItem = {
  id: number;
  label: string;
  percentage: string;
};

function toPercentage(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function RouletteDistributionEditor({
  items,
}: {
  items: DistributionItem[];
}) {
  const [rows, setRows] = useState<DistributionItem[]>([
    ...items,
    { id: 0, label: "", percentage: "" },
  ]);
  const prizeTotal = rows.reduce(
    (total, row) => total + toPercentage(row.percentage),
    0,
  );
  const missPercentage = Math.round((100 - prizeTotal) * 100) / 100;

  const updateRow = (index: number, values: Partial<DistributionItem>) => {
    setRows((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...values } : row
    )));
  };

  return (
    <form className="roulette-distribution-form" action="/game/roulette" method="post">
      <input type="hidden" name="action" value="distribution" />
      <div className="roulette-section-heading">
        <div>
          <h4 id="roulette-items-title">룰렛 설정 수정</h4>
          <p>경품 당첨 확률을 설정합니다. 남은 비율은 꽝 확률로 자동 저장됩니다.</p>
        </div>
        <div className="roulette-editor-heading-actions">
          <Link href="/?tab=game&game=roulette">취소</Link>
          <button type="submit" disabled={missPercentage < 0}>저장</button>
        </div>
      </div>
      <div className="roulette-percentage-list" aria-labelledby="roulette-items-title">
        {rows.map((row, index) => (
          <div className={`roulette-percentage-row${row.id === 0 ? " is-new" : ""}`} key={row.id || "new"}>
            <label>
              당첨 내용
              <input
                name="label"
                value={row.label}
                maxLength={50}
                placeholder={row.id === 0 ? "커피 쿠폰" : undefined}
                required={row.id !== 0}
                onChange={(event) => updateRow(index, { label: event.target.value })}
              />
            </label>
            <label>
              당첨 확률
              <span>
                <input
                  type="number"
                  name="percentage"
                  min={0.01}
                  max={100}
                  step={0.01}
                  value={row.percentage}
                  placeholder="0"
                  required={row.id !== 0}
                  onChange={(event) => updateRow(index, { percentage: event.target.value })}
                />%
              </span>
            </label>
            {row.id === 0 ? (
              <button
                className="roulette-add-prize"
                type="submit"
                disabled={!row.label.trim() || !row.percentage}
              >
                추가
              </button>
            ) : (
              <button className="roulette-remove" type="submit" name="deleteId" value={row.id}>삭제</button>
            )}
          </div>
        ))}
        <div className={`roulette-percentage-row is-miss${missPercentage < 0 ? " is-invalid" : ""}`}>
          <strong>꽝</strong>
          <span><b>{missPercentage.toFixed(2)}%</b><small>(자동 설정)</small></span>
        </div>
      </div>
      <div className="roulette-distribution-actions">
        <p className={missPercentage < 0 ? "is-error" : ""}>
          {missPercentage < 0
            ? "당첨 확률 합계가 100%를 넘었습니다."
            : `당첨 합계 ${prizeTotal.toFixed(2)}% · 꽝 ${missPercentage.toFixed(2)}%`}
        </p>
        <span>0.01% 단위까지 입력 가능합니다.</span>
      </div>
    </form>
  );
}
