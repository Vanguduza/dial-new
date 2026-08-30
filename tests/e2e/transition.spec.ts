import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Customer transition contract — rendered assertions.
 *
 * Source: DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md v2.2 (frozen).
 * Each test names the clause it enforces.
 *
 * v2.2 changed §4.2 from one permitted text element to two. The previous
 * version of this file asserted a single headline and screened for stage-label
 * words including "browse" — which now appears in the *required* top
 * instruction, so it would have reported the mandated copy as a violation.
 */

const BROWSE_INSTRUCTION = /^click on the category image to browse parts$/i;
const HEADLINE = /^Know your .+\. Find the right part\.$/;

/** The visual window: the artwork plus its hit map, excluding page chrome. */
function transitionWindow(page: Page): Locator {
  return page.getByRole('region', { name: /vehicle|transformation|visual/i }).first();
}

async function startFlow(page: Page) {
  await page.goto('/?autostart=1&source=garage');
  await expect(transitionWindow(page)).toBeVisible();
}

test.describe('transition window content (§4.2)', () => {
  test('shows exactly the two permitted text elements', async ({ page }) => {
    await startFlow(page);
    const window = transitionWindow(page);

    await expect(window.getByText(BROWSE_INSTRUCTION)).toHaveCount(1);
    await expect(window.getByText(HEADLINE)).toHaveCount(1);

    // Nothing else. Every visible text node in the window must be one of the
    // two, rather than screening for a list of forbidden words — a denylist
    // cannot catch copy nobody thought to forbid.
    const texts: string[] = await window.evaluate((root) => {
      const out: string[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        const text = (node.textContent ?? '').trim();
        if (text && parent && getComputedStyle(parent).visibility !== 'hidden') {
          const rect = parent.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) out.push(text);
        }
        node = walker.nextNode();
      }
      return out;
    });

    const unexpected = texts.filter(
      (text) => !BROWSE_INSTRUCTION.test(text) && !HEADLINE.test(text),
    );
    expect(unexpected, `unexpected text inside the transition window`).toEqual([]);
  });

  test('places the instruction at the top and the headline at the bottom-left', async ({ page }) => {
    await startFlow(page);
    const window = transitionWindow(page);

    const frame = await window.boundingBox();
    const instruction = await window.getByText(BROWSE_INSTRUCTION).boundingBox();
    const headline = await window.getByText(HEADLINE).boundingBox();
    expect(frame && instruction && headline).toBeTruthy();
    if (!frame || !instruction || !headline) return;

    // Instruction in the upper third.
    expect(instruction.y - frame.y).toBeLessThan(frame.height / 3);
    // Headline in the lower third and the left half.
    expect(headline.y - frame.y).toBeGreaterThan((frame.height * 2) / 3);
    expect(headline.x - frame.x).toBeLessThan(frame.width / 2);

    // §4.2: restrained size and maximum width, so it does not cover the vehicle.
    expect(headline.width).toBeLessThan(frame.width * 0.55);
    expect(headline.height).toBeLessThan(frame.height * 0.2);
  });

  test('contains no progress semantics', async ({ page }) => {
    await startFlow(page);
    const window = transitionWindow(page);

    await expect(window.getByRole('progressbar')).toHaveCount(0);
    await expect(window.locator('progress')).toHaveCount(0);
    await expect(window.locator('[aria-valuenow]')).toHaveCount(0);
    await expect(window.getByText(/\b\d{1,3}\s*%/)).toHaveCount(0);
  });

  test('offers no playback control', async ({ page }) => {
    await startFlow(page);
    const window = transitionWindow(page);

    // Asserted on control semantics, not labels, so re-wording cannot
    // reintroduce them.
    await expect(
      window.getByRole('button', { name: /play|pause|restart|replay|scrub|seek|skip|stop/i }),
    ).toHaveCount(0);
    await expect(window.locator('input[type="range"]')).toHaveCount(0);
  });
});

