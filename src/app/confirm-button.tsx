"use client";

import type { ComponentProps } from "react";

// A submit button that asks before an action that cannot be undone. With an
// empty message it behaves like a plain button (e.g. "봇 입장" vs "봇 퇴장").
export function ConfirmButton({ message, onClick, ...props }: ComponentProps<"button"> & { message: string }) {
  return (
    <button
      {...props}
      onClick={(event) => {
        if (message && !window.confirm(message)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}
