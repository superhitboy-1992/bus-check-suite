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
- 实时到站（可选）：站点选定后展开「本站实时到站」折叠面板，列出经过本站的线路
  （按站名自动反查），**上下行分开**显示线路名、车牌号、还有几站、距离与预计到站时间；
  在途车按预计到达升序排在前面，没有在途车时显示下一班发车时间或「不在运营时间」。
  面板展开时按设定间隔（默认 30 秒）自动刷新，收起或页面切到后台即停止。
  数据来自随申行接口，需先部署一个 Cloudflare Worker 代理，详见下文。

### 跳车检查（`#/jump`、`#/export`）

- 台账：列表/当日表格视图、筛选、分页、编辑、删除；
- 新建：14 项检查项三态（合格/不合格/待确认）、驾驶员/售票员、上下车时间/地点；
- 导出：以官方《营运检查表-跳车及服务检查》模板生成 Excel（20 行/页，超出自动追加工作表；
  右下角自动填写检查人与检查日期；跨天记录在备注前置日期标记，如 `8.31,备注`），另支持 CSV。

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
pnpm build:line-map   # 重新生成 public/line-map.json（站点映射，需要联网）
```

## 实时到站（可选功能）

### 数据来源与前提

实时数据来自**随申行**（上海 MaaS）的公交接口（`api.shmaas.net`），能返回
线路名、车牌号、还有几站、距离（米）、预计到达（分钟）。该接口是 App 使用的
**未公开接口**：没有文档、没有服务承诺，可能随时变更或限制访问，所以本功能：

- 默认不影响任何原有功能，接口不可用时只在面板上显示「暂无数据」，登记、查询、导出照常；
- 所有调用集中在 `src/lib/live/` 这一层，将来换数据源只改适配层。

**数据源（基础数据 → 实时数据源，`#/basic-data`）**，三选一，默认「自动」：

- **自动（推荐）**：依次尝试 直连随申行 → 本机预览服务的同源转发 → 下面填的自建代理，
  哪条通用哪条（失败的数据源会短暂降级，不会每次都白等一个超时）；
- **直连随申行**：直接调 `https://api.shmaas.net`；
- **自建代理**：只走 Cloudflare Worker 代理。

按打开方式对照：

| 打开方式 | 实际走的数据源 |
| --- | --- |
| 电脑 `http://localhost:5173` | 直连随申行（最快，实测 0.5 秒左右返回） |
| 手机 `/ 局域网 http://192.168.x.x:5173` | 同源转发：由电脑上的预览服务（`tools/live-dev-proxy.js`）代为请求 |
| 线上 GitHub Pages | 只能自建代理（无服务端，且上游不放行线上来源） |

> 随申行接口只放行 `localhost` / `127.0.0.1` 作为跨域来源（`Origin` 白名单），
> 实测局域网 IP、`*.github.io`、普通域名直连都返回 403，所以浏览器直连只在
> localhost 打开时可用；其他来源由本机预览服务或 Worker 在服务端转发（服务端请求不带
> `Origin`，不受该限制）。

代理地址默认填 `https://bus-live-proxy.1015184868.workers.dev`（写在
`src/lib/live/config.js` 的 `DEPLOYED_PROXY_BASE`），可用构建变量
`VITE_LIVE_PROXY_BASE`（GitHub 仓库 **Settings → Variables**）或应用内输入框覆盖。
部署 / 本地调试见 `worker/README.md`（`pnpm dlx wrangler@4 deploy`；本地调试
`pnpm dlx wrangler@4 dev`，代理地址填 `http://localhost:8787`）。

> ⚠️ 已知网络问题：`*.workers.dev` 在部分国内网络下会被 DNS 投毒 + 连接无响应
> （实测办公电脑 `curl https://bus-live-proxy.1015184868.workers.dev/api/health` 超时，
> 界面表现为「请求超时，请稍后重试」）。这类设备保持默认「自动」即可：电脑用
> localhost 直连、手机走本机预览服务的同源转发，都不会经过 `workers.dev`。
> 确实要代理时，给 Worker 绑一个自定义域名（Workers → Settings → Domains & Routes →
> Custom Domain），再把代理地址改成新域名。应用里的「连通性自检」会逐个数据源报出通不通。

