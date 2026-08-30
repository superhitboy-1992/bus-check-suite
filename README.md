# 公交检查助手（驻站检查 + 跳车检查 合并版）

把原「公交跳车检查助手」与「驻站检查登记系统」合并为一个纯前端单机应用：
**首页双入口**进入驻站检查或跳车检查；线路（含车队）、站点、车号、检查人/驻站人、
驾驶员、售票员等基础资料**统一维护一份**，两个模块自动互通；备份合并为一个 JSON 文件，
并兼容导入两个旧应用导出的备份（并集合并，不会互相覆盖）。

数据仅保存在浏览器 `localStorage`，无后端、无登录、可离线使用（PWA）。

## 功能

### 驻站检查（`#/station/reg`、`#/station/list`、`#/station/export`）

- 登记：站点、驻站人、日期为「本次检查信息」，逐车登记后保留；车辆信息（时间、线路、
  车号、上客人数、进出站规范 √/×、售票员招呼 √/×、检查情况、整改措施、备注）保存后自动清空。
- 快捷输入：线路按「车队 → 线路」两级选择，支持汉字与拼音首字母/全拼模糊匹配；
  车号自动统一格式（去空格/横线、字母大写）；输入车号后自动补当前时间。
- 查询：按日期、站点、线路、关键字筛选，可编辑/删除。
- 导出：按「日期 + 站点」分组，以内置《驻站记录表【日期】.xlsx》模板生成表格
  （固定 30 行、A4 打印格式），支持单张导出与批量 ZIP；手机上可直接分享到微信/邮件。
- 备份提醒：登记达 50 条或距上次备份超 7 天时提示。

### 跳车检查（`#/jump`、`#/statistics`、`#/export`）

- 台账：列表/当日表格视图、筛选、分页、编辑、删除；
- 新建：14 项检查项三态（合格/不合格/待确认）、驾驶员/售票员、上下车时间/地点；
- 统计：日/周/月 + 线路/检查人筛选，合格率、项目合格率、不合格项 Top 10；
- 导出：Excel (.xlsx) / CSV，表头与原版应用一致。

### 基础数据（`#/basic-data`）

统一页签：线路（含车队归属）/ 站点 / 车号 / 检查人 / 驾驶员 / 售票员 / 车队管理 /
Excel 导入 / 备份恢复。首次打开会自动内置线路、车队、站点、驻站人名单（来自
`src/data/catalogSeed.js`），也可从现成 Excel 一键导入补充。

## 运行

需要 Node.js（≥ 18）与包管理器（pnpm 或 npm）。

```bash
pnpm install
pnpm dev        # 开发服务器，监听 0.0.0.0，本机 http://localhost:5173
```

手机与电脑连同一 Wi-Fi 后，浏览器打开 `http://<电脑局域网IP>:5173`。

```bash
pnpm build      # 产物在 dist/
pnpm preview    # 本地预览构建产物
pnpm test       # Vitest 单元与页面测试
```

## 从旧应用迁移（重要）

新旧应用部署在不同网址，localStorage 互不相通，请按以下步骤把旧数据带过来：

1. 旧跳车检查：在旧应用打开「基础数据 → 备份/恢复」→ 导出 JSON 备份；
2. 旧驻站检查：在旧应用打开「设置 → 导出数据（JSON）」→ 导出备份；
3. 新应用：打开「基础数据 → 备份/恢复」→ 选择备份文件导入（可依次导入两份）。

导入采用**并集合并**：记录按 id 去重、资料库按名称去重，先导入哪份都可以，不会互相覆盖。
旧应用的备份文件与既有数据保留在旧网址里，作为兜底，确认无误后可把旧仓库归档停用。

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库（如 `bus-check-suite`），把本目录推送上去；
2. 仓库 `Settings → Pages`，Source 选择 `GitHub Actions`（仓库已带
   `.github/workflows/deploy.yml`，推送 main 分支即自动构建部署）；
3. 手机打开部署地址后「添加到主屏幕」，即可全屏、离线使用（新地址需要重新安装一次）。

## 数据说明

- 数据只存在当前浏览器（localStorage），键名：`busCheck.records`（跳车记录）、
  `busCheck.stationRecords`（驻站记录）、`busCheck.basicData`（共享基础资料）、
  `busCheck.version`（当前 2）。
- 清理浏览器数据、换手机/电脑会导致数据丢失，请定期在「基础数据 → 备份/恢复」导出 JSON。
- 数据量较大时（约 4MB 以上）会提示存储空间预警，建议及时导出备份。

## 技术栈

React 18 + Vite 6 + Tailwind CSS 4 + SheetJS（xlsx）+ pinyin-pro + Vitest +
vite-plugin-pwa。全部为浏览器端代码，可离线使用。

## 文件结构

```
src/lib/storage.js          统一数据层：两类记录、共享基础资料、备份合并导入
src/lib/stationCore.js      驻站纯逻辑（分组/格式化/车号归一化）
src/lib/search.js           汉字 + 拼音模糊搜索
src/lib/stationImport.js    Excel 资料导入解析
src/lib/stationXlsx.js      模板 Excel 导出 + ZIP（零依赖）
src/lib/stationTemplate.js  内置《驻站记录表》模板（由 build-template.js 生成，勿手改）
src/data/catalogSeed.js     内置初始资料库（由 build-catalog.js 生成，勿手改）
src/pages/HomePage.jsx      首页双入口
src/pages/station/          驻站模块（登记/查询/导出）
src/pages/JumpHomePage.jsx  跳车台账（原跳车检查首页）
tools/build-template.js     重新打包模板（node tools/build-template.js）
tools/build-catalog.js      重新生成内置资料库（node tools/build-catalog.js）
```

> 原始 Excel（`database/` 目录）仅保留在本机，不入库；模板源文件
> 《驻站记录表【日期】.xlsx》《车队线路信息.xlsx》保留在仓库根目录。
