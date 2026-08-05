# SciForge Continuity 多客户端接力 v1 执行计划

> 状态：PR 0 冻结候选。base/target 为 `AGI4Sci/SciForge:gui`；每个 PR 合并后从最新 `gui` 创建下一分支，不使用 stacked PR。
>
> 权威设计：[D-01～D-28](./continuity-multi-client-v1.zh-CN.md)；验收：[AC-01～AC-17](./continuity-multi-client-v1-acceptance.zh-CN.md)；Zulip endpoint/字段/feature/config/typed error/fixture 唯一事实源：[官方能力核验](./continuity-zulip-official-capability-audit.zh-CN.md)。本计划不维护第二份 REST 合同。

## 1. PR 路线与 canonical path

```mermaid
flowchart LR
    P0["PR 0 设计冻结"] --> P1["PR 1 Capability 命令语义"]
    P1 --> P2["PR 2 Agent State SDK v2"]
    P2 --> P3["PR 3 Continuity ledger"]
    P3 --> P4["PR 4 Runtime 投影与命令"]
    P4 --> P5["PR 5 Electron 接力中心"]
    P5 --> P6["PR 6 Zulip 可恢复主链路"]
    P6 --> P7["PR 7 uncertain/recovery"]
    P7 --> P8["PR 8 安全与交付"]
```

```text
Electron UI / Zulip /sf
  → Capability Broker + Continuity command service
  → SQLite task/event/decision/receipt/outbox
  → runtime-neutral Agent State / Host Remote Messaging / Host Notification
```

禁止第二套 IPC、Zulip transport/poll loop、service/facade/registry、状态机、即时 send 或 fallback。SQLite 是唯一 Continuity 事实源，Zulip 是可重建投影。

## 2. 所有 Coding Agent 的共同边界

### 2.1 架构

- `@sciforge/domain-continuity` 同版本拥有 main 与可选 renderer，使用独立 entrypoint、manifest 与 generated composition。
- Host 只依赖通用 Domain SDK contract，不含 domain ID switch/feature map/专属设置表。
- Domain package 不导入 Host 私有 `src/main`、`src/renderer`、`src/shared`、`@shared`、`@renderer`。
- Agent State 是 runtime-neutral 状态入口；`agentExecution` 仍是用途不同的唯一高层执行端口。Codex/Claude 能力不足时 fail closed，不 fallback。
- Zulip credential/connection/reconnect/REST 属于 Host；binding/parser/card/receipt/outbox/watermark 属于 Continuity。
- 桌面 UI 和 `/sf` 调用同一 Broker/command service；renderer 不读 SQLite、不加专用 preload API。

### 2.2 数据与安全

- 纯本地 mutation 在单一 SQLite transaction 写 event/projection/receipt/outbox intent；网络/Runtime 在事务外走持久 saga。
- Broker 的 invocation ID/expected revision 是唯一命令 ID/OCC option；payload 不保存第二份可漂移值。
- task mutation 用 `continuity.task` + semantic revision；delivery mutation 用 `continuity.delivery` + delivery revision。
- Decision append-only，通过 `supersedesDecisionId` 纠正。
- 未授权 sender 在 task/binding/receipt 查询前静默 ignored；存在/不存在 task 行为同形，无 reply/outbox/Agent。
- 禁止持久或远程输出 secret、真实身份、workspace root、reasoning、assistant delta、完整消息和 tool stdout。
- 不宣称 exactly-once；使用至少一次 transport、幂等应用、审计和 fail-closed recovery。

### 2.3 Git 与协作

- 每 PR 一个 Integrator 负责 branch、共享文件、generate、commit/push/PR；Worker 不执行 Git mutation。
- 并行写前必须冻结上游 contract 并签发互不重叠 path lease；manifest、lockfile、SDK exports、generated composition 只由 Integrator 修改。
- 发现未知修改立即保留现场并报告；禁止 reset/clean/restore/force push。
- 每个 PR 记录 base SHA；focused tests 后运行完整退出门；最后审计 private imports、旧入口、duplicate path、hard-code 与 dead files。

