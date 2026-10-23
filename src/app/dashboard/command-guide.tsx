export type CommandGuideRow = {
  who: "청취자" | "DJ";
  note?: string;
  commands?: Array<{ command: string; description?: string }>;
};

// The "how to play from chat" box at the bottom of each game panel.
export function CommandGuide({ rows }: { rows: CommandGuideRow[] }) {
  return (
    <div className="game-command" aria-label="채팅 명령어">
      {rows.map((row) => (
        <div key={row.who} className="game-command-row">
          <span className={`game-command-who${row.who === "DJ" ? " is-dj" : ""}`}>{row.who}</span>
          <div className="game-command-list">
            {row.note && <span className="game-command-note">{row.note}</span>}
            {row.commands?.map((item) => (
              <span key={item.command} className="game-command-chip">
                <code>{item.command}</code>
                {item.description && <small>{item.description}</small>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