test.describe('invisible hit map (§5.1, §5.4)', () => {
  test('draws no visible click target', async ({ page }) => {
    await startFlow(page);
    const regions = transitionWindow(page).locator('[data-hit-region]');
    const count = await regions.count();
    expect(count, 'expected at least one hit region').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const styles = await regions.nth(i).evaluate((node) => {
        const computed = getComputedStyle(node);
        return {
          background: computed.backgroundColor,
          borderWidth: computed.borderTopWidth,
          outlineWidth: computed.outlineWidth,
        };
      });
      expect(styles.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      expect(parseFloat(styles.borderWidth)).toBe(0);
      expect(parseFloat(styles.outlineWidth)).toBe(0);
    }
  });

  test('hides hit regions from the accessibility tree and offers a keyboard equivalent', async ({
    page,
  }) => {
    await startFlow(page);
    const regions = transitionWindow(page).locator('[data-hit-region]');
    const count = await regions.count();
    for (let i = 0; i < count; i++) {
      await expect(regions.nth(i)).toHaveAttribute('aria-hidden', 'true');
    }

    const categoryList = page.getByRole('list', { name: /categor/i });
    await expect(categoryList).toBeAttached();
    await expect(categoryList.getByRole('link').first()).toBeAttached();
  });

  /**
   * §5.1: "A broad Chassis or Body region must never capture a point visibly
   * occupied by the engine or transmission."
   *
   * §5.4 requires desktop and mobile coordinate-probe fixtures for
   * representative Engine, Transmission, Chassis and Body points, each
   * resolving its expected vehicle-scoped section URL.
   */
  const probes = [
    { category: 'VC-ENG', section: 'engine' },
    { category: 'VC-TRN', section: 'transmission-drivetrain' },
    { category: 'VC-FBRK', section: 'chassis-systems' },
    { category: 'VC-BODY', section: 'body-exterior' },
  ];

  for (const probe of probes) {
    test(`probe: ${probe.category} resolves to ${probe.section}`, async ({ page }) => {
      await startFlow(page);
      const region = transitionWindow(page)
        .locator(`[data-hit-region][data-visual-category="${probe.category}"]`)
        .first();
      await expect(region).toBeAttached();

      // Click the region's centre — the point visibly occupied by that system.
      const box = await region.boundingBox();
      expect(box).toBeTruthy();
      if (!box) return;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

      await page.waitForURL(
        new RegExp(`/epc/vehicles/[a-z0-9-]+/sections/${probe.section}`),
        { timeout: 15_000 },
      );
      const url = new URL(page.url());
      // §6.1 fitment travels with the click; §6.3 no raw source node id.
      expect(url.searchParams.get('fitment')).toBeTruthy();
      expect(url.pathname).not.toMatch(/node[_-]?id/i);
    });
  }
});

test.describe('mobile (§5.1)', () => {
  test.skip(({ browserName }, testInfo) => testInfo.project.name !== 'mobile', 'mobile only');

  test('hit regions are forgiving enough to tap', async ({ page }) => {
    await startFlow(page);
    const regions = transitionWindow(page).locator('[data-hit-region]');
    const count = await regions.count();
    for (let i = 0; i < count; i++) {
      const box = await regions.nth(i).boundingBox();
      if (!box) continue;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('reduced motion (§4.3)', () => {
  test.skip(
    ({ browserName }, testInfo) => testInfo.project.name !== 'reduced-motion',
    'reduced-motion project only',
  );

  test('cuts directly to the stable exploded result', async ({ page }) => {
    await startFlow(page);
    const window = transitionWindow(page);
    await expect(window.locator('[data-hit-region]').first()).toBeAttached({ timeout: 3_000 });
    await expect(window).toHaveAttribute('data-flow-state', /navigation-ready|complete/);
  });
});

/**
 * §3.3, §3.5, §4.5 — completion memory. New in v2.2.
 *
 * Returning to the homepage with the same vehicle must restore the settled
 * exploded view rather than replaying; changing an identity-bearing value must
 * invalidate that memory.
 */
test.describe('completion memory (§4.5)', () => {
  test('returning with the same vehicle restores the settled view without replay', async ({
    page,
  }) => {
    await startFlow(page);
    const window = transitionWindow(page);
    await expect(window).toHaveAttribute('data-flow-state', /navigation-ready|complete/, {
      timeout: 30_000,
    });

    // Into EPC and back.
    await page.getByRole('list', { name: /categor/i }).getByRole('link').first().click();
    await page.waitForURL(/\/epc\//);
    await page.goBack();

    // Settled immediately — no replay from the beginning.
    await expect(transitionWindow(page)).toHaveAttribute(
      'data-flow-state',
      /navigation-ready|complete/,
      { timeout: 3_000 },
    );
    await expect(transitionWindow(page).locator('[data-hit-region]').first()).toBeAttached();
  });

  test('editing an identity-bearing value invalidates the completion match', async ({ page }) => {
    await startFlow(page);
    await expect(transitionWindow(page)).toHaveAttribute(
      'data-flow-state',
      /navigation-ready|complete/,
      { timeout: 30_000 },
    );

    // Committed values stay visible and faint until edited (§3.4).
    const committed = page.locator('[data-committed="true"]').first();
    await expect(committed).toBeAttached();

    const cascade = page.getByRole('group', { name: /vehicle selection|progressive/i });
    const firstField = cascade.getByRole('combobox').first();
    await firstField.click();
    // Editing must reset the previous vehicle's transition (§3.4).
    await expect(page.locator('[data-committed="true"]')).toHaveCount(0);
  });
});

test.describe('committed selection (§3.4)', () => {
  test('keeps committed values readable at AA contrast', async ({ page }) => {
    await startFlow(page);
    const committed = page.locator('[data-committed="true"]').first();
    await expect(committed).toBeAttached();

    const contrast = await committed.evaluate((node) => {
      const parse = (value: string) => value.match(/\d+(\.\d+)?/g)!.map(Number);
      const luminance = ([r, g, b]: number[]) => {
        const channel = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      let element: HTMLElement | null = node as HTMLElement;
      let background = 'rgba(0, 0, 0, 0)';
      while (element && /rgba\(0, 0, 0, 0\)|transparent/.test(background)) {
        background = getComputedStyle(element).backgroundColor;
        element = element.parentElement;
      }
      const a = luminance(parse(getComputedStyle(node as HTMLElement).color));
      const b = luminance(parse(background));
      const [light, dark] = a > b ? [a, b] : [b, a];
      return (light + 0.05) / (dark + 0.05);
    });

    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
});