上游地址、路径与响应归一化在 `src/lib/live/upstream.js`，前端直连与
`worker/index.js` 代理共用同一份。

### 站点映射

面板需要把「本应用站名」对上接口的 `stopId`，这份对照表由脚本生成：

```bash
pnpm build:line-map                 # 重新生成 public/line-map.json
pnpm build:line-map --only 1677路    # 只重跑指定线路（与已有结果合并）
```

脚本会把全角/半角括号、「（招呼站）」括号内容、「单向/双向」后缀归一化后再匹配，
当前 50 条有站点的线路中 23 条匹配率 ≥95%、22 条 70–95%、5 条偏低。匹配不上的
站点对应的线路会在面板底部提示「未匹配到站点的线路」，可人工校对：把正确的
`stopId` 写进 `tools/line-map.overrides.json`（格式见该文件旁注释与
`tools/build-line-map.js` 说明），再重跑脚本，人工结果不会被覆盖。

已知需要校对的线路：`1677路`、`1683路`、`枫泾2路`、`枫泾1路`、`莲漕专线`
（多为站名写法差异，例如基础数据里的「平漾路」与接口的「漾平路」）。

### 刷新频率与请求量

一次刷新 = 本站经过的线路数 × 方向数（最多约 24 次请求）。代理端对线路站点缓存
24 小时、实时到站缓存 20 秒，前端还有 20 秒内存缓存与 4 路并发上限，因此实际打到
上游的请求量很小。

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
- 站名一律使用**半角括号**并紧贴前文（如 `莲花路地铁站(北广场)`），不允许全角 `（）`；
- 可选指令数组：`stationRenames`（`{routeName, oldName, newName}`，供老用户把旧写法
  本地停用并收敛到线上活跃名）与 `stationRemovals`（`{routeName, name}`，停用该线路旧站）；
  客户端执行后只从选择器隐藏/改名，不删除已保存记录；
- 站点、线路、驻站人不能为空，字段缺失会导致 CI 构建失败（线上保持上一个可用版本）；
- 自动更新采用**并集合并**：远程同名条目覆盖、本地独有条目保留、不删除任何条目；
  如需移除某条目，请在应用内「基础数据」页手动删除；
- 原始 Excel（`database/`）按隐私约定不入库。

## 数据说明

- 数据只存在当前浏览器（localStorage），键名：`busCheck.records`（跳车记录）、
  `busCheck.stationRecords`（驻站记录）、`busCheck.basicData`（共享基础资料）、
  `busCheck.version`（当前 2）、`busCheck.liveConfig`（实时到站的数据源、代理地址与
  刷新间隔，属于本机设置，不参与备份合并）。
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
src/lib/export.js           跳车 CSV 导出与导出文件名
src/lib/jumpXlsx.js         跳车模板 Excel 导出（20 行/页、多工作表）
src/lib/jumpTemplate.js     内置《营运检查表-跳车及服务检查》模板（由 build-template.js 生成，勿手改）
src/lib/remoteCatalog.js    线上基础数据拉取：哈希/校验/增量合并
src/lib/live/               实时到站数据层：代理客户端、到站归一化、映射查询、轮询 hook
worker/                     Cloudflare Worker 代理（隐藏上游与跨域，带缓存与来源白名单）
tools/build-line-map.js     生成 public/line-map.json（线路 + 方向 + 站点 → stopId）
public/line-map.json        站点映射真源（由脚本生成，勿手改）
src/data/catalogSeed.js     内置初始资料库（由 basic-data.json 生成，勿手改）
public/basic-data.json      线上基础数据真源（可在 GitHub 网页直接编辑）
src/pages/HomePage.jsx      首页双入口
src/pages/station/          驻站模块（登记/查询/导出）
src/pages/JumpHomePage.jsx  跳车台账（原跳车检查首页）
tools/build-template.js     重新打包模板（node tools/build-template.js / --which jump）
tools/build-data.js         基础数据生成（--from-excel 读表格 / --from-json 读 JSON）
```

> 原始 Excel（`database/` 目录）仅保留在本机，不入库；模板源文件
> 《驻站记录表【日期】.xlsx》《营运检查表-跳车及服务检查【日期】.xlsx》
> 《车队线路信息.xlsx》保留在仓库根目录。