## 3. 共用 Git SOP

```bash
git switch gui
git pull --ff-only origin gui
git status --short --untracked-files=all
git switch -c codex/continuity-XX-name
git rev-parse HEAD
```

工作目录一律写 `<repo-root>` 或相对路径。只逐项 stage 已审查文件，不使用 `git add .`。已共享分支需要更新时由 Integrator merge 最新 `origin/gui`，不 rebase/force push。每个 PR 最终执行：

```bash
git diff --check <BASE_SHA>...HEAD
git status --short --untracked-files=all
```

## 4. 依赖与合并门

| PR | Branch | 主要产物 | 前置 | 合并门 |
|---|---|---|---|---|
| 0 | `codex/continuity-00-design` | 正式设计、官方能力合同、fixtures、AC、计划 | 最新可用 `gui` | D-01～D-28/AC-01～AC-17 无冲突；无业务代码 |
| 1 | `codex/continuity-01-capability` | resource serialization、stable invocation ID | PR 0 | 并发同 revision 只有一个成功 |
| 2 | `codex/continuity-02-agent-state-sdk` | Domain SDK v2 Agent State 原子切换 | PR 1 | 旧状态入口删除；Codex/Claude 合同通过 |
| 3 | `codex/continuity-03-ledger` | domain package、SQLite、receipt/outbox core | PR 2 | 无网络确定性 replay；source/packaged 可加载 |
| 4 | `codex/continuity-04-runtime` | runtime-neutral projector/commands | PR 3 | Runtime mutation 与重启收敛 |
| 5 | `codex/continuity-05-desktop` | Electron 接力中心、导航、通知 | PR 4 | Electron 本地闭环通过 |
| 6 | `codex/continuity-06-zulip-online` | `/sf`、history gate、card/outbox worker | PR 5 | live/history 仅在 healthy catch-up 后开放 |
| 7 | `codex/continuity-07-recovery` | gap/reset、uncertain reconciliation、card repair | PR 6 | crash/network unknown 可审计收敛 |
| 8 | `codex/continuity-08-hardening` | security/regression/diagnostics/UAT/runbook | PR 7 | AC 全证据与发布审计通过 |

## 5. PR 0：设计冻结

### 目标与范围

只修改 `docs/**/*.md` 和 `docs/fixtures/continuity-zulip-v1/*.json`。冻结四份正式文档、旧长期方案状态说明与 synthetic contract fixtures；不实现代码，不执行未授权外部写。

| Task | Owner | 产物 | 前置 |
|---|---|---|---|
| P0-DOC-01 | Integrator | 正式设计/计划/能力核验；D-01～D-28 | 无 |
| P0-PROBE-02 | Test Worker | preflight/live/history/send/edit synthetic fixtures；真实 probe blockers | P0-DOC-01 |
| P0-ACC-03 | Test Worker | AC-01～AC-17、证据模板、真机矩阵 | P0-DOC-01 |
| P0-OLD-04 | Docs Worker | 旧 Zulip 长期方案状态说明与四文档链接 | P0-DOC-01 |
| P0-REV-05 | Reviewer | 范围、唯一事实源、安全、链接/渲染、自审 | P0-PROBE-02、P0-ACC-03、P0-OLD-04 |

退出门：四文档、fixtures、旧状态说明完成；无占位项、旧命令、第二 REST 合同、业务代码、secret 或个人路径；未授权外部写为零；真实 marker/edit/push 未完成项明确 blocker；维护者确认前不称设计已合并冻结。

## 6. PR 1：Capability 命令语义加固

### 目标

在共享 Broker 修复 mutation resource concurrency OCC，并让 renderer/system/remote 的 stable command ID 成为 handler context 的唯一 invocation ID；不含 Continuity 业务。

