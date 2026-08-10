import { UNO_MODULE_CATALOG as GAME_UNO_MODULE_CATALOG } from "@/lib/game/constants";
import type {
  UnoNegativeModuleId,
  UnoPositiveModuleId,
} from "@/lib/game/types";
import { validateCommunityUnoCard } from "@/lib/game/uno";
import { ApiProblem } from "./api";
import type { UnoModuleDefinition } from "./contracts";

/**
 * The executable game catalog is the single source of truth. The API only
 * renames positive/negative to benefit/drawback for the builder UI contract.
 */
export const UNO_MODULE_CATALOG: readonly UnoModuleDefinition[] = Object.values(
  GAME_UNO_MODULE_CATALOG,
).map((module) => ({
  id: module.id,
  kind: module.kind === "positive" ? "benefit" : "drawback",
  points: module.points,
  label: module.name,
  description: module.description,
}));

const MODULES_BY_ID = new Map<string, UnoModuleDefinition>(
  UNO_MODULE_CATALOG.map((module) => [module.id, module]),
);

export function validateUnoModuleIds(moduleIds: string[]): {
  moduleIds: string[];
  pointTotal: 0;
} {
  if (new Set(moduleIds).size !== moduleIds.length) {
    throw new ApiProblem(
      400,
      "INVALID_INPUT",
      "moduleIds may not contain duplicate modules.",
    );
  }

  const modules = moduleIds.map((id) => MODULES_BY_ID.get(id));
  const unknownIds = moduleIds.filter((_, index) => !modules[index]);
  if (unknownIds.length > 0) {
    throw new ApiProblem(
      400,
      "INVALID_INPUT",
      `Unknown UNO module: ${unknownIds.join(", ")}.`,
    );
  }

  const knownModules = modules.filter(
    (module): module is UnoModuleDefinition => Boolean(module),
  );
  const benefits = knownModules.filter((module) => module.kind === "benefit");
  const drawbacks = knownModules.filter((module) => module.kind === "drawback");
  if (benefits.length < 1 || benefits.length > 2) {
    throw new ApiProblem(
      400,
      "INVALID_INPUT",
      "A community UNO card needs between one and two benefit modules.",
    );
  }
  if (drawbacks.length < 1 || drawbacks.length > 2) {
    throw new ApiProblem(
      400,
      "INVALID_INPUT",
      "A community UNO card needs between one and two drawback modules.",
    );
  }

  const gameValidation = validateCommunityUnoCard({
    id: "server-validation",
    name: "server-validation",
    author: "server-validation",
    version: 1,
    positiveModules: benefits.map(
      (module) => module.id as UnoPositiveModuleId,
    ),
    negativeModules: drawbacks.map(
      (module) => module.id as UnoNegativeModuleId,
    ),
  });
  if (!gameValidation.valid) {
    throw new ApiProblem(
      400,
      "INVALID_INPUT",
      "UNO modules do not satisfy the executable game rules.",
      {
        pointTotal: gameValidation.pointTotal,
        errors: [...gameValidation.errors],
      },
    );
  }

  return { moduleIds, pointTotal: 0 };
}
