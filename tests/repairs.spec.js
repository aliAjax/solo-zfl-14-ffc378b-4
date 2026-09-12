import { test, expect } from "@playwright/test";
import fs from "node:fs";

const STORAGE_KEY = "zfl-14-repairs";

const seedRepairs = [
  {
    id: "r1",
    location: "厨房",
    title: "水槽下方渗水",
    priority: "high",
    cost: 260,
    status: "todo",
    photo: "",
    note: "先检查软管接口",
    createdAt: 1000
  },
  {
    id: "r2",
    location: "卫生间",
    title: "马桶水箱漏水",
    priority: "medium",
    cost: 180,
    status: "doing",
    photo: "",
    note: "需要更换浮球",
    createdAt: 3000
  },
  {
    id: "r3",
    location: "卧室",
    title: "衣柜门松动",
    priority: "low",
    cost: 60,
    status: "done",
    photo: "",
    note: "合页螺丝滑丝",
    createdAt: 2000
  }
];

function seedState(overrides = {}) {
  return {
    filter: "all",
    search: "",
    sortBy: "created",
    sortDir: "desc",
    repairs: seedRepairs,
    ...overrides
  };
}

async function seedAndOpen(page, overrides) {
  // 仅在首次导航时播种，避免 reload 时覆盖应用已保存的状态
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    },
    [STORAGE_KEY, seedState(overrides)]
  );
  await page.goto("/");
}

// 外层 beforeEach 已播种并打开页面；需要自定义数据时覆盖后重新加载
async function reseedAndReload(page, overrides) {
  await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify(value)), [STORAGE_KEY, seedState(overrides)]);
  await page.reload();
}

const locations = (page) => page.locator(".repair h3").allTextContents();

test.beforeEach(async ({ page }) => {
  await seedAndOpen(page);
});

test.describe("搜索", () => {
  test("按位置过滤", async ({ page }) => {
    await page.locator("#search-input").fill("厨房");
    await expect(page.locator(".repair")).toHaveCount(1);
    expect(await locations(page)).toEqual(["厨房"]);
  });

  test("按问题描述过滤", async ({ page }) => {
    await page.locator("#search-input").fill("衣柜");
    await expect(page.locator(".repair")).toHaveCount(1);
    expect(await locations(page)).toEqual(["卧室"]);
  });

  test("按备注过滤", async ({ page }) => {
    await page.locator("#search-input").fill("浮球");
    await expect(page.locator(".repair")).toHaveCount(1);
    expect(await locations(page)).toEqual(["卫生间"]);
  });

  test("无匹配时显示空状态，清空后恢复", async ({ page }) => {
    await page.locator("#search-input").fill("不存在的内容");
    await expect(page.locator(".repair")).toHaveCount(0);
    await expect(page.locator(".empty")).toBeVisible();
    await page.locator("#search-input").fill("");
    await expect(page.locator(".repair")).toHaveCount(3);
  });

  test("搜索与状态筛选叠加生效", async ({ page }) => {
    await page.locator("#search-input").fill("水");
    await expect(page.locator(".repair")).toHaveCount(2);
    await page.locator("[data-filter='doing']").click();
    await expect(page.locator(".repair")).toHaveCount(1);
    expect(await locations(page)).toEqual(["卫生间"]);
  });
});

test.describe("排序", () => {
  test("默认按创建时间降序", async ({ page }) => {
    expect(await locations(page)).toEqual(["卫生间", "卧室", "厨房"]);
  });

  test("按预计费用排序并切换方向", async ({ page }) => {
    await page.locator("#sort-by").selectOption("cost");
    expect(await locations(page)).toEqual(["厨房", "卫生间", "卧室"]);
    await page.locator("#sort-dir").click();
    expect(await locations(page)).toEqual(["卧室", "卫生间", "厨房"]);
    await expect(page.locator("#sort-dir")).toHaveText("↑ 升序");
  });

  test("按优先级排序并切换方向", async ({ page }) => {
    await page.locator("#sort-by").selectOption("priority");
    expect(await locations(page)).toEqual(["厨房", "卫生间", "卧室"]);
    await page.locator("#sort-dir").click();
    expect(await locations(page)).toEqual(["卧室", "卫生间", "厨房"]);
  });

  test("按创建时间升序", async ({ page }) => {
    await page.locator("#sort-dir").click();
    expect(await locations(page)).toEqual(["厨房", "卧室", "卫生间"]);
  });
});