| Task | Owner | 产物/完成定义 | 前置 |
|---|---|---|---|
| P1-LOCK-01 | Backend Worker | canonical resource queue；锁内 revision 重检；异常后队列继续 | PR 0 |
| P1-ID-02 | Contract Worker | renderer idempotency key 与 handler invocation ID 类型/校验 | PR 0 |
| P1-CLIENT-03 | Renderer Worker | client 保留调用方 stable ID | P1-ID-02 |
| P1-RACE-04 | Test Worker | concurrent same revision、same ID/different payload、共同 audience 负测 | P1-LOCK-01、P1-ID-02、P1-CLIENT-03 |
| P1-INTEGRATE-05 | Integrator | 公共类型/生成物集成，现有 provider 不变 | P1-RACE-04 |
| P1-AUDIT-06 | Reviewer | 无 Continuity hard-code、非全局 mutex、无 token persistence | P1-INTEGRATE-05 |

退出门：两个不同 ID 同一 resource `vN` 并发只一成功；100 个同 ID 同 payload handler 最多一次；同 ID 不同 payload conflict；不同 resource 可并行；UI/system 不因 handle 不同分裂队列。

强制门：`domain-sdk:typecheck/test`、focused broker/client tests、`capability:check`、typecheck、full test、lint。

## 7. PR 2：Domain SDK v2 Agent State 原子切换

### 目标

用唯一 runtime-neutral Agent State 替换 `agentThreads + turnEvents` 状态读取，不保留 alias/双轨；保留用途不同的 `agentExecution`、typed artifact port、ordered awaited lifecycle hook。

| Task | Owner | 产物/允许路径 | 前置 |
|---|---|---|---|
| P2-CONTRACT-01 | Contract Worker | Agent State、typed artifact、hook、公共贡献合同/tests | PR 1 |
| P2-HOST-02 | Backend Worker A | runtime-neutral Host、inventory/replay/live/dispose | P2-CONTRACT-01 |
| P2-APPROVAL-03 | Backend Worker B | durable approval seq；restart 闭合 ghost attention | P2-CONTRACT-01 |
| P2-PORTS-04 | Backend Worker C | typed artifact + ordered awaited hook/version-ref event | P2-CONTRACT-01 |
| P2-CONSUMER-05 | Backend Worker C | Change Inspector、Project/Evidence DAG、Git Checkpoints 消费迁移 | P2-HOST-02、P2-PORTS-04 |
| P2-API-06 | Integrator | SDK 2.0、exports、manifest/fixture/composition/公共贡献切换 | P2-APPROVAL-03、P2-CONSUMER-05 |
| P2-DELETE-07 | Integrator | 删除旧合同/装配/死测试 | P2-API-06 |
| P2-REV-08 | Reviewer | runtime-neutral、无 fallback/敏感事件/兼容层 | P2-DELETE-07 |

退出门：snapshot/watermark 一致；subscribe-buffer-replay 无丢重；inventory 分页 complete；gap typed resnapshot；Goal/Todo/attention replay；raw delta/reasoning/stdout 不出界；Codex/Claude unsupported fail closed；旧 state symbols 零生产引用；source/packaged composition 全为 Host API v2。

强制门：SDK/domain package tests/check/generate、runtime host focused、typecheck/full test/lint/build、source 与 packaged smoke。

## 8. PR 3：Continuity 核心 ledger

### 目标

创建 `@sciforge/domain-continuity` main 核心：schema/migration/repository/reducer/cursor/source receipt/command receipt/digest/outbox 和只读 capabilities。entry factory/composition 零 I/O；不接 Runtime/UI/Zulip。

