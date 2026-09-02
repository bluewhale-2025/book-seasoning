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

test("new messages do not pull a reader away from older conversation", async ({ page, request }) => {
  for (let index = 2; index <= 24; index += 1) {
    await request.post(
      "http://127.0.0.1:4174/v1/rooms/90000000-0000-4000-8000-000000000001/session/messages",
      {
        headers: { authorization: "Bearer participant" },
        data: {
          clientMessageId: `98000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          body: `스크롤 검증 메시지 ${index}`,
          replyToMessageId: null,
        },
      },
    );
  }

  await page.goto("/e2e/session.html?actor=host");
  const viewport = page.getByTestId("session-message-viewport");
  await expect(page.getByText("스크롤 검증 메시지 24")).toBeVisible();
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await viewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0);

  await request.post(
    "http://127.0.0.1:4174/v1/rooms/90000000-0000-4000-8000-000000000001/session/messages",
    {
      headers: { authorization: "Bearer participant" },
      data: {
        clientMessageId: "98000000-0000-4000-8000-000000000025",
        body: "과거를 읽는 동안 도착한 메시지",
        replyToMessageId: null,
      },
    },
  );

  await expect(page.getByRole("button", { name: "새 메시지 1개" })).toBeVisible();
  expect(await viewport.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByRole("button", { name: "새 메시지 1개" }).click();
  await expect
    .poll(() =>
      viewport.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "새 메시지 1개" })).toHaveCount(0);
  expect(await page.evaluate(() => document.body.scrollHeight)).toBe(
    await page.evaluate(() => window.innerHeight),
  );
});
