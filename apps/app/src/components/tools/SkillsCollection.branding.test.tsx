// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SkillProvenanceTooltip } from "./SkillsCollection";

afterEach(cleanup);

it("uses Foundry for application-managed skill provenance", () => {
  const { container } = render(
    <SkillProvenanceTooltip
      prefix="Managed by"
      providerId={null}
      name="Workspace"
    />,
  );
  const image = container.querySelector("img");
  expect(image?.getAttribute("src")).toBe("/foundry-mark.png");
  expect(image?.className).not.toMatch(/invert|brightness-0/);
  expect(image?.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelector('[data-provider-icon="bb"]')).not.toBeNull();
});