| Task | Owner | 产物 | 前置 |
|---|---|---|---|
| P3-PKG-01 | Integrator | package/manifest/README/definition/lockfile | PR 2 |
| P3-CONTRACT-02 | Contract Worker | strict schema/errors/unknown event tests | P3-PKG-01 |
| P3-DB-03 | Backend Worker A | migration/database/failure rollback | P3-CONTRACT-02 |
| P3-REPO-04 | Backend Worker B | repository/reducer/source receipt/cursor/snapshot | P3-CONTRACT-02、P3-DB-03 |
| P3-CMD-05 | Backend Worker A | command service/receipt/digest/OCC | P3-REPO-04 |
| P3-OUT-06 | Backend Worker B | transport-neutral outbox/claim/lease/restart | P3-REPO-04 |
| P3-LIFE-07 | Backend Worker A | activate/open/migrate/dispose lifecycle | P3-DB-03 |
| P3-CAP-08 | Integrator | list/open/events/diagnostics，task handle `ui/system` | P3-CMD-05、P3-OUT-06、P3-LIFE-07 |
| P3-GEN-09 | Integrator | domain/capability generated freshness | P3-CAP-08 |
| P3-ADV-10 | Test Worker | eager-I/O、crash、repeat、secret、unknown kind | P3-GEN-09 |
| P3-REV-11 | Reviewer | package boundary/transaction/lifecycle/resource | P3-ADV-10 |

退出门：空库 migration、future/corrupt DB fail closed；同 DB 重启/repeat/fault 后 task/event/receipt/outbox 确定一致；network call 不在 transaction；source/packaged activate/dispose；零 Host private import/domain hard-code。

强制门：domain/capability generate/check、package typecheck/test、extension package test、root typecheck/test/lint/build、source/packaged smoke。

## 9. PR 4：AgentRuntime 投影与受控命令

### 目标

Agent State snapshot/replay/live 共用 reducer 投影 Task，并注册 resource-scoped continue/approval/input/Decision capabilities。Runtime mutation 使用 Tx A delivering → external call → Tx B settle；`clientDirectiveId === commandId`。

| Task | Owner | 产物 | 前置 |
|---|---|---|---|
| P4-PROJ-01 | Backend Worker A | projector/reducer/source sequence dedupe | PR 3 |
| P4-BACKFILL-02 | Backend Worker B | inventory/backfill/startup live window | P4-PROJ-01 |
| P4-CMD-03 | Backend Worker C | task resource handlers、saga、stable errors | P4-PROJ-01 |
| P4-CHECKPOINT-04 | Contract Worker | typed `version_ref_available` + public checkpoint capability | P4-PROJ-01 |
| P4-CRASH-05 | Test Worker | dispatch before/during/after、100 duplicates、restart | P4-CMD-03 |
| P4-INTEGRATE-06 | Integrator | lifecycle/capability/generated composition | P4-BACKFILL-02、P4-CHECKPOINT-04、P4-CRASH-05 |
| P4-REV-07 | Reviewer | runtime-neutral/resource/OCC/saga/no bypass | P4-INTEGRATE-06 |

退出门：AC-01；existing/new threads 幂等；重复 source event 不升 revision；attention 不丢；continue/attention 至多一次；unsupported 不 fallback；crash 后 uncertain 不自动重发；terminal/checkpoint 竞态最终一致；敏感 canary 零持久化。

强制门：Continuity/SDK/runtime focused、domain/capability generate/check、root typecheck/test/lint/build、source/packaged smoke。

## 10. PR 5：Electron 接力中心、导航与通知

### 目标

交付本地 ledger/AgentRuntime 闭环；package-owned renderer 只使用 snapshot/cursor/events 与 capabilities。新增通用 notification/navigation/sessionless overlay/openSession ports，原子删除旧 completion notification 专用 IPC。

| Task | Owner | 产物 | 前置 |
|---|---|---|---|
| P5-NAV-01 | Host Worker | SDK notification/navigation、ready/owner registry | PR 4 |
| P5-OVERLAY-02 | Renderer Core Worker | additive sessionless overlay/openSession | P5-NAV-01 |
| P5-UI-03 | Renderer Worker | package renderer/components/i18n/tests | P5-OVERLAY-02 |
| P5-NOTIFY-04 | Backend Worker | deterministic desktop intent/at-most-once worker + 旧路径删除 | P5-UI-03 |
| P5-GEN-05 | Integrator | SDK 2.1/manifest/generated renderer composition | P5-NOTIFY-04 |
| P5-SMOKE-06 | Test Worker | source/packaged toolbar/navigation/polling/degraded | P5-GEN-05 |
| P5-REV-07 | Reviewer | owner/navigation/notification side effect/old IPC/package boundary | P5-SMOKE-06 |

