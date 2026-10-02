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
  editing,
}: {
  items: DistributionItem[];
  editing: boolean;
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
          <h4 id="roulette-items-title">{editing ? "기존 경품 수정" : "룰렛 경품 및 확률"}</h4>
          <p>{editing
            ? "기존 경품을 수정하거나 새 경품을 추가합니다."
            : "새 경품은 아래 입력란에서 바로 추가할 수 있습니다."}</p>
        </div>
        <div className="roulette-editor-heading-actions">
          {editing ? (
            <>
              <Link href="/?tab=game&game=roulette">취소</Link>
              <button type="submit" disabled={missPercentage < 0}>변경사항 저장</button>
            </>
          ) : (
            <Link href="/?tab=game&game=roulette&rouletteEdit=1">기존 경품 수정</Link>
          )}
        </div>
      </div>
      <div className="roulette-percentage-list" aria-labelledby="roulette-items-title">
        {rows.map((row, index) => {
          const isNew = row.id === 0;
          if (!editing && !isNew) {
            return (
              <div className="roulette-percentage-row is-existing-readonly" key={row.id}>
                <input type="hidden" name="label" value={row.label} />
                <input type="hidden" name="percentage" value={row.percentage} />
                <strong>{row.label}</strong>
                <span><b>{row.percentage}%</b></span>
              </div>
            );
          }
          return (
            <div className={`roulette-percentage-row${isNew ? " is-new" : ""}`} key={row.id || "new"}>
              <label>
                {isNew ? "새 당첨 내용" : "당첨 내용"}
                <input
                  name="label"
                  value={row.label}
                  maxLength={50}
                  placeholder={isNew ? "커피 쿠폰" : undefined}
                  required={!isNew}
                  onChange={(event) => updateRow(index, { label: event.target.value })}
                />
              </label>
              <label>
                {isNew ? "새 당첨 확률" : "당첨 확률"}
                <span>
                  <input
                    type="number"
                    name="percentage"
                    min={0.01}
                    max={100}
                    step={0.01}
                    value={row.percentage}
                    placeholder="0"
                    required={!isNew}
                    onChange={(event) => updateRow(index, { percentage: event.target.value })}
                  />%
                </span>
              </label>
              {isNew ? (
                <button
                  className="roulette-add-prize"
                  type="submit"
                  disabled={!row.label.trim() || !row.percentage || missPercentage < 0}
                >
                  경품 추가
                </button>
              ) : (
                <button className="roulette-remove" type="submit" name="deleteId" value={row.id}>삭제</button>
              )}
            </div>
          );
        })}
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
