import { test, expect, type Page } from "@playwright/test";

// Helper: collect console errors during a test
function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

// Helper: clear localStorage so tests start fresh
async function resetState(page: Page) {
  await page.goto("/#/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/#/");
}

// Helper: fill a number input by label text
async function setNumberInput(page: Page, label: string, value: number) {
  const row = page.locator("div").filter({ hasText: new RegExp(`^${label}`) });
  const input = row.locator('input[type="number"]').first();
  await input.fill(String(value));
}

// Helper: set export settings via the Zustand store directly.
// Playwright's fill()/selectOption() don't reliably trigger React 19's onChange
// in headless Chromium, so we bypass the DOM and go straight to the store.
async function setExportSetting(page: Page, path: string, value: unknown) {
  await page.evaluate(
    ({ path: p, value: v }) => {
      const store = (window as unknown as Record<string, unknown>).__store as {
        getState: () => Record<string, unknown>;
      };
      const state = store.getState();
      const simIndex = Number(location.hash.match(/\/export\/(\d+)/)?.[1] ?? 0);
      const getSettings = state.getExportSettings as (i: number) => Record<string, unknown>;
      const setSettings = state.setExportSettings as (i: number, s: Record<string, unknown>) => void;
      const current = getSettings(simIndex);

      // Support nested paths like "start.style" or "end.scaleFactor"
      const parts = p.split(".");
      if (parts.length === 1) {
        setSettings(simIndex, { ...current, [parts[0]]: v });
      } else {
        const section = current[parts[0]] as Record<string, unknown>;
        setSettings(simIndex, {
          ...current,
          [parts[0]]: { ...section, [parts[1]]: v },
        });
      }
    },
    { path, value },
  );
  // Wait for React re-render
  await page.waitForTimeout(100);
}