退出门：AC-02/AC-11；hidden/loading/reload/no-session 导航正确；ready generation 无丢/重复；旧 notification API 零生产引用；backfill 不弹通知；notification `delivering` restart → uncertain 且不重弹；overlay 隐藏后停止 polling；PR 6 前无 remote 控件。

强制门：domain/SDK/root tests、generate/check、build、Electron support、source/packaged smoke。

## 11. PR 6：Zulip 可恢复主链路

### 强制阅读

Integrator、每个 Worker、Reviewer 开始前都必须完整阅读 [Zulip 官方能力合同](./continuity-zulip-official-capability-audit.zh-CN.md)，并在交付中列出使用的 fixture IDs。不得从本计划、旧代码或第三方 SDK 反推接口字段。

### 目标

扩展唯一 `ZulipBotRuntime` 和通用 Remote Messaging contract，交付 Host-first authorization、three-state dispatch、`/sf tasks/status/writes`、binding、history startup gate、durable card/index/reply/reminder outbox。catch-up/gap 时 remote write fail closed。

| Task | Owner | 产物 | 前置 |
|---|---|---|---|
| P6-SDK-01 | Contract Worker | opaque target/messaging/history/lifecycle/handler contract/tests | PR 5 |
| P6-DISPATCH-02 | Host Worker A | `claimed/legacy-eligible/ignored`，legacy dedupe 前 classify | P6-SDK-01 |
| P6-TRANSPORT-03 | Host Worker B | 唯一 Zulip target/send/edit/history/lifecycle/preflight transport | P6-SDK-01 |
| P6-AUTH-04 | Security Worker | immutable authorizedSenderId settings/migration/setup/负测 | P6-TRANSPORT-03、P6-DISPATCH-02 |
| P6-INBOX-05 | Domain Worker A | target watermark/history gate/live buffer/ignored audit | P6-AUTH-04 |
| P6-CMD-06 | Domain Worker A | binding/parser/resources、tasks/status/write commands | P6-INBOX-05 |
| P6-OUT-07 | Domain Worker B | card/index renderer、outbox worker、mention reminder/replacement | P6-TRANSPORT-03、P6-CMD-06 |
| P6-UI-08 | Renderer Worker | target/link/unlink/delivery/health/notification preflight UI | P6-OUT-07 |
| P6-API-09 | Integrator | SDK 2.2、manifest/contributions、generated files | P6-UI-08 |
| P6-REG-10 | Test Worker | kill/claim/history/live 与 existing RemoteChannel regression | P6-API-09 |
| P6-REV-11 | Reviewer | one transport、authorization、visibility、claim/outbox、package boundary | P6-REG-10 |

退出门：AC-03～07、09、10、13～15 主链路；claimed/ignored 无 direct send；未授权 repository spy 为零；same message 100 次只执行一次；ordinary legacy behavior 不回归；history gate 完成前 handler/outbox/write 关闭；gap 不推进 watermark；`/sf tasks` 只含 authorized target linked tasks；card/index 命令完整；edit 不可用恰好一个 replacement；健康状态诚实。

强制门：Continuity/SDK tests、Zulip/RemoteChannel focused、domain/capability generate/check、root typecheck/test/lint/build、source/packaged smoke。

## 12. PR 7：uncertain 收敛与恢复加固

### 强制阅读

Integrator、每个 Worker、Reviewer 必须完整阅读官方能力合同并引用 fixture IDs；复用 PR 6 唯一 history path，禁止 search client 或 SDK 偷扩。

### 目标

加固 repeated queue reset/long disconnect/gap，并用 stable marker + 同一 history path 收敛 uncertain；delivery capability 使用独立 resource/revision，card deletion 并发只产生一个 replacement。

