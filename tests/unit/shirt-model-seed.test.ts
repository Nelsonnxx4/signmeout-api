import { describe, expect, it } from "vitest";

import { SHIRT_MODEL_SEEDS } from "../../prisma/seed/shirt-models.js";
import { shirtPlacementConfigSchema } from "../../src/modules/signatures/placement.rules.js";

describe("seeded shirt model versions", () => {
	it("match the frontend v2 assets and contain valid front/back UV placement", () => {
		expect(SHIRT_MODEL_SEEDS).toHaveLength(2);

		for (const model of SHIRT_MODEL_SEEDS) {
			expect(model.version).toBe(2);
			expect(model.modelKey).toMatch(/^models\/shirts\/.+-v2\.glb$/);

			const placement = shirtPlacementConfigSchema.parse(model.placementConfig);
			expect(placement.version).toBe(model.version);
			expect(placement.surfaces.map(({ id }) => id)).toEqual(["front", "back"]);
		}
	});
});