test.describe("刷新后数据一致", () => {
  test("新增事项刷新后仍在，统计一致", async ({ page }) => {
    await page.locator("input[name='location']").fill("阳台");
    await page.locator("textarea[name='title']").fill("晾衣架松动");
    await page.locator("select[name='priority']").selectOption("medium");
    await page.locator("input[name='cost']").fill("120");
    await page.locator("button[type='submit']").click();
    await expect(page.locator(".repair")).toHaveCount(4);

    await page.reload();
    await expect(page.locator(".repair")).toHaveCount(4);
    await expect(page.locator(".repair h3", { hasText: "阳台" })).toBeVisible();
    // 统计：未完成 3 项（阳台/厨房/卫生间），预计费用 120+260+180
    await expect(page.locator(".stat", { hasText: "未完成" }).locator("strong")).toHaveText("3");
    await expect(page.locator(".stat", { hasText: "预计费用" }).locator("strong")).toHaveText("¥560");
  });

  test("搜索词和排序设置刷新后保留", async ({ page }) => {
    await page.locator("#search-input").fill("水");
    await page.locator("#sort-by").selectOption("cost");
    await page.locator("#sort-dir").click();

    await page.reload();
    await expect(page.locator("#search-input")).toHaveValue("水");
    await expect(page.locator("#sort-by")).toHaveValue("cost");
    await expect(page.locator("#sort-dir")).toHaveText("↑ 升序");
    expect(await locations(page)).toEqual(["卫生间", "厨房"]);
  });

  test("状态流转和删除刷新后保持", async ({ page }) => {
    await page.locator("[data-status='r1']").selectOption("done");
    await page.locator("[data-delete='r2']").click();
    await expect(page.locator(".repair")).toHaveCount(2);

    await page.reload();
    await expect(page.locator(".repair")).toHaveCount(2);
    await expect(page.locator("[data-status='r1']")).toHaveValue("done");
    await expect(page.locator(".repair h3", { hasText: "卫生间" })).toHaveCount(0);
    await expect(page.locator(".stat", { hasText: "未完成" }).locator("strong")).toHaveText("0");
  });
});

test.describe("原有功能回归", () => {
  test("新增、状态流转、删除与统计", async ({ page }) => {
    await expect(page.locator(".stat", { hasText: "未完成" }).locator("strong")).toHaveText("2");
    await expect(page.locator(".stat", { hasText: "处理中" }).locator("strong")).toHaveText("1");
    await expect(page.locator(".stat", { hasText: "预计费用" }).locator("strong")).toHaveText("¥440");

    await page.locator("input[name='location']").fill("客厅");
    await page.locator("textarea[name='title']").fill("插座面板开裂");
    await page.locator("input[name='cost']").fill("80");
    await page.locator("button[type='submit']").click();
    await expect(page.locator(".stat", { hasText: "未完成" }).locator("strong")).toHaveText("3");
    await expect(page.locator(".stat", { hasText: "预计费用" }).locator("strong")).toHaveText("¥520");

    const added = page.locator(".repair", { hasText: "客厅" });
    await added.locator("select[data-status]").selectOption("done");
    await expect(page.locator(".stat", { hasText: "未完成" }).locator("strong")).toHaveText("2");

    await page.locator("[data-filter='done']").click();
    await expect(page.locator(".repair")).toHaveCount(2);
    await page.locator(".repair", { hasText: "客厅" }).locator("[data-delete]").click();
    await expect(page.locator(".repair")).toHaveCount(1);
  });
});