| Task | Owner | 产物 | 前置 |
|---|---|---|---|
| P7-HOST-01 | Host Worker | history/page/error/lifecycle adversarial tests；单 transport | PR 6 |
| P7-INBOX-02 | Domain Worker A | watermark/catch-up/live buffer gap 加固 | P7-HOST-01 |
| P7-RECON-03 | Domain Worker B | marker/reconcile/confirm/retry audit capabilities | P7-HOST-01 |
| P7-CARD-04 | Domain Worker C | deleted-card replacement/revision coalescing | P7-RECON-03 |
| P7-FAULT-05 | Test Worker | kill/restart/history/live/card fault matrix | P7-INBOX-02、P7-CARD-04 |
| P7-DIAG-06 | Renderer Worker | gap/uncertain/manual risk UI | P7-INBOX-02、P7-RECON-03 |
| P7-API-07 | Integrator | capability descriptors/generated freshness；无 SDK 扩展 | P7-FAULT-05、P7-DIAG-06 |
| P7-REV-08 | Reviewer | one history path、delivery OCC、audit、recovery convergence | P7-API-07 |

退出门：AC-08 与 AC-04/07 fault regression；唯一 marker → delivered，多 marker → failed diagnostic，零 marker → remain uncertain；人工 retry/confirm 有 risk acknowledgement 和 append-only audit；连续两次 recovery 结果相同；无 cursor jump/automatic uncertain resend/ordinary history prompt。

强制门：Continuity/SDK/domain tests、Zulip/RemoteChannel focused、capability check、root typecheck/test/lint/build、source/packaged smoke。

## 13. PR 8：安全、回归与交付

### 强制阅读

Integrator、所有 Worker、Reviewer 必须完整阅读官方能力合同、D-01～D-28 和 AC-01～AC-17；UAT 结论必须与真实设备证据一致。

### 目标

只补跨模块 fault/security/upgrade、diagnostics、runbook、source/packaged smoke 与 Web/Android/iOS UAT；不引入新业务能力、兼容层或第二 recovery path。

| Task | Owner | 产物 | 前置 |
|---|---|---|---|
| P8-MATRIX-01 | Adversarial Test Worker | crash/security/upgrade fixtures 与 P0 canary | PR 7 |
| P8-DIAG-02 | Backend + Renderer Worker | bounded redacted diagnostics capability/view | P8-MATRIX-01 |
| P8-DOC-03 | Docs Worker | final architecture/runbook/evidence template | P8-MATRIX-01 |
| P8-SMOKE-04 | Test Worker | source/packaged 共用 production assertions | P8-DIAG-02 |
| P8-UAT-05 | Product Test Worker | packaged + Web/Android/iOS、Push preflight/evidence | P8-DOC-03、P8-SMOKE-04 |
| P8-AUDIT-06 | Integrator | manifest-derived boundary test、freshness、dead path removal | P8-DOC-03、P8-SMOKE-04、P8-UAT-05 |
| P8-REV-07 | Reviewer | full diff、AC evidence、release blockers | P8-AUDIT-06 |

发布 blocker：unauthorized execution/task leak、duplicate Runtime mutation、silent watermark jump、automatic uncertain resend、non-atomic ledger、secret/path/reasoning/stdout leak、DB silent rebuild、packaged path missing、Host domain hard-code/duplicate path、声称支持平台缺 AC-16 真机或以消息送达冒充 AC-17 Push。

退出门：AC-01～AC-17 均有自动/人工证据；在线 P95 ≤5 秒；source/packaged 同 production path；Android/iOS 缺设备则明确“尚未验收/不在本次支持声明”；manifest-derived architecture audit、generate freshness、typecheck/full regression/lint/build 全通过。

## 14. Coding Agent Prompt

### 14.1 Integrator Prompt

