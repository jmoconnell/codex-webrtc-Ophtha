import { test, expect } from "@playwright/test";

test("should allow a user to log in, start a session, and send a chat message", async ({
  page,
}) => {
  await page.goto("http://localhost:3000");

  // Log in
  await page.fill('input[name="username"]', "test@example.com");
  await page.fill('input[name="password"]', "password");
  await page.fill('input[name="dob"]', "2000-01-01");
  await page.click('button[type="submit"]');

  // Wait for authentication to complete
  await expect(page.locator("text=Authenticated")).toBeVisible();

  // Start a session
  await page.click("text=Connect to Voice Session");

  // Wait for the session to connect
  await expect(page.locator("text=Assistant connected")).toBeVisible();

  // Check for video element
  const videoElement = await page.locator("video");
  await expect(videoElement).toBeVisible();

  // Send a chat message
  await page.fill('input[type="text"]', "Hello, assistant!");
  await page.click("text=Send");

  // Check if the message appears in the transcript
  await expect(page.locator('text=Patient: Hello, assistant!')).toBeVisible();
});