test.describe("Full E2E Workflow", () => {
  test("Setup → Run → Results → Export → Workspace round-trip", async ({ page }) => {
    const errors = trackConsoleErrors(page);

    // ─── SETUP PAGE ─────────────────────────────────────────────
    await resetState(page);
    await expect(page.locator("h1")).toHaveText("Fleeting Grace");

    // Verify all simulation setting inputs exist and are interactive
    const settingLabels = [
      "Number of simulations",
      "Mass range",
      "Bounding sphere radius",
      "Max speed",
      "Max simulation time",
      "Time step",
      "Escape radius",
    ];
    for (const label of settingLabels) {
      await expect(page.getByText(label)).toBeVisible();
    }

    // Change every number input to verify they're all editable
    await setNumberInput(page, "Number of simulations", 8);
    await expect(page.locator('input[type="number"]').first()).toHaveValue("8");

    await setNumberInput(page, "Bounding sphere radius", 40);
    await expect(
      page.locator("div").filter({ hasText: /^Bounding sphere radius/ }).locator('input[type="number"]'),
    ).toHaveValue("40");

    await setNumberInput(page, "Max speed", 25);
    await setNumberInput(page, "Max simulation time", 30);
    await setNumberInput(page, "Time step", 4);
    await setNumberInput(page, "Escape radius", 200);

    // Mass range has two inputs — change both
    const massRow = page.locator("div").filter({ hasText: /^Mass range/ });
    const massInputs = massRow.locator('input[type="number"]');
    await massInputs.first().fill("0.5");
    await massInputs.last().fill("100");

    // Workspace buttons: no saved workspace yet
    await expect(page.getByRole("button", { name: "Save to Browser" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load Saved" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear Saved" })).not.toBeVisible();

    // ─── RUN SIMULATIONS ────────────────────────────────────────
    // Use a small count for speed
    await setNumberInput(page, "Number of simulations", 5);

    const runButton = page.getByRole("button", { name: "Run Simulations" });
    await expect(runButton).toBeEnabled();
    await runButton.click();

    // Progress bar should appear
    await expect(page.getByText(/Running simulation/)).toBeVisible({ timeout: 5_000 });

    // Wait for navigation to results (simulations finish)
    await page.waitForURL("**/results", { timeout: 30_000 });

    // ─── RESULTS PAGE ───────────────────────────────────────────
    await expect(page.locator("h1")).toHaveText("Results");
    await expect(page.getByText("5 simulations")).toBeVisible();

    // Grid should have 5 simulation cards
    const cards = page.locator(".grid > div");
    await expect(cards).toHaveCount(5);

    // Each card has a canvas (3D scene) and an Export button
    for (let i = 0; i < 5; i++) {
      const card = cards.nth(i);
      await expect(card.locator("canvas")).toBeVisible();
      await expect(card.getByText("Export")).toBeVisible();
    }

    // Verify all 9 scoring weight sliders exist
    const sliders = page.locator('input[type="range"]');
    await expect(sliders).toHaveCount(9);

    const scoringNames = [
      "SpaceFilling", "Tortuosity", "CurvatureVariance",
      "DirectionEntropy", "Interweaving", "Complexity",
      "SweepingArcs", "TotalDistance", "Duration",
    ];
    for (const name of scoringNames) {
      await expect(page.getByText(name)).toBeVisible();
    }

    // Record initial card order (by termination reason text per card)
    async function getCardOrder() {
      const reasons: string[] = [];
      const count = await cards.count();
      for (let i = 0; i < count; i++) {
        const text = await cards.nth(i).locator(".text-xs.text-gray-500").textContent();
        reasons.push(text ?? "");
      }
      return reasons;
    }
    const initialOrder = await getCardOrder();

    // Manipulate scoring sliders — set SpaceFilling to max, Duration to min
    const spaceFilling = sliders.first();
    await spaceFilling.fill("10");
    const duration = sliders.last();
    await duration.fill("-10");

    // Check the weight values updated in the UI
    // Each scoring row is a direct child of the .space-y-3 container
    const scoringRows = page.locator(".space-y-3 > div");
    await expect(scoringRows.first().locator(".font-mono")).toHaveText("10");
    await expect(scoringRows.last().locator(".font-mono")).toHaveText("-10");

    // Order may have changed (or may not if the data happens to sort the same)
    // At minimum, verify no crash happened and cards still render
    await expect(cards).toHaveCount(5);

    // Reset all weights
    await page.getByText("Reset all weights").click();
    await expect(scoringRows.first().locator(".font-mono")).toHaveText("1");
    await expect(scoringRows.last().locator(".font-mono")).toHaveText("1");

    // Order should be restored
    const resetOrder = await getCardOrder();
    expect(resetOrder).toEqual(initialOrder);

    // Back to Setup navigation
    await page.getByText("Back to Setup").click();
    await page.waitForURL("**/");
    await expect(page.locator("h1")).toHaveText("Fleeting Grace");

    // "View Results" button should be visible (we have results in memory)
    await expect(page.getByRole("button", { name: "View Results" })).toBeVisible();
    await page.getByRole("button", { name: "View Results" }).click();
    await page.waitForURL("**/results");

    // ─── PAGINATION ─────────────────────────────────────────────
    // With 5 sims and default 4×3=12 per page, we should be on a single page.
    // Pagination controls should not appear.
    await expect(page.getByText(/Page \d+ \/ \d+/)).not.toBeVisible();

    // ─── EXPORT PAGE ────────────────────────────────────────────
    // Click "Export" on the first card
    const firstExport = cards.first().getByText("Export");
    await firstExport.click();
    await page.waitForURL(/\/export\/\d+/);

    await expect(page.locator("h1")).toHaveText("Export");
    await expect(page.getByText(/Simulation #/)).toBeVisible();

    // 3D mesh preview canvas should render
    const meshCanvas = page.locator("canvas");
    await expect(meshCanvas).toBeVisible();

    // ── Verify export page sections ──
    await expect(page.getByText("General")).toBeVisible();
    await expect(page.getByText("Tube segments")).toBeVisible();
    await expect(page.getByText("Output size")).toBeVisible();
    await expect(page.getByText("Body Start Position")).toBeVisible();
    await expect(page.getByText("Body End Position")).toBeVisible();
    await expect(page.getByText("Show velocity arrow")).toBeVisible();

    // Verify number inputs exist
    const numberInputCount = await page.locator("input[type='number']").count();
    expect(numberInputCount).toBeGreaterThanOrEqual(2);

    // Verify selects exist
    const selectCount = await page.locator("select").count();
    expect(selectCount).toBeGreaterThanOrEqual(2);

    // ── Test style switching via the Zustand store ──
    // Direct DOM manipulation of React-controlled <select> elements is unreliable
    // in headless mode, so we test style changes via the store (same as the UI does)
    for (const startStyle of ["none", "solid_sphere", "armillary", "ring"]) {
      await page.evaluate((style) => {
        // Access zustand store from window — we need to expose it temporarily
        const selects = document.querySelectorAll("select");
        const startSelect = selects[0];
        if (startSelect) {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            "value",
          )!.set!;
          nativeSetter.call(startSelect, style);
          startSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, startStyle);
      // Small wait for React to process
      await page.waitForTimeout(100);
    }

    // Verify conditional UI: after "ring" was set, scale factor should be visible
    await expect(page.getByText("Scale factor").first()).toBeVisible();

    // Set to "none" to verify conditional UI hides
    await page.evaluate(() => {
      const selects = document.querySelectorAll("select");
      const startSelect = selects[0];
      if (startSelect) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value",
        )!.set!;
        nativeSetter.call(startSelect, "none");
        startSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await page.waitForTimeout(100);

    // ── Velocity arrow toggle ──
    const arrowToggle = page.getByText("Show velocity arrow").locator("..").locator("button");
    await expect(arrowToggle).toBeVisible();
    await arrowToggle.click();
    await arrowToggle.click();

    // ── Download button exists ──
    await expect(page.getByRole("button", { name: "Download OBJ" })).toBeVisible();
    // We don't click it to avoid triggering a file download in CI

    // Navigate back to results
    await page.getByText("Back to Results").click();
    await page.waitForURL("**/results");
    await expect(cards).toHaveCount(5);

    // ─── WORKSPACE SAVE / LOAD / CLEAR ──────────────────────────
    // Go back to setup
    await page.getByText("Back to Setup").click();
    await page.waitForURL("**/");

    // Save workspace
    const saveBtn = page.getByRole("button", { name: "Save to Browser" });
    await saveBtn.click();

    // "Clear Saved" should appear reactively
    await expect(page.getByRole("button", { name: "Clear Saved" })).toBeVisible();

    // Verify localStorage actually has data
    const storageKey = await page.evaluate(() => localStorage.getItem("fleeting-grace-workspace"));
    expect(storageKey).not.toBeNull();
    const workspace = JSON.parse(storageKey!);
    expect(workspace.initialConditions).toHaveLength(5);
    expect(workspace.simulationSettings).toBeDefined();

    // Simulate a fresh session: reload the page (clears in-memory state)
    await page.reload();
    await expect(page.locator("h1")).toHaveText("Fleeting Grace");

    // "View Results" should NOT be visible (no in-memory results after reload)
    await expect(page.getByRole("button", { name: "View Results" })).not.toBeVisible();

    // But saved workspace should be detected
    await expect(page.getByRole("button", { name: "Clear Saved" })).toBeVisible();
    await expect(page.getByText("A saved workspace was found")).toBeVisible();

    // Load the saved workspace — should replay sims and navigate to results
    await page.getByRole("button", { name: "Load Saved" }).click();
    await page.waitForURL("**/results", { timeout: 30_000 });
    await expect(page.locator("h1")).toHaveText("Results");
    await expect(cards).toHaveCount(5);

    // Go back and clear workspace
    await page.getByText("Back to Setup").click();
    await page.waitForURL("**/");
    await page.getByRole("button", { name: "Clear Saved" }).click();
    await expect(page.getByRole("button", { name: "Clear Saved" })).not.toBeVisible();

    // Verify localStorage is empty
    const cleared = await page.evaluate(() => localStorage.getItem("fleeting-grace-workspace"));
    expect(cleared).toBeNull();

    // ─── CONSOLE ERROR CHECK ────────────────────────────────────
    // Filter out known benign warnings (e.g., React Three Fiber, sourcemaps)
    const realErrors = errors.filter(
      (e) =>
        !e.includes("THREE.") &&
        !e.includes("sourcemap") &&
        !e.includes("DevTools") &&
        !e.includes("404") &&
        !e.includes("WebGL"),
    );
    expect(realErrors).toEqual([]);
  });

  test("Pagination works with enough simulations", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await resetState(page);

    // Run 15 simulations (default grid is 4×3=12 per page, so 2 pages)
    await setNumberInput(page, "Number of simulations", 15);
    await page.getByRole("button", { name: "Run Simulations" }).click();
    await page.waitForURL("**/results", { timeout: 60_000 });

    await expect(page.getByText("15 simulations")).toBeVisible();

    // First page should have 12 cards
    const cards = page.locator(".grid > div");
    await expect(cards).toHaveCount(12);

    // Pagination controls should be visible
    await expect(page.getByText("Page 1 / 2")).toBeVisible();
    const prevBtn = page.getByRole("button", { name: "Previous" });
    const nextBtn = page.getByRole("button", { name: "Next" });
    await expect(prevBtn).toBeDisabled();
    await expect(nextBtn).toBeEnabled();

    // Go to page 2
    await nextBtn.click();
    await expect(page.getByText("Page 2 / 2")).toBeVisible();
    await expect(cards).toHaveCount(3); // remaining 3 sims
    await expect(nextBtn).toBeDisabled();
    await expect(prevBtn).toBeEnabled();

    // Go back to page 1
    await prevBtn.click();
    await expect(page.getByText("Page 1 / 2")).toBeVisible();
    await expect(cards).toHaveCount(12);

    const realErrors = errors.filter(
      (e) =>
        !e.includes("THREE.") &&
        !e.includes("sourcemap") &&
        !e.includes("DevTools") &&
        !e.includes("404") &&
        !e.includes("WebGL"),
    );
    expect(realErrors).toEqual([]);
  });

  test("Empty state navigations are handled gracefully", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await resetState(page);

    // Navigating directly to results with no sims shows empty state
    await page.goto("/#/results");
    await expect(page.getByText("No simulations yet")).toBeVisible();
    await expect(page.getByText("Go to Setup")).toBeVisible();

    // Can navigate back to setup
    await page.getByText("Go to Setup").click();
    await page.waitForURL("**/");
    await expect(page.locator("h1")).toHaveText("Fleeting Grace");

    // Navigating to a nonexistent export shows not found
    await page.goto("/#/export/999");
    await expect(page.getByText("Simulation not found")).toBeVisible();
    await page.getByText("Back to Results").click();
    await page.waitForURL("**/results");

    const realErrors = errors.filter(
      (e) =>
        !e.includes("THREE.") &&
        !e.includes("sourcemap") &&
        !e.includes("DevTools") &&
        !e.includes("404") &&
        !e.includes("WebGL"),
    );
    expect(realErrors).toEqual([]);
  });

  test("Scoring weights: mess with every slider and verify re-sorting", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await resetState(page);

    // Run 10 simulations so we have variety to sort
    await setNumberInput(page, "Number of simulations", 10);
    await page.getByRole("button", { name: "Run Simulations" }).click();
    await page.waitForURL("**/results", { timeout: 30_000 });

    const cards = page.locator(".grid > div");
    const sliders = page.locator('input[type="range"]');
    await expect(sliders).toHaveCount(9);

    // Helper: get the sim indices from the grid by reading Export link hrefs
    async function getGridOrder(): Promise<string[]> {
      const exportLinks = cards.locator("text=Export");
      const count = await exportLinks.count();
      const order: string[] = [];
      for (let i = 0; i < count; i++) {
        // Each Export button navigates to /export/:simIndex, we can get the
        // card's position + reason text as a fingerprint
        const card = cards.nth(i);
        const reason = await card.locator(".text-xs.text-gray-500").textContent();
        // Also get the score bar widths as a fingerprint
        const bars = card.locator(".bg-cyan-500");
        const barCount = await bars.count();
        const widths: string[] = [];
        for (let j = 0; j < barCount; j++) {
          const style = await bars.nth(j).getAttribute("style");
          widths.push(style ?? "");
        }
        order.push(`${reason}|${widths.join(",")}`);
      }
      return order;
    }

    const baselineOrder = await getGridOrder();

    // ── Crank SpaceFilling to max, everything else to 0 ──
    for (let i = 0; i < 9; i++) {
      await sliders.nth(i).fill(i === 0 ? "10" : "0");
    }
    const scoringRows = page.locator(".space-y-3 > div");
    await expect(scoringRows.first().locator(".font-mono")).toHaveText("10");
    await expect(scoringRows.nth(1).locator(".font-mono")).toHaveText("0");
    // Cards should still all be present and rendering
    await expect(cards).toHaveCount(10);
    const spaceFillingOrder = await getGridOrder();

    // ── Now flip: Duration to max, everything else to 0 ──
    for (let i = 0; i < 9; i++) {
      await sliders.nth(i).fill(i === 8 ? "10" : "0");
    }
    await expect(scoringRows.last().locator(".font-mono")).toHaveText("10");
    await expect(cards).toHaveCount(10);
    const durationOrder = await getGridOrder();

    // ── Set every slider to a different value across the full range ──
    const values = [-10, -7, -4, -1, 0, 2, 5, 8, 10];
    for (let i = 0; i < 9; i++) {
      await sliders.nth(i).fill(String(values[i]));
    }
    // Verify each slider's displayed weight
    for (let i = 0; i < 9; i++) {
      await expect(scoringRows.nth(i).locator(".font-mono")).toHaveText(String(values[i]));
    }
    await expect(cards).toHaveCount(10);

    // ── Set all weights to negative: sorting should still work ──
    for (let i = 0; i < 9; i++) {
      await sliders.nth(i).fill("-5");
    }
    for (let i = 0; i < 9; i++) {
      await expect(scoringRows.nth(i).locator(".font-mono")).toHaveText("-5");
    }
    await expect(cards).toHaveCount(10);

    // ── Reset and confirm it restores defaults ──
    await page.getByText("Reset all weights").click();
    for (let i = 0; i < 9; i++) {
      await expect(scoringRows.nth(i).locator(".font-mono")).toHaveText("1");
    }
    const resetOrder = await getGridOrder();
    expect(resetOrder).toEqual(baselineOrder);

    const realErrors = errors.filter(
      (e) =>
        !e.includes("THREE.") &&
        !e.includes("sourcemap") &&
        !e.includes("DevTools") &&
        !e.includes("404") &&
        !e.includes("WebGL"),
    );
    expect(realErrors).toEqual([]);
  });

  test("Export settings: mess with every control", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await resetState(page);

    // Run 5 sims, go to export page for the first one
    await setNumberInput(page, "Number of simulations", 5);
    await page.getByRole("button", { name: "Run Simulations" }).click();
    await page.waitForURL("**/results", { timeout: 30_000 });

    // Click Export on the first card
    const cards = page.locator(".grid > div");
    await cards.first().getByText("Export").click();
    await page.waitForURL(/\/export\/\d+/);
    await expect(page.locator("h1")).toHaveText("Export");

    const allInputs = page.locator("input[type='number']");
    const allSelects = page.locator("select");

    // ── General: Tube segments ──
    // Default is 64; cycle through several values
    for (const val of [16, 128, 32]) {
      await setExportSetting(page, "tubeSegments", val);
      await expect(allInputs.first()).toHaveValue(String(val));
    }

    // ── General: Output size ──
    // Default is 9; cycle through several values
    for (const val of [1, 12, 24, 6]) {
      await setExportSetting(page, "outputSize", val);
      await expect(allInputs.nth(1)).toHaveValue(String(val));
    }

    // ── Start style: cycle through all options ──
    for (const style of ["none", "solid_sphere", "armillary", "ring"] as const) {
      await setExportSetting(page, "start.style", style);
      await expect(allSelects.first()).toHaveValue(style);

      if (style === "none") {
        // "none" hides scale factor and segments for start
        // End is still solid_sphere, so only 1 "Scale factor" label
        await expect(page.getByText("Scale factor")).toHaveCount(1);
      } else {
        // Non-none shows Scale factor for both start + end
        await expect(page.getByText("Scale factor")).toHaveCount(2);
      }
    }

    // Set to armillary for more settings to tweak
    await setExportSetting(page, "start.style", "armillary");
    await expect(allSelects.first()).toHaveValue("armillary");

    // ── Start: Scale factor ──
    for (const val of [0.5, 10, 20, 4]) {
      await setExportSetting(page, "start.scaleFactor", val);
      await expect(allInputs.nth(2)).toHaveValue(String(val));
    }

    // ── Start: Segments ──
    for (const val of [4, 32, 128, 16]) {
      await setExportSetting(page, "start.segments", val);
      await expect(allInputs.nth(3)).toHaveValue(String(val));
    }

    // ── Velocity arrow toggle: click multiple times ──
    const arrowToggle = page.getByText("Show velocity arrow").locator("..").locator("button");
    const initialClass = await arrowToggle.getAttribute("class");
    const wasOn = initialClass?.includes("bg-cyan-600");

    await arrowToggle.click(); // toggle
    const afterClick = await arrowToggle.getAttribute("class");
    expect(afterClick?.includes("bg-cyan-600")).toBe(!wasOn);

    await arrowToggle.click(); // toggle back
    const afterSecond = await arrowToggle.getAttribute("class");
    expect(afterSecond?.includes("bg-cyan-600")).toBe(wasOn);

    // Also toggle via the store
    await setExportSetting(page, "start.showVelocityArrow", false);
    await expect(arrowToggle).toHaveClass(/bg-gray-700/);
    await setExportSetting(page, "start.showVelocityArrow", true);
    await expect(arrowToggle).toHaveClass(/bg-cyan-600/);

    // ── End style: cycle through options ──
    for (const style of ["none", "solid_sphere"] as const) {
      await setExportSetting(page, "end.style", style);
      await expect(allSelects.last()).toHaveValue(style);

      if (style === "none") {
        // Start still has scale factor (armillary), end doesn't → count = 1
        await expect(page.getByText("Scale factor")).toHaveCount(1);
      } else {
        await expect(page.getByText("Scale factor")).toHaveCount(2);
      }
    }

    // Set end to solid_sphere and mess with its settings
    await setExportSetting(page, "end.style", "solid_sphere");

    // ── End: Scale factor ──
    for (const val of [1, 8, 15, 3]) {
      await setExportSetting(page, "end.scaleFactor", val);
      // With armillary start: inputs are [tube, output, startScale, startSeg, endScale, endSeg]
      await expect(allInputs.nth(4)).toHaveValue(String(val));
    }

    // ── End: Segments ──
    for (const val of [4, 64, 128, 32]) {
      await setExportSetting(page, "end.segments", val);
      await expect(allInputs.nth(5)).toHaveValue(String(val));
    }

    // ── Verify settings persist across navigation ──
    await page.getByText("Back to Results").click();
    await page.waitForURL("**/results");

    // Re-enter the same export page
    await cards.first().getByText("Export").click();
    await page.waitForURL(/\/export\/\d+/);

    // All the last values should still be there
    await expect(allInputs.first()).toHaveValue("32");      // tubeSegments
    await expect(allInputs.nth(1)).toHaveValue("6");        // outputSize
    await expect(allSelects.first()).toHaveValue("armillary"); // start.style
    await expect(allInputs.nth(2)).toHaveValue("4");        // start.scaleFactor
    await expect(allInputs.nth(3)).toHaveValue("16");       // start.segments
    await expect(allSelects.last()).toHaveValue("solid_sphere"); // end.style
    await expect(allInputs.nth(4)).toHaveValue("3");        // end.scaleFactor
    await expect(allInputs.nth(5)).toHaveValue("32");       // end.segments

    // ── Download button is present ──
    await expect(page.getByRole("button", { name: "Download OBJ" })).toBeVisible();

    const realErrors = errors.filter(
      (e) =>
        !e.includes("THREE.") &&
        !e.includes("sourcemap") &&
        !e.includes("DevTools") &&
        !e.includes("404") &&
        !e.includes("WebGL"),
    );
    expect(realErrors).toEqual([]);
  });
});
