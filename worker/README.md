# 实时公交代理（Cloudflare Worker）

应用默认按「直连随申行 → 本机预览服务同源转发 → 本 Worker」的顺序找可用数据源。
本机 localhost 打开时直连就够（上游的 Origin 白名单只放行 localhost），
手机走局域网地址时由预览服务转发，**线上部署（GitHub Pages）打开时只有这个 Worker 可用**。
它只暴露三个白名单端点，不是开放代理。

## 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 连通性自检，返回上游地址与城市代码 |
| POST | `/api/bus/line-search` | 线路搜索，入参 `{ keywords, pageNo?, pageSize? }` |
| POST | `/api/bus/line-detail` | 线路站点，入参 `{ lineId, lineName, direction }` |
| POST | `/api/bus/eta` | 实时到站，入参 `{ lineName, stopName, stopId, direction }` |

`/api/bus/eta` 返回归一化后的结构，前端只认这一份契约：

```json
{
  "status": "running",
  "buses": [
    {
      "plate": "沪A-13762A",
      "stopsAway": 1,
      "distanceMeters": 370,
      "etaMinutes": 2,
      "accessible": true,
      "gps": "121.380858,31.190582"
    }
  ],
  "schedule": { "message": "", "cars": [{ "vehicle": "", "time": "04:40", "countdown": "" }] },
  "updatedAt": "2026-09-14T22:52:00.000Z"
}
```

`status` 取值：`running`（有车在途）、`waiting`（无在途车但有排班）、`closed`（不在运营时间）。

## 部署

需要 Node.js 18+ 与 Cloudflare 账号（免费计划足够）。已部署实例：

```
https://bus-live-proxy.1015184868.workers.dev
```

该地址写在 `src/lib/live/config.js` 的 `DEPLOYED_PROXY_BASE`。重新部署：

```powershell
cd worker
pnpm dlx wrangler@4 login     # 浏览器登录；弹不出浏览器就加 --browser=false 手动开链接
pnpm dlx wrangler@4 deploy    # 首次会下载约 40MB，之后很快
```

`index.js` 通过 `../src/lib/live/upstream.js` 复用前端同一份上游契约（地址、路径与
响应归一化），wrangler 会一起打包，所以要在仓库里用命令行部署。
若要在 Cloudflare 控制台 **Edit code** 里手贴，需要同时新建
`src/lib/live/upstream.js` 模块（内容与仓库里的同名文件一致）。

不想用命令行时，也可以在 Cloudflare 控制台 **Workers & Pages → 该 Worker →
Edit code** 里编辑并 Deploy，再在 **Settings → Variables** 配好
`UPSTREAM_BASE` / `CITY_CODE` / `ALLOWED_ORIGINS`（改完要重新 Deploy 才生效）。

本地联调：

```powershell
cd worker
pnpm dlx wrangler@4 dev       # 默认 http://localhost:8787
```

然后把应用的代理地址临时改成 `http://localhost:8787`。

> ⚠️ `*.workers.dev` 在部分国内网络下会被 DNS 投毒 + SNI 阻断：实测办公电脑
> `curl https://bus-live-proxy.1015184868.workers.dev/api/health` 超时，同一个
> 地址手机流量正常。若某台设备打不开，绑一个自定义域名给这个 Worker
> （Workers → Settings → Domains & Routes → Add → Custom Domain），
> 再把应用里的代理地址换成新域名即可，代码不用改；也可以直接在应用里把数据源
> 切回「直连随申行」。

## 配置项

都在 `wrangler.toml` 的 `[vars]` 里：

- `UPSTREAM_BASE`：上游地址，默认 `https://api.shmaas.net`
- `CITY_CODE`：城市代码，默认 `310100`（上海）
- `ALLOWED_ORIGINS`：前端来源白名单，逗号分隔、支持 `*`；建议部署后收紧成实际地址

缓存策略：线路站点 24 小时、实时到站 20 秒（按「路径 + 请求体指纹」缓存，
不同站点互不干扰）。上游超时 8 秒，失败返回
`{ "error": "upstream_timeout" | "upstream_error" | "bad_request" | "origin_not_allowed", "error_msg": "..." }`。

## 说明

上游是随申行 App 使用的未公开接口，无文档、无 SLA，可能随时变更或限制访问。
本代理仅转发公开的公交线路/到站查询数据，不做任何持久化存储。
