import { CONTEXTUAL_TIPS } from "./tips";
import type {
  ContextualState,
  ContextualTip,
  ContextualVertical,
} from "./types";

export function getContextualMessage({
  vertical,
  state,
  seed,
}: {
  vertical: ContextualVertical;
  state: ContextualState;
  seed: string;
}): ContextualTip {
  const exactMatches = CONTEXTUAL_TIPS.filter(
    (tip) => tip.vertical === vertical && tip.states.includes(state)
  );
  const candidates =
    exactMatches.length > 0
      ? exactMatches
      : CONTEXTUAL_TIPS.filter(
          (tip) => tip.vertical === vertical && tip.states.includes("default")
        );

  if (candidates.length === 0) {
    throw new Error(`No contextual tips configured for ${vertical}:${state}`);
  }

  const highestPriority = Math.max(
    ...candidates.map((tip) => tip.priority ?? 0)
  );
  const prioritized = candidates.filter(
    (tip) => (tip.priority ?? 0) === highestPriority
  );

  return prioritized[stableHash(`${vertical}:${state}:${seed}`) % prioritized.length];
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
