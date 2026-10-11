import type { TeamAiAgentId } from "@/server/services/team-ai-service";
import styles from "./team-ai-dashboard.module.css";

const labels: Record<TeamAiAgentId, string> = {
  lorenzo: "Lorenzo, CEO AI",
  marco: "Marco, agente Marketing",
  giulia: "Giulia, agente Creative",
  alessandro: "Alessandro, agente E-commerce e SEO",
  matteo: "Matteo, agente Ordini e Supporto",
  francesca: "Francesca, agente Finanza",
};

type AvatarState = "idle" | "working" | "failed" | "awaiting" | "completed" | "thinking";

export function AgentAvatar({ id, state = "idle" }: { id: TeamAiAgentId; state?: AvatarState }) {
  const stateClass = `avatar${state[0].toUpperCase()}${state.slice(1)}` as keyof typeof styles;
  return (
    <span className={`${styles.avatar} ${styles[stateClass]}`} role="img" aria-label={labels[id]}>
      <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
        <rect className={styles.avatarHead} x="15" y="21" width="50" height="42" rx="18" />
        <path className={styles.avatarAntenna} d="M40 21V13M34 13h12" />
        <circle className={styles.avatarEye} cx="31" cy="40" r="3" />
        <circle className={styles.avatarEye} cx="49" cy="40" r="3" />
        <path className={styles.avatarSmile} d="M31 51c5 4 13 4 18 0" />
        {id === "lorenzo" && (
          <path className={styles.avatarAccent} d="M29 18l4-7 7 5 7-5 4 7v5H29z" />
        )}
        {id === "marco" && <path className={styles.avatarAccent} d="M60 26v-8m-5 8v-5m10 5v-11" />}
        {id === "giulia" && (
          <path className={styles.avatarAccent} d="M59 19l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" />
        )}
        {id === "alessandro" && (
          <>
            <circle className={styles.avatarAccent} cx="61" cy="56" r="5" />
            <path className={styles.avatarAccent} d="M65 60l5 5" />
          </>
        )}
        {id === "matteo" && (
          <path
            className={styles.avatarAccent}
            d="M13 42a27 27 0 0 1 54 0M13 42v9m54-9v9M13 51h7m40 0h7"
          />
        )}
        {id === "francesca" && (
          <>
            <circle className={styles.avatarAccent} cx="62" cy="55" r="8" />
            <path className={styles.avatarAccent} d="M62 50v10m-3-7c1 1 5 1 6 3s-4 3-6 1" />
          </>
        )}
      </svg>
      {state === "thinking" && (
        <span className={styles.thinkingDots} aria-label="Elaborazione in corso">
          <i />
          <i />
          <i />
        </span>
      )}
      {state === "completed" && (
        <span className={styles.completedMark} aria-label="Completato">
          ✓
        </span>
      )}
    </span>
  );
}
