import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Customer transition contract — rendered assertions.
 *
 * Source: DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md (frozen).
 * Each test names the clause it enforces. These are the checks Blueprint §10
 * requires QA_READY to confirm, and the reason the previous source-string test
 * was not sufficient: it asserted on copy, so any rewording defeated it.
 */

const HEADLINE = /^Know your .+\. Find the right part\.$/;

/** The visual window: the artwork plus its hit map, excluding page chrome. */
function transitionWindow(page: Page): Locator {
  return page.getByRole('region', { name: /vehicle|transformation|visual/i }).first();
}

async function startFlow(page: Page) {
  await page.goto('/?autostart=1&source=garage');
  await expect(transitionWindow(page)).toBeVisible();
}

test.describe('transition window chrome (§4.2)', () => {
  test('shows the model headline and nothing else', async ({ page }) => {
    await startFlow(page);
    const window = transitionWindow(page);

    const headings = await window.getByRole('heading').allInnerTexts();
    const matching = headings.filter((text) => HEADLINE.test(text.trim()));
    expect(matching, `headings found: ${JSON.stringify(headings)}`).toHaveLength(1);
  });

  test('contains no progress semantics', async ({ page }) => {
    await startFlow(page);
    const window = transitionWindow(page);

    await expect(window.getByRole('progressbar')).toHaveCount(0);
    await expect(window.locator('progress')).toHaveCount(0);
    await expect(window.locator('[aria-valuenow]')).toHaveCount(0);
    // Percentage text is the other common form.
    await expect(window.getByText(/\b\d{1,3}\s*%/)).toHaveCount(0);
  });

  test('offers no playback control', async ({ page }) => {
    await startFlow(page);
    const window = transitionWindow(page);

    // Asserted on control semantics, not on button labels, so re-wording
    // cannot reintroduce them.
    const controls = window.getByRole('button', {
      name: /play|pause|restart|replay|scrub|seek|skip|stop/i,
    });
    await expect(controls).toHaveCount(0);
    await expect(window.locator('input[type="range"]')).toHaveCount(0);
  });

  test('never presents a Technical stage (§4.1)', async ({ page }) => {
    await startFlow(page);
    const window = transitionWindow(page);
    await expect(window.getByText(/\btechnical\b/i)).toHaveCount(0);
    // Stage labels of any kind are prohibited inside the window.
    await expect(window.getByText(/\b(hero|cgi|line art|exploded|browse)\b/i)).toHaveCount(0);
  });
});

test.describe('invisible hit map (§5.1, §5.4)', () => {
  test('draws no visible click target', async ({ page }) => {
    await startFlow(page);
    const window = transitionWindow(page);

    const regions = window.locator('[data-hit-region]');
    const count = await regions.count();
    expect(count, 'expected at least one hit region').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const styles = await regions.nth(i).evaluate((node) => {
        const computed = getComputedStyle(node);
        return {
          opacity: computed.opacity,
          background: computed.backgroundColor,
          borderWidth: computed.borderTopWidth,
          outlineWidth: computed.outlineWidth,
        };
      });
      // Invisible by default: no fill, no border, no outline.
      expect(styles.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      expect(parseFloat(styles.borderWidth)).toBe(0);
      expect(parseFloat(styles.outlineWidth)).toBe(0);
    }
  });

  test('hides hit regions from the accessibility tree and offers a keyboard equivalent', async ({
    page,
  }) => {
    await startFlow(page);

    // §5.4: screen-reader users get a semantic category list, not pixel
    // coordinates. The artwork itself is decorative.
    const regions = transitionWindow(page).locator('[data-hit-region]');
    const count = await regions.count();
    for (let i = 0; i < count; i++) {
      await expect(regions.nth(i)).toHaveAttribute('aria-hidden', 'true');
    }

    const categoryList = page.getByRole('list', { name: /categor/i });
    await expect(categoryList).toBeAttached();
    const links = categoryList.getByRole('link');
    await expect(links.first()).toBeAttached();
  });

  test('routes a body-region click into Body & Exterior for the selected vehicle (§5.2)', async ({
    page,
  }) => {
    await startFlow(page);
    const window = transitionWindow(page);

    const body = window.locator('[data-hit-region][data-visual-category="VC-BODY"]').first();
    await expect(body).toBeAttached();
    await body.click({ force: true });

    await page.waitForURL(/\/epc\/vehicles\/[a-z0-9-]+\/sections\/body-exterior/);
    const url = new URL(page.url());
    // §6.1: fitment travels with the click; §6.3: no raw source node id.
    expect(url.searchParams.get('fitment')).toBeTruthy();
    expect(url.pathname).not.toMatch(/node[_-]?id/i);
  });
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
      // WCAG 2.1 AA target size, and the Blueprint's "forgiving on mobile".
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

    // Navigation-ready immediately: the hit map is active without waiting for
    // an animation to play through.
    await expect(window.locator('[data-hit-region]').first()).toBeAttached({ timeout: 3_000 });
    await expect(window).toHaveAttribute('data-flow-state', /navigation-ready|complete/);
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

    // §3.4: "the faint treatment must remain readable and meet accessibility
    // contrast requirements". 4.5:1 is AA for body text.
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
});
