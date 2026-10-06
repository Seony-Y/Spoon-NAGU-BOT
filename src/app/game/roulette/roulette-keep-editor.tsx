"use client";

import { useState } from "react";

type KeepUser = {
  userId: string;
  nickname: string;
  items: Array<{ label: string; count: number }>;
};

export function RouletteKeepEditor({
  users,
  disabled = false,
}: {
  users: KeepUser[];
  disabled?: boolean;
}) {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const toggleSelection = (index: number, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  return (
    <form className="roulette-keep-editor" action="/game/roulette" method="post">
      <input type="hidden" name="action" value="keeps" />
      <div className="roulette-section-heading">
        <div>
          <h4 id="roulette-keeps-title">사용자별 킵</h4>
          <p><code>!내 킵</code>으로 조회</p>
        </div>
      </div>
      <div className="roulette-keep-list">
        {users.map((user, userIndex) => {
          const isEditing = editingUserId === user.userId;
          return (
          <section className={isEditing ? "is-editing" : undefined} key={user.userId}>
            <div className="roulette-keep-user-heading">
              <strong>{user.nickname}</strong>
              <button
                className="roulette-keep-edit-toggle"
                type="button"
                aria-label={`${user.nickname} 킵 ${isEditing ? "수정 취소" : "수정"}`}
                onClick={() => {
                  setEditingUserId(isEditing ? null : user.userId);
                  setSelected(new Set());
                }}
              >
                {isEditing ? "취소" : "수정"}
              </button>
            </div>
            {isEditing && <p className="roulette-keep-edit-help">수정할 항목과 수량을 입력해 주세요.</p>}
            <ul>{user.items.map((item, itemIndex) => {
              const index = users.slice(0, userIndex).reduce(
                (total, current) => total + current.items.length,
                itemIndex,
              );
              const isSelected = selected.has(index);
              return (
                <li key={item.label}>
                  {isEditing && (
                    <input
                      type="checkbox"
                      name="selection"
                      value={index}
                      checked={isSelected}
                      aria-label={`${user.nickname} ${item.label} 선택`}
                      onChange={(event) => toggleSelection(index, event.target.checked)}
                    />
                  )}
                  {isEditing && <input type="hidden" name="item" value={index} />}
                  <input type="hidden" name={`userId:${index}`} value={user.userId} />
                  <input type="hidden" name={`itemLabel:${index}`} value={item.label} />
                  <span>{item.label}</span>
                  {isEditing ? (
                    <label>
                      <input
                        type="number"
                        name={`count:${index}`}
                        min={1}
                        max={1_000_000}
                        defaultValue={item.count}
                        aria-label="수량"
                        required
                        onInput={(event) => {
                          if (event.currentTarget.valueAsNumber < 1) event.currentTarget.value = "1";
                        }}
                      />
                      <em>개</em>
                    </label>
                  ) : <em>{item.count.toLocaleString("ko-KR")}개</em>}
                </li>
              );
            })}</ul>
            {isEditing && (
              <div className="roulette-keep-actions">
                <span>{selected.size.toLocaleString("ko-KR")}개 항목 선택</span>
                <div>
                  <button type="submit" name="operation" value="update" disabled={disabled}>수정</button>
                  <button className="is-delete" type="submit" name="operation" value="delete" disabled={disabled || selected.size === 0}>선택 삭제</button>
                </div>
              </div>
            )}
          </section>
          );
        })}
      </div>
    </form>
  );
}