test.describe("照片加载失败", () => {
  const brokenPhoto = {
    id: "r4",
    location: "阳台",
    title: "晾衣架松动",
    priority: "medium",
    cost: 120,
    status: "todo",
    photo: "/missing-photo.png",
    note: "周末处理",
    createdAt: 4000
  };

  test("显示替代占位文字而非破裂图标", async ({ page }) => {
    await reseedAndReload(page, { repairs: [...seedRepairs, brokenPhoto] });
    const photo = page.locator(".repair", { hasText: "阳台" }).locator(".photo");
    await expect(photo).toHaveText("照片加载失败");
    await expect(photo.locator("img")).toHaveCount(0);
  });

  test("有效照片仍正常显示为图片", async ({ page }) => {
    const validPhoto = {
      ...brokenPhoto,
      photo: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
    };
    await reseedAndReload(page, { repairs: [...seedRepairs, validPhoto] });
    const img = page.locator(".repair", { hasText: "阳台" }).locator(".photo img");
    await expect(img).toBeVisible();
    expect(await img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
  });

  test("不中断搜索、排序、状态流转、删除和统计", async ({ page }) => {
    await reseedAndReload(page, { repairs: [...seedRepairs, brokenPhoto] });
    await expect(page.locator(".repair", { hasText: "阳台" }).locator(".photo")).toHaveText("照片加载失败");

    // 统计包含坏照片事项：未完成 3 项，预计费用 260+180+120
    await expect(page.locator(".stat", { hasText: "未完成" }).locator("strong")).toHaveText("3");
    await expect(page.locator(".stat", { hasText: "预计费用" }).locator("strong")).toHaveText("¥560");

    // 搜索仍能找到该事项
    await page.locator("#search-input").fill("晾衣架");
    await expect(page.locator(".repair")).toHaveCount(1);
    await page.locator("#search-input").fill("");

    // 排序正常：创建时间降序，阳台（createdAt 最大）在最前
    expect(await locations(page)).toEqual(["阳台", "卫生间", "卧室", "厨房"]);

    // 状态流转正常
    await page.locator("[data-status='r4']").selectOption("done");
    await expect(page.locator(".stat", { hasText: "未完成" }).locator("strong")).toHaveText("2");

    // 删除正常
    await page.locator("[data-delete='r4']").click();
    await expect(page.locator(".repair")).toHaveCount(3);
    await expect(page.locator(".stat", { hasText: "预计费用" }).locator("strong")).toHaveText("¥440");
  });
});

test.describe("清空已完成", () => {
  test("只移除已完成事项，未完成保留，统计同步", async ({ page }) => {
    await expect(page.locator("#clear-done")).toHaveText("清空已完成（1）");
    await page.locator("#clear-done").click();

    // 已完成（卧室）被移除，待处理和处理中保留
    await expect(page.locator(".repair")).toHaveCount(2);
    expect(await locations(page)).toEqual(["卫生间", "厨房"]);
    await expect(page.locator(".repair h3", { hasText: "卧室" })).toHaveCount(0);

    // 统计同步：未完成 2、处理中 1、预计费用 260+180
    await expect(page.locator(".stat", { hasText: "未完成" }).locator("strong")).toHaveText("2");
    await expect(page.locator(".stat", { hasText: "处理中" }).locator("strong")).toHaveText("1");
    await expect(page.locator(".stat", { hasText: "预计费用" }).locator("strong")).toHaveText("¥440");

    // 没有已完成事项后按钮禁用
    await expect(page.locator("#clear-done")).toBeDisabled();
  });

  test("刷新后清空结果一致", async ({ page }) => {
    await page.locator("#clear-done").click();
    await expect(page.locator(".repair")).toHaveCount(2);

    await page.reload();
    await expect(page.locator(".repair")).toHaveCount(2);
    await expect(page.locator(".repair h3", { hasText: "卧室" })).toHaveCount(0);
    await expect(page.locator("#clear-done")).toBeDisabled();

    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(saved.repairs).toHaveLength(2);
    expect(saved.repairs.every((repair) => repair.status !== "done")).toBe(true);
  });

  test("状态流转出已完成项后按钮恢复可用并可再次清空", async ({ page }) => {
    await page.locator("#clear-done").click();
    await expect(page.locator("#clear-done")).toBeDisabled();

    await page.locator("[data-status='r1']").selectOption("done");
    await expect(page.locator("#clear-done")).toBeEnabled();
    await expect(page.locator("#clear-done")).toHaveText("清空已完成（1）");

    await page.locator("#clear-done").click();
    await expect(page.locator(".repair")).toHaveCount(1);
    expect(await locations(page)).toEqual(["卫生间"]);
  });

  test("清空后搜索、排序、新增保持可用", async ({ page }) => {
    await page.locator("#clear-done").click();

    await page.locator("#search-input").fill("马桶");
    await expect(page.locator(".repair")).toHaveCount(1);
    await page.locator("#search-input").fill("");

    await page.locator("#sort-by").selectOption("cost");
    await page.locator("#sort-dir").click();
    expect(await locations(page)).toEqual(["卫生间", "厨房"]);

    await page.locator("input[name='location']").fill("客厅");
    await page.locator("textarea[name='title']").fill("插座面板开裂");
    await page.locator("button[type='submit']").click();
    await expect(page.locator(".repair")).toHaveCount(3);
  });
});

test.describe("导出", () => {
  function expectedStamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  test("导出文件名带日期，内容为当前全部维修事项", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-json").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(`维修事项-${expectedStamp()}.json`);

    const content = JSON.parse(fs.readFileSync(await download.path(), "utf-8"));
    expect(content).toEqual(seedRepairs);
  });

  test("导出不改变本地存储和页面状态", async ({ page }) => {
    const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-json").click();
    const download = await downloadPromise;
    await download.path();

    const after = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(after).toBe(before);
    await expect(page.locator(".repair")).toHaveCount(3);
    await expect(page.locator(".stat", { hasText: "未完成" }).locator("strong")).toHaveText("2");
  });

  test("导出后搜索、排序、新增、状态流转保持可用", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-json").click();
    await (await downloadPromise).path();

    await page.locator("#search-input").fill("水槽");
    await expect(page.locator(".repair")).toHaveCount(1);
    await page.locator("#search-input").fill("");

    await page.locator("#sort-by").selectOption("cost");
    expect(await locations(page)).toEqual(["厨房", "卫生间", "卧室"]);

    await page.locator("input[name='location']").fill("客厅");
    await page.locator("textarea[name='title']").fill("插座面板开裂");
    await page.locator("button[type='submit']").click();
    await expect(page.locator(".repair")).toHaveCount(4);

    await page.locator("[data-status='r1']").selectOption("done");
    await expect(page.locator(".stat", { hasText: "未完成" }).locator("strong")).toHaveText("2");
  });
});
