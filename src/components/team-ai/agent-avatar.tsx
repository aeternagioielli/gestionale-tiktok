import type { TeamAiAgentId } from "@/server/services/team-ai-service";
import styles from "./agent-avatar.module.css";

const labels: Record<TeamAiAgentId, string> = {
  lorenzo: "Lorenzo, CEO AI",
  marco: "Marco, agente Marketing",
  giulia: "Giulia, agente Creative",
  alessandro: "Alessandro, agente E-commerce e SEO",
  matteo: "Matteo, agente Ordini e Supporto",
  francesca: "Francesca, agente Finanza",
};
type AvatarState = "idle" | "working" | "failed" | "awaiting" | "completed" | "thinking";
const frames = {
  lorenzo: { x: 24, y: 26, width: 52, height: 43, rx: 17 },
  marco: { x: 28, y: 27, width: 44, height: 43, rx: 14 },
  giulia: { x: 27, y: 28, width: 46, height: 43, rx: 20 },
  alessandro: { x: 25, y: 27, width: 50, height: 43, rx: 12 },
  matteo: { x: 29, y: 23, width: 42, height: 49, rx: 19 },
  francesca: { x: 26, y: 26, width: 48, height: 44, rx: 15 },
};
export function AgentAvatar({
  id,
  state = "idle",
  size = "default",
}: {
  id: TeamAiAgentId;
  state?: AvatarState;
  size?: "default" | "large";
}) {
  return (
    <span
      className={styles.avatar}
      data-size={size}
      data-state={state}
      role="img"
      aria-label={labels[id]}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <path className={styles.body} d="M28 93v-10c0-9 9-13 22-13s22 4 22 13v10Z" />
        <rect className={styles.shell} x="44" y="63" width="12" height="14" rx="5" />
        <rect className={styles.shell} {...frames[id]} />
        {id !== "giulia" && id !== "matteo" && (
          <path className={styles.line} d="M50 26V17m-4 0h8" />
        )}
        <rect
          className={styles.visor}
          x="32"
          y="37"
          width="36"
          height="22"
          rx={id === "alessandro" ? 7 : 10}
        />
        <circle className={styles.eye} cx="42" cy="46" r="2.4" />
        <circle className={styles.eye} cx="58" cy="46" r="2.4" />
        <path className={styles.smile} d="M46 54q4 3 8 0" />
        {id === "lorenzo" && (
          <g className={styles.accent}>
            <path d="M40 24l-2-9 8 5 4-8 4 8 8-5-2 9Z" />
            <path d="m50 77 4 5-4 5-4-5Z" />
          </g>
        )}
        {id === "marco" && (
          <g className={styles.accent}>
            <path d="M68 16q8 4 8 13m-4-19q13 6 13 19" />
            <path className={styles.filledAccent} d="m73 61 12-6v18l-12-6h-6v-6Z" />
            <path d="M75 68v8" />
          </g>
        )}
        {id === "giulia" && (
          <>
            <path className={styles.beret} d="M25 32c-4-13 17-21 35-15 8 2 13 6 14 12l-23-2Z" />
            <circle className={styles.filledAccent} cx="54" cy="17" r="3" />
            <g className={styles.accent}>
              <path d="m73 82 12-22" strokeWidth="4" />
              <path className={styles.filledAccent} d="M82 62c-5-8 4-15 8-16 1 6 1 12-4 16Z" />
            </g>
          </>
        )}
        {id === "alessandro" && (
          <g className={styles.accent}>
            <circle cx="59" cy="47" r="8" />
            <path d="m65 53 8 8M42 80l8-4 8 4v9l-8 4-8-4Zm0 0 8 4 8-4m-8 4v9" />
          </g>
        )}
        {id === "matteo" && (
          <>
            <path className={styles.accent} d="M21 49V39a29 29 0 0 1 58 0v10" />
            <rect className={styles.beret} x="18" y="43" width="9" height="16" rx="4" />
            <rect className={styles.beret} x="73" y="43" width="9" height="16" rx="4" />
            <path className={styles.accent} d="M77 56v6q0 5-10 5h-8" />
            <circle className={styles.filledAccent} cx="58" cy="67" r="3" />
          </>
        )}
        {id === "francesca" && (
          <>
            <g className={styles.accent}>
              <rect x="33" y="40" width="14" height="13" rx="5" />
              <rect x="53" y="40" width="14" height="13" rx="5" />
              <path d="M47 46h6" />
            </g>
            <g className={styles.filledAccent}>
              <rect x="41" y="85" width="4" height="4" rx="1" />
              <rect x="48" y="81" width="4" height="8" rx="1" />
              <rect x="55" y="77" width="4" height="12" rx="1" />
            </g>
          </>
        )}
      </svg>
      {state === "thinking" && (
        <span className={styles.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      {state === "completed" && (
        <svg className={styles.indicator} viewBox="0 0 20 20" aria-hidden="true">
          <path d="m5 10 3 3 7-7" />
        </svg>
      )}
      {state === "failed" && (
        <svg className={styles.indicator} viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v7m0 3v2" />
        </svg>
      )}
      {state === "awaiting" && (
        <svg className={styles.indicator} viewBox="0 0 20 20" aria-hidden="true">
          <path d="m10 3 7 7-7 7-7-7Z" />
        </svg>
      )}
    </span>
  );
}
