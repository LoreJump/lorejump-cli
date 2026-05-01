// @ts-expect-error tsup .md text loader
import LOREJUMP_OPTIMIZE_MD from "./skills/lorejump-optimize/SKILL.md";
// @ts-expect-error tsup .md text loader
import LOREJUMP_HARNESS_MD from "./skills/lorejump-harness/SKILL.md";

import type { SkillName } from "../constants.js";

export const SKILL_CONTENT: Record<SkillName, string> = {
  "lorejump-optimize": LOREJUMP_OPTIMIZE_MD as unknown as string,
  "lorejump-harness": LOREJUMP_HARNESS_MD as unknown as string,
};
