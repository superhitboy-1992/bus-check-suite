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
  （固定 30 行、A4 打印格式），支持单张导出与批量 ZIP；导出后显示结果面板，
  可下载或分享，已导出文件保留在本页列表中。
- 备份提醒：登记达 50 条或距上次备份超 7 天时提示。

### 跳车检查（`#/jump`、`#/export`）

- 台账：列表/当日表格视图、筛选、分页、编辑、删除；
- 新建：14 项检查项三态（合格/不合格/待确认）、驾驶员/售票员、上下车时间/地点；
- 导出：Excel (.xlsx) / CSV，表头与原版应用一致。

### 基础数据（`#/basic-data`）

统一页签：线路（含车队归属）/ 站点 / 车号 / 检查人 / 驾驶员 / 售票员 / 车队管理 /
Excel 导入 / 备份恢复。首次打开会自动内置线路、车队、站点、驻站人、驾驶员、售票员名单
（来自 `public/basic-data.json`，打包时同步生成 `src/data/catalogSeed.js` 作为离线兜底；
驾驶员/售票员名单由 `database/司售人员名单.xlsx` 生成，姓名与线路归属一并内置），
也可从现成 Excel 一键导入补充，包括直接导入《司售人员名单》。应用每次联网打开时还会
自动拉取线上 `basic-data.json`，内容有变化就静默增量合并（新增/改名自动更新，本地
手工添加的条目保留，不删除任何条目，检查记录不受影响）。

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

## 更新基础数据

线上基础数据的真源是仓库内的 `public/basic-data.json`（与内置 `catalogSeed.js` 同结构，
顶部 `updatedAt` 仅用于展示）。更新分两种方式，push 到 main 后 GitHub Actions 会自动
重新生成内置数据、跑测试并部署，几分钟后生效；已装用户下次联网打开应用即自动更新。

### 方式一：小改（在 GitHub 网页直接编辑）

1. 打开仓库里的 `public/basic-data.json`；
2. 点右上角「编辑」铅笔图标，直接修改/新增/删除条目（建议用浏览器搜索定位）；
3. 「Commit changes」提交到 main 分支，等待 Actions 完成即可。

### 方式二：批量（新表格，本机处理）

拿到新的《各线路站点》《驻站人姓名》《司售人员名单》或《车队线路信息》后，放入
本机 `database/` 目录（不入库），然后运行：

```bash
node tools/build-data.js --from-excel
```

脚本会同步生成 `public/basic-data.json` 与 `src/data/catalogSeed.js`，提交这两个文件并
推送即可。平时从线上拉取网页端修改后，也可运行 `pnpm build:data`
（即 `node tools/build-data.js --from-json`）重新生成本地内置库。

### JSON 字段说明与注意事项

- 六个数组字段：`stations`（`name`/`routeName`/`sortOrder`）、`routes`（线路名数组）、
  `checkers`（驻站人/检查人）、`fleets`（`{name, routes[]}`）、`drivers` 与
  `conductors`（`{name, routeName}`）；
- 站点、线路、驻站人不能为空，字段缺失会导致 CI 构建失败（线上保持上一个可用版本）；
- 自动更新采用**并集合并**：远程同名条目覆盖、本地独有条目保留、不删除任何条目；
  如需移除某条目，请在应用内「基础数据」页手动删除；
- 原始 Excel（`database/`）按隐私约定不入库。

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
src/lib/remoteCatalog.js    线上基础数据拉取：哈希/校验/增量合并
src/data/catalogSeed.js     内置初始资料库（由 basic-data.json 生成，勿手改）
public/basic-data.json      线上基础数据真源（可在 GitHub 网页直接编辑）
src/pages/HomePage.jsx      首页双入口
src/pages/station/          驻站模块（登记/查询/导出）
src/pages/JumpHomePage.jsx  跳车台账（原跳车检查首页）
tools/build-template.js     重新打包模板（node tools/build-template.js）
tools/build-data.js         基础数据生成（--from-excel 读表格 / --from-json 读 JSON）
```

> 原始 Excel（`database/` 目录）仅保留在本机，不入库；模板源文件
> 《驻站记录表【日期】.xlsx》《车队线路信息.xlsx》保留在仓库根目录。
