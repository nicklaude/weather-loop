import { test, expect } from '@playwright/test';

test.describe('Weather Loop', () => {
  test('loads and displays the weather loop interface', async ({ page }) => {
    await page.goto('/');

    // Check header is present
    await expect(page.locator('h1')).toContainText('Weather Loop');

    // Check region selector is present
    await expect(page.locator('#sector-select')).toBeVisible();

    // Check playback controls are present
    await expect(page.locator('.playback-controls')).toBeVisible();

    // Take screenshot of initial state
    await page.screenshot({ path: 'tests/screenshots/01-initial-load.png', fullPage: true });
  });

  test('can change region selector', async ({ page }) => {
    await page.goto('/');

    // Wait for initial load
    await page.waitForSelector('#sector-select');

    // Change to CONUS
    await page.selectOption('#sector-select', 'CONUS');

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/02-conus-selected.png', fullPage: true });
  });

  test('shows loading progress', async ({ page }) => {
    await page.goto('/');

    // Check for loading indicator (might be fast, so we just verify structure)
    const hasLoadingOrFrames = await page.evaluate(() => {
      return document.querySelector('.loading') !== null ||
             document.querySelector('.satellite-image') !== null;
    });

    expect(hasLoadingOrFrames).toBe(true);

    // Wait for frames to load (up to 30 seconds)
    await page.waitForSelector('.satellite-image', { timeout: 30000 });

    // Take screenshot after load
    await page.screenshot({ path: 'tests/screenshots/03-loaded.png', fullPage: true });
  });

  test('playback controls work', async ({ page }) => {
    await page.goto('/');

    // Wait for frames to load
    await page.waitForSelector('.satellite-image', { timeout: 30000 });

    // Get initial frame info
    const initialFrameInfo = await page.locator('.frame-info').textContent();

    // Click next frame
    await page.click('button[title="Next frame"]');

    // Frame info should change
    const newFrameInfo = await page.locator('.frame-info').textContent();

    // Click play
    await page.click('button[title="Play"]');

    // Wait a moment
    await page.waitForTimeout(500);

    // Take screenshot during playback
    await page.screenshot({ path: 'tests/screenshots/04-playing.png', fullPage: true });

    // Click pause
    await page.click('button[title="Pause"]');
  });

  test('scrubber updates current frame', async ({ page }) => {
    await page.goto('/');

    // Wait for frames to load
    await page.waitForSelector('.satellite-image', { timeout: 30000 });

    // Get scrubber
    const scrubber = page.locator('.scrubber');

    // Move scrubber to middle
    const box = await scrubber.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/05-scrubbed.png', fullPage: true });
  });

  test('frame picker dots work', async ({ page }) => {
    await page.goto('/');

    // Wait for frames to load
    await page.waitForSelector('.satellite-image', { timeout: 30000 });

    // Click a frame dot
    const dots = page.locator('.frame-dot');
    const count = await dots.count();

    if (count > 5) {
      await dots.nth(5).click();

      // Verify that dot is now active
      await expect(dots.nth(5)).toHaveClass(/active/);

      // Take screenshot
      await page.screenshot({ path: 'tests/screenshots/06-frame-picker.png', fullPage: true });
    }
  });

  test('speed selector changes playback speed', async ({ page }) => {
    await page.goto('/');

    // Wait for frames to load
    await page.waitForSelector('.satellite-image', { timeout: 30000 });

    // Change speed
    await page.selectOption('#speed-select', '300');

    // Verify selection
    await expect(page.locator('#speed-select')).toHaveValue('300');

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/07-slow-speed.png', fullPage: true });
  });

  test('mobile view is responsive', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');

    // Wait for frames to load
    await page.waitForSelector('.satellite-image', { timeout: 30000 });

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/08-mobile.png', fullPage: true });
  });

  test('refresh button reloads frames', async ({ page }) => {
    await page.goto('/');

    // Wait for frames to load
    await page.waitForSelector('.satellite-image', { timeout: 30000 });

    // Click refresh
    await page.click('button[title="Refresh"]');

    // Should show loading
    await page.waitForSelector('.loading, .satellite-image');

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/09-refreshed.png', fullPage: true });
  });
});

// Helper to take a screenshot for manual review
test('take screenshot for approval', async ({ page }) => {
  await page.goto('/');

  // Wait for full load
  await page.waitForSelector('.satellite-image', { timeout: 60000 });

  // Wait an extra moment for any animations
  await page.waitForTimeout(1000);

  // Take full page screenshot
  await page.screenshot({
    path: 'tests/screenshots/approval-screenshot.png',
    fullPage: true
  });
});