```markdown
你是 SciForge Continuity <PR 编号> 的 Integrator Coding Agent。

仓库：<repo-root>
base/target：AGI4Sci/SciForge:gui
个人远程：origin
分支：codex/continuity-XX-name
base SHA：<填写>

必须完整阅读：
1. 根 AGENTS.md；
2. 修改 docs 时完整阅读 docs/AGENTS.md；
3. docs/continuity-multi-client-v1.zh-CN.md；
4. 本执行计划的共同边界与当前 PR 章节；
5. 直接依赖 PR 的公共合同与测试；
6. PR 6、PR 7 或 PR 8 必须完整阅读 docs/continuity-zulip-official-capability-audit.zh-CN.md，它是唯一 Zulip 接口事实源。

先报告 branch、HEAD、base SHA、git status 和用户已有修改。建立 task graph/文件所有权后实施。默认一个 Write Agent；Worker 不做 Git。共享 manifest/exports/lock/generated 由你串行处理。

禁止兼容 alias、临时旁路、domain ID switch、第二 provider/transport/state path 或 test-only production path。focused tests 后跑完整退出门，并审计 private imports、旧入口、duplicate implementation、hard-code、dead files。

交付：任务状态表；文件与用途；测试命令/结果；未验证项；风险/回滚点；PR 描述草稿。
```

### 14.2 Worker Prompt

```markdown
任务 ID：<P?-...>
角色：<Contract/Backend/Renderer/Test/Security/Docs>
branch/base SHA：<只核对，不切分支>
目标：<可观察结果>
前置：<任务 IDs>
允许修改：<精确路径>
禁止修改：manifest/generated/lock/shared files/Host private path/未授权路径
必须复用：<公开合同与唯一生产路径>
输入输出：<schema/errors/states>
必须测试：<cases/commands>
完成定义：<二值清单>

PR 6～PR 8 开始前必须完整阅读 docs/continuity-zulip-official-capability-audit.zh-CN.md，并在交付列出 endpoint 对应 fixture IDs；不得维护第二份接口合同。

不执行 branch/commit/push/merge/rebase/restore/delete。发现路径重叠或未知修改立即停止并报告。缺合同就报告 blocker，不发明 fallback/compatibility。

交付：状态；修改文件；验证；未验证；架构审计；风险；建议集成顺序。
```

### 14.3 Reviewer Prompt

```markdown
只读审查当前 PR 相对 base SHA 的完整 diff，不修改文件。

PR 6～PR 8 必须先完整阅读 docs/continuity-zulip-official-capability-audit.zh-CN.md，以其 endpoint/字段/typed error/history/fixture 为唯一审查依据，并核对实现引用的 fixture IDs。

按优先级检查：
1. 数据丢失、重复外部动作、授权绕过、secret/path 泄漏；
2. canonical path、domain package boundary、Host hard-code、旧双轨；
3. command ID/OCC/receipt/outbox/watermark/recovery；
4. source/packaged production path；
5. 缺失 failure tests/docs/AC evidence。

每个 finding 给严重级别、文件/行号、复现、违反合同、最小正确修复。无 blocker 也列已核验不变量和无法核验项。
```

## 15. Draft PR 描述模板

```markdown
## Summary
<本 PR 的完整阶段>

## Why
<前置问题与为何本 PR 解决>

## Changes
- <公共合同/生产行为>

## Architecture invariants
- Canonical path: <入口 → Broker → service → ledger/port>
- Removed old paths: <若有>
- Package boundary: <证据>

## Tests
- `<命令>` — pass

## Acceptance evidence
- <AC-ID>：<证据>

## Not included
- <下一 PR 范围>

## Risks and rollback
- <degraded 行为与 revert 范围>
```

## 16. v1 最终完成定义

- PR 0～PR 8 合并最新 `gui`；domain-continuity 是唯一 owner，main/renderer entry 清晰。
- Broker stable command ID/concurrent OCC、Agent State v2 cutover、SQLite migration/replay/receipt/outbox 均由测试证明。
- Electron overlay 与 `/sf` 共用 Broker/command service；生产只有一个 Zulip transport/history/outbox path。
- offline/reset/gap/uncertain/replacement 可审计收敛；未授权与敏感 canary 全部 fail closed。
- AC-01～AC-17 证据完整，支持声明与真机一致；source/packaged、boundary、composition、capability、typecheck、tests、lint/build 全通过。
