#!/usr/bin/env bun

/**
 * Take a screenshot of the weather loop app for review
 * Usage: bun run scripts/screenshot.ts [output-path]
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

async function takeScreenshot(outputPath: string = '/tmp/weather-loop-screenshot.png') {
  console.log('Starting dev server and taking screenshot...');

  // Ensure output directory exists
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2, // Retina
  });
  const page = await context.newPage();

  try {
    // Navigate to local dev server
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 60000 });

    // Wait for satellite image to load
    await page.waitForSelector('.satellite-image', { timeout: 60000 });

    // Wait a moment for any animations
    await page.waitForTimeout(1000);

    // Take screenshot
    await page.screenshot({
      path: outputPath,
      fullPage: true,
    });

    console.log(`Screenshot saved to: ${outputPath}`);
  } catch (error) {
    console.error('Error taking screenshot:', error);
    throw error;
  } finally {
    await browser.close();
  }

  return outputPath;
}

// Run if executed directly
const outputPath = process.argv[2] || '/tmp/weather-loop-screenshot.png';
takeScreenshot(outputPath).catch((e) => {
  console.error(e);
  process.exit(1);
});
