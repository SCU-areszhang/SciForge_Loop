# Run-0 隔离部署 artifacts 与当前阻塞状态

本文记录 `add-full-multi-user-collaboration-loop` 的 Run-0 部署交付边界。
本次新增仓库 artifacts、安全预检和离线测试，并按 User 授权对服务器执行了
一次只读的 container/network/volume/listener 盘点与 DNS 复查。没有执行 Compose、
migration、服务启动、Nginx/Caddy reload、数据库写入、备份或恢复。

## 已冻结的候选环境

| 资源 | Run-0 候选值 |
| --- | --- |
| Cloud origin | `https://cloud-run0.sciforge.cn` |
| Identity origin | `https://login-run0.sciforge.cn` |
| OIDC issuer | `https://login-run0.sciforge.cn/realms/SciForge-Run0` |
| Realm | `SciForge-Run0` |
| Audience | `sciforge-cloud-api` |
| Desktop client | public Authorization Code + PKCE S256 |
| Compose projects | `sciforge-run0-edge`、`sciforge-run0-identity`、`sciforge-run0-cloud` |
| PostgreSQL | 两个独立 database/role/volume/internal network |
| Secrets | 仅 `/etc/sciforge-run0/secrets/` 下的文件引用；Git 中无值 |
| Backups | `/var/backups/sciforge-run0/identity` 与 `/var/backups/sciforge-run0/cloud` |

Identity Realm template 开启自助注册、关闭 implicit/direct grant、强制 Desktop
使用 S256，并为 Access Token 添加固定 Cloud audience。Cloud 只接受冻结的 HTTPS
issuer 和 `sciforge-desktop` authorized party；配置中没有旧 issuer、HTTP 或环境变量
fallback。Cloud 的 OIDC JIT User 和 Device/Agent 约束仍由应用 canonical path 执行，
不能把 Realm template 存在误报为该 live path 已通过。

三个 Compose project 仅通过专用 edge backplane 组合。两个 PostgreSQL 分别位于
不同的 `internal: true` 网络，不发布 5432；Cloud 和 Keycloak 也不发布 8787、
8080 或 9000。Edge 候选单独发布 443，因此必须先解决现有监听冲突。

## 与 A 的隔离证明方式

仓库静态禁止集合包含只读审计已经确认的 A 名称：

- Compose：`sciforge-collaboration-private`、`sciforge-keycloak`、
  `sciforge-collaboration-a-https-oidc-test`；
- Networks：`sciforge-collaboration-private_database`、
  `sciforge-collaboration-private_private-edge`、
  `sciforge-keycloak_identity-internal`、`sciforge-keycloak_identity-edge`；
- Volumes：`sciforge-collaboration-private_collaboration-db`、
  `sciforge-keycloak_keycloak-db-data`。

审计没有确认的 A database/role 不会被猜测或硬编码。运行 preflight 时必须显式
提供一次完整的只读 inventory，其中逐类列出 Compose project、container、network、
network CIDR、volume、database、role、secret root、backup root 与 TCP listener。
preflight 将候选名称与“静态禁止集合 + 现场 inventory”交叉比较；inventory 缺失、
使用示例占位符、类别不全或可被 group/other 写入都会 fail closed。
inventory 还必须由调用者拥有、只有一个 hard link，且采集时间不超过 30 分钟。

该脚本只读取本地文件并使用 DNS resolver 查询两个精确 Run-0 hostname。它没有
SSH、Docker、HTTP、数据库或文件写接口，也没有默认部署目标。输出明确包含：

```json
{
  "safety": {
    "mutationsAttempted": false,
    "publicDeploymentMutated": false,
    "fallbackUsed": false
  },
  "openspecTasks": {
    "7.3": "blocked",
    "7.4": "not_run"
  }
}
```

完整 JSON 还会给出 isolation、DNS 和 ingress 的有界状态，但不会输出 secret、
凭据、Token、现场实体内容或完整 inventory。

## 当前状态（2026-08-24）

| OpenSpec task | 状态 | 证据边界 |
| --- | --- | --- |
| 7.1 | artifacts ready for review | 三套 Compose、Realm、edge route、secret/backup references 已落地；尚未部署。 |
| 7.2 | preflight implemented, full live inventory pending | 离线测试证明 name/CIDR/DNS/443 fail-closed 语义；已只读确认现有 443 listener 和多组既有 Compose 资源，但仍需含 database/role/path/CIDR 的 owner-only 完整 inventory 才能执行正式 preflight。 |
| 7.3 | **blocked** | 审计时两个 Run-0 DNS 尚未就绪，所以正式状态为 `awaiting_dns`；禁止借用 `login-test` issuer。 |
| 7.4 | **not_run** | 未部署、未 migration、未做 health/backup/isolated restore，也没有 image/schema receipt。 |

此外，服务器现有 edge 当前独占 `0.0.0.0:443`，且只读盘点发现多组既有
production/staging/acceptance Compose 项目。它们都只作为隔离禁止集合的现场事实，不会被停止、
重用或重命名。即使 DNS 后续就绪，当前独立 edge
候选也会得到 `awaiting_ingress`。本 artifacts 不会自动修改 A edge、停止容器、抢占
端口或选择另一个未经确认的公网入口。需要先由负责人批准一个仍能保持 A byte/state
不变的 ingress 方案，再更新并重新审查 Run-0 manifest/Compose。

## 后续显式 handoff 门禁

下列事项必须由有权限的 Human 在独立维护步骤中完成；本次没有执行：

1. 以只读命令生成不含 secret 的完整 inventory，保存为 owner-only 普通文件；
2. 运行 `node scripts/run0-preflight.mjs --inventory <absolute-path>`，保存 stdout
   回执；`awaiting_dns`、`awaiting_ingress` 或任何 overlap 都立即停止；
3. 为 Cloud/edge 选择并记录 digest-pinned image，为 Run-0 创建全新 secret、配置和
   backup directories，绝不复制 A credential；
4. 在获批 ingress 方案后，只对三个 exact Run-0 Compose project 做 config
   validation；不得使用 wildcard、默认 project name 或 A compose file；
5. 显式运行 Run-0 migration，再验证 Cloud/Identity health、OIDC Discovery 的 exact
   issuer、PKCE/JIT/Device；
6. 分别生成 Cloud/Identity backup，并在新的临时 project/network/volume 中做隔离
   restore；不得覆盖唯一 live volume；
7. 记录脱敏 image digest、schema version 与 gate result，同时再次只读核对 A 的
   container/database/edge 状态没有变化。

只有完成以上 live 证据后，7.3/7.4 才可重新判断。仓库单元测试、DNS fixture、
Compose 文件存在或推理都不能替代这些证据。
