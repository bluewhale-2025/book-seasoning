import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("discussion discovery keeps status and availability separate", async ({ page }) => {
  await page.goto("/e2e/product.html?route=find");
  await expect(page.getByRole("heading", { name: "함께 읽을 토론을 찾아보세요" })).toBeVisible();
  await expect(page.getByText("시작 예정")).toBeVisible();
  await expect(page.getByText("토론 중")).toBeVisible();
  await expect(page.getByText("참여 가능", { exact: true })).toHaveCount(2);
});

test("product routes reflow at 360px without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/e2e/product.html?route=find");
  await expect(page.getByRole("heading", { name: "함께 읽을 토론을 찾아보세요" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);

  await page.goto("/e2e/product.html?route=waiting");
  await expect(page.getByRole("heading", { name: "참가자" })).toBeVisible();
  const waitingDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(waitingDimensions.scrollWidth).toBe(waitingDimensions.clientWidth);
});

test("discussion discovery has no automatic WCAG A/AA violations", async ({ page }) => {
  await page.goto("/e2e/product.html?route=find");
  await expect(page.getByText("침묵과 책임에 관하여")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("waiting room keeps preparation optional and host controls role-scoped", async ({ page }) => {
  await page.goto("/e2e/product.html?route=waiting");
  await expect(page.getByRole("heading", { name: "참가자" })).toBeVisible();
  await expect(page.getByText("접속 중").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "방 설정" })).toBeVisible();
  await expect(page.getByRole("button", { name: "토론 시작" })).toBeDisabled();
  await expect(page.getByText("작성하지 않아도 토론에 참여할 수 있어요.")).toBeVisible();
  await expect(page.getByText("기억하지 않는 것도 하나의 선택일까요?")).toBeVisible();
});

test("waiting room has no automatic WCAG A/AA violations", async ({ page }) => {
  await page.goto("/e2e/product.html?route=waiting");
  await expect(page.getByText("기억하지 않는 것도 하나의 선택일까요?")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("ended discussion keeps the official record primary and original sources readable", async ({ page }) => {
  await page.goto("/e2e/product.html?route=result");
  await expect(page.getByRole("heading", { name: "우리가 오래 머문 쟁점" })).toBeVisible();
  await expect(page.getByText("침묵은 선택인가")).toBeVisible();
  await expect(page.getByText(/타인의 침묵을 쉽게 단정하지 않겠다/)).toBeVisible();

  await page.getByRole("tab", { name: "전체 대화" }).click();
  await expect(page.getByText("침묵을 개인의 선택만으로 볼 수 있을까요?")).toBeVisible();

  await page.getByRole("tab", { name: "사전 입력" }).click();
  await expect(page.getByRole("heading", { name: "함께 본 준비" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 준비" })).toBeVisible();
  await expect(page.getByText("나는 침묵을 회피라고만 생각하고 있었다.")).toBeVisible();
});

test("ended discussion reflows at 360px and has no automatic WCAG A/AA violations", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/e2e/product.html?route=result");
  await expect(page.getByText("침묵은 선택인가")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("Book Context admin flow reflows and keeps its editor accessible", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/e2e/product.html?route=admin-list");
  await expect(page.getByRole("heading", { name: "Book Context" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "데미안" })).toBeVisible();

  await page.goto("/e2e/product.html?route=admin-pack");
  await expect(page.getByRole("heading", { name: "책 정보", exact: true })).toBeVisible();
  await page.getByLabel("편집할 섹션").selectOption("THEMES");
  await expect(page.getByRole("heading", { name: "주제" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "제목" })).toHaveValue("두 세계");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("account deletion shows impact before credentials and reflows at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/e2e/product.html?route=profile");
  await page.getByRole("button", { name: "계정 탈퇴" }).click();
  await expect(page.getByText("공동 기록 21개 유지")).toBeVisible();
  await expect(page.getByText("비공개 사전 입력 1개 삭제")).toBeVisible();
  await expect(page.getByRole("button", { name: "영구 탈퇴" })).toBeDisabled();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});
