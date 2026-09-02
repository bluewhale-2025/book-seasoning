import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:4174/reset");
});

test("two isolated participants converge after realtime delivery and reconnect", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const participantContext = await browser.newContext();
  const host = await hostContext.newPage();
  const participant = await participantContext.newPage();

  await Promise.all([
    host.goto("/e2e/session.html?actor=host"),
    participant.goto("/e2e/session.html?actor=participant"),
  ]);
  await expect(host.getByText("첫 번째 확정 메시지")).toBeVisible();
  await expect(participant.getByText("첫 번째 확정 메시지")).toBeVisible();

  const participantComposer = participant.getByRole("textbox", { name: "토론 메시지" });
  await participant.getByText("첫 번째 확정 메시지").hover();
  await participant.getByRole("button", { name: "민수님에게 답장" }).click();
  await expect(participant.getByText("민수님에게 답장")).toBeVisible();
  await participantComposer.fill("수진의 새 관점");
  await expect(host.getByText("수진님이 입력 중…")).toBeVisible();
  await participantComposer.press("Enter");

  await expect(host.getByText("수진의 새 관점")).toBeVisible();
  await expect(participant.getByText("수진의 새 관점")).toBeVisible();
  await expect(host.locator("q").filter({ hasText: "첫 번째 확정 메시지" })).toBeVisible();

  await participantContext.close();
  const hostComposer = host.getByRole("textbox", { name: "토론 메시지" });
  await hostComposer.fill("연결이 끊긴 동안 확정된 메시지");
  await hostComposer.press("Enter");
  await expect(host.getByText("연결이 끊긴 동안 확정된 메시지")).toHaveCount(1);
  await expect(host.getByText("연결이 끊긴 동안 확정된 메시지")).toBeVisible();

  const reconnectedContext = await browser.newContext();
  const reconnected = await reconnectedContext.newPage();
  await reconnected.goto("/e2e/session.html?actor=participant");
  await expect(reconnected.getByText("연결이 끊긴 동안 확정된 메시지")).toHaveCount(1);
  await expect(reconnected.getByText("연결이 끊긴 동안 확정된 메시지")).toBeVisible();

  await hostContext.close();
  await reconnectedContext.close();
});

test("a failed message retries with one stable id and one confirmed row", async ({ page }) => {
  await page.goto("/e2e/session.html?actor=host");
  const composer = page.getByRole("textbox", { name: "토론 메시지" });
  await composer.fill("재시도 메시지");
  await composer.press("Enter");

  await expect(page.getByRole("alert")).toContainText("전송하지 못했습니다");
  await page.getByRole("button", { name: "같은 메시지 다시 보내기" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("재시도 메시지")).toHaveCount(1);
});

test("the discussion route has no automatic WCAG A/AA violations", async ({ page }) => {
  await page.goto("/e2e/session.html?actor=host");
  await expect(page.getByText("첫 번째 확정 메시지")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});
