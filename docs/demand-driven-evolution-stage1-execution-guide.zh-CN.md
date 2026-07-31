# SciForge 需求驱动 Workflow 演进 Stage1：双人开发执行指南

> 状态：Gate 0 合同与通用平台门尚未完成；不得把本文中的目标类型、action 或状态写成“当前已经可用”。
>
> 本轮范围：只更新 Stage1 规划、OpenSpec 和执行指南，没有实现或启用任何 Stage1 production code。
>
> 产品来源：[Stage1 正式总体方案](https://ecnw9f4vkfa6.feishu.cn/docx/PAWadfTCmonb4VxCf5jcTynKnec)，读取版本 `revision_id=44`（2026-07-30）。
>
> 实现合同：[`demand-driven-workflow-evolution-stage1`](../openspec/changes/demand-driven-workflow-evolution-stage1/) 下的 `proposal.md`、`design.md`、`tasks.md` 和六份 delta spec。

## 1. 先说结论

新版方案在软件工程正确性上更合理，应该作为 Stage1 的主骨架。它闭合了上一版没有写清的 owner、授权、崩溃恢复和原子激活语义。上一版只在可读性和尽早并行开发上更好；这两点应通过拆门保留，而不能靠删掉安全合同换取：

1. 所有高风险写操作都必须经过 Host 实时授权链，历史 decision、receipt、invocation ID 或重启前 token 不能恢复权限；
2. 每个外部副作用都必须先持久化 intent，并能在崩溃后通过权威 lookup 对账，绝不能凭超时猜测或自动再发一次；
3. Builder、Verifier 和 sealed harness 必须使用不同且不可伪造的 operation principal；Verifier 只看 data-only envelope，sealed 原始结果只在 trusted harness 的瞬时内存中出现；
4. source 与 packaged 两条真实生产链都必须跑故障注入、进程 kill/restart、竞争窗口和泄漏扫描；fake、直接 handler 调用和 happy-path 单测不能替代。

因此，最终方案不是退回上一版，而是：**使用新版的架构与验收合同，同时把门拆成开发门、基础合并门和能力激活门，恢复上一版合理的开发并行性。**

Stage1 只有两名开发者：

- 开发者 A 拥有 Create Loop Catalog/runtime；
- 开发者 B 拥有 Workflow Evolution；
- `[I]` 不是第三个人，而是开发者 B 另行戴上的 integration/platform 帽子；人员相同不合并权限，`[B]` 与 `[I]` 必须使用不同 task、对话、分支和 commit。`[I]` 只做通用平台和机械集成，不能替 A 或 B 编写 domain 语义。

基础平台仍须先把 `0.7A + 0.8A + 0.8B + 0.8M + 0.8S + 0.8D + 0.8C + 0.9` 八个 producer 作为不可拆分的 0.8I train 原子合入。其中 0.8S 只负责 purpose-aware inventory release/provenance/KMS-HSM signing，0.8D 是 A 独立提交且 I 必须逐字节保留的 Git Checkpoints 修复。之后基础门只包含 0.10、完整五包 Host-resource rewiring 0.10R、generic Agent contract 0.11、A/B contracts 和基础 matrix：0.12 等待 `0.8I/0.10/0.10R/0.11/0.14B`，0.15 关闭 P1/P2 合并门。

但 B 不必等 0.15 才开始写纯领域代码。A 的 0.14A 公共合同和 B 的 0.4/0.6 shell/fixtures 存在后，B 可以在 stacked branches 开发 2.3–2.6、2.8–2.10 的 Ledger/FSM/reducer/policy/projection/lease/local-fake；这些 pure branches 不含 production registration code、Agent dispatch、Publisher call 或 Catalog side effect。2.1 的 production contribution semantic producer 也可提前 author，但不得在 0.15 前 merge/register/activate；2.2 与任何其他 production merge/activation 仍必须等待 0.15。0.7B 是 8.5/P6 的独立 Publisher 激活门；0.11P/0.11S/0.11A 是 3.10/3.11B/5.10 前的独立 real-Agent 激活门，都不属于基础 0.12/0.15。

开发全过程只允许以下主链：

```text
B Ledger / deterministic Controller
        │
        │ WorkflowCatalogPort
        ▼
manifest-owner-bound system invoker
        │
        ▼
Capability Broker
        │
        ▼
A-owned Create Loop Catalog provider + one execution engine
```

不得增加第二个 Catalog service、第二套 Workflow runner、专用 IPC/preload/MCP、Host domain switch、生产 fake、兼容 alias 或 fallback。

阶段硬门如下：

1. 0.14A 与 0.4/0.6 尚未冻结：B pure P2 development No-Go；满足后可开发但不可 production merge/activate。
2. 基础 0.15 未关闭：P1 production 与 B 2.1/2.2/P2 production merge No-Go。
3. 真实 A/B provider、owner ACL 和 live authorization 未通过：P3 No-Go。
4. 0.11P/0.11S/0.11A、A 消费者迁移、I 删除旧 `run()` 未完成：Builder/Verifier dispatch、B Agent projection 和 `CANDIDATE_PRIVATE` No-Go。
5. stable caller 迁移、A/I/B transient sealed-result 链、Verifier data-only 隔离未通过：P5 No-Go。
6. P5 recovery 及 source/packaged 生产链或独立 0.7B Publisher 未通过：P6 export No-Go。

任务是否完成只看 OpenSpec [`tasks.md`](../openspec/changes/demand-driven-workflow-evolution-stage1/tasks.md) 的 checkbox 和对应 evidence SHA，不看聊天结论。

## 2. 权威来源与“当前事实 / 目标合同”

发生冲突时按以下顺序判断：

1. 根目录 [`AGENTS.md`](../AGENTS.md)；
2. active OpenSpec 的 proposal、design、六份 specs 和 tasks；
3. 飞书 Stage1 正式总体方案中未被 OpenSpec 收窄或修正的产品边界；
4. 本执行指南的分支、integration train、命令和 stop condition；
5. 其他历史提案或说明。

本文是 runbook，不是第二份领域合同。完整 FSM 边、receipt 字段和 failure-class 映射由各自 canonical owner 的 public contract 与 OpenSpec specs 维护；例如 publisher 类型属于 Host/SDK，不属于 B。本文只保留执行时必须核对的门和不变量。

在对应任务合入前，下表左侧才是当前事实：

| 当前事实 | 目标合同由谁、在哪个任务建立 |
|---|---|
| Create Loop 仍以可变 Workflow 状态为主要生产对象 | A 在 0.3、0.5、P1 建立 Catalog V1 |
| `@sciforge/domain-create-loop/catalog-contract` 尚不是可消费的冻结 seam | A 在 0.3/0.5 建立 |
| Workflow Evolution package 尚未成为 backend domain | B 在 0.4 建合法、零贡献 package shell；2.1 才加入 production contributions/lifecycle/database |
| 当前仓库生成/发现 13 个 domain package，manifest 尚未全部切到严格 V2 | I 在 0.8M 把 13 份现有 manifest 全部迁到严格 V2，并让全部 13 个通过 package-owned defaults 组成完整 `sciforge.official` 发行 cohort；新 B package 在 0.4 成为第 14 个 cohort member。产品分类另算：原 6 个 Workbench 不变，B 是第 7 个 Workbench，其他 7 个保留原分类与全部贡献 |
| Broker wire 仍未整体切换为严格 V2 | I 准备 0.7A、0.8A、0.8B、0.8M 与唯一 signing producer 0.8S；A 独立准备 0.8D；I 再准备 0.8C、0.9，最后由 0.8I 把八个 producer 加一个机械 commit 一次性合入；这些 commits 不能单独合入 |
| 现有 `git-checkpoints.restore` 成功链仍可能因外层 `changed_resource_required` 语义错误而失败 | A 在 0.8D 仅修复外层成功 envelope：保留 destructive 成功 output，返回 `changed:false` 表示没有 caller-bound resource revision；所有 UI/Agent top-level `approval=confirmation` action 由 0.8I 统一迁到 bootstrap scope + stable request ID + `createOrGetProtectedInvocation`，同进程 exact retry/read/replay 不重复 dispatch，restart 不返回旧结果 |
| Host 还不能把共享 system caller 当作 B 身份证明 | I 在 0.8A、0.8C、0.9–0.10 建 exact owner ACL、owner-bound invoker 和 package-name 生命周期拓扑 |
| Host 尚无公开 readiness reader、安全 workspace publisher 和 fail-closed package teardown | I 在 atomic 0.8I 中建立 workspace identity、SDK reservation、readiness/provenance；0.10 建 Host-owned generic lifecycle/recovery、revisioned snapshot 与 signed resource declarations/claims，0.10R 完整重接五个现有 package 的 Host primitives；独立 0.7B 以后再为 P6 建 `WorkspacePublisherV1` 与 ABI 8 native package |
| blocking Agent `run()` 仍有 Create Loop 消费者，也没有符合 Stage1 的真实 zero-retention production lane | 基础 0.11 只建 generic API、两层 tombstone/recovery contract，不宣称 real provider ready；独立 0.11P 锁定 provider 证据，0.11S 只签 static config/attestation-policy/trust/revocation bundle，0.11A 在 credential/tombstone/raw 前动态取得 fresh attestation/revocation 并消费 OS vault；3.10/3.11B 才关闭 pre-P4 real-Agent gate |
| stable callers 仍可能解析可变 `workflowId` | A 在 6.1–6.2 全部迁移并删除旧入口 |
| 普通 PR CI、Stage1 matrix、license policy 命令尚待 Gate 0 建立 | I 在 0.1、0.2、0.13、0.14A/0.14B/0.14I 建立 |

不得为了“先跑起来”把目标类型写成 test-only mock 后宣称已完成，也不得用提示词、不同 thread ID、临时目录或 `enabled=false` 冒充权限与隔离。

## 3. 两人所有权和分支

### 3.1 固定角色

| 标签 | 实际人员 | 独占语义与路径 | 禁止事项 |
|---|---|---|---|
| `[A]` | 开发者 A | `packages/domains/create-loop/**`；Catalog schema、policy、provider、store、engine、stable bindings、Promotion/rollback mechanics | 不编写 B 的 Run/FSM/documents/decision |
| `[B]` | 开发者 B | `packages/domains/workflow-evolution/**`；Run/Attempt/Gate/Operation、Ledger、routing、budget、Agent orchestration、trusted harness、UI | 不实例化 Catalog，不导入 A store/runtime/validator，不切 Anchor |
| `[I]` | 开发者 B（integration/platform 模式） | 通用 Host/SDK/Broker/CI/generator/integration files、lock/generated outputs、cross-package harness | 不替 A/B domain owner 修改领域语义，不加入 domain-ID 特判，不把 `[B]` semantic diff 混入 I branch/commit |

一个 task 只有一个 author。Review 不转移 author 和 path ownership。

开发者 B 同时承担 `[B]` 与 `[I]` 只表示同一人可以在不同任务中切换帽子，不表示同一任务可以有两个 Owner。一次 Coding Agent 对话、一个工作分支和一个 commit 必须固定为一个 Owner role；从 `[B]` 切到 `[I]` 或反向切换时，必须结束当前任务并从已验证的 integration base 另开对话和分支。

### 3.2 分支

```text
origin/stage1/integration               受保护集成分支
origin/stage1/a-<task>-<topic>          A 的 Create Loop semantic 分支
origin/stage1/b-<task>-<topic>          B 的 Workflow Evolution semantic 分支
origin/stage1/i-<task>-<topic>          I 的通用平台分支
origin/stage1/i-train-<task>            combined integration train
origin/sync/upstream-gui-YYYYMMDD       I 的上游同步分支
```

任何分支都从最新 `stage1/integration` 开始：

```bash
git fetch origin --prune
git switch stage1/integration
git pull --ff-only origin stage1/integration
git switch -c stage1/b-0.4-contract-shell
```

禁止在共享分支 rebase、force-push、直接 push，禁止把 `upstream/dev` 混入以 `gui` 为基线的 Stage1。

### 3.3 I 独占的 shared files

只有 `[I]` 可以更新：

- 根 lock/toolchain 文件；
- generated installed-domain composition；
- generated capability documentation；
- `scripts/stage1-contract-matrix.mjs`；
- `docs/generated/stage1-workflow-contract-matrix.json`；
- cross-package/provider/source/packaged harness；
- OpenSpec `tasks.md` checkbox。

A/B semantic commit 不手改生成文件和 checkbox。I 只有在 owner evidence 和 combined train CI 都通过后，才以单独 checklist commit 勾选任务。

### 3.4 开发者 B 的最新任务编号

| 阶段 | B author tasks | 交付边界 |
|---|---|---|
| Gate 0 | `0.4`, `0.6` | 只冻结 contract shell、schema/constants/fixtures；无 production runtime |
| P2 | `2.1`, `2.3–2.12` | backend package、Ledger/FSM/documents/gates、policy/price assets、budget/admission、lease、Teacher、restart；尚不调用真实 Catalog |
| Provider integration | `3.2`, `3.3`, `3.5` | 唯一 adapter、唯一 Catalog coordinator、B-owned integration fixtures |
| P3 | `4.3`, `4.4`, `4.6` | Anchor trial 编排、COVERED/PARTIAL authoritative reduction、B fixtures |
| P4 | `5.2–5.7`, `5.9`, `5.10B` | routing、唯一 Agent coordinator、Builder、Candidate orchestration/repair/cancel、B fixtures，以及不可单独合入/激活的 B-owned Candidate activation commit |
| P5 readiness | `6.6`, `6.7`, `6.10` | transient harness consumer、Verifier data-only envelope、B positive-control fixtures |
| P5 | `7.2–7.5`, `7.6A`, `7.6B`, `7.8–7.10`, `7.12A`, `7.12B`, `7.14D` | sealed/Verifier/report/decision、Promotion continuation、reconciliation、rollback、saga、完整 Ledger fault matrix，以及 B-owned activation semantic commit |
| P6 | `8.1`, `8.3–8.5`, `8.8` | public corpus、把 B package/module 从 `1.1.0` 升到 `1.2.0` 的 renderer/export semantic train、capability client、redacted export、B pilot fixtures |
| Verification | `9.2` | B package focused/type/restart/FSM/budget/Agent/sealed/export boundary gate |

B 不领取表外的 A/I task。依赖方尚未提供 immutable evidence SHA 时，B 只能写 pure contract/reducer/fake tests，不能用 production fake 或临时 Host bypass“先完成”真实路径。

### 3.5 Coding Agent 单任务调度

三种 Owner role 使用三份独立提示词：

| Owner role | 实际开发者 | 提示词 | 分支 |
|---|---|---|---|
| `[A]` | 开发者 A | [`stage1-create-loop-coding-agent-task.zh-CN.md`](prompts/stage1-create-loop-coding-agent-task.zh-CN.md) | `stage1/a-<task>-<topic>` |
| `[B]` | 开发者 B | [`stage1-workflow-evolution-coding-agent-task.zh-CN.md`](prompts/stage1-workflow-evolution-coding-agent-task.zh-CN.md) | `stage1/b-<task>-<topic>` |
| `[I]` | 开发者 B（integration/platform 模式） | [`stage1-integration-coding-agent-task.zh-CN.md`](prompts/stage1-integration-coding-agent-task.zh-CN.md) | `stage1/i-<task>-<topic>` 或 `stage1/i-train-<task>` |

每次只把 `tasks.md` 中一个且仅一个与提示词 Owner 匹配的 Task ID 交给 Coding Agent。没有 Task ID 时只做只读启动检查；零个或多个可执行候选都必须停止。Agent 不得在同一对话中执行相邻任务、从一个 Owner role 切换到另一个角色、把 review 当 authorship，或把同一实际开发者的 `[B]` 与 `[I]` 修改放入同一分支/commit。

当一个 domain semantic task 需要 combined train 时，A/B Agent 只交付 owned semantic SHA；必须结束该 Agent 任务，再由独立 `[I]` 对话从已验证 integration base 建 train。I Agent 只原样集成 owner SHA 和添加 task 允许的机械修改，不能在 train 上修 domain semantic defect。

### 3.6 B 开始 `0.4` 前的 A/I handoff

B 的第一个领域任务 `0.4` 只在 `tasks.md` 的直接依赖 `0.8M + 0.14A` 都能由已合入 immutable evidence 证明时开始。达到该状态前，A 与 I 的最小有序交付如下：

| 顺序 | Owner | Task/交付 | 合入要求 |
|---|---|---|---|
| 1 | `[I]` | `0.1`、`0.2` | 依次合入 `stage1/integration`，建立受保护基线、精确 toolchain、普通 PR CI 与 license gate |
| 2 | `[I]` | 准备 `0.7A`、`0.8A`、`0.8B`、`0.8M` | 只形成各自 task 允许的 immutable producers，不单独 merge/activate/ship |
| 3 | `[A]` | `0.8D` | 从含 `0.1/0.2` 的 base 形成独立 Git Checkpoints semantic SHA；不改 V2/ACL/generated，不能单独合入 |
| 4 | `[I]` | `0.8S`、`0.8C`、`0.9` 与 atomic `0.8I` | 验证依赖后，把八个 exact producers 与一个独立 mechanical commit 原子合入 |
| 5 | `[I]` | `0.11` | 从已合入 `0.8I` 建 generic Agent operation contract；不声称 real provider ready |
| 6 | `[A]` | `0.3`、`0.5` | 从含 `0.8I + 0.11` 的 integration 依次形成 Create Loop public contract 与 fixture semantic SHAs，不单独合入 |
| 7 | `[I]` | `0.14A` | 原样集成 A 的 exact `0.3 + 0.5` SHAs，加独立 mechanical generated/lock/signing evidence，并合入 integration |

`0.10/0.10R` 是基础门的并行 I lane，直接阻塞后续 `0.12/0.15` 与 production merge，但不在 `tasks.md` 的 `0.4` direct `dependsOn` 中；不得把“可 author 0.4”误写成 P1/P2 production 已可 merge。

在创建 `stage1/b-0.4-contract-shell` 前，B Agent 必须验证：

```text
0.8M producer SHA:
0.8I train SHA:
0.11 producer SHA:
0.3 semantic SHA:
0.5 semantic SHA:
0.14A train SHA:
Create Loop ./catalog-contract export/digest:
Current stage1/integration SHA:
```

上述 SHA 必须通过 commit-object 与 ancestry 检查，`./catalog-contract` 必须在当前 integration 真实存在且可由 source/package export 解析；聊天结论、未提交 diff、semantic draft branch 或未合入 train 不能解锁 B。

## 4. Combined integration train

只要变更触及 package/manifest/dependency、renderer contribution、capability descriptor、wire schema、public export、matrix source、root lock 或 generated output，就必须走 combined train。

### 4.1 固定步骤

1. Domain owner 从最新 integration 建 `stage1/a-*` 或 `stage1/b-*`。
2. Owner 只改 owned files，跑 focused tests，形成不可变 semantic commit。
3. Semantic draft 不单独合入 integration。
4. `[I]` 从同一个 integration SHA 建 `stage1/i-train-<task>`。
5. I 原样集成 semantic commit，不 squash/rewrite 其语义。
6. I 运行所有 generator，只增加一个独立的机械 lock/generated/matrix commit；这一 commit 不改 domain 语义，也不提前勾选 checkbox。
7. 只有 combined train 分支向 `stage1/integration` 发 merge PR。
8. A、B review combined diff；full CI、generation drift、license gate 全绿后合入。

如果 generator 暴露语义错误，立即停止 train，把问题退回 domain owner。I 不在 train 上顺手修 domain code。semantic SHA 变化后必须重新生成并重新验证。只有 owner implementation/train 已在 immutable SHA 合入并且 evidence 有效，I 才另开 phase-close checklist PR 更新 OpenSpec checkbox；不能把未合入 semantic draft 和“已完成”勾选一起交付。

### 4.2 PR 必须记录

```text
Integration base SHA:
Semantic owner:
Semantic commit SHA:
Train branch:
Owned paths:
Generated/mechanical commit SHA:
Contract matrix source digests:
Commands and exact results:
Reviewers:
Unverified / residual risks:
```

## 5. Gate 0 必须冻结的公共合同

### 5.1 唯一合同来源、生成器、输出和消费者

合同真相只有两处：

- A：`packages/domains/create-loop/src/catalog-contract/**`
- B：`packages/domains/workflow-evolution/src/contract/**`

派生 oracle 固定为：

```text
generator: scripts/stage1-contract-matrix.mjs
output:    docs/generated/stage1-workflow-contract-matrix.json
```

规则：

- generator 只读取上面两组 package exports；
- output 必须记录两组 source digest；
- I 的真实 provider/reducer integration harness 消费 generated JSON；
- B 的 production reducer 和 focused parameterized tests 直接 import B-owned adjacency constants；
- OpenSpec 是需要被核对的文档 oracle，绝不是 runtime import；
- 第二次运行全部 generator 必须零 diff。

不得手写第三份 FSM、ACL 或 capability matrix。

### 5.2 Gate 0 唯一 V1 类型清单与 Broker V2

Gate 0 的公共类型只从下表三个 export 暴露。每个 serialized value 都必须携带严格 schema ID 和 `schemaVersion=1`；未知字段、未知版本、无版本值全部 fail closed。Reader/publisher 这类 port interface 由 public V1 export 版本化，本身不是拿来序列化的 domain value。

| Owner | 唯一 public export | 必须冻结的 V1 类型 |
|---|---|---|
| Host/SDK | `@sciforge/domain-sdk/host`、`@sciforge/domain-sdk/contract` | Host export 拥有 `WorkspaceIdentityV1`、`CapabilityProviderProvenanceV1`、readiness request/evidence、`WorkspacePublisherV1`、`readPublication`、publication state/receipt/failure 和唯一 generic `RequestRebuildRecipeV1`；generic SDK contract 唯一拥有跨域 `ComputeReservationV1` |
| Create Loop（A） | `@sciforge/domain-create-loop/catalog-contract` | Definition、proposed/official Release、service binding、Catalog patch/revision、Candidate/disposition、stable/pending Anchor、operation lookup/receipt/error、controlled evaluation/cancel、Promotion、rollback 及共享 mapping fixtures |
| Workflow Evolution（B） | `@sciforge/domain-workflow-evolution/contract` | `RequirementSpecV1`、`ChangeSpecV1`、closed `CandidateProposalV1`、closed `VerificationAssessmentV1`、Builder/Verifier recipe inputs/instances/builders/fixtures、`VerificationReportV1`、`PromotionDecisionV1`、policy/price/budget、`VerifierInputEnvelopeV1`、`ReplayInputEnvelopeV1`、`SealedSuiteReceiptV1`、`AuditPublicationRebuildRecipeV1`，以及 Run/Attempt/Gate/Operation enum、terminal set、adjacency/recovery constants |

B 的 0.4/0.6 还要把 Coverage/Gap、command idempotency、budget/admission、Candidate lease/orchestration、Teacher evidence、Agent operation metadata、rollback entry、audit export 和 redacted projection 的严格 schema/fixture 一并冻结。`AuditPublicationRebuildRecipeV1` 是 B-owned closed contract，用于固定 redacted projection/source revisions、exact projection/serializer implementations、publication identity、byte length 与 digests，但绝不保存 publication bytes；本指南只说明职责与验收，不复制 canonical spec 的完整字段表。`CandidateProposalV1` 只能携带提议定义和 bounded rationale；`VerificationAssessmentV1` 只能携带 advisory recommendation、bounded risks 和 allowlisted receipt references。两个 schema 都有固定 discriminant、`schemaVersion=1`、严格字节/计数上限、unknown-field rejection 和 complete-body digest；任何身份、policy、eligibility、receipt authority 或 mutation 请求都会整份拒绝。

B 只从 `@sciforge/domain-sdk/contract` 导入 `ComputeReservationV1`，不得定义、re-export 或接受 domain-local 变体；同理只从 A 的 public contract 导入两类 Catalog error。reservation 是 closed object，除 `kind=COMPUTE_RESERVATION_V1`、`schemaVersion=1` 和 `reservationDigest` 外，精确绑定：

```text
reservationId
workspaceIdentityDigest
operationOwnerScope
budgetScopeId + budgetScopeRevision
actionId + operationId
reservedRequestBodyDigest
runBudgetDecisionId + runBudgetDecisionDigest
modelPriceTableId + modelPriceTableDigest
maxModelCalls + maxInputTokens + maxOutputTokens
maxCostUsdMicros + maxActiveComputeMs + maxConcurrentOperations
```

`reservedRequestBodyDigest` 绑定**不含 reservation envelope**的严格 request body；`reservationDigest` 只从完整 validated object 中排除它自己，再按 RFC 8785/SHA-256 lowercase 计算。这个单向顺序避免 request/reservation digest cycle。这里的“清单”不是允许创建一套公共 runtime；Gate 0 shell 虽然必须是 repository-generator-valid 的合法 package，但不得带 production capability、lifecycle、database、renderer 或 fallback。

`CAPABILITY_BROKER_CONTRACT_VERSION` 在 0.8A 只能一次性从 `1` 升到 `2`：

- descriptor、registry、SDK、IPC、preload、renderer client 和 generated capability docs 全部携带并验证 V2；
- 任一 V1/V2 混用在 discovery 或 dispatch 前 fail closed；
- 不提供 default-field upgrade、兼容 alias、双 parser 或临时 V1 fallback；
- V2 同时冻结 `allowedSystemOwnerScopes`、单值 authorization purpose、三类 invocation/delivery mapping 和公开 readiness reader；
- owner、workspace、provider provenance、invocation class、principal、readiness evidence 都由 Host 当前上下文产生，payload/options 不能选择或削弱。

所有 top-level `approval=confirmation` invocation 都只能走一条 Host-orchestrated flow，不按 effect 分叉，也不区分 UI/Agent 或 `global | workspace | resource`：

1. authenticated UI/Agent channel bootstrap 时，Host 返回闭合 `{contractVersion:2, creationScope}`。creation scope 只绑定当前 `processEpoch`、channel/principal、audience 和 caller owner，不绑定 target，也不是 permission；workspace/resource target 由后面的 per-entry `ProtectedInvocationScopeBindingV1` 单独派生。canonical client 为这一次 initiation 生成一个稳定 lowercase UUIDv4 `requestId`，同次 retry 必须原样复用 scope 与 ID；
2. 唯一创建 API 是 `createOrGetProtectedInvocation({contractVersion:2, creationScope, requestId, actionId, request})`，其中 request 只有 `{input, resource?, expectedRevision?}`。Host 先验证 authenticated audience 和 exact registered `approval=confirmation`，再根据 descriptor 派生 `GLOBAL | WORKSPACE | RESOURCE` binding。generic invoke、preload/IPC、Agent-tool bridge、renderer dialog/caller boolean 和旧的 destructive/external-write-only 分支都必须在 protected lookup 前拒绝；
3. 每个 live provider registration 都有 Host-minted、不可序列化的 `providerRegistrationId`，绑定 retained provenance、descriptor version/effect/approval、schemas、handler 和 lifecycle resource。第一次 create 使用 `(processEpoch, channel, creationScope, requestId)` 作为唯一 key，保存 exact request/caller tuple/provider binding，生成 invocation/reference/private challenge，先把 `AWAITING_CONFIRMATION` entry 注册为 provider lifecycle resource，再打开 Host trusted preview。exact create retry返回同一 `ProtectedInvocationCreateAckV1`；相同 ID 配不同 action/request 只返回 `PROTECTED_INVOCATION_REQUEST_MISMATCH`，不能泄漏原 entry；
4. entry FSM 固定为 `AWAITING_CONFIRMATION -> DENIED | EXPIRED | CANCELLED | FAILED | DISPATCHING`，`DISPATCHING -> IN_FLIGHT | CANCELLING | FAILED`，`IN_FLIGHT -> CANCELLING | SUCCEEDED | FAILED | OUTCOME_UNKNOWN`，`CANCELLING -> CANCELLED | SUCCEEDED | FAILED | OUTCOME_UNKNOWN`。只有 Host trusted surface 可记录 `APPROVE | DENY`；确认时重验 exact live provider registration 和全部 binding、消费 private single-use receipt，并只 dispatch 已保存的 request；
5. `cancelProtectedInvocation`、exact create retry、`readProtectedInvocation(reference)` 和同进程 `replayProtectedInvocation(reference)` 都只能观察这一个 non-evicting entry，不能创建/确认/重复 dispatch。provider quiesce/disable/replace 必须先关闭 protected admission、cancel/contain 所有 bound entry，并等其 terminal/resource release；replacement registration 不能继承旧 confirmation；
6. restart 在任何 lookup 前使 creation scope、request retry、reference、invocation ID、challenge、receipt 和旧 result 全部失效。客户端不能自动换 scope/ID 或返回旧 Broker result；继续 durable effect 必须由用户显式新 initiation、新 confirmation，再进入 capability 自己的 reconciliation path。

0.8C 是全仓迁移，不是只给 Stage1 新 descriptor 加规则。I 必须先盘点 source 与 packaged composition 中每个已有 `system` descriptor 和 manifested caller edge：不再需要 system audience 的就删除；仍需要的就写非空、无重复、exact manifest-owner ACL。任一未审计 descriptor、空 ACL、wildcard、action-prefix 推断或 repository-wide permissive default 都会阻止 V2 激活。

两条现有调用链必须保留为回归基准：

```text
sciforge.project-dag
  -> evidence-dag.view
  ACL 只能包含 sciforge.project-dag

git-checkpoints.restore
  grants sciforge.version-control.restore
  -> version-control.restore
  requires sciforge.version-control.restore
  ACL 只能包含 sciforge.git-checkpoints
```

第二条链还必须拒绝 wrong owner、wrong workspace、wrong purpose、direct inner call、expired/closed outer scope、detached child 和 payload/options purpose injection，且在 inner handler 前零 dispatch。0.8C 只允许修改既有 package 的 ACL/purpose metadata，不允许借机改 handler、payload schema、business policy 或 domain state；每个受影响 package diff 都要 A、B 共同 review。

Git Checkpoints 还存在一项与 V2 metadata 分开的基线语义修复 `0.8D [A]`：

- 只处理成功的 workspace-scoped outer `git-checkpoints.restore` envelope；
- real inner restore 的 destructive success output 保持不变；
- outer Broker mutation metadata 返回 `changed:false`，只表示该外层 capability 没有可推进的 caller-bound resource revision，不表示 workspace 没变，也不能把 success 改成 failure；
- source 与 packaged real Broker 都必须证明不再触发 `changed_resource_required`；
- digest conflict、inner failure、outer failure 继续 fail closed，不能包装成 success；
- response 丢失后的 exact replay 只有在同一仍存活 Broker process/epoch 内才可返回 immutable success，并必须证明 real nested restore 至多 dispatch 一次；restart 后不返回旧结果，旧 invocation/confirmation 在 lookup 前失败，后续动作只能走新 preview、新 Host invocation、新 confirmation 和 capability 自己的 durable reconciliation；
- 0.8D 不改 manifest、V2 schema、generated output、ACL、purpose 或其他 Git Checkpoints 行为；0.8I 必须原样集成该 A commit，0.8C 只能在它周围补 metadata，不能 rewrite/squash reinterpret。

### 5.3 Host workspace、Manifest V2 与 package 生命周期

0.7A/0.8I 必须先于 A/B database 和 production adapter 建立基础 Host 合同；0.10/0.10R 再在 production package 合并前关闭通用平台与资源治理。0.7B 不属于这组基础前置，它是后续仅供 8.5/P6 真实导出使用的 Publisher 激活合同与实现：

- 0.7A 的 `WorkspaceIdentityV1`：Host 从已存在目录的 validated absolute realpath 和稳定平台目录身份派生，处理 case 与 symlink alias，绑定 caller context；A/B 只把它当 opaque key。同一 semantic commit 在 `@sciforge/domain-sdk/contract` 定义唯一 `ComputeReservationV1`。0.7A 不能单独合入，只能随 0.8I foundation train 原子落地。
- 0.8B 的 `CapabilityProviderProvenanceV1` 是闭合 union：`DOMAIN_MANIFEST` 来自 activated generated domain manifest；`HOST_CORE` 来自 immutable Host-core definition。两种分支都必须带 `moduleId/moduleVersion/definitionDigest`。`version-control.restore` 使用 `HOST_CORE` provider provenance；它的 caller owner 仍来自 `sciforge.git-checkpoints` manifest，不能伪造一份 domain manifest，也不能按 action prefix 推断 owner。
- 0.7B 的 `WorkspacePublisherV1.publishNewFile` 和 `readPublication` 只通过一个 native package 实现；B 只提交 stable `publicationId`、根目录下一个合法 filename、media type、content digest 和 bounded mutable bytes，永远拿不到 canonical path。

#### Manifest V2：发现、分发、依赖和 caller authority 是四件不同的事

0.8M 把当前生成器能发现的 13 个现有 domain package 全部迁移到唯一严格的 `DomainPackageManifestV2`：

```text
Anchored Comments
Biology Room
Browser Preview
Change Inspector
Create Loop
Evidence DAG
Git Checkpoints
Life Science Preview
Paper Radar
Project DAG
Remote SSH
Terminal
Visual Review
```

`sciforge.official` 是当前正式发行携带和初始化的完整 package cohort，不是 Workbench 产品分类标签；Host 仍然不能写死 package list 或数量：

- 13 份现有 manifest 全部必须是 `contractVersion: 2`，且 `module.version` 精确等于各自普通 `package.json.version`；
- 每份 manifest 都必须显式携带 canonical、按 UTF-8 byte tuple 排序、无重复的 `outboundSystemCapabilities`；没有 system call 时也写空数组；
- 13 个现有 package 全部声明 package-owned `distribution: { channelId: "sciforge.official", defaultInstalled: true, defaultEnabled: true }`，所以 B 加入前 cohort 正好是 13；
- 新 `@sciforge/domain-workflow-evolution` 在 0.4 声明相同 metadata 后成为第 14 个 cohort member；
- Workbench 产品分类仍是原有 Create Loop、Visual Review、Change Inspector、Terminal、Anchored Comments、Git Checkpoints 六个，加上 Workflow Evolution 后才是七个；另外七个 release-cohort package 不因此改成 Workbench，且保留原有 capability/panel/toolbar/preview/lifecycle 等全部贡献；
- release configuration 只能选择 `channelId`，不能 include/exclude 或枚举 package；
- V1 manifest、V1/V2 union、in-memory upgrader、default-filled adapter、legacy validator 和 source/packaged 双图全部删除，不能兼容共存。

signed inventory 是唯一 composition 输入。它对每个 channel member 绑定：

```text
standard package name
stable moduleId
module.version == package.json.version
manifest definitionDigest
every CanonicalContractExportDescriptorV1 digest and exact bytes
closed runtime dependency objects
canonical outbound system edges
distribution defaults
```

每个 public contract export 都必须生成一个 target-neutral、闭合的 `CanonicalContractExportDescriptorV1`，绑定 package/module/version/export path、按 export name 的 UTF-8 bytes 排序且无重复的 contract exports，以及 `implementationSurfaceDigest` 和 `typeSurfaceDigest`。descriptor 与 surface model 都使用 versioned closed schema、RFC 8785 canonical JSON UTF-8 和 lowercase SHA-256。source 与 packaged pipeline 分别从普通 package export 独立重建同一 contract/implementation/type surface，再比较并携带完全相同的 descriptor bytes；不能拿 TypeScript source 与 transformed/bundled JavaScript 原始字节直接比较，也不能让 tree shaking、conditional export、source map 或 bundling 改写 descriptor。

唯一签名容器是闭合 `SignedDistributionInventoryEnvelopeV1`：

```text
kind = SIGNED_DISTRIBUTION_INVENTORY_V1
schemaVersion = 1
keyId
algorithm = Ed25519
body
signature
```

closed `body` 精确包含 `kind=DISTRIBUTION_INVENTORY_BODY_V1`、`schemaVersion=1`、`releaseId`、`buildId`、`channelId`、正 safe-integer `inventorySequence` 和 canonical sorted members。signature input 是 exact ASCII `SciForge.SignedDistributionInventoryV1`、一个 `0x00` 和 body 的 RFC 8785 canonical JSON UTF-8 bytes。

生成和验证只能把仓库现有 official keyring 一次迁到 strict `OfficialVerificationKeyV2`，不能另建 Stage1 keyring。每把 key 只有一个不可变 usage：`official-extension-package | distribution-inventory | agent-provider-trust-bundle`；旧 key material 逐字节保留且只能是 extension usage，新 inventory/bundle key 必须有不同 key ID 与 fingerprint。sequence-bearing `ACTIVE` key 只能接受 exact usage/interval 的新 artifact；退役 key 变成带 frozen maximum 的 `VERIFY_ONLY`，只能重验它退役前 Host 已接受并保留 exact bytes 的历史 artifact，绝不能接受新提交的 artifact。usage/fingerprint 复用、interval gap/overlap、V1 fallback 或用 `VERIFY_ONLY` 签未来 artifact 都 fail closed。

Host 预期 release/build/channel 只能来自 immutable closed `HostReleaseProvenanceV1`：`releaseId/buildId/channelId/applicationVersion/semanticTrainTreeDigest/provenanceDigest`。source CI 使用绑定 exact immutable parent 的 read-only module；packaged app 使用认证打包/代码签名边界覆盖的 immutable resource。Host 必须先认证 provenance，再把其中三个 expected values 传给 inventory verifier；settings/env/CLI/inventory/package/旁路文件不能覆盖。

`0.8S` 是唯一 release-signing producer，操作顺序固定：

1. inventory-changing train 提交 reviewed closed `DistributionInventoryReleaseInputV1`，精确字段只有 `schemaVersion:1`、`releaseId`、`buildId`、`channelId`、正 safe-integer `inventorySequence`、`keyId`；禁止 package list/count/include/exclude/member、signature 或 private-key material；
2. protected release controller 显式分配并记录下一条 per-channel sequence；generator 不能 auto-increment、按时间/package 推导、静默复用或改写 input；
3. ordinary PR CI 从 exact immutable unsigned semantic-parent tree 与 fixed input 确定性生成 RFC 8785 body，独立验证 member/export/definition binding 和已有 envelope，并以相同 parent/input 二次生成零 diff；repository checkout 和普通 PR job 没有 production private key，也不能产 production signature；
4. 只有 distinct、non-exportable、exact-usage 的 KMS/HSM 或等价隔离 signing service 能签名。build/controller principal 与 signer principal 必须分离；signer 不能 fetch/checkout/execute/build/test/inspect repository code，也不能接受 repo URL、commit、archive、path、command、member list 或 mutable config。它只接受 usage/key ID、canonical signature-input bytes 与 digest、body digest、以及已经绑定 provenance/input/parent/sequence 的 immutable evidence reference，独立重算并验证 eligibility 后只返回 signature 与 signer receipt；
5. signature/envelope 只能落在以该 semantic parent 为父的一个 mechanical child commit；child 不得改 package/manifest/definition/export/dependency/edge/input 等语义。Final CI 必须从 recorded parent/input 重算 body 并验证 envelope，拒绝 signing child 或其后任何 semantic drift。child SHA 只是 evidence，不进入被签 body，因此不存在 commit-SHA/signature cycle。

签名者缺失、sequence stale/reused/non-monotonic、body/parent/key mismatch、普通 PR 暴露 private key、signing child 有语义编辑或证据缺失，全部 `NO_GO`。0.8I/0.8M、0.14A、0.14B、2.2、8.6 以及以后任何 member/version/definition/export/distribution/dependency/outbound-edge 变化，都必须提供新的显式 release input、sequence allocation 和 protected signing evidence。

Host 在任何 package-state reconciliation、construction 或 lifecycle 前事务持久化 `AcceptedDistributionSecurityStateV1`，而不是只保存 digest：

- 当前最高 `inventorySequence/bodyDigest`、exact verified signed-envelope bytes、exact canonical body bytes、authenticated provenance digest/tuple 与 accepting key usage/revision/eligibility interval；
- 每个曾被接受 package 的 retained binding：package name、stable module ID、最高 package/module release SemVer、definition digest、完整 sorted export-descriptor digest bindings、来源 sequence/body digest；
- 永久双向 package-name↔module-ID tombstone。后续 inventory 删除 package 也不能删除 binding、identity mapping 或可复现它们的 signed evidence。

每次启动都用同一 purpose-aware keyring 和历史 `VERIFY_ONLY` 规则重新 parse/verify retained signed bytes，重算 provenance/body/member binding，再做 monotonic 比较；一个 transaction append 可复现 evidence、推进受影响 per-package high-water/tombstone 和 latest state。同 sequence/同 body/provenance reopen 幂等；低 sequence、同 sequence不同 body、provenance tuple 不匹配、wrong-usage/revoked/ineligible key、invalid signature、package/module version rollback、同版本 definition/export drift 或 package/module identity reuse 都在 composition 前失败。

版本规则也是 inventory 合同，不是 npm convenience：

- 九个普通 `package.json.version` 仍为 `0.1.0`、但 manifest 已为 `1.0.0` 的现有 package，统一把 ordinary package version 升到 `1.0.0`，绝不能把 manifest 降到 `0.1.0`；
- `module.version === package.json.version` 是整个 backend/renderer/lifecycle/capability/export 的唯一 release compatibility version；
- 相对同 package 的最高已接受 inventory，只要 `definitionDigest` 或任一 bound contract-export descriptor digest 变化，package/module 都必须使用更高的 numeric release SemVer；同版本 drift 或 downgrade 在 generation/verification 时失败；
- 0.3 新增 Create Loop `./catalog-contract`，因此必须在 regeneration 前把 Create Loop package/module 从 exact `1.0.0` 同步升到 `1.1.0`；
- 0.4 的零贡献 Workflow Evolution shell 固定 package/module `1.0.0`；2.1 增加 production definition/contributions 前同步升到 `1.1.0`；8.3 首次加入 renderer/`./renderer` definition-export surface 时同步升到 `1.2.0`，8.5 必须使用同一个尚未合入的 `1.2.0` semantic train，8.6 只补 higher release input/protected signature，I 不能替 B bump version 或改 definition。

Manifest V2 dependency 不再是字符串，而是闭合对象：

```text
packageName
minimumModuleVersion
maximumModuleVersionExclusive
requiredContractExports
```

版本只接受完整、无 prerelease/build/wildcard/caret/tilde 的 release SemVer `MAJOR.MINOR.PATCH`，并按数值 tuple 验证：

```text
minimumModuleVersion <= provider.module.version < maximumModuleVersionExclusive
```

`requiredContractExports` 必须显式存在、去重并按 UTF-8 bytes 排序；source 与 packaged 实际加载的 ordinary export 必须重建出 signed binding 中完全相同的 descriptor bytes、contract surface、implementation surface 和 type surface。Project DAG 的现有依赖固定为 Evidence DAG `[1.0.0, 2.0.0)` + `["./contract"]`。Workflow Evolution 的唯一依赖固定为 Create Loop `[1.0.0, 2.0.0)` + `["./catalog-contract"]`；两边还保留普通 production `package.json` dependency，不能只靠 manifest。

每个 outbound edge 是闭合对象：

```text
actionId
targetProviderModuleId
authorizationPurposeMode = none | inherit-current-action
authorizationPurpose     = null | one exact namespaced purpose
```

generator 必须把 caller edge 与 target descriptor 的 provider module、`system` audience、`allowedSystemOwnerScopes` 和 required purpose 做机械交叉验证。Host owner-bound invoker 只能调用 signed inventory 中存在的 exact edge；target ACL 仍须再次验证，但 ACL 不能反向创造 caller authority。factory、handler、payload、invoke option、action prefix、runtime scan 或 Host default 都不能补边、扩边或推断边。

0.8M、0.8C、0.10R 是仅有的 repository-wide I 例外。前两者只能改 manifest/schema/generator/signed inventory/outbound edge/target ACL-purpose metadata；0.10R 只能把完整审计发现的现有 resource acquisition 替换为 signed declaration 指定的 behavior-preserving Host primitive 和 pre-acquisition claim，包含 `HOST_NETWORK_LISTENER`，不能改 handler contract、payload、business branch/policy、domain state/schema、retry semantics 或 user-visible outcome。把现有 13 个 package 纳入 complete official release cohort 是 metadata migration，不是产品重分类；0.10R 是五包实际 wiring train，不是把 package recovery logic 搬进 Host。两者都必须保留所有原 contribution、选择和行为，并由 A、B 及每个 affected package 的 recorded owner review。

Stage1 publisher 的范围刻意收窄为“workspace 根目录下一个新文件”：

- `relativePath` 必须正好是一个 filename；`/`、`\`、其他分隔符、`.`、`..`、空 segment、drive/device prefix/name、NUL 和任何 nested path 都在 native dispatch 前拒绝；
- 不做 component walk，也不承诺 movable-parent 或任意嵌套目录安全；将来若需要嵌套路径，必须新版本合同和新威胁模型，不能在 Stage1 上加字符串检查绕过去；
- `workflow-evolution.export-audit` 必须是当前同 owner/workspace、`effect=external-write` 的 confirmed outer invocation，并授予唯一 `sciforge.workspace-publisher.export-audit` purpose。Host 必须先完成 owner/workspace/effect/purpose/live-scope validation，任何失败都发生在 child registration 和 publication lookup 前；
- 验证全部通过后，Broker 才能原子注册 publication child；只有 child 注册成功后才能 publication-operation lookup、接受/复制 bytes、创建 temp 或调用 native；
- Host 以 `(workspaceIdentity, operationOwnerScope, publicationId)` 建 durable namespace，严格比较 request digest；复用 ID 但 filename/media/digest 不同只在 Host-private state 记录 `REQUEST_DIGEST_CONFLICT`，公开只能返回 `REQUEST_REJECTED`，且零文件变化；
- canonical child 注册后，publisher 还必须按 `(workspaceIdentity, operationOwnerScope, publicationId) + current durable revision` 取得一个 expected-revision **per-operation execution fence**。Host transaction 把 winner 绑定到 Host-generated publisher execution-attempt ID 和当前 process epoch；任何 publication state transition 或 filesystem/native call 前都必须已取得 matching fence。它只负责并发控制，不替代 confirmation、canonical registrar、lease 或 durable publication FSM；
- 应用继续使用既有 single-Main-process ownership；packaged second instance 必须在 publisher 初始化前拒绝。唯一 Main 内每个 executing publication key 只有一个 non-evicting single-flight entry。两个并发 fresh confirmations/resumes 恰好一个 execution-fence winner；loser 零 filesystem/native call，只能在 winner settle 后以当前 read authority 读取并采用 durable state。live epoch 内不能 steal、timeout 或 LRU-evict fence；容量满就 fail closed。crash 后的新 sole Main 只能在 fresh confirmation、新 child registration、当前 package/read authority、durable reconciliation 和 expected-revision CAS 下接管，不能后台恢复旧授权；
- durable publication operation 只保存 `relativePath`、media/content digest、status/failure/receipt、一个 active `tempNonce`、从 `TEMP_STAGED` lineage 开始存在的 platform-stable file identity、publisher execution-attempt metadata，以及从 `PUBLISHING` 开始才存在并由该 terminal lineage 保留的 `publishAttemptId`；raw content bytes 不能进入 operation/idempotency record、log、trace、event 或 cache；
- Host 必须在首次创建 `IN_PROGRESS/CLAIMED` 的同一个原子 transaction 中生成并持久化唯一、不可预测、namespace-unique 的 active `tempNonce`。该 COMMIT 前禁止 native create；native port 只接收已经持久化的 nonce 与 retained root handle，不能自己生成、轮换或替换 nonce；
- claim COMMIT 后必须先通过 root-handle-relative no-follow/reparse-safe lookup 证明 exact nonce path 和 final 都不存在，才可 exclusive create。若 `CLAIMED` 阶段发现 nonce path 已有任何对象，无论 regular、同 digest、hard link、symlink 或 Windows reparse point，它都没有可信 identity，必须 **no-touch**：禁止 open-for-write、truncate、adopt、relink、rename、delete 或签成 success。能权威证明冲突时只在 Host-private state 记录 `TEMP_IDENTITY_CONFLICT`，公开只能是 `PUBLICATION_FAILED`；identity/type/absence 有歧义时 durable state 为 `OUTCOME_UNKNOWN`，公开只能是 `OUTCOME_UNCERTAIN`。nonce 是否存在及其 type/identity/link/name/diagnostic 不能通过 result、异常文本、IPC、event、caller-visible log 或备用 error channel 外泄；
- 只有当前进程 successful exclusive create 返回的 handle 可以接收 bytes。Host write/flush/digest 后，必须在 handle 仍绑定时重新证明 nonce path 仍是同一个 regular、non-reparse、single-link identity，再以相同 nonce/identity/digest 原子提交 `TEMP_STAGED`；path swap、额外 hard link、type/identity drift 全部 fail closed 且不触碰观察到的对象；
- pre-`TEMP_STAGED` kill matrix 必须分别 kill 在 claim COMMIT 后但 native create 前、exclusive create 后、首字节后、temp flush 后、identity read 后、以及 `TEMP_STAGED` COMMIT 前。六个窗口重启后都仍是带原 nonce、无可信 temp identity 的 `CLAIMED`，但**只有第一个窗口**可恢复，而且必须权威证明 nonce path 与 final 都不存在。其余五个窗口留下已有但不可信的 nonce path，必须 no-touch fail closed，不能“重新打开并继续写”；
- `TEMP_STAGED` 只有在 exact persisted nonce/identity/digest 仍匹配且 final 不存在时，才可在新的 matching confirmed child 下恢复。之后 canonical `enterPublish()` 必须先赢；紧邻任何 native no-replace 前，Host 必须在 matching publisher execution fence 下重新做 root-handle-relative no-follow proof，确认 staged temp 仍是 exact regular、non-reparse、single-link identity/digest 且 final absent，再用 expected-revision transaction 原子提交 `TEMP_STAGED -> PUBLISHING`，绑定 Host-generated `publishAttemptId`、publisher execution attempt/process epoch、当前 registered child attempt、nonce、temp identity/digest 和 final name。CAS、fence、identity、type、link count、digest 或 final-absence 任一失败都必须零 native publish；
- `enterPublish()` 返回的不可序列化 lease 与 matching publisher execution fence 必须一直持有到 native no-replace、final proof、支持时的 root durability flush、以及 durable success receipt 或 terminal failure-state COMMIT。只有 `SUCCEEDED` 携带 receipt；不存在 failure receipt。successful-return/throw/cancel/revoke 先赢时 deny lease、零 final，并保证 durable state 停在 `PUBLISHING` 之前；lease 先赢时 outer settlement 必须等待。`PUBLISHING` 是 durable external-write fence，per-operation fence 是独立并发控制；两者都不是第二套授权 FSM；
- recovery/cleanup 禁止目录枚举、glob/prefix scan、猜 nonce、选最新 temp、生成第二个 active nonce 或第二个 active temp。`CLAIMED`/`TEMP_STAGED` 时 final 即使与 temp 同 identity/digest，也只能 conflict/unknown，绝不能签成 success。**只有已有 durable `PUBLISHING` lineage** 才能在新的 matching confirmation + 新 canonical lease + matching execution fence 下继续或对账。无论 native call 后立即成功还是 restart reconciliation，root-handle-relative no-follow proof 都必须证明 final 是 regular、non-reparse、single-link、exact fenced identity/digest，并单独证明 exact nonce path 已不存在，才可 flush root 和提交 `SUCCEEDED`。hard link、额外 link count、symlink/reparse、非 regular、identity/digest drift、nonce 仍存在或证据有歧义都只能 conflict/unknown；
- durable lookup state 只有 `NOT_FOUND | IN_PROGRESS | SUCCEEDED | FAILED | CANCELLED | OUTCOME_UNKNOWN`，内部 `IN_PROGRESS` phase 才是 `CLAIMED | TEMP_STAGED | PUBLISHING`；public result 使用扁平 phase，不能把 `IN_PROGRESS/CLAIMED` 当 wire shape。Closed `WorkspacePublicationReceiptV1` 精确字段只有 `schemaVersion`、`publicationId`、`requestDigest`、`relativePath`、`mediaType`、`contentDigest`、Host-computed safe-integer `byteLength`、`phase:"SUCCEEDED"`；
- closed `WorkspacePublicationPublicResultV1` 只有三种：`NOT_FOUND` 只含 schema/version/publication ID/phase；`CLAIMED | TEMP_STAGED | PUBLISHING | SUCCEEDED | CANCELLED` 含 request allowlist 加 phase；`FAILED | OUTCOME_UNKNOWN` 含同一 allowlist、phase 和唯一 `failureClass`。`FAILED` 只允许 `REQUEST_REJECTED | PUBLICATION_FAILED`，`OUTCOME_UNKNOWN` 只允许 `OUTCOME_UNCERTAIN`。unknown field、nested private result、arbitrary metadata、timestamp、owner/workspace identity 或 alternate error/details object 都必须 serialization failure；
- `readPublication` 只读、owner/workspace scoped，不继承历史授权，也不检查/修改 bytes、取得 execution fence、进入 lease、flush 或签 receipt。Public lookup 与 `publishNewFile` **绝不返回 Host-private `tempNonce`、platform file identity、publisher execution-attempt ID/epoch/revision、`publishAttemptId`、native/root handle、canonical workspace path、registrar child/lease identity、exact diagnostic code 或 private absence/occupancy/type/link evidence**，也不能借 exception/IPC/event/returned log/alternate channel 绕过。`FAILED/CANCELLED/OUTCOME_UNKNOWN` 不自动再发，也不换文件名；
- source 和 packaged app 必须加载同一个 `@sciforge/workspace-publisher-native`。Node-API ABI 固定为 8，release CI 真实构建并探测 macOS arm64、macOS x64、Windows x64、Linux x64 四个 target；macOS 两架构使用隔离 staging。Electron 必须 externalize native dependency，并通过 `files`、`asarUnpack`、`beforePack/afterPack` 和 runtime probe 验证实际 shipped binary；
- native helper 只对 retained workspace-root handle 下的 temp/final filename 操作：macOS 用 `renameatx_np(..., RENAME_EXCL)`，Linux 用 `renameat2(..., RENAME_NOREPLACE)`，Windows 用 handle-relative `FileRenameInfoEx` fail-if-exists/reparse-safe 等价语义。final native entrypoint 必须同时收到当前 canonical publish lease 和完全匹配的 durable `PUBLISHING` fence；`CLAIMED`/`TEMP_STAGED` 根本没有 final-publish entrypoint。普通 rename、copy-delete、overwrite fallback 和 host-machine binary fallback 全部禁止；unsupported platform/filesystem 只能 fail closed。

0.8B 还提供公开只读的 `CapabilityReadinessReaderV1`。request 与 evidence body 顶层都严格为：

```text
schemaVersion: 1
entries: [
  actionId
  descriptorContractVersion
  inputSchemaVersion
  inputSchemaDigest
  outputSchemaVersion
  outputSchemaDigest
  enforcementProfileVersion   // 与 digest 同时为 null 或同时非 null
  enforcementProfileDigest
  enabled
  providerModuleId
  providerProvenanceKind      // DOMAIN_MANIFEST | HOST_CORE
  providerDefinitionDigest
]
```

entries 按 `actionId` 的 UTF-8 byte lexical order 升序排列并禁止重复。Host 只从 canonical registry/schema/profile/provenance source 读取当前实际值，对完整 versioned body 的 RFC 8785 canonical JSON UTF-8 bytes 做 SHA-256，输出 lowercase hex `evidenceDigest`。缺失 capability 通过 omitted entry 表示，disabled capability 通过 `enabled=false` 表示；任何 descriptor/schema/profile/provenance drift 都保持 `STILL_BLOCKED`。B 不得直接 import registry/IPC、读取 generated 文件冒充 live state，或接受 payload readiness/provenance 声明。

0.10 与 2.1/2.2 的 package topology 固定为：

```text
@sciforge/domain-workflow-evolution
        │ depends on（package name edge）
        ▼
@sciforge/domain-create-loop

activation: @sciforge/domain-create-loop -> @sciforge/domain-workflow-evolution
disposal:   @sciforge/domain-workflow-evolution -> @sciforge/domain-create-loop
```

0.10 是唯一 canonical、versioned、durable package-state controller。它把每个 standard package name 的 `installed` 与 `enabled` 显式选择持久化，并与 Host-derived effective availability 分开；首次创建、schema/distribution migration 和 crash retry 都必须 transactional、idempotent，且只对 generated signed-distribution inventory 对账。

- fresh state 在 B 加入前从 verified `sciforge.official` inventory 的 13 个 member defaults 建状态，加入 B 后从 14 个 member defaults 建状态；Host 不写死名字或数量；
- 13→14 upgrade 保留原 13 个 package 的 disabled/uninstalled/installed/enabled 选择和全部可见贡献，只为 never-seen Workflow Evolution 写入 signed default；不能为了满足依赖偷偷重启用 Create Loop，也不能在后续升级重置用户显式禁用的 Workflow Evolution；
- `installed`、`enabled` 是持久用户选择，effective availability 是 Host 派生状态。只有 `installed && enabled` 且完整 dependency numeric-version/definition/export closure 有效的 package 才进入同一个 effective active set；dependency 不可用时必须保留 Workflow Evolution 的 `installed:true, enabled:true`，只把 effective reason 设为 `DEPENDENCY_UNAVAILABLE`；
- 这个 active set 统一 gate capability definition/readiness、handler/system invoker、所有 main contributions、renderer、event/subscription、background resource 和每个 remaining generated contribution kind。disabled/unavailable package 必须是完整零贡献，不只是 lifecycle 没启动；
- verified inventory 还必须先通过 existing-keyring Ed25519、release/build/channel binding 和完整 `AcceptedDistributionSecurityStateV1`：exact signed envelope/body evidence、per-package version/definition/export high-water 和永久双向 package/module tombstone；reactivation 重新验证这些 retained bytes/bindings、持久选择、完整 graph、numeric version interval、signed outbound edges 和 package-to-module mapping。不能只信 digest，也不能让旧 B contribution 继续挂在 missing/disabled/failed/different-version/export 的 A 上。

Package lifecycle 与上文 Broker child registrar 是两套不同层级的 FSM。唯一 `PackageLifecycleStateV1` 固定为：

```text
INACTIVE -> ACTIVATING
ACTIVATING -> ACTIVE | QUIESCING
ACTIVE -> QUIESCING
QUIESCING -> DISPOSING | TEARDOWN_FAILED
DISPOSING -> INACTIVE | TEARDOWN_FAILED
TEARDOWN_FAILED -> QUIESCING
```

- `INACTIVE -> ACTIVATING` 先原子创建 durable `PackageLifecycleAttemptV1`。Host 生成不可复用 `lifecycleAttemptId`，绑定 exact signed package/module/version/definition/export、当前 `processEpoch` 和 monotonic revision；每次 transition 用 expected-revision CAS，取得 execution/recovery ownership 时在同一 transaction 更新 owner epoch。teardown retry 保留同一 attempt ID，后续 reactivation 新建 ID；
- 只有 `ACTIVATING` 可在 Host-private、attempt-scoped staging container 里 construction/registration。staged capability/main/renderer/readiness/event/subscription/worker/timer/child/resource 必须 inert/paused、不可发现/调用/render、不能接受 external/background work；construction 不能私自启动未注册 I/O。任何可能跨进程存活或影响外部状态的 resource，必须先 durable claim，再经 Host staged acquisition。完整 staged set freeze 后才可进入 final publish；任何失败保持全量不可见并进入同一个 `QUIESCING`，不能另建 rollback-only lifecycle；
- lifecycle controller 为每个 published package 持有一个 durable、immutable、revisioned `PublishedPackageSnapshotV1`，精确绑定 Host 分配且 package-monotonic 的 `snapshotRevision`、package/module/version、attempt ID/revision/epoch、definition/export、provider snapshot、signed resource declarations、完整 Main/renderer contribution projection 和 digest。`ACTIVATING -> ACTIVE` transaction 同时插入完整 revision 并把它设为唯一 authoritative projection；Main/renderer registry 只是 revision-checked materialized cache；
- final publish 前，Main 和当前连接的 targeted renderer 都在 private revision-scoped registry 中 stage 完整 projection，并返回 matching current-epoch `STAGED` ack，期间零 public registration。sole graph lifecycle commit lock 内重验 provider revisions、dependent signed binding/frozen staging、declarations/claims 和全部 `STAGED` ack，再原子提交 state+snapshot。commit 后 Host 才发 exact revision-bound publish token；consumer 整包原子 apply 并返回 `APPLIED`，禁止 contribution-by-contribution publish；
- renderer disconnect 时不暴露 contribution；reconnect 由 Host mint 新 `connectionEpoch`，renderer 丢弃全部 prior staged/applied revisions，请求 current authoritative projection，重新 `STAGED -> APPLIED`；若已无 current revision则 apply empty projection并 `WITHDRAWN`。Main restart 后旧 ack/token 全失效，不能从 generated composition 或 cache eager import；
- quiescence 取得同一个 graph lock，先关闭 authoritative admission、按逆拓扑清 current projection 并 commit `ACTIVE -> QUIESCING`，再让 Main/仍存活 renderer 整包 remove matching revision 并返回 `WITHDRAWN`。stale reference 必须同时检查 authoritative attempt/snapshot 与 local applied revision。仍存活 consumer 缺 withdrawal ack 就是 nonzero resource；终止或断开的 renderer 没有 surviving registry；
- Manifest V2 只声明 sorted closed `PackageLifecycleResourceDeclarationV1`，resource type 精确为 `HOST_CONTRIBUTION_REGISTRATION | HOST_REGISTRAR_CHILD | HOST_EVENT_SUBSCRIPTION | HOST_TIMER | HOST_WORKER | HOST_NETWORK_LISTENER | HOST_DURABLE_LEASE | PROCESS_LOCAL_DISPOSER`。declaration 不能指向 handler/script/command/class/cleanup export/arbitrary method 或 package-specific algorithm；
- 唯一 versioned `PackageLifecycleRecoveryContractV1` 由 Host 拥有，package 不实现、export 或 load recovery contract。每次 declared acquisition 前，Host 必须先 transactionally commit attempt-scoped `PackageLifecycleResourceClaimV1`，绑定 Host resource identity/state/revision/epoch 与 generic cleanup token；undeclared/direct/over-limit/unclaimed acquisition在 effect 前失败，claim 只在 fixed Host primitive 权威证明 stopped/drained/released/absent 后清除；
- 0.8M 只为 13 包添加 signed generic declarations 并把现有 in-memory disposer 分类为 `PROCESS_LOCAL_DISPOSER`。独立 0.10R 对完整五包实际 acquisition 做 behavior-preserving rewiring，覆盖 registration/child/subscription/timer/worker/`HOST_NETWORK_LISTENER`/durable lease/process-local disposer；无法被 fixed primitive 表达的外部 cleanup 直接 `NO_GO`，I 不能发明 Host branch 或 package callback；
- lifecycle init 前先取得 exclusive single-Main ownership，并权威证明 prior owner process 已终止；仅 epoch 变化不算证明。startup matrix 固定：prior `INACTIVE` 保持；prior `ACTIVATING/ACTIVE` clear prior snapshot 后进 `QUIESCING`；prior `QUIESCING` 以 revision CAS 接管 same attempt；prior `DISPOSING` 进入 `TEARDOWN_FAILED`；prior `TEARDOWN_FAILED` 只有 Host recovery-contract/declaration binding 与 exclusive retry ownership 都验证后才能走唯一 `TEARDOWN_FAILED -> QUIESCING`；
- disposer/recovery throw、hang、timeout、crash、nonzero claim、missing live-consumer withdrawal 或 lost ack 必须 durable 进入/保持 `TEARDOWN_FAILED`。retry 保留 same attempt，重新跑 Host-generic reconciliation 并证明所有 child/resource/withdrawal 为零，之后才可 `DISPOSING -> INACTIVE`。禁止 restart 后调用 package cleanup code、跳状态、并发第二个 disposer、compatibility cleanup 或第二套 FSM。

- 0.3 扩展 A 的严格 Manifest V2，保留 `packaging.bundled:true`、module/package version equality、official defaults、closed dependencies 和 canonical outbound edges，并把新 `./catalog-contract` descriptor 写入 signed binding；因为 definition/export descriptor 改变，Create Loop package/module 必须从 exact `1.0.0` 同步升到 `1.1.0`；
- 0.4 的 B shell 是 package/module `1.0.0`，已有严格 `contractVersion:2` manifest、合法 `package.json`、`./definition`、零贡献 `./main`，声明 official defaults，且以 ordinary production dependency 依赖 package `@sciforge/domain-create-loop`；代码只从 signed public subpath `@sciforge/domain-create-loop/catalog-contract` import；
- B manifest 的 dependency object 精确为 Create Loop `[1.0.0, 2.0.0)` + `requiredContractExports:["./catalog-contract"]`；B→A 所有 system call 还必须逐条出现在 sorted `outboundSystemCapabilities`，ordinary calls 使用 `none/null`，prepare/finalize/abort/rollback 使用 `inherit-current-action` + exact purpose；
- 2.1 才给 B 加 production contributions/lifecycle/database；这会改变 signed definition，所以 package/module 必须从 `1.0.0` 同步升为 `1.1.0`，并完整保留 0.4 的 strict V2 distribution/dependency/export/outbound-edge metadata，不能同版本 drift、退回 legacy string dependency 或另建 graph；
- A 的 `package.json` 公开 export `./catalog-contract`，source/packaged 必须独立重建出与 signed inventory 完全一致的 target-neutral descriptor bytes 和 contract/implementation/type surfaces；
- dependency graph 的 node/edge 使用标准 package name；激活后的 authorization/system/operation owner 才使用稳定 `moduleId`；
- source/runtime 与 packaged composition 都消费同一 generated graph 和 effective active set，拓扑激活 A 后 B，严格反向 dispose B 后 A；
- missing、unsigned、duplicate、non-bundled、version/definition/export mismatch、cycle、duplicate moduleId 全部拒绝；只有 `main.runtime-lifecycle` 的 numeric priority 不能覆盖依赖拓扑，renderer 和其他 contribution kind 保留原有独立排序合同但使用同一 effective set；Host 不得出现 domain-ID switch、package-count list 或 alternate graph。

### 5.4 身份、owner 与授权用途

以下五个概念不能混用：

| 类型 | 用途 | 来源 |
|---|---|---|
| `WorkspaceIdentityV1` | Catalog、Ledger、grant、operation namespace、Candidate lease 的 workspace 分区 | Host 对已存在目录做 realpath/case/symlink 归一并绑定 caller context |
| `SystemOwnerScopeV1` | descriptor 的 system caller owner ACL | caller 的 activated manifest 稳定 `moduleId` |
| `CapabilityProviderProvenanceV1` | capability provider 的来源、版本和 definition digest | activated generated domain manifest 的 `DOMAIN_MANIFEST` 分支，或 immutable Host-core definition 的 `HOST_CORE` 分支 |
| `OperationOwnerScopeV1` | durable Catalog operation namespace | system=稳定 moduleId；UI=稳定 authenticated/OS principal；Agent=Host-minted durable operation principal |
| `CommandOwnerScopeV1` | B mutating capability 的 durable command namespace | system=稳定 moduleId；UI=稳定 authenticated/OS principal；payload 不得提供 |

精确 module owner 是：

```text
sciforge.create-loop
sciforge.workflow-evolution
```

caller 的 `moduleVersion` 只用于审计，不能参与 restart-stable owner key；provider 的 `moduleVersion` 则是独立 provenance definition 的必填版本字段，不能反过来充当 caller owner。

每个含 `system` audience 的 descriptor 必须有非空、无重复、无 wildcard 的 `allowedSystemOwnerScopes`。没有 `system` audience 的 descriptor 必须完全省略该字段，不能传空数组。

授权 inheritance 只允许单值：

```text
outer descriptor: grantedAuthorizationPurpose
inner descriptor: requiredAuthorizationPurpose
```

两者要么不存在，要么是一个精确、非空、namespaced 值。禁止数组、alias、wildcard、payload/options 覆盖。Promotion 与 rollback 使用 A contract 导出的两个不同 purpose 常量；`cancel-run` 的确认绝不能授权 Promotion 或 rollback。

继承链必须同时匹配：

```text
outerProviderOwnerScope = sciforge.workflow-evolution
innerCallerOwnerScope   = sciforge.workflow-evolution
innerProviderOwnerScope = sciforge.create-loop
workspace
outer/inner action
outer invocation
effect = destructive
one exact purpose
Host live token + current process epoch
```

Broker 只拥有一个 Host-private `LiveChildRegistrarV1`，同时管理 protected capability child 与 Workspace Publisher child。闭合 FSM 只有：

```text
OPEN -> CLOSING_SUCCESS -> SETTLED
OPEN -> REVOKING       -> SETTLED
```

- 只有 `OPEN` 能注册 child，或让已注册 child 进入 lease；
- outer handler 成功返回使 registrar 原子进入 `CLOSING_SUCCESS`；throw/cancel/revoke 使其原子进入 `REVOKING`；第一个 closing transition 胜出，后来的 outer signal 不能 reopen 或改弱 barrier；
- 离开 `OPEN` 必须在一个 Host 操作里同时关闭新 child registration 与全部未进入 lease 的 admission，contain 未进入的 child；
- `CLOSING_SUCCESS`/`REVOKING` 只有在每个 registered process attempt terminal 且每个 acquired lease released 后才能 `SETTLED`。process-attempt containment 不能伪造 Catalog/publication durable outcome；例如 child 可对 registrar terminal，但 precise `TEMP_STAGED` 仍可在新的 live scope 下恢复；
- `registerCapabilityChild` 与 `registerWorkspacePublicationChild` 共用同一 registrar；`enterCommit()` 与 `enterPublish()` 只是其唯一 lease-entry transition 的 typed facade，不能各建 liveness flag、mutex、closure FSM 或 fallback；
- 历史 decision、invocation ID、operation ID、receipt、publication ID 或重启前 token 都不能恢复授权。

必须在同一 injected boundary 分别强制以下双序：

| 竞态 | closing/return 先赢 | lease entry 先赢 |
|---|---|---|
| successful return × `enterCommit()` | `CLOSING_SUCCESS`，deny lease，零 protected write，contain 后 `SETTLED` | 先记录 commit lease，再 `CLOSING_SUCCESS`；outer success 等 COMMIT/rollback、terminal、release |
| successful return × `enterPublish()` | `CLOSING_SUCCESS`，deny lease，零 final file；只保留 canonical safe durable recovery point | 先记录 publish lease，再 `CLOSING_SUCCESS`；outer success 等 publish/rollback、durable outcome、terminal、release |
| throw/cancel/revoke × 两类 lease | `REVOKING` 先赢即 deny protected effect | lease 先赢则 adverse outer settlement 也必须等待 protected effect 与 release |

所以这里的“检查”不能是 `isLive()` 后再 COMMIT/publish。inner child 必须在 dispatch 前注册；A 把不可序列化 commit lease 持有到 COMMIT/rollback，Publisher 把 publish lease 持有到 final durability 与 durable operation outcome。outer settle、process restart 或旧 epoch 之后，任何历史值都不能重建 chain。

### 5.5 精确 action ACL

以下表必须由 package descriptors 生成并被 provider suite 验证。`禁止`表示 descriptor 不得出现 `allowedSystemOwnerScopes`。

#### Create Loop

| Action | Effect | Approval | Audience | `allowedSystemOwnerScopes` |
|---|---|---|---|---|
| `create-loop.catalog.read-anchor` | `read` | none | UI, Agent | 禁止 |
| `create-loop.catalog.read-catalog` | `read` | none | UI, Agent | 禁止 |
| `create-loop.catalog.read-snapshot` | `read` | none | system | 仅 `sciforge.workflow-evolution` |
| `create-loop.catalog.get-release` | `read` | none | UI, Agent | 禁止 |
| `create-loop.catalog.get-candidate` | `read` | none | system | 仅 `sciforge.workflow-evolution` |
| `create-loop.catalog.read-operation` | `read` | none | UI, Agent, system | system 仅 `sciforge.create-loop` / `sciforge.workflow-evolution`；所有 caller 仅能读自己的 `OperationOwnerScopeV1` namespace/action |
| `create-loop.catalog.read-pending-promotion` | `read` | none | system | 仅 `sciforge.workflow-evolution` |
| `create-loop.catalog.provision` | `destructive` | `confirmation` | UI | 禁止 |
| `create-loop.catalog.stage-candidate` | `workspace-write` | none | system | 仅 `sciforge.workflow-evolution` |
| `create-loop.catalog.close-candidate` | `workspace-write` | none | system | 仅 `sciforge.workflow-evolution` |
| `create-loop.catalog.evaluate` | `workspace-write` | none | system | 仅 `sciforge.workflow-evolution` |
| `create-loop.catalog.cancel-evaluation` | `workspace-write` | none | system | 仅 `sciforge.workflow-evolution` |
| `create-loop.catalog.execute-bound-service` | `external-write` | `confirmation` | UI, Agent | 禁止 |
| `create-loop.catalog.dispatch-bound-service` | `external-write` | none | system | 仅 `sciforge.create-loop` |
| `create-loop.catalog.prepare-promotion` | `destructive` | `confirmation` | system | 仅 `sciforge.workflow-evolution`，并要求当前 Promotion purpose |
| `create-loop.catalog.finalize-promotion` | `destructive` | `confirmation` | system | 仅 `sciforge.workflow-evolution`，并要求当前 Promotion purpose |
| `create-loop.catalog.abort-promotion` | `destructive` | `confirmation` | system | 仅 `sciforge.workflow-evolution`，并要求当前 Promotion purpose |
| `create-loop.catalog.rollback` | `destructive` | `confirmation` | system | 仅 `sciforge.workflow-evolution`，并要求当前 rollback purpose |

#### Workflow Evolution

| Action | Effect | Approval | Audience | `allowedSystemOwnerScopes` |
|---|---|---|---|---|
| `workflow-evolution.submit-requirement` | `workspace-write` | `confirmation` | UI | 禁止 |
| `workflow-evolution.get-run` | `read` | none | UI, system | system 仅 `sciforge.workflow-evolution` |
| `workflow-evolution.list-pending-gates` | `read` | none | UI, system | system 仅 `sciforge.workflow-evolution` |
| `workflow-evolution.recheck-platform-gate` | `workspace-write` | none | UI, system | system 仅 `sciforge.workflow-evolution` |
| `workflow-evolution.clarify-requirement` | `workspace-write` | none | UI | 禁止 |
| `workflow-evolution.resolve-resource-gate` | `workspace-write` | none | UI | 禁止 |
| `workflow-evolution.record-promotion-decision` | `workspace-write` | `confirmation` | UI | 禁止 |
| `workflow-evolution.execute-promotion` | `destructive` | `confirmation` | UI | 禁止 |
| `workflow-evolution.open-rollback-recovery` | `workspace-write` | `confirmation` | UI | 禁止 |
| `workflow-evolution.execute-rollback` | `destructive` | `confirmation` | UI | 禁止 |
| `workflow-evolution.cancel-run` | `destructive` | `confirmation` | UI | 禁止 |
| `workflow-evolution.export-audit` | `external-write` | `confirmation` | UI | 禁止 |

Stage1 的 `get-run` 没有 Agent audience。Builder/Verifier 只能接收 Controller 组装的 operation input。

### 5.6 Catalog、policy、初始 provision 与错误总映射

`WorkflowExecutionPolicyBindingV1` 是唯一执行权威。它冻结 policy version/digest、call mode、runtime/model/profile、tool/file/network/env/opaque-secret scope 和 hard budget。

- `WorkflowDefinitionV1` 只能提出行为请求，不能另带有效 authority。
- Candidate 与准备后 official Release 必须包含同一个 binding value/digest。
- `WorkflowServiceBindingV1` 只引用其 digest，不能覆盖 policy/profile。
- provision、stage、evaluate、prepare、stable execution 全部验证同一个 binding。
- 任一 Candidate/Release/service binding/request/Host enforcement/terminal receipt 不一致都 fail closed。

初始 Catalog 只能通过 UI-confirmed `InitialCatalogProvisionV1`：

```text
1–5 × InitialWorkflowReleaseInputV1
1–5 × InitialServiceBindingPlanV1
```

每个 request 内 Release 至少有一个 binding；binding 只能指向本 request Release；initial Release 没有 parent；整个 batch 在一个 SQLite transaction 中生成 Release、binding、一个 Catalog、Anchor、`CatalogOperationReceiptV1` 和 `InitialCatalogProvisionReceiptV1`。任何错误整批零写。不得扫描/import `state.json`，B 不 journal provision。

A 不 import B contract，也不读取或声称验证 B Ledger。prepare/finalize/abort 的跨包字段只能是 opaque
`verificationReportId/digest` 与 `promotionDecisionId/digest`；B 证明它们的 Ledger 语义，A 只验证 public shape、owner/current grant、A-owned Catalog evidence 和 exact digest binding，并在 receipt 中原样保存。

A contract 必须导出以下完整 `CatalogErrorCodeV1 -> CatalogFailureClassV1` 总映射：

| `CatalogErrorCodeV1` | `CatalogFailureClassV1` |
|---|---|
| `CATALOG_STALE_GENERATION` | `STALE_GENERATION` |
| `CATALOG_POLICY_BLOCKED` | `POLICY_BLOCKED` |
| `CATALOG_VALIDATION_REJECTED` | `VALIDATION_REJECTED` |
| `CATALOG_AUTHORIZATION_REQUIRED` | `AUTHORIZATION_REQUIRED` |
| `CATALOG_RETRYABLE_ZERO_WRITE` | `RETRYABLE_ZERO_WRITE` |
| `CATALOG_PENDING_PROMOTION_PRESENT` | `PENDING_PROMOTION_PRESENT` |
| `CATALOG_PENDING_MISMATCH` | `PENDING_MISMATCH` |
| `CATALOG_IDENTITY_OR_DIGEST_CONFLICT` | `IDENTITY_OR_DIGEST_CONFLICT` |
| `CATALOG_PERMANENT_FAILURE` | `PERMANENT_FAILURE` |

每个 action 还必须从同一 A export 提供自己的 allowed-code subset 和 executable fixture。B 的 `CatalogOperationCoordinator/Reconciler` 只消费这份共享映射：ACL/owner denial 发生在 Catalog lookup 前，不伪造成 Catalog error；unknown code、超出 action subset、缺 receipt、malformed code/class、owner/digest mismatch 一律按不可能合同结果隔离为 `IDENTITY_OR_DIGEST_CONFLICT`，进入 `RECOVERY_REQUIRED`，绝不猜测业务终态。

allowed-code subset 必须逐 action 精确匹配：

| Catalog action | 唯一允许的 terminal error codes |
|---|---|
| `provision` | `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_RETRYABLE_ZERO_WRITE`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `stage-candidate` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_PENDING_PROMOTION_PRESENT`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `close-candidate` | `CATALOG_VALIDATION_REJECTED`, `CATALOG_PENDING_PROMOTION_PRESENT`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `evaluate` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_PENDING_MISMATCH`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `cancel-evaluation` | `CATALOG_VALIDATION_REJECTED`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `prepare-promotion` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_AUTHORIZATION_REQUIRED`, `CATALOG_RETRYABLE_ZERO_WRITE`, `CATALOG_PENDING_PROMOTION_PRESENT`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `finalize-promotion` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_AUTHORIZATION_REQUIRED`, `CATALOG_RETRYABLE_ZERO_WRITE`, `CATALOG_PENDING_MISMATCH`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `abort-promotion` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_AUTHORIZATION_REQUIRED`, `CATALOG_RETRYABLE_ZERO_WRITE`, `CATALOG_PENDING_MISMATCH`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |
| `rollback` | `CATALOG_STALE_GENERATION`, `CATALOG_POLICY_BLOCKED`, `CATALOG_VALIDATION_REJECTED`, `CATALOG_AUTHORIZATION_REQUIRED`, `CATALOG_RETRYABLE_ZERO_WRITE`, `CATALOG_PENDING_PROMOTION_PRESENT`, `CATALOG_IDENTITY_OR_DIGEST_CONFLICT`, `CATALOG_PERMANENT_FAILURE` |

`stage-candidate`、`close-candidate`、非 replay `evaluate`、`cancel-evaluation` 这四个 approval-free action 不允许向 B 暴露 `CATALOG_RETRYABLE_ZERO_WRITE`；A 必须在 provider 内完成可安全处理的瞬时 storage retry。B 遇到越界 code 必须走 identity-conflict recovery，不能把它当成“可以再试一次”。

B 的 reducer 对 provider observation 的总规则是：

| Action / observation | B 必须做什么 |
|---|---|
| `provision` 的任何 observation | B 从不 journal provision；统一隔离到 `RECOVERY_REQUIRED(IDENTITY_OR_DIGEST_CONFLICT)` |
| approval-free action，authoritative pre-dispatch `NOT_FOUND`，且 B 从未记录 provider `IN_FLIGHT` | Operation 保持 `INTENT_RECORDED`；只允许 fenced exact redispatch 同一 request/operation ID，compute-bearing work 还必须保留并复用同一 reservation |
| 任意 action，在 B 已记录 authoritative `IN_FLIGHT` 后出现 `NOT_FOUND` | 不可能状态，`RECOVERY_REQUIRED(IDENTITY_OR_DIGEST_CONFLICT)`，禁止 redispatch |
| 任意 action，`IN_PROGRESS` | Operation 保持 `IN_FLIGHT`，Run 进入/保持 `RECOVERY_REQUIRED`，只读轮询 |
| 任意 action，`OUTCOME_UNKNOWN` | Operation terminal `OUTCOME_UNKNOWN`，Run `RECOVERY_REQUIRED`，禁止第二次 dispatch |
| terminal result 缺 receipt、malformed、foreign、digest 不匹配或 action/code 越界 | `RECOVERY_REQUIRED(IDENTITY_OR_DIGEST_CONFLICT)` |
| `stage-candidate` success | 绑定 exact Candidate/validation receipt；若有前任还要 exact atomic `SUPERSEDED` receipt；Attempt 进入 `STAGED` |
| `stage-candidate` stale / policy / validation-or-permanent | stale：必要时先 close `STALE` 再回 `EVALUATING_COVERAGE`；policy：必要时先 close `FAILED` 再 `POLICY_BLOCKED`；validation/permanent：必要时先 close `FAILED` 再 `FAILED` |
| `stage-candidate` pending-present / identity-conflict | `RECOVERY_REQUIRED`，保留 lease |
| `close-candidate` success | 只有 disposition 与 stored continuation 精确匹配才消费；需要 terminal 时在同一 Ledger transaction terminalize 并释放 lease |
| `close-candidate` 任何 terminal failure、malformed、`IN_PROGRESS` 或 unknown | `RECOVERY_REQUIRED`，保留 lease |
| non-replay `evaluate` success | 只消费 exact controlled-evaluation outcome；若 Run 正在 `CANCELLING`，只能当 containment，不能当 verification/Promotion evidence |
| non-replay `evaluate` stale / policy / validation-or-permanent | Anchor trial stale 直接重新评估；Candidate 路径先拿 `STALE` 或 `FAILED` close receipt，再进入规定状态 |
| non-replay `evaluate` pending-mismatch / identity-conflict / malformed / in-progress / unknown | `RECOVERY_REQUIRED`，保留 Candidate lease |
| `cancel-evaluation` authoritative contained/terminal | 继续 stored cancellation；其他 failure/malformed/in-progress/unknown 都 `RECOVERY_REQUIRED` |
| `prepare-promotion` success | exact pending/reservation 后进入 `REPLAYING` |
| `prepare-promotion` `NOT_FOUND` | 保持原 Operation、request 和 reservation，转为 `HELD_PREPARE_RETRY`，回 `WAITING_PROMOTION_AUTHORIZATION(PREPARE)` |
| `prepare-promotion` terminal authorization-required / retryable-zero-write | 已证明零写才释放该 terminal Operation 的 reservation；以后新 confirmation 使用新 operation ID 和新 reservation |
| `prepare-promotion` stale / policy / validation-or-permanent | 释放已证明 terminal zero-write reservation，取得相应 `STALE`/`FAILED` close receipt后才 terminal |
| `prepare-promotion` pending-present / mismatch / identity-conflict / malformed / in-progress / unknown | `RECOVERY_REQUIRED`；未证明结果的 reservation 不释放 |
| replay `evaluate` pass / authoritative non-pass | exact pending 下：pass 进入 finalize 或 authorization wait；fail、provider failed、contained cancelled 进入 abort 或 authorization wait |
| replay `evaluate` `NOT_FOUND` | 保持 `HELD_PENDING_REPLAY`，进入 `WAITING_PROMOTION_AUTHORIZATION(REPLAY_OR_ABORT)` |
| replay mismatch / malformed / in-progress / unknown | `RECOVERY_REQUIRED`，既不 finalize 也不 abort |
| `finalize-promotion` success | `COMPLETED`；`NOT_FOUND`/authorization/retryable/其他 A-proven zero-write 且 exact pending 完整时回 `WAITING_FINALIZE_AUTHORIZATION` |
| `abort-promotion` success | Candidate `ABORTED`、Run `FAILED`、reservation 恰好释放一次；`NOT_FOUND`/authorization/retryable 且 exact pending 完整时回 `WAITING_ABORT_AUTHORIZATION` |
| finalize/abort pending mismatch、identity conflict、malformed、in-progress 或 unknown | `RECOVERY_REQUIRED`；abort 的其他 terminal failure 也保留 pending/reservation |
| `rollback` success | `ROLLED_BACK` |
| `rollback` `NOT_FOUND` / pending-present / authorization / retryable，且证明零写 | 回 `WAITING_ROLLBACK_AUTHORIZATION`，不后台 retry |
| `rollback` stale / policy / validation / permanent，且证明零写 | 对该 recovery tuple 永久 `ROLLBACK_FAILED` |
| rollback identity-conflict / malformed / in-progress / unknown | `RECOVERY_REQUIRED` |

所有 `SUCCEEDED`、`FAILED`、`CANCELLED` 组合中没有列入共享 executable Cartesian fixtures 的 tuple 都是“不可能合同结果”，统一进入 identity-conflict recovery。B 的 production reducer 和 focused tests 直接 import B-owned adjacency constants 与 A-owned action/error fixtures，不能根据这张人类说明表再手写一份逻辑。

### 5.7 Evaluation delivery 与 Agent operation 平台合同

canonical `create-loop.catalog.evaluate` descriptor 冻结的不是一个全局 transient 值，而是以下 Host-derived 完整映射：

| `EvaluationInvocationClassV1` | `EvaluationResultDeliveryV1` | 合法用途 |
|---|---|---|
| `STANDARD_CONTROLLER` | `STANDARD_CONTROLLER_RESULT` | `ANCHOR_TRIAL/COVERAGE_TRIAL` 与非 sealed 的 `CANDIDATE_PRIVATE` purpose |
| `LIVE_APPROVED_OUTER_CONTROLLER` | `STANDARD_CONTROLLER_RESULT` | 仅当前同 owner/workspace、Promotion-purpose `execute-promotion` 外层 invocation 中的 `POST_PROMOTION_REPLAY/PROMOTION_REPLAY` |
| `TRUSTED_SEALED_HARNESS` | `TRANSIENT_HARNESS_COMPARE` | 仅 registered trusted-harness current operation principal 的 `CANDIDATE_SEALED` |

Host 从 active owner-bound invoker/profile 派生 class、exact principal、channel 和 policy；payload/options 不能选择。trusted harness 请求非 sealed purpose、standard Controller 请求 sealed/replay、或 replay 没有当前 fresh outer context，都在 A handler 前失败，不能降级为 ordinary result。

旧 outer invocation ID、operation ID、receipt、serialized context、Broker idempotency entry 或 prior process epoch 都不能重建 replay 授权。只有同一仍存活 `processEpoch` 中 complete bound tuple 完全相同的 replay，才可从 non-evicting process-local invocation entry 等待或返回 immutable settled result，且不重新 dispatch；对 `TRANSIENT_HARNESS_COMPARE` 也只能返回 durable digest/status receipt，绝不能重放 raw output。restart 后旧 entry/ID/confirmation 在 lookup 前拒绝，不返回旧 Broker result。真正重新执行 `POST_PROMOTION_REPLAY` 必须取得新的 UI confirmation 和 live chain，并在 dispatch 前注册为 outer child。

Stage1 只有一个 production Agent lane：

```text
Host generic operation/profile contracts
  -> root normal runtime dependency @sciforge/agent-operation-adapter
  -> ATTESTED_EPHEMERAL_V1
  -> one installation-allowlisted remotely attested provider configuration
```

- `0.11P` 是 implementation 前的 hard feasibility gate：锁定一个 exact provider/endpoint/tenant/region/model/API scope，冻结 current legal+technical zero-retention evidence、Host-verifiable `SIGNED_STATEMENT` 或 `OFFICIAL_VERIFICATION_API` PoC、freshness/live revocation、可关闭 retry/redirect-auth replay/hedging/failover/reconnect-after-write/queue redelivery 的 single-shot transport，以及 declared OS/architecture source+packaged matrix。任何缺失都是 `NO_GO`，不能先对 Codex/Claude/mock/future provider 编码；
- `0.11S` 是唯一 `SignedAgentProviderTrustBundleV1` producer，必须等待 `0.8I + 0.11P`。closed `AgentProviderTrustBundleReleaseInputV1` 只含 schema、bundle ID/sequence/lifetime、key ID 和 immutable `qualificationRecordDigest`。signed static body 只含该 qualification binding、strict provider configs 及各自 closed `attestationPolicy`、installation-pinned trust roots 和 revocation authorities；live attestation、challenge/revocation nonce/response、`verifiedAt`、`attestationDigest` 或其他 runtime/freshness evidence 都是非法 unknown member，也不能进入 static `configDigest`；
- official keyring 只允许 exact `agent-provider-trust-bundle` `ACTIVE` usage/sequence interval。ordinary PR 两次确定性重建 domain-separated RFC 8785 unsigned body，拿不到 private key；distinct non-exportable KMS/HSM signing service 不 checkout/build/test/inspect code，只接收 exact usage/key、canonical signature bytes+digest、body digest 和已经绑定 release input/qualification/parent/sequence 的 immutable evidence reference，并只返回 signature+receipt。bundle 是 mechanical child，final CI 从 parent/input 重算；source/packaged 必须携带同一 verified bundle。rollback/same-sequence drift/wrong-usage/revoked/`VERIFY_ONLY`/expired/missing signer或packaged bundle/incomplete high-water 全 fail closed；
- package 路径固定为 `packages/agent-operation-adapter`；root `package.json` 必须把它列为普通 `dependencies`，不是 dev/optional/peer/test-only/dynamic-path/packaged-only；
- source 与 packaged Host composition 解析同一 public exports；Host 不再有第二个 private adapter、domain-specific dispatch、runtime-name switch 或 test bypass；
- package 拥有唯一 production adapter acceptedness store、单次 application-request transport、destroy-on-completion isolated worker 和唯一 profile kind `ATTESTED_EPHEMERAL_V1`；
- installation allowlist 只能来自这个 static signed bundle；Host 持久化最高 sequence/digest、完整 canonical envelope/body 和 config/policy/root/authority bindings。不存在 unsigned settings/env/domain allowlist、parallel root 或 live evidence-in-config path；
- 每个 `AttestedEphemeralProviderConfigV1` 只携带 opaque `credentialRef`。Host 只能通过 generic `HostCredentialVaultV1` 从当前 installation/account 的平台 OS credential facility 解析；secret bytes 不得进入 repository/package/settings JSON、application-read environment/config、manifest/bundle/database/log/receipt/crash artifact 或 domain state。domain payload、prompt、recipe、Agent output 和 B policy 也不能覆盖 provider/endpoint/transport/model/API/retention/attestation；
- Host 先验证 bundle/high-water 与 selected static config/policy/root/authority。随后、且必须在 `HostCredentialVaultV1.acquireForAgent`、adapter tombstone、worker/`createOrGet`、protected raw allocation/reconstruction 前，动态取得 fresh `RemoteZeroRetentionAttestationV1` 和独立 current revocation evidence；official-verification branch 使用新的 32-byte nonce，attestation/revocation nonce 互不复用。preflight 不携带 provider credential 或 raw Agent request，也不能 dispatch Agent request。验证 exact statement/challenge、certificate/endpoint/provider/tenant/region/model/API scope、freshness、expiry 和 revocation 后，Host 先把 `policyDigest/attestationDigest/statementDigest/verification root-kind/revocationEvidenceDigest` immutable bind 到 operation/enforcement record，之后 adapter tombstone复制同一组 digests；任何 partial/conflict 都 fail closed。只有完成 binding 后，OS vault 才把 single-use credential lease 释放进 isolated transport protected memory；
- persistent Codex、persistent Claude、FullTrace 和任何保存 session/thread/turn history 的 lane 明确 unsupported，不能包一层就声称等价，也不能作为自动或人工 fallback；
- protected CI 对每个 declared supported OS/architecture 只把 ephemeral secret 注入 OS vault，先跑 exact immutable source train，再启动 exact packaged artifact 跑同一真实 Host → named adapter → profile → provider assertion；evidence 只公开绑定 train/bundle/provider scope/artifact/platform/command/result 的 redacted digest。ordinary PR 没有 provider credential，任一未证明平台标记 `UNSUPPORTED/NO_GO`，不能借别的平台 evidence。mock、loopback、fake attestation 或 direct package internal 不算。

唯一 Host key 是：

```text
(hostDerivedOwnerId, operationId)
```

`requestDigest`、`profileDigest` 是不可变比较字段，不是允许第二行的 key。通用状态固定为：

```text
CLAIMED     -> DISPATCHING | FAILED | CANCELLED
DISPATCHING -> RUNNING | SUCCEEDED | FAILED | CANCELLED | OUTCOME_UNKNOWN
RUNNING     -> SUCCEEDED | FAILED | CANCELLED | OUTCOME_UNKNOWN
```

`CLAIMED -> FAILED | CANCELLED` 只允许发生在 native dispatch 前；terminal state 无出边。因为 raw retention 是 `NONE`，B 不能靠保存 prompt 恢复请求。每个 Builder/Verifier operation 在 claim 前必须用 Host 唯一的 closed、versioned、non-raw `RequestRebuildRecipeV1` 持久化一个 B-owned instance。它的 exact fields 是：

```text
kind = AGENT_REQUEST_REBUILD_RECIPE_V1
schemaVersion = 1
recipeId
ownerDomainModuleId
ownerDomainContractDigest
frozenDomainInputs[] = { objectKind, objectId, objectDigest }
promptTemplate = { templateId, templateDigest }
profileTemplate = { templateId, templateDigest }
serializer = { serializerId, serializerVersion, serializerDigest }
expectedRequestDigest
recipeDigest
```

`recipeDigest` 只从完整 validated object 中排除自身，再按 RFC 8785/SHA-256 lowercase 计算。recipe 不能含 request/prompt bytes、messages、provider payload 或可逆 raw copy。完整 recipe 与 frozen dependencies 由 owning domain 持久化；独立 pre-P4 Agent delivery probe 只有 synthetic test harness 可以作为 test owner。B 只负责提供 production frozen inputs、instance builder 和 fixtures，不能重声明 generic recipe schema 或另建 reconstruction path。Host operation 只绑定 recipe ID/digest、request/profile digest 和可选 canonical `ComputeReservationV1` identity/digest，不保存 recipe contents。

Host 必须在同一个 transaction 中完成 `CLAIMED -> DISPATCHING`、stable dispatch token 分配和不可复用 **Host token-allocation tombstone** 持久化，transaction COMMIT 后才能调用 adapter。它只证明 Host 不会重新分配 token，不证明 adapter/provider 接受，更不证明 remote zero retention。

命名 production adapter 另有独立 durable local acceptedness store。首次 token-unique `createOrGet` 必须在 worker creation、raw transfer、socket/DNS/HTTP/RPC/SDK application send 之前，原子提交状态为 `MAY_HAVE_BEEN_ACCEPTED` 的 tombstone。只有 transaction winner 能继续一次 single-shot application request；同 token 的并发/后续调用看到任何 record 后只能采用现状或 `UNQUERYABLE`，绝不能再 send。Adapter 必须提供：

```text
atomic token-unique createOrGet(dispatchToken, request)
authoritative lookup:
NOT_FOUND | RUNNING(handle) | TERMINAL(receipt) | UNQUERYABLE
cancel(dispatchToken)
```

`NOT_FOUND` 的含义只能是“adapter-local store 权威不存在该 token record”，因此 canonical lane 没有 create worker 或 external send。只要 adapter record 曾存在，lookup 就永远不能回到 `NOT_FOUND`；bare `MAY_HAVE_BEEN_ACCEPTED`、worker crash、GC/404、eventual invisibility、provider retention expiry、lost response、redirect/auth challenge 或任何歧义都必须返回 `UNQUERYABLE`，不能重建或重发。

`DISPATCHING` restart 先 lookup：

- `RUNNING/TERMINAL`：采用唯一 handle/receipt；
- `NOT_FOUND`：owning domain 用同一个 recipe 在 bounded volatile buffer 中确定性重建，逐项校验 frozen dependency/profile、`reservedRequestBodyDigest` 和最终 stored request digest；全部精确匹配后，才用**同一个 token**进行首次 atomic `createOrGet`，而该调用仍须先提交 adapter `MAY_HAVE_BEEN_ACCEPTED`；
- recipe/dependency/template/serializer 缺失或任一 digest 不匹配：terminal `FAILED/REQUEST_REBUILD_UNAVAILABLE`，零 create/thread/turn/provider dispatch；
- `UNQUERYABLE`：`OUTCOME_UNKNOWN`，永不 rebuild/resend；
- 已经 `RUNNING` 后出现不可能的 `NOT_FOUND`：也只能 `OUTCOME_UNKNOWN`。

Lookup-only、check-then-unkeyed-create、缺少 atomic token-unique `createOrGet`、adapter-local durable pre-send tombstone、authoritative lookup/cancel 或 rebuild recipe 的 adapter 都在首次 dispatch 前失败。不存在 new-token、current-template、alternate-profile、raw-history 或 blind-retry fallback。

Builder/Verifier 各有不可伪造的 operation principal，raw retention 为 `NONE`，input/result 只直接交付 deterministic Controller，不发布到 sidebar、thread list、generic turn event、artifact、shared memory、goal/context、handoff/reference、sibling 或其他 same-owner consumer。这里的 raw 包括完整 request/prompt/system/context bytes、transcript/turn/event/stream、transport/provider payload，以及 unparsed 或 partially parsed result bytes。Host、adapter、worker、transport、remote provider、domain、queue、filesystem、log、trace、UI、export 都不得持久化。raw 只能通过 bounded、single-owner、transferable mutable buffer 进入/离开一个 destroy-on-completion worker；transfer 必须 detach sender，所有 owner 在 `finally` clear。持有 raw 的进程在 allocation 前必须禁用 core/minidump/crash report/upload/heap snapshot，进入 non-dumpable 模式，并使用 locked/non-pageable 或等价 protected memory。每个 hop 的实际 enforcement/execution receipt 必须绑定 adapter/worker/transport/config/attestation/protection evidence；requested setting 或 provider name 不算证明。

独立 pre-P4 0.11P/0.11S/0.11A lane 只能用一个 unexported、production-unregistrable transient result consumer 验 generic delivery boundary。test harness 自己是 recipe owner，把一份 synthetic non-raw recipe 与 frozen synthetic dependencies 放进 production-inaccessible test-only durable store；该 store 必须跨本次 restart 存活，运行后销毁。它不持久化 Workflow Evolution 或其他 domain data，也不可能成为 production consumer；所以这个 gate 只能证明 generic recipe/tombstone/delivery recovery，不能声称已有 B projection 或验 B projection COMMIT/ack crash window。首个 production Builder recipe/projection coordinator 是 5.3，B 的两类 projection window fixture 是 5.9，B-owned activation commit 是 5.10B；只有它与 A-owned 5.10A 在满足 0.11P/0.11S/0.11A、3.11A、3.11B 与 5.1–5.9 后原子组成 5.10，production path 才可用。Verifier projection 更晚才由 7.3/7.12A 建立。

B 允许持久化的 Agent-derived business content 只有两个 closed projection：

- `CandidateProposalV1`：固定 `kind=CANDIDATE_PROPOSAL_V1`、`schemaVersion=1`、canonical `WorkflowDefinitionV1` 和 `0..4,096` UTF-8 bytes rationale；received/canonical complete document 都不超过 `262,144` bytes；
- `VerificationAssessmentV1`：固定 `kind=VERIFICATION_ASSESSMENT_V1`、`schemaVersion=1`、advisory `CONTINUE | REPAIR | STOP`、`0..16` 个 sorted unique bounded risks 和 `1..32` 个 sorted unique allowlisted opaque evidence refs；received/canonical complete document 都不超过 `32,768` bytes。

两者都拒绝 unknown field、duplicate JSON member、错误 discriminant/version、越界值、非 canonical order 和 Agent 自报的 digest/authority。B 在一个 Ledger transaction 中原子提交 projection、consumption receipt 和 Operation/Attempt transition；Host `SUCCEEDED` 本身不是业务消费完成。

迁移顺序不可交换：

```text
0.11P I 在 adapter implementation 前完成真实 provider qualification、
      signed/challenge PoC、revocation/no-retry、OS vault 与 protected platform matrix
0.11 I 建 generic Agent operation/profile API、RequestRebuildRecipe、
     Host token-allocation tombstone 与 adapter acceptedness contract
0.8I + 0.11P
→ 0.11S I 以 isolated KMS/HSM signer 交付唯一 static purpose-scoped
        SignedAgentProviderTrustBundleV1（config+attestationPolicy+trust+revocation only）
→ 0.11A I（依赖 0.11 + 0.11P + 0.11S）交付 root runtime @sciforge/agent-operation-adapter、
        verified-bundle consumer、fresh runtime attestation/revocation、HostCredentialVaultV1、
        MAY_HAVE_BEEN_ACCEPTED store、ATTESTED_EPHEMERAL_V1 和真实 attested provider evidence
→ 3.8 A 迁移 Create Loop 唯一 AI Agent consumer
→ 3.9 I 审计全部消费者并删除 blocking run()
→ 3.10 I 通过 source/packaged named-adapter real-Agent gate
→ 3.11B I 记录 P4 Agent readiness
```

不得长期双 API，也不得由 I 越权修改 A 的 consumer 语义。

## 6. 分阶段实施

### 6.1 三道门：先开发，再合并，后激活

开发者 B 先完成 0.4/0.6；semantic branch 必须从已经包含 0.14A 的 integration 开始：

- 0.4：建立第 5.2 节列出的唯一 B contract shell 和可执行 schema/package tests。它必须已经是 package/module version `1.0.0` 的 repository-generator-valid package：严格 `DomainPackageManifestV2`/`contractVersion:2`、合法 `package.json`、public `./contract`、`./definition`、零贡献 `./main`、focused tests/typecheck；`packaging.bundled:true`，`module.version === package.json.version`，声明 `sciforge.official` defaults、Create Loop `[1.0.0,2.0.0)` + required `./catalog-contract` 的 closed dependency，以及每条 B→A call 的 sorted outbound edge/purpose mode。普通 `package.json` 仍须生产依赖 `@sciforge/domain-create-loop`，代码只从 signed `@sciforge/domain-create-loop/catalog-contract` import。它同时冻结 closed `CandidateProposalV1`、closed `VerificationAssessmentV1`、Builder/Verifier 对 generic `RequestRebuildRecipeV1` 的 frozen inputs/instances/builders/fixtures、policy/price/budget schemas，但不得复制 generic recipe schema。此时不加 production capability、lifecycle、database、renderer 或 fallback；
- 0.6：冻结 B-owned 四套 adjacency/recovery constants、Evidence unions、current-policy omission normalization、Candidate orchestration、close-before-terminal、sealed/Verifier、rollback 和 executable fixtures；`totalAttemptLimit` 必须为 `1..3` 且包含初始 Attempt，`sealedQueryLimit` 必须为 `1..5`。`3/5` 只是首次安装 policy seed，提交省略时复制当前 policy，不得硬编码为永久 default；fixture 还要证明 current policy 改变只影响后续 omitted-field decision，已存在 Run 的 frozen decision 不变；
- review A/I 的 basic foundation 0.3、0.5、0.7A、0.8A、0.8B、0.8M、0.8S、0.8D、0.8C、0.9–0.15，特别核对 0.8S 的 provenance/exact-parent/isolated-signer evidence、0.8D unchanged 和 0.10R 五包 Host-primitive rewiring；0.7B 与 0.11P/0.11S/0.11A 作为独立 activation lane 单独 review，不能反向声称阻塞 pure P2；
- 不创建 P2 production capability，不提前加 renderer。

0.14A + 0.4 + 0.6 形成**开发门**：此后 B 可开发 2.3–2.6、2.8–2.10 pure Ledger/FSM/reducer/policy/projection/lease/local-fake stacked branches；这些 pure branches 不含 production registration code/dispatch/Publisher/Catalog side effect，且不能在 2.2 前合入。2.1 的 production contribution semantic producer 可提前 author，但不得在 0.15 前 merge/register/activate。0.15 是**基础合并门**：2.2 与 P1 production 也必须等待 0.15。0.7B→8.5/P6 和 0.11P/0.11S/0.11A→3.10/3.11B/5.10 是两个独立的**能力激活门**。

开发者 A 以 `[A]` 身份冻结 Catalog 合同/fixtures，并单独完成 0.8D Git Checkpoints baseline semantic repair。开发者 B 以 `[I]` 身份完成基础 workspace identity、strict Manifest V2/unsigned generator、0.8S provenance/release input/sequence/KMS-HSM signing evidence、outbound-edge/ACL-purpose migration、sole confirmation flow、readiness、Host-owned lifecycle、0.10R 五包 rewiring、generic Agent API、license 和 basic matrix；独立 activation branches 再完成 0.7B native publisher，以及 0.11P qualification、0.11S static bundle、0.11A fresh-attestation/OS-vault adapter。开发者 B 的 `[B]` 与 `[I]` 身份必须使用独立对话、`stage1/b-*` 与 `stage1/i-*` 分支和 commits，不混合 domain semantic 与 platform mechanics；I 也不得 rewrite 0.8D 或替任何 package owner invent signing input。

基础 0.15 合并门退出条件：

- A/B schema、fixtures、adjacency constants 可直接被测试和 production reducer 消费；
- strict Manifest V2 没有 V1/union/upgrader/default adapter；现有 13 份 manifest 全部用 package-owned true/true defaults 形成完整 official cohort，B shell 加入后 cohort 是 14，而 Workbench 产品分类保持原 6 + B；原 13 个 package 的所有贡献和 explicit choices 都保留；
- 九个 ordinary `0.1.0` package 已升到 `1.0.0`；Create Loop 在 0.3 从 exact `1.0.0` 升到 `1.1.0`；B shell 是 `1.0.0`。每个 module/package version 相等，definition 或 descriptor digest 同版本 drift/rollback 失败；`CanonicalContractExportDescriptorV1` exact bytes 与 contract/implementation/type surfaces 在 source/packaged 独立重建后一致，transform/source-map/bundle/tamper drift 全部失败；
- `0.8S` 的 closed release input、authenticated `HostReleaseProvenanceV1`、显式 sequence、ordinary-PR deterministic unsigned/zero-diff/no-private-key、domain-separated bytes、distinct KMS/HSM signer、mechanical signature child 与 final parent recompute 全通过；八个 foundation producer 加一个 mechanical commit 的 SHA/evidence 完整；
- strict `OfficialVerificationKeyV2` 只有 `official-extension-package | distribution-inventory | agent-provider-trust-bundle` 三种 exact single usage；legacy key byte-for-byte extension-only，ACTIVE/VERIFY_ONLY interval rotation无 gap/overlap，VERIFY_ONLY 只重验 Host 已接受的 exact historical bytes。`AcceptedDistributionSecurityStateV1` 还保留 provenance、accepting key usage/revision/eligibility 与 complete envelope/body/member high-water；rollback/same-sequence drift/wrong usage或provenance/identity/version drift 全 fail closed；
- Broker V2 全仓 inventory 中没有未迁移 system descriptor/caller；Project DAG read chain 与 Git Checkpoints live-purpose restore chain 的 source/packaged 正反例全部通过；
- 0.8D real Broker baseline success 不再因 outer `changed_resource_required` 失败，且 outer `changed:false` 没被误写成 inner restore 无变化；所有 UI/Agent、global/workspace/resource、任意 effect 的 top-level `approval=confirmation` action 只能走 channel bootstrap creation scope + stable UUIDv4 request ID + `createOrGetProtectedInvocation`。providerRegistration/target binding/closed FSM、cancel/read/replay、provider quiescence 和 restart invalidation 正反例全部通过；generic invoke、caller confirmation 和 effect-only旧路径不可达；
- exact owner、ACL、purpose、workspace、operation namespace 已由 generic source/packaged tests证明；
- readiness body 的 exact version/schema/profile/provenance fields、UTF-8 排序、profile null-pair、RFC 8785/SHA-256 digest 与 discovery filtering 已通过；`DOMAIN_MANIFEST` 和 `HOST_CORE` 两个 provenance 分支都有正反例，caller-supplied evidence、stale fingerprint、schema/profile/provenance drift 均失败；
- 0.10 的 durable installed/enabled/effective-active gate、Host-owned `PackageLifecycleRecoveryContractV1`、signed generic declarations与claims通过；0.10R 已把完整五包实际 resource acquisition behavior-preserving 地接到 Host primitives，包含 `HOST_NETWORK_LISTENER`。revisioned `PublishedPackageSnapshotV1` 的 Main/renderer `STAGED/APPLIED/WITHDRAWN`、reconnect、graph-lock publish/unpublish、startup normalization 和 `TEARDOWN_FAILED` source/packaged matrix全通过；任何 package recovery program 或 restart 后 package cleanup code都失败；
- 0.11 只证明 generic operation/profile、owner-persisted recipe/Host ID-digest binding、两层 tombstone contract 和 synthetic generic delivery boundary；基础门不得声称 real provider、signed bundle、OS vault、raw `NONE` production lane 或 B projection 已 ready；
- `stage1-contract-matrix.mjs` 与 generated JSON 已合入且二次生成零 diff；
- ordinary merge PR CI 和 `npm run license:policy-check` 已存在并通过正、负 fixtures；
- 基础 combined trains 合入，tasks 记录 immutable evidence/dependency SHA；
- A、B 无口头例外。

后续能力激活证据不能回填成基础门证据：

- 0.7B Publisher 的 native/source/packaged/fence/final-proof matrix 只在 8.5/P6 export 前关闭；
- 0.11P provider qualification、0.11S static KMS/HSM-signed bundle、0.11A fresh runtime attestation/revocation+OS vault+one-send/raw `NONE` matrix 只在 3.10/3.11B/5.10 前关闭；
- Broker owner ACL、live child、`enterCommit()` gate 阻塞 Promotion；
- A/I/B transient positive-control 与 Verifier isolation gate 阻塞 P5。

### 6.2 P1 / P2：并行但不互相写代码

开发者 A 的 P1：

- 实现 `catalog.sqlite`、唯一 policy binding、official Releases、service bindings、Catalog、stable/pending Anchor；
- 实现 owner-scoped durable operations；
- 实现原子 initial provision、Candidate stage/close；1.9A 单独实现 protected prepare，1.9B 单独实现 finalize/abort，1.9C 单独实现 rollback；
- 建 canonical evaluate/cancel provider，但三个 mode 暂时都 fail closed；
- 对 DB-only mutation 做逐 statement、pre-COMMIT、post-COMMIT/pre-response 故障测试。

开发者 B 的 P2：

- 2.1 将 contract shell 扩为 backend-only bundled package；因为 signed definition 从零贡献变为 production backend，先把 package/module 从 `1.0.0` 同步升到 `1.1.0`，再完整保留第 5.3 节的 strict V2 official defaults、closed Create Loop interval/export dependency、ordinary package dependency 和 exact signed outbound edges；不得同版本 drift、退回 string dependency 或另建 enablement path；
- 2.2 由 I 走 combined train，验证 source/runtime 与 packaged 使用同一 verified signed inventory：原 13 个 package 加 B 是 14-member release cohort，产品分类只有原 6 + B；fresh state 从 14 个 signed defaults 建立，13→14 upgrade 保留原 13 个显式选择与贡献，只初始化 B；A 不可用时 B 的 durable `installed:true, enabled:true` 保持而 effective=`DEPENDENCY_UNAVAILABLE`/零贡献；拓扑 A 先启、B 先停，version/definition/descriptor/surface/edge 任一 drift 都在 construction/lookup 前失败；disposer failure 进入 `TEARDOWN_FAILED` 并阻止 A replacement/B reactivation；
- 实现 `ledger.sqlite`、四套 reducer、三文档、Coverage/Gap、budget/admission、Candidate lease schema、Teacher `BYPASSED`；
- production reducer 直接 import B-owned adjacency constants；
- 只使用 unexported test fake，并在进入 Catalog 调用前停止；
- Markdown 仅实现纯 deterministic redacted renderer，不自动落盘；
- P2 restart 只测 P2 可达状态，后续阶段新增状态由对应阶段补测试。

在 0.14A + 0.4 + 0.6 开发门后，2.3–2.6、2.8–2.10 可以作为 pure stacked B branches 开发；2.7 依赖真实 package/readiness，不在早期许可内。任何 production implementation PR 都不能在 2.2 package train 前合入。2.11 只能从已合入的完整 2.3–2.10 baseline 开始；2.12 只能从该 baseline 加已合入 2.11 restart recovery 开始。章节顺序、并行 sibling branch 或本地 cherry-pick 都不算 dependency evidence。

P2 的 admission、policy、price 和 budget 不是“先留几个数字以后再补”，0.4/0.6 必须先冻结，2.3、2.8 按同一合同实现。

`WorkspaceEvolutionPolicyV1` 是 workspace 的上限与默认来源，必须持久化 Host-derived `workspaceId`、policy ID/digest、非空且排序的 runtime/model allowlists、price-table ID/digest、`maxQueuedOrNonTerminalRuns` 和下面八个数值。`RunBudgetInputV1` 可以省略数值或请求 allowlist 子集，但 B 必须在计算 command request digest、展示 confirmation、做 admission、创建 Run 之前完成 default、排序、去重、policy ceiling 和 price-table 校验。`RunBudgetDecisionV1` 一旦持久化，所有字段都必填；recovery/dispatch 时禁止再给缺失字段补默认值。

`WorkspaceEvolutionPolicyV1` installation seed 和 `ModelPriceTableV1` 的唯一 production source 是 B package 内经过 review、versioned、带 digest 的 assets。第一次打开 workspace Ledger 时，B 在一个 transaction 中幂等 append immutable seed rows、asset-version activation record 和 current pointers；同一 package version 重开不能覆盖 row 或偷偷移动 pointer。package upgrade 只能通过显式、append-only、reviewed migration 插入新版本并原子推进 current pointer；已有 Run 的 decision 永远不改。payload、env、runtime flag、process-local config 或代码里的临时常量都不能补造 production policy/price。

| `RunBudgetDecisionV1` 字段 | inclusive range | Stage1 首次安装 policy seed |
|---|---:|---:|
| `maxModelCalls` | `1..64` | `16` |
| `maxInputTokens` | `1..1_000_000` | `100_000` |
| `maxOutputTokens` | `1..200_000` | `20_000` |
| `maxCostUsdMicros` | `0..100_000_000` | `5_000_000` |
| `maxWallTimeMs` | `1_000..3_600_000` | `600_000` |
| `maxConcurrentOperations` | `1..4` | `1` |
| `totalAttemptLimit` | `1..3` | `3`，包含初始 Attempt |
| `sealedQueryLimit` | `1..5` | `5` |

上表 seed 只用于首次安装当前 workspace policy，不是 submit omission default，更不是 restart fallback。某字段省略时必须复制**当前持久化 policy 的对应值**；当前 policy 值可能不是 `16/100000/.../3/5`。decision 还必须带 `schemaVersion`、policy ID/digest、非空排序后的 runtime/model 子集、price-table ID/digest、literal `currency="USD"`、`priceTableExpiresAt` 和自身 RFC 8785/SHA-256 lowercase digest。字段不能在 Run 创建后增加；想增加预算只能新建 Run。

`ModelPriceTableV1` 必须有 ID/digest、`currency="USD"`、expiry 和按 `modelId` 唯一排序的 rows。每个 row 只使用非负 safe integer：

```text
perCallUsdMicros
inputUsdMicrosPerMillionTokens
outputUsdMicrosPerMillionTokens
```

成本只用 checked integer micro-USD：

```text
calls * perCallUsdMicros
+ ceil(inputTokens * inputUsdMicrosPerMillionTokens / 1_000_000)
+ ceil(outputTokens * outputUsdMicrosPerMillionTokens / 1_000_000)
```

禁止 binary floating point。missing/expired table、wrong currency、digest mismatch、selected model 不存在、非整数、unsafe integer、乘加或 ceiling-division overflow 都在 Run 创建或 dispatch 前 fail closed；不能静默换新表或换模型。provider 只能证明 ceiling、不能给 authoritative actual usage 时，receipt 写 `usageStatus=UNAVAILABLE`，Ledger 按完整 worst case 计费。

workspace admission 的 `maxQueuedOrNonTerminalRuns` 为 `1..8`，首次安装 seed 为 `2`。普通 admission **只计数 `RunKindV1=EVOLUTION`** 的 non-terminal Run，包括没有另设 `QUEUED` 状态的 lease-waiting `BUILDING_CANDIDATE`；`ROLLBACK_RECOVERY` 不计入普通额度，也不能提交普通 Evolution work。rollback recovery 只受 7.9 的 exact `(workspaceId, promotionReceiptId, failedGeneration)` partial unique 约束：同一 tuple 不能同时有两个 non-terminal recovery Run，不同合法 tuple 互不阻塞，禁止发明 workspace-wide recovery cap。普通 Evolution 的计数、创建 Run、完整 budget decision、首个文档 revision 和 audit event 必须在同一 transaction：观察到 `limit - 1` 时最多一个并发提交成功到 `limit`；观察到 `limit` 的提交返回稳定 `ADMISSION_LIMIT_EXCEEDED`，不创建 Run/budget/document/audit side effect（除幂等 denied-command receipt）；永远不能提交 `limit + 1`。ordinary admission fixtures 只按 `limit - 1 / limit / limit + 1` 和并发边界执行；rollback recovery 用 tuple partial-unique fixtures 独立验证。

`maxWallTimeMs` 是累计 active compute，不是绝对截止时间；human/resource/platform/authorization wait 和应用停止时间不计入。每次 dispatch 前一个 Ledger transaction 原子 reserve worst-case call/token/cost/active-compute 和 concurrency slot；terminal usage 结算并释放未使用部分，`IN_PROGRESS` 保留，`OUTCOME_UNKNOWN` 收取完整 reservation。restart 只从持久化 reservation 和 authoritative receipt 恢复，不从进程时钟猜。

Gate 只有以下三类：

```text
GateStateV1 = OPEN | RESOLVED | CANCELLED
GateKindV1  = CLARIFICATION | RESOURCE | PLATFORM
```

Gate 不重开，每个 Run 至多一个 `OPEN` Gate。Promotion 由 `PromotionDecisionV1` 和显式 `WAITING_PROMOTION*` Run state 表示；当前 Host authorization 也不是 durable Gate。两者都不得出现在 `list-pending-gates`。

`workflow-evolution.recheck-platform-gate` 是 `WAITING_PLATFORM` 唯一生产出口。payload 只能提供 Run、精确 open PLATFORM Gate、expected revision 和 `commandId`。B Controller 必须调用公开、owner/workspace-bound 的 `CapabilityReadinessReaderV1`，由 Host 从 canonical registry/profile source 生成 `CapabilityReadinessEvidenceV1`；B 只比较并持久化这份证据。B 不得直接读取 registry/generated 文件、import Host-private IPC，payload 也不能声称“能力已经存在”。匹配时原子 resolve 并返回 `EVALUATING_COVERAGE`；不匹配返回 `STILL_BLOCKED`，Gate/Run 除幂等 denied-command receipt 外保持不变。

### 6.3 Provider integration 与 P3 COVERED

P3 provider work 先完成 3.1–3.7，并由 `3.11A` 单独关闭 provider readiness；它不依赖 Agent migration，也不能被 `3.11B` 替代：

- 3.2：B 只有一个 production `WorkflowCatalogPort` adapter，只 import A 的 public `./catalog-contract` 并通过 owner-bound system invoker 调 Broker；
- 3.3：B 在该 adapter 后只实现一个复用的 `CatalogOperationCoordinator/Reconciler`，统一 stage、close、evaluate、cancel、prepare、replay、finalize、abort、rollback；
- fake 不 export、不注册、不由生产选择；
- I 以真实 A/B factory、generated matrix、真实 Broker 验 owner-before-lookup、operation namespace、live purpose/child barrier、lifecycle order；
- 3.7 的 source/packaged negative architecture fixture 禁止 B 私有 import、production fake export、专用 IPC/preload/MCP、duplicate store/service/canonicalizer、legacy Agent call 和 mutable execution alias。

`CatalogOperationCoordinator/Reconciler` 的唯一流程是：

```text
commit B intent + operationId + requestDigest + resumeReducerState
→ owner-scoped read-operation
→ 按 action/code/class executable fixture 验证权威观察
→ 仅在合同允许时 invoke exact request
→ typed reducer 在一个 Ledger transaction 中存 receipt/error、Operation 与 Run/Attempt transition
```

它不得自动重发 unknown，不得创建第二条 request path。Approval-free work只有在 B 从未记录 provider `IN_FLIGHT`、owner/workspace/action/request 全匹配、authoritative pre-dispatch `NOT_FOUND` 且 disposable-workspace cleanup 完成时，才可 fenced redispatch 同一 operation ID 和 exact request；compute-bearing work 的原 reservation 必须继续 held 并原样复用。`NOT_FOUND` 本身既不释放 reservation，也不增加 actual usage 或 sealed-query count。只有 B 在同一 Ledger transaction 中证明仍为 `INTENT_RECORDED`、明确安全放弃该 operation，并写入零 usage/零 query 时，才可释放。

destructive `NOT_FOUND` 绝不由 background worker 重试；Run 回到精确 authorization wait。新的相关 UI confirmation 可以 dispatch 仍为 `INTENT_RECORDED` 的同一 exact request/operation ID。若 destructive operation 已 terminal zero-write failure，terminal Operation 不重开；合同允许继续时必须创建 linked new operation。Pending replay 还必须复用 prebound operation/request/input 和 `HELD_PENDING_REPLAY` reservation，并由 fresh Promotion outer invocation 提供当前 class/purpose。

P3 只启用 `ANCHOR_TRIAL`：

```text
freeze Requirement/input
→ reserve exact worst-case compute
→ read one consistent snapshot
→ possible Anchor selected; Coverage remains unset
→ evaluate(ANCHOR_TRIAL)
→ store authoritative receipt/usage
→ reread Catalog/generation
→ COVERED + COMPLETED
   or PARTIAL + exact Release-bound WORKFLOW_DELTA
   or RECOVERY_REQUIRED
```

P3 fixture 必须 schema-prove没有 AI Agent atom。generation/Catalog digest drift 时丢弃 verdict，重新评估；技术失败或 unknown 不是 Coverage。COVERED 不创建 Candidate、lease 或 stage call。

4.3 还必须实现 `EXECUTING_ANCHOR` 的 active cancellation，不能等 P4 再补：

```text
freeze cancel command，拒绝新工作
→ Run = CANCELLING
→ 通过 3.3 CatalogOperationCoordinator
   以 stable cancel operation ID 调 cancel-evaluation
→ authoritative cancelled/terminal containment
→ Run = CANCELLED
```

Anchor trial 从未获取 Candidate build lease，也没有 Candidate，因此这条路径没有 `close-candidate`。cancel/terminal receipt 为 `IN_PROGRESS`、`OUTCOME_UNKNOWN`、missing 或 mismatch 时进入 `RECOVERY_REQUIRED`，不能报告 `CANCELLED`，也不能重发 trial。

### 6.4 P4 Candidate：完整编排

P4 的纯 routing/reducer/fake work 可在 P2 后开始；Builder dispatch 和 `CANDIDATE_PRIVATE` 的真实 Agent 路径必须先完成 0.11P 的 provider scope/证据边界、0.11S 的 verified static trust bundle，以及 0.11A 的 real named adapter/profile 与调用前 fresh attestation。之后还要等待 3.8 A consumer migration、3.9 I legacy deletion、3.10 source/packaged real-Agent gate，并由 `3.11B` 单独关闭 Agent readiness。3.11B evidence 必须精确标识 adapter package/version/digest、real provider config、remote attestation、两层 tombstone、one-send/protected-buffer/raw-residual 结果及 Codex/Claude/FullTrace no-fallback。真实 5.5 stage/evaluate 还依赖 A 的 5.1 mode、B 的 5.3 coordinator 和 5.4 Builder。

路由固定：

```text
PARTIAL     -> exact Release-bound WORKFLOW_DELTA
NOT_COVERED -> Expressibility Check
               -> NEW_WORKFLOW
               -> PLATFORM_CAPABILITY_GAP
               -> RESOURCE_GAP
               -> POLICY_BLOCKED
```

只有 `WORKFLOW_DELTA` 和 `NEW_WORKFLOW` 进入 Candidate path。其余 route 必须零 stage call。

5.3 由 B 实现一个且只有一个 `AgentOperationCoordinator`，Builder 与后续 Verifier 共用：

```text
atomically commit B intent + SDK-owned ComputeReservationV1
→ 以同一 Host operation ID create/status/cancel/reconcile
→ 持久化并采用唯一 handle/receipt
→ 在一个 B transaction 中提交 strict domain projection、consumption receipt、
  usage、Operation 与 Attempt/Run transition
```

unknown/unqueryable work绝不 resend；late、cancelled、superseded 或 contained result 只持久化 digest、size、terminal metadata 和 quarantine reason，不采用 raw payload。5.4 Builder 和 7.3 Verifier 都不得另建 Agent dispatch/coordinator path；二者使用不同 Host-minted operation principal。

Host Agent `SUCCEEDED` 只说明 runtime 有 authoritative terminal receipt，不代表 B 已消费业务结果。B 的 operation-principal-scoped delivery handler 只能在一个 bounded volatile buffer 中解析：

- Builder：closed、bounded `CandidateProposalV1`；
- Verifier：closed、bounded `VerificationAssessmentV1`。

任何 unknown field、错误 discriminant/value、size/count 越界都整份拒绝；raw request、system/context prompt、transcript、provider envelope、unparsed/partially parsed bytes、hidden reasoning 和任意 attachment 永不持久化。合法 projection、绑定 Agent operation/request/profile/result 与 projection type/version/digest 的 consumption receipt、B Operation/Attempt transition 必须在同一 Ledger transaction COMMIT；此前任何后续状态都不能消费该结果。

两个崩溃窗口必须分别实现和测试：

| 窗口 | restart 后唯一合法结果 |
|---|---|
| raw 已 delivery 或 Host 已 `SUCCEEDED`，但 projection/consumption receipt 尚未 COMMIT | 不 redeliver、不 re-query、不 resend、不从 metadata 重建；B Operation `OUTCOME_UNKNOWN`、Attempt `EXECUTION_UNKNOWN`、Run `RECOVERY_REQUIRED`；Host terminal record保持不变 |
| projection + consumption receipt + transition 已 COMMIT，但 acknowledgement 丢失 | 只恢复 exact committed projection/receipt；不请求 raw、不重复 transition |

cancel/supersede/late-result 也用同一个线性化边界：containment 先赢则不能 persist projection，只能留 digest/size/terminal/quarantine metadata；projection transaction 先赢只能幂等恢复该 projection/receipt，不能重新打开或推进后来已 contained 的 Attempt。

B 的 canonical Candidate orchestration 不得跳步：

```text
route 已确定为 WORKFLOW_DELTA 或 NEW_WORKFLOW
→ atomically acquire one workspace build lease
→ Attempt CREATED -> BUILDING
→ atomically reserve Builder budget + commit Agent intent
→ launch Builder operation principal
→ strict CandidateProposalV1 parse
→ Controller derives every authoritative field
→ durable stage-candidate intent
→ A stage receipt
→ Attempt STAGED
→ atomically reserve CANDIDATE_PRIVATE budget
  + record evaluation intent
  + Attempt STAGED -> EXECUTING
→ dispatch exact CANDIDATE_PRIVATE request
→ A ControlledEvaluationReceiptV1 + actual usage
→ READY_FOR_VERIFICATION
   | REPAIRABLE_FAILED
   | FAILED
   | CANCELLED
   | EXECUTION_UNKNOWN
```

lease 必须在 eligible route 之后、Builder admission/reservation/dispatch 之前用一个 transaction 获取。并发 loser 不能启动 Builder，不能创建 Agent thread，也不能调用任何 Catalog action。仅仅“在 stage 前再看一次 lease”不够，因为那会让两个 Run 都先花 Agent 预算。

lease loser 不新增 `WAITING_*` state 或 ticket entity。它必须持久停在现有 `BUILDING_CANDIDATE`，同时满足：

```text
candidateLeaseHeld = false
activeCandidateId  = null
Attempt count      = 0
Operation count    = 0
ComputeReservation = 0
```

所有 waiter 只按持久化 `(createdAt ASC, runId ASC)` 排序。startup 以及任何 lease-release transaction COMMIT 后，B 触发一次 package-fenced、event-driven scan；scan 用一个 conditional Ledger transaction 给最老 eligible Run 设置 lease 并同时创建其 initial Attempt。stale/cancelled/terminal/already-claimed row 只能 no-op 后继续下一行。禁止 polling、busy loop、第二个 scheduler 或非确定性“谁先醒谁先拿”。

5.1–5.9 完成并不等于 Candidate 生产路径已开放。`5.10A [A]` 只可在 `3.11A + 3.11B + 5.1 + 5.8` 后形成 package-owned、无 B/Host/generated/lock 修改的 `CANDIDATE_PRIVATE` provider/mode activation commit；`5.10B [B]` 只可在 `3.11A + 3.11B + 5.2–5.7 + 5.9` 后形成无 A/Host/generated/lock 修改的 route/dispatch/orchestration/first production projection activation commit。两者都不能单独 merge、activate 或 ship。只有 `5.10 [I]` 在 `0.11P + 0.11S + 0.11A + 3.11A + 3.11B + 5.1–5.9 + immutable 5.10A + immutable 5.10B` 全部有 evidence 后，原样集成两个 commit，并通过 exact Host → normal root `@sciforge/agent-operation-adapter` → verified static trust bundle → fresh runtime attestation → OS-vault credential → `ATTESTED_EPHEMERAL_V1` real provider path、real A/B providers 和 killable process boundaries 跑完整 routing/lease/cancel/Agent/stage/evaluate/recovery fixture，才能原子激活唯一 production Candidate path。I 只写 train mechanics 和 tests，不写 domain toggle 或 reducer 语义。5.10 前该路径必须 unavailable 且 fail closed；5.10 也不代表 sealed acceptance 已通过。

Builder 只能返回 proposed body 和 bounded rationale。workspace/base/generation/mode/attempt/supersession/operation/request/change/policy/budget/service exposure/evidence 全由 Controller 派生；未知、越权、超限字段整份拒绝，只留 digest、size 和 stable rejection code，零 stage。

Repair 创建新 Attempt 和新 immutable Candidate。旧 Candidate 直到 successor stage 在 A 的同一 transaction 中产生 `SUPERSEDED` receipt 才退出当前身份。总 Attempt 数以 Gate 0 的精确常量为准，不使用“2–3 次左右”。

预算常量和计数必须原样实现；下面的 `policyValue` 来自当前持久化 workspace policy，不是固定 seed：

```text
RunBudgetDecisionV1.totalAttemptLimit = 1..3，省略时复制 current policyValue，包含初始 Attempt
RunBudgetDecisionV1.sealedQueryLimit  = 1..5，省略时复制 current policyValue
```

首次安装 seed 是 3 个总 Attempt 和 5 个 sealed query，但当前 policy 可以更低；总 Attempt 永远包含 initial Attempt，不是“initial + repairLimit”。每个已经 dispatch 的 sealed evaluation（包括 unknown outcome）消耗一次 sealed query；权威 pre-dispatch `NOT_FOUND` 消耗零 query、零 actual usage，但保留 exact request/reservation 供 fenced redispatch。Builder、private/public/regression/scientific/sealed evaluation、Verifier 和 replay 各有自己的 SDK-owned `ComputeReservationV1`，不能共用一笔未跟踪额度。普通 approval-free pre-dispatch `NOT_FOUND` 不是 release event；只有 B 在同一 Ledger transaction 安全放弃仍为 `INTENT_RECORDED` 的 operation 时才能释放。terminal usage 结算 authoritative actual，无法取得 actual 时按全额；`IN_PROGRESS` 保留 reservation，`OUTCOME_UNKNOWN` 按完整 worst case 计费；replay 使用第 6.6 节更严格的 held 规则。

### 6.5 P5 前三道独立硬门

P5 只有在以下三道门全部通过后才能开始。

#### 门一：stable callers 全部迁移

A 必须在 6.1–6.2 完成：

- UI/Agent 只调用 `execute-bound-service(bindingId, expectedGeneration)`；
- Create Loop scheduler/webhook 只调用 `dispatch-bound-service(bindingId, generation, trigger/event idempotency)`；
- 所有 caller 只解析 current stable Anchor binding；
- arbitrary/unbound/provisional/stale Release 全部拒绝；
- pre-dispatch `AgentProfileEnforcementReceiptV1` 和 terminal `AgentExecutionReceiptV1` 与 `WorkflowExecutionPolicyBindingV1` 匹配；
- 删除 mutable `workflowId` production action、alias、forwarder、fallback；
- schedule/webhook cursor 使用 generation fence。

stable caller migration 必须在 provisional Promotion 前完成，否则“pending 不可见”没有生产意义。

I 的 6.3 必须在 source 和 packaged app 跑完四 caller 矩阵：

| Stable caller | Canonical action / identity | 每一行共同必须证明 |
|---|---|---|
| renderer/manual | `execute-bound-service(bindingId, expectedGeneration)`；UI current confirmation | valid current binding 执行；proposed/provisional/unbound/arbitrary Release 和旧 generation 拒绝 |
| Agent | `execute-bound-service(bindingId, expectedGeneration)`；Host Agent principal/current confirmation | 同上，且 enforcement receipt 与 terminal actual receipt 匹配 |
| schedule | `dispatch-bound-service(bindingId, generation, trigger idempotency)`；仅 `sciforge.create-loop` | 同上，且 frozen trigger 与 durable dispatch idempotency 生效 |
| webhook | `dispatch-bound-service(bindingId, generation, event idempotency)`；仅 `sciforge.create-loop` | 同上，且 frozen event 与 durable dispatch idempotency 生效 |

四行都要在 pending 全程继续解析旧 Anchor，finalize 后才切到新 Anchor，abort 后仍留在旧 Anchor，并证明 mutable-ID fallback 已不存在。Draft preview 只能作为显式 non-service preview，不能充当 stable caller。

#### 门二：A/I/B transient sealed-result 完整链

同一个 canonical `evaluate` descriptor 使用第 5.7 节的完整三类映射；只有 `TRUSTED_SEALED_HARNESS + CANDIDATE_SEALED` 得到 `TRANSIENT_HARNESS_COMPARE`，普通与 live replay 都是 `STANDARD_CONTROLLER_RESULT`。这不是第二个 handler。

| Owner | 必须完成 |
|---|---|
| A | descriptor 注册严格 delivery policy；只持久化 digest/status/usage receipt；不保留 raw result；无 ordinary-result fallback |
| I | Broker/runtime/transport 禁止 cache、trace、event、log、generic subscriber、IPC replay、persistent return；remote provider 必须给实际 zero-retention enforcement receipt |
| B | trusted harness 只在内存比较 bounded raw buffer；success/failure/cancel 都 zeroize；只持久化 aggregate `SealedSuiteReceiptV1` |

sealed input 必须是 synthetic、non-secret，只能进入 exact Candidate evaluation。oracle、expected、assertion、case metadata、suite membership 始终只在 B private harness/registry。Crash 发生在 evaluation 后、trusted receipt commit 前时，结果是 sealed `OUTCOME_UNKNOWN`，不得推断、重试或 Promotion。

I 必须在 source 和 packaged app 中使用 unique canary 做 positive control，扫描 cache/trace/events/logs/subscribers/IPC/persistent return/Ledger/Markdown/Agent-visible/export；故意泄漏 fixture 必须让 scanner 失败。

#### 门三：Verifier data-only 隔离

B 的 `VerifierInputEnvelopeV1` 必须把 Candidate prompt、rationale、text 作为 fixed Host system policy 之下的 quoted untrusted data。它们不能成为 system instruction、context config、tool、automatic reference 或 file input。

Verifier：

- 使用独立 operation principal；
- 只接收 data-only Candidate envelope 和 opaque sealed receipt ID；
- 只返回 advisory `VerificationAssessmentV1`；
- 不能自报 sealed pass、伪造 receipt、宣告 eligibility 或请求 mutation。

I 的 prompt-injection positive-control 必须证明恶意 Candidate 与 clean control 的 effective system policy、context、tool set、reference set 和 file inputs 字节相同；故意脆弱 fixture 必须失败。

I 只有在 6.12 的六项证据同时固定到 immutable SHA 后才可关闭 P5 readiness：

```text
3.6  real provider + live authorization
3.10 Agent isolation after legacy deletion
5.10 atomic Candidate activation train
6.3  four stable-caller source/packaged matrix
6.11 complete A -> I -> B transient delivery canary
6.8  Verifier prompt-injection isolation
```

### 6.6 P5 Promotion、continuation 与 rollback

7.1 由 A 在 6.12 后实现并 fixture `POST_PROMOTION_REPLAY`，但 production exposure 必须保持 fail-closed，直到 7.14C 随 7.15 原子激活。B 的 7.2 只有在 `5.10 + 6.12` 都有 immutable evidence 后才能开始；7.2–7.4 verification reducer 顺序固定：

1. 当前 immutable Attempt 必须已经是 `READY_FOR_VERIFICATION`；一个 Ledger transaction 消费 `VERIFICATION_STARTED`，把 Attempt 和 Run 都进入 `VERIFYING`，然后才能 dispatch verification work。
2. 7.2 的 public/regression/scientific/sealed evaluation 各自先 reserve 独立 budget。每个 matching terminal suite receipt 只绑定 evidence，不能单独宣告 verification pass；sealed 仍只保存 trusted aggregate receipt。
3. 7.3 通过共享 5.3 `AgentOperationCoordinator` 启动独立 Verifier principal，只提交 strict `VerificationAssessmentV1` projection/consumption receipt。assessment 只是 advisory。
4. 7.4 必须实现一个 exhaustive total reducer，闭合输出只能是 `PASS | REPAIR | FATAL | UNKNOWN`，没有 default branch，也不能漏掉 Cartesian tuple。
5. `PASS`：只有 deterministic Controller 重新验证 exact Candidate/policy、全部 public receipts、opaque sealed receipt、regression/scientific evidence、Builder/Verifier operation/isolation/actual-usage receipts都可信，且 advisory Verifier 无 unresolved blocker 时，才冻结 report，并在一个 transaction 中写 Attempt `VERIFIED`、Run `WAITING_PROMOTION`。
6. `REPAIR`：只有权威 public repair evidence、remaining Attempt capacity 和 budget 都满足时，才保留 lease，把旧 Attempt 固定为 `REPAIRABLE_FAILED`，原子创建 `attemptNo+1` 并回 `BUILDING_CANDIDATE`。
7. `FATAL`：policy/security/isolation/forgery/supersession、不可修复 failure，或者虽然 evidence 可修复但 remaining Attempt capacity/budget 不足；B 必须先取得 matching `close-candidate(FAILED)` receipt，再 terminalize Attempt/Run 并释放 lease。
8. `UNKNOWN`：任一 required operation/evidence 为 missing、late、mismatched、foreign、`IN_PROGRESS`、`OUTCOME_UNKNOWN`、`EXECUTION_UNKNOWN` 或 otherwise ambiguous；Run 进入 `RECOVERY_REQUIRED`，outcome-unprovable Attempt 固定为 `EXECUTION_UNKNOWN`，Candidate lease 保持 held；不得生成 report、repair、eligibility 或推断 Candidate disposition。
9. Verifier recommendation 只能降级或增加 risk，不能把 objective failure 升级成 `PASS`。
10. `VerificationReportV1` 绑定 exact Candidate、policy、所有 receipt/usage/isolation digest 和 residual risks；只有 `PASS` 可以产生可用于 decision 的 report。

7.5 的 `record-promotion-decision` 只写 Ledger business fact，绝不能直接调用 Catalog：

- approval：进入 `WAITING_PROMOTION_AUTHORIZATION(PREPARE)`；
- rejection：handler 返回后，由 deterministic Controller 的普通 approval-free saga 记录 `close-candidate(REJECTED)` intent；收到 A matching receipt 后，B 才原子进入 `REJECTED` 并释放 lease；unknown close 进入 `RECOVERY_REQUIRED`。

`WAITING_PROMOTION_AUTHORIZATION` 必须携带唯一可信 phase：

```text
PREPARE
REPLAY_OR_ABORT
```

- `PREPARE`：没有 pending，已有 exact approved decision。
- `REPLAY_OR_ABORT`：matching pending 已存在，replay operation 权威为 `NOT_FOUND`。
- phase 由 reducer 从 trusted receipts 推导，payload 不能设置。

7.6A 只能在 `6.12 + 7.1 + 7.5 + A 的 7.7 validation` 都有 immutable evidence 后开始；7.6B 还必须等 7.6A 的 prebound pending/reservation 语义完成。`execute-promotion` 只能在当前 UI confirmation、Promotion purpose 和同一 workspace 下运行。顺序固定，reservation 绝不能在 prepare 之后才创建：

```text
ReplayReservationStateV1 =
  HELD_PREPARE | HELD_PREPARE_RETRY | HELD_PENDING_REPLAY | SETTLED | RELEASED
```

```text
B atomically create/freeze replay ComputeReservationV1
→ preallocate exact replay operation/request/input identities
→ journal promotion intent
→ await prepare-promotion
→ authoritative prepare NOT_FOUND:
    same Operation/request/reservation = HELD_PREPARE_RETRY
    WAITING_PROMOTION_AUTHORIZATION(PREPARE)
→ terminal prepare zero-write failure:
    release that reservation exactly once
    later confirmed new Operation uses a new reservation
→ success: pending provisional Catalog binds those exact identities/reservation
            reservation = HELD_PENDING_REPLAY
            stable Anchor remains old
→ synchronously await exact POST_PROMOTION_REPLAY as registered outer child
→ PASS: finalize；若 scope 已结束则 WAITING_FINALIZE_AUTHORIZATION
→ FAIL/FAILED/contained CANCELLED: abort；若 scope 已结束则 WAITING_ABORT_AUTHORIZATION
→ replay NOT_FOUND: keep HELD_PENDING_REPLAY
                    WAITING_PROMOTION_AUTHORIZATION(REPLAY_OR_ABORT)
→ IN_PROGRESS/OUTCOME_UNKNOWN: RECOVERY_REQUIRED
```

prepare 权威 `NOT_FOUND` 且无 pending 时也不能释放 reservation：它把同一个仍为 `INTENT_RECORDED` 的 exact request 变为 `HELD_PREPARE_RETRY`，下次 fresh confirmation 复用相同 operation/request/reservation。只有 authoritative terminal `AUTHORIZATION_REQUIRED`、`RETRYABLE_ZERO_WRITE` 或其他合同规定的 terminal zero-write prepare failure 才释放该 reservation；以后若可继续，必须新建 linked Operation 和新 reservation。未证明 write/outcome 的 reservation 绝不释放。

一旦 pending 已提交，replay `NOT_FOUND` 就必须保持 `HELD_PENDING_REPLAY`，不得归还给并发工作。只有 exact terminal replay 结算 actual/full usage，或 matching terminal abort 对 undispatched hold 恰好释放一次。

每个 first/retry prepare dispatch 与每个 pre-pending cancellation proof 必须进入同一个 B Controller dispatch fence；key 是 exact workspace、Run 和 B Operation identity。Controller、reconciler、restart resume、timer、command handler 都不能绕开它。这个 fence 只控制 B dispatch admission；Host/Broker 的 child registration/revocation/settlement 仍只走 canonical `LiveChildRegistrarV1`。

- dispatch side 在 fence 内重新读取 exact Run/Operation/reservation revisions 与 digests，并一直持有到 canonical child registration 在 handler 前失败，或已注册 child 到达 canonical contained settlement；
- mutually exclusive cancel side 在 fence 内重新读取同一组 Ledger facts，再做 current owner/workspace `read-operation` 与 `read-pending-promotion`，并在仍持 fence 时提交或拒绝 abandonment；
- fence 外、进入前或释放后的 `NOT_FOUND`/no-pending observation 都不是取消证据；
- cancel-first：在释放 fence 前，Ledger transaction 冻结新 work、把 prepare intent terminalize 为 `CANCELLED`、记录零 usage/query 并恰好释放一次 `HELD_PREPARE_RETRY`；以后任何 dispatcher 重读都不得注册 child 或 dispatch；
- child-registration-first：cancel 禁止 abandonment 和 reservation release，必须等这个 canonical child settlement，再只按 current authoritative provider state 归约；
- 任何 interleaving 都不能同时出现 released reservation 与 registered/dispatched prepare child。

若已经 staged Candidate，安全 cancel 之后仍须取得 matching `close-candidate(CANCELLED)` receipt，才能最终 `CANCELLED` 并释放 Candidate lease；generic cancel 不能写 `ABORTED`。任何 mismatch/ambiguity/pending 都是 non-cancellable，reservation 保持 held，也不能由独立 cleanup job 回收。

B-owned deterministic fixture 要在同一 fence boundary 强制 cancel-first 与 child-registration-first。real subprocess 还要 kill 在 cancel-side COMMIT 前/后、child registration 后但 final handler handoff 前、以及 handoff 后但 A claim/handler 前；用相同 userData 重启后必须证明 A handler handoff 至多一次、无重复 prepare mutation，并且 reservation 只有 retained 或 released 一个结果。

从 `REPLAY_OR_ABORT` 继续时，新 confirmation 必须冻结 `REPLAY` 或 `ABORT` 选择；`REPLAY` 复用原 operation/request/input/reservation ID/digest，并要求 Host 从这个 fresh outer invocation 重新派生 `LIVE_APPROVED_OUTER_CONTROLLER`。Passed replay 也可以在新的 Promotion confirmation 下显式放弃并 abort，但必须提供 matching pass receipt 和 abandonment reason；任何 background replay/abort 都禁止。Pending 永不过期，不做后台 cleanup。

Rollback 是单独的 `ROLLBACK_RECOVERY` Run：

1. 7.9 的 `open-rollback-recovery` 是唯一入口。
2. 它按 `(workspaceId, promotionReceiptId, failedGeneration)` 验证并幂等创建/返回唯一 non-terminal Run，直接进入 `WAITING_ROLLBACK_AUTHORIZATION`。
3. 它无 Candidate lease、无 Catalog call、不能指向任意历史。
4. 已证明 `ROLLED_BACK` 或 authoritative permanent `ROLLBACK_FAILED` 的 tuple 永不重开；取消的 waiting Run 只有在没有后续 finalize/rollback 使 tuple 失效时，才允许新的 distinct confirmed open。
5. 7.10 的 `execute-rollback` 只作用于已有 recovery Run，并要求 fresh rollback purpose。

7.10 只有在 A 的 1.9C rollback implementation/validation、A 的 7.7 protected-input validation 和 B 的 7.9 recovery entry 全部完成后才能接真实 Catalog rollback。

Rollback retry：

- `NOT_FOUND`：保留原 `INTENT_RECORDED` Operation 和同一 operation ID；下次新 confirmation 可发同一个 exact request。
- 已 terminal 的 `AUTHORIZATION_REQUIRED`、`RETRYABLE_ZERO_WRITE`、`PENDING_PROMOTION_PRESENT`：返回 waiting，但下次使用新的 operation ID，并链接旧 Operation。
- 永久 `STALE_GENERATION`、`VALIDATION_REJECTED`、`PERMANENT_FAILURE`：`ROLLBACK_FAILED`。
- `IN_PROGRESS`、`OUTCOME_UNKNOWN`、pending mismatch 或 malformed receipt：`RECOVERY_REQUIRED`。
- 任何 pending Promotion 都让 rollback 零 Catalog 写并回到 authorization wait。

B 的 P5 fault evidence 被拆成两个不可互相替代的任务：

- 7.12A：覆盖每个 Ledger intent/receipt/resume boundary、pending cancel denial、Candidate disposition-before-terminal、sealed/Verifier unknown/late output、Promotion waits、rollback entry、lease release，并对 Builder/Verifier 都跑“raw/Host terminal 在 projection COMMIT 前”和“projection COMMIT 后 acknowledgement 前”两个窗口；
- 7.12B：对 P2 之后新增的每个 P3–P5 Ledger transaction family 重新执行 2.12 的 every-SQL-statement、pre-COMMIT、COMMIT、post-COMMIT/pre-response、real close/reopen、kill/restart 全矩阵，逐一断言 before/after image、resume action、reservation held/released、lease 与 terminal receipt，不能抽样。

### 6.7 Candidate、无 Candidate 的取消和 lease

2.7 只实现没有 active work、lease、pending 或 destructive ambiguity 的 waiting-Gate cancellation；5.7 才实现 active work、empty lease 和 Candidate-bearing Run 的完整 containment。两者不能用同一条“直接设为 CANCELLED”捷径。

取消严格按以下顺序：

1. freeze cancel command，拒绝新工作；
2. 以稳定 operation ID cancel/contain Agent、evaluation、Teacher；
3. 等全部 operation 权威 terminal/cancelled；
4. 若 `activeCandidateId != null`，journal/reconcile `close-candidate(CANCELLED)`；
5. B 只有在 matching close receipt 后，才能同一 Ledger transaction 进入 `CANCELLED` 并释放 lease。

四种情况必须分开：

| 情况 | terminal / lease 规则 |
|---|---|
| 从未进入 Candidate path、没有 lease | 无 active work/pending/destructive ambiguity 时可直接取消 waiting Gate |
| Candidate lease race loser：`BUILDING_CANDIDATE`、`candidateLeaseHeld=false`、`activeCandidateId=null`、零 Attempt/Operation/reservation | 可在一个 transaction 中原子进入 `CANCELLED`；不调用 `close-candidate`，FIFO fenced scan 必须跳过该 Run |
| 已拿 build lease，但 `activeCandidateId=null` | 全部 operation terminal 后，同一 transaction 写 `NO_CANDIDATE_STAGED` 并释放空 lease；不调用 `close-candidate` |
| `activeCandidateId!=null` | 必须先拿到 A 的 matching terminal disposition receipt；unknown/mismatch 时 `RECOVERY_REQUIRED` 且保留 lease |

`WAITING_ROLLBACK_AUTHORIZATION` 只有在没有 rollback intent、Operation 或 registered child 时才可 cleanly cancel；一旦写入 dispatch intent，就零状态拒绝 cancel，直到权威 containment。取消记录保留为 immutable history。只有这种 pristine pre-intent `CANCELLED`，且没有 Ledger-known later finalization 或 `RollbackReceiptV1` 使 tuple 失效时，后续 distinct confirmed `open-rollback-recovery` 才可能按 frozen guard 新建一个 recovery Run。曾经 `ROLLED_BACK` 或 authoritative permanent `ROLLBACK_FAILED` 的 tuple 永不重开。

有 pending Promotion、unresolved destructive operation，或处于 `PROMOTING`、`REPLAYING`、`WAITING_FINALIZE_AUTHORIZATION`、`FINALIZING`、`WAITING_ABORT_AUTHORIZATION`、`ABORTING_PROMOTION`、`ROLLING_BACK` 或 matching destructive `RECOVERY_REQUIRED` 时，`cancel-run` 必须 `NON_CANCELLABLE_SAFETY_PHASE` 零写拒绝。

### 6.8 P5 只能通过一个原子 activation train 开放

`7.14C`、`7.14D` 的全部 package-owned producer tasks，以及 7.13A/7.13B 完成，也不代表 P5 production route 已开放。为了避免 “A replay 已开、B recovery 还没开” 或反向半激活：

1. `7.14C [A]` 从同一个 frozen pre-activation integration SHA 形成唯一 A-owned semantic activation commit，只启用已经 review 的 replay/protected provider surface，不含 Host/generated/lock 修改；
2. `7.14D [B]` 从同一个 SHA 形成唯一 B-owned semantic activation commit，只启用 7.6A/7.6B/7.8/7.10 已 review 的 Promotion continuation/recovery routes 与 reducer bindings，不含 generated/lock 修改；
3. 两个 commit 都不能单独合入；
4. `7.14A [I]` 在包含 exact 7.14C/7.14D 的未合并 train 上跑 source 真实链；`7.14B [I]` 用同一 train 跑 packaged 真实链。两条链都必须从 generated composition 经 B public capability/controller、唯一 adapter、manifest-owner invoker、real Broker 到 real A provider，禁止 direct handler/factory、fake injection 和 I-authored domain toggle；
5. `7.15 [I]` 只有在 A/B focused evidence、7.12A/7.12B 全故障矩阵、7.13A/7.13B kill windows、A/I/B transient canary 和 7.14A/7.14B 全绿后，才原样集成两个 activation commits，并加一个纯机械 lock/composition/docs commit 原子合入。

任何 semantic failure 都退回对应 A/B owner。`[I]` 不能在 train 上“顺手修” domain reducer，也不能让一个 activation commit 先进入 integration。

### 6.9 P6

P6 才加入 renderer 和 audit export：

- B 提供冻结、非秘密科研 corpus 和 requirement/redaction cases；
- A 用 canonical initial provision 建一个 Catalog/Anchor，其中有 3–5 个 manual-only Releases/bindings；
- 8.3 在同一个 B-owned renderer/export semantic commit 中把 package/module 从 `1.1.0` 精确升到 `1.2.0`；8.5 必须使用这个仍未合入的 exact `1.2.0` train，8.6 只为它提供 higher 0.8S release input/protected signature 和机械 integration，I 不能替 B 改版本或 definition/export 语义；
- B UI 只走 capabilities，不读 SQLite、不解析 Markdown 为状态、不建第二 reducer；
- 0.4 冻结、0.6 提供 byte vectors 的 closed `RedactedAgentUsageProjectionV1` 精确包含：`schemaVersion:1`；每个 `1..128` UTF-8 bytes 的 `runtimeVersion/modelVersion/profileVersion`；exact `status=SUCCEEDED | FAILED | CANCELLED | OUTCOME_UNKNOWN`；分别不超过 frozen `maxInputTokens/maxOutputTokens/maxCostUsdMicros/maxWallTimeMs` 的非负 safe-integer `inputTokens/outputTokens/costUsdMicros/latencyMs`；`1..128` 个按 UTF-8 bytes 排序、无重复 lowercase SHA-256 `receiptDigests`；以及 lowercase `projectionDigest`。digest 是排除自身后的完整对象 RFC 8785 canonical UTF-8 SHA-256，所有值只从 bound Host-verified enforcement/execution/usage receipts 派生；
- unknown field、duplicate/non-canonical order/number/bytes、tamper，以及 renderer/Agent/provider payload/current default/export option 供值，或 handle/thread/turn/principal/provider/config/endpoint/prompt/result/transcript/correlation/case membership/per-case outcome/sealed/oracle/resource-ref/authorization/path/secret/direct-DB 字段，都必须 schema rejection；`export-audit` 还只能输出 redacted run data 与 opaque sealed receipt digest/aggregate；
- 8.5 中 B 只调用 0.7B 建立的 Host `WorkspacePublisherV1.publishNewFile(publicationId, relativePath, boundedBytes, mediaType, contentDigest)` 并消费 receipt；保留 wire 字段名 `relativePath`，但它的值必须是 workspace 根目录下一个 filename segment；B 永远不接收/reconstruct canonical path；
- 首次调用 Host 前，B 在一个 Ledger transaction 中提交 export intent、closed B-owned `AuditPublicationRebuildRecipeV1` 和 immutable bounded redacted projection record。它冻结 exact source revisions/digests、projection/serializer implementation identities/digests、publication/request identity、expected byte length/content digest，但不保存 raw publication bytes；字段级 canonical schema 只以 spec 为准，不在指南复制；
- response 丢失或 restart 后先只用 same owner/workspace/publication ID 调 `readPublication`。exact receipt 可幂等采用；public result 必须严格复用第 5.3 节的 closed flattened allowlist 和 `REQUEST_REJECTED | PUBLICATION_FAILED | OUTCOME_UNCERTAIN` 映射，unknown/nested details 不得序列化，private diagnostic/nonce/file/execution/publish identity、handle/path/occupancy evidence 不能通过任何公开通道出现，也不能取得 fence 或 resume。conflict/failure/absence/ambiguity 都不能自动创建第二个 publication、alternate filename 或 overwrite；
- 只有新的 matching confirmation 才能恢复 Host write。B 只能从 frozen projection 与 recipe-bound exact implementations 重建；不能读取 current Ledger rows、采用 later revision、换同名 current serializer、保存/读取 raw bytes 或更换 publication ID/name。重建 bytes 必须与第一次 volatile serialization **byte-for-byte 相同**，并再次匹配 length/content/request digest；任何 frozen fact unavailable/mismatch 都必须零 Host invocation；
- 8.8 fixture 把第一次 bytes 只留在 test memory，之后提交新的 Ledger revisions、close/reopen real Ledger，再 fresh-confirmed resume；必须同时证明 byte equality、length/digest equality 和 Host 只收到一次原请求；
- Host publisher 只通过 source/packaged 共用的 native port 对 retained workspace-root handle 下的一个 filename 做 atomic no-overwrite publish；所有 nested/separator path 在 native dispatch 前拒绝，不做 component walk；
- 8.8/8.9 必须逐个 kill：B intent/recipe/projection COMMIT 后；Host `CLAIMED` COMMIT 后但 native create 前；exclusive create 后；首字节后；temp flush 后；identity read 后；`TEMP_STAGED` COMMIT 前；`TEMP_STAGED` 后但 `enterPublish()` 前；`enterPublish()` 后但 durable `PUBLISHING` COMMIT 前；`PUBLISHING` COMMIT 后但 native publish 前；atomic final publish 后但 receipt COMMIT 前；durable receipt 后但 B/UI response 前。六个 pre-staging window 都在 Host-private store 保留同一个 nonce，但 public lookup 只报告 `CLAIMED` phase；只有 claim-before-create 且 exact nonce/final absence 可恢复，另外五个 post-create `CLAIMED` 路径必须 no-touch fail closed。`TEMP_STAGED` 只能从 exact persisted identity/digest + final absent 恢复；`enterPublish()` 后必须紧邻 `PUBLISHING` COMMIT 再证明 exact staged regular/non-reparse/single-link identity/digest 与 final absent，任一失败零 native publish。并发 fresh resumes 必须由 per-operation execution fence/single-flight 产生一个 filesystem/native winner 和 read/adopt-only loser；second Main 不能初始化 publisher。只有 `PUBLISHING` lineage 可在 fresh lease + matching execution fence 下继续/对账，且 immediate/reconciled `SUCCEEDED` 前都必须证明 final regular、non-reparse、single-link、exact fenced identity/digest 和 nonce path absent。全程不能 enumerate/guess/rotate/create second temp；
- I 运行 realpath/symlink/case alias 下的 source/packaged two-launch E2E，并在 renderer 已存在时重新注入 Create Loop failure/disable/removal/version/definition/export switch，以及 disposer throw/hang/timeout/crash。必须证明 B 的 private staging 从未 partial publish，published snapshot/graph lock 先关闭全贡献，再让 child/resource 归零；失败停在 `TEARDOWN_FAILED`，A 不被提前替换、B 不被重启，只有 `TEARDOWN_FAILED -> QUIESCING` 的 same-attempt controlled retry 可重走 exact recovery/disposer path；显式 installed/enabled 选择跨 restart 不变。

## 7. 崩溃、重试和故障注入

### 7.1 Catalog 与 Ledger

所有 B-owned Catalog mutation 都执行：

```text
Ledger intent commit
→ owner-checked read-operation
→ invoke if permitted
→ immutable receipt/error
→ Operation + Run/Attempt transition in one Ledger transaction
```

这就是 3.3 的唯一 `CatalogOperationCoordinator/Reconciler`，不是可以在各 saga 复制的一段伪代码。B 不能仅因发起 Promise/IPC 就把 Operation 标成 `IN_FLIGHT`；只有 A 权威返回 `IN_PROGRESS` 才能进入该状态。同步 terminal 或 restart 后发现的 terminal receipt 可以直接从 `INTENT_RECORDED` 进入 terminal。

DB-only A action把 operation claim、mutation 和 terminal receipt 放在一个 SQLite transaction：

- COMMIT 前 crash：`NOT_FOUND`；
- COMMIT 后：terminal immutable receipt；
- 不允许 DB change 与 receipt 分离成 orphan `IN_PROGRESS`。

Controlled/external execution才能出现 `IN_PROGRESS/OUTCOME_UNKNOWN`。B 对任何 unknown 都不自动重发、不推断成功、不创建 VerificationReport、不 Promotion。

### 7.2 Agent dispatch 三个必杀窗口

必须用可 kill 的真实子进程测试至少覆盖：

1. Host `CLAIMED -> DISPATCHING`、stable dispatch token、recipe binding 与不可复用 **Host token-allocation tombstone** 已在一个 transaction 中 COMMIT，但 adapter 尚无 record：restart lookup 必须是 authoritative `NOT_FOUND`；只有所有 frozen recipe/profile/reservation/request digests 完全匹配，才用同一 token 进行首次 `createOrGet`；
2. adapter-local `MAY_HAVE_BEEN_ACCEPTED` 已 COMMIT，但 worker/external application send 尚未发生：restart 必须 `UNQUERYABLE`，不能 `NOT_FOUND`、rebuild 或 resend；measured application-send count 为 `0`，Host operation 进入 `OUTCOME_UNKNOWN`；
3. single-shot external application request 已发送，但 adapter/Host handle 或 terminal receipt 尚未 COMMIT：若 provider-native authoritative lookup 能证明 exact same token 的 `RUNNING/TERMINAL` 就采用，否则 `UNQUERYABLE -> OUTCOME_UNKNOWN`；measured application-send count 为 `1`，两种结果都不 resend。

三处都必须通过 exact Host → normal root `@sciforge/agent-operation-adapter` → `ATTESTED_EPHEMERAL_V1` → real allowlisted attested remote path 测试。Transport fixture 必须证明 redirect、auth refresh、possible-write reconnect、SDK retry、hedging、failover 和 queue redelivery 都不会产生第二个 application request；provider-native idempotency 不能替两次 send 开脱。recipe unavailable/mismatch 必须 `FAILED/REQUEST_REBUILD_UNAVAILABLE` 且零 adapter tombstone/send；GC/404/retention/visibility ambiguity 在已有 adapter record 时只能 `UNQUERYABLE`；`RUNNING` 后不可能的 `NOT_FOUND` 也只能 `OUTCOME_UNKNOWN`。

另需覆盖 B 已收到 handle、但 Ledger handle receipt 尚未 COMMIT 的退出窗口，确认 5.3 coordinator 只 reconcile 同一 Host operation，绝不创建第二次 dispatch；terminal cleanup、package upgrade、Host/adapter/worker restart 后两层 tombstone 都仍存在且 token 不复用。raw canary scan 同时覆盖 Host/adapter/worker/domain databases、workspace/temp/runtime files、core/minidump/crash-report/upload、swap/page-capture fixtures、sessions/events/traces/logs/caches/artifacts/queues 和所有启用的可逆编码；只能留下 allowlisted digests、bounded metadata、两层 tombstone 和 enforcement/terminal receipts。

### 7.3 Promotion kill windows

7.13A 至少覆盖：

- A commit 后、B receipt commit 前；
- prepare commit 后、B receipt commit 前；
- replay/finalize/abort/rollback dispatch 前后；
- live authorization outer return/throw/cancel；
- child 已 dispatch 但 domain code 未 await；
- successful-return-first/`enterCommit()`-first，以及 throw/cancel/revoke-first/`enterCommit()`-first 的两种线性化顺序；
- prepare fence 的 cancel-side COMMIT 前/后、child registration 后但 final handler handoff 前、handoff 后但 A claim/handler 前。

要求 closing-first 零 protected write，commit-first 强制 outer settlement 等 COMMIT/rollback/terminal/release；prepare cancel-first 与 child-registration-first 不能同时释放 reservation 和 dispatch，重启后 A handler handoff 至多一次；stable service 在 pending 期间始终解析旧 Anchor；reconciliation 只读；任何未提交 destructive continuation 都等新的精确 confirmation。

### 7.4 Transient sealed-result 三个必杀窗口

7.13B 必须在 source/packaged 可 kill 进程中覆盖：

1. I 已拥有 A 的 raw mutable buffer，尚未转交 B；
2. B 已拥有该 buffer，aggregate `SealedSuiteReceiptV1` 尚未 COMMIT；
3. aggregate receipt 已 COMMIT，response 尚未交付给调用方。

前两个窗口重启后只能得到 sealed `OUTCOME_UNKNOWN`；第三个只能恢复已经提交的 digest/aggregate receipt。三者都必须复用同一 userData 并重新扫描 6.11 的全部 surface，证明没有 raw replay、redelivery、temp copy、immutable/structured-clone copy 或 uncleared error payload。任何一跳无法证明 single-owner mutable buffer transfer 与 `finally` zeroization 时，只能使用 destroy-on-completion isolated process；仍无法证明则 execution 前 fail closed。

## 8. Coding Agent 任务包

每次只给 Coding Agent 一个 task ID。不要说“完成 P4”或“实现整个 B package”。

```text
Task ID:
Owner role: [A] | [B] | [I]
Goal:
Integration base SHA:
Dependency/evidence SHAs:
Owned paths:
Read-only context paths:
Public contracts and generated-matrix digest:
Required behavior:
Required state/event/receipt rows:
Non-goals:
Forbidden changes:
Tests to add first:
Fault/kill windows:
Verification commands:
Stop conditions:
Semantic commit handoff:
```

推荐 prompt：

```text
先完整读取根 AGENTS.md、active OpenSpec、owned package README，以及本 task
引用的 package contract 和 generated matrix digest。

在编码前列出：
1. 当前事实；
2. task 完成后应成立的目标；
3. 逐项可验证成功标准；
4. owned path 与禁止 path；
5. 需要的 dependency/evidence SHA。

只修改 Owned paths。发现必须改变公共 schema、descriptor、ACL、purpose、FSM、
receipt、shared/generated file 或另一 owner 路径时，立即停止并报告，不要扩大范围。
先写失败测试，再实现最小生产路径。

不得新增平行 IPC、MCP、service、registry、state store、runner、canonicalizer、
compatibility alias 或 fallback。不得用 prompt、自报 role、thread name、临时目录、
enabled=false 或 requested profile 代替 Host enforced isolation。

无 authoritative operation/dispatch token/handle/status 时不得自动重试。
不得把 sealed oracle、secret、raw Agent/result、internal handle 或 authorization token
写入 prompt、workspace、Ledger、Markdown、日志、trace、event 或 export。

完成后只提交 owned semantic commit；不要手改 lock、generated output 或 OpenSpec checkbox。
```

Agent 完成报告：

```text
Result:
Semantic commit SHA:
Changed files:
Contract changes:
Tests added:
Commands and exact results:
Fault/kill windows covered:
Unverified:
Risks:
Required integration train:
Next dependency:
```

I 接手 semantic commit 后另建 `stage1/i-train-*`，生成 lock/composition/capability docs/matrix 并运行 full CI。Agent 不得把 semantic draft 直接合入 integration。

## 9. 验证命令

### 9.1 当前可用的 package/root 验证

Create Loop：

```bash
npm --workspace @sciforge/domain-create-loop run test
npm --workspace @sciforge/domain-create-loop run typecheck
```

Workflow Evolution package 建立后：

```bash
npm --workspace @sciforge/domain-workflow-evolution run test
npm --workspace @sciforge/domain-workflow-evolution run typecheck
```

通用平台：

```bash
npm run domain-sdk:test
npm run domain-sdk:typecheck
npm run domain-packages:check
npm run capability:check
```

Combined train：

```bash
npm run domain-packages:generate
npm run capability:generate
git diff --exit-code
npm run domain-packages:check
npm run capability:check
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

`stage1-contract-matrix.mjs` 的生成/check CLI 由 0.13 与 CI 一起冻结；在该任务合入后，PR 必须使用仓库实际注册的 matrix check 命令，不能在本指南提前发明另一个命令。

### 9.2 Gate 0 新增的阻塞命令

0.2 合入后，每个 combined train 必须执行：

```bash
npm run license:policy-check
```

该命令必须由 versioned allow/deny/notice rules 和 negative fixtures 支撑：

- denied license 必须失败；
- required notice missing/unknown 必须失败；
- manual exception 必须是 committed immutable SPDX/notice record；
- exception 缺 owner、evidence、expiry/review date 或 explicit merge-block condition 必须失败。

不要再使用历史 `license:package-audit` 名称作为 Stage1 gate。

### 9.3 里程碑

```bash
npm run typecheck --workspaces --if-present
npm run test --workspaces --if-present
npm run smoke:electron:source
npm run smoke:electron:packaged:build
git diff --check
```

source/packaged smoke 必须真实经过：

```text
generated composition
→ B public capability/controller
→ sole WorkflowCatalogPort adapter
→ owner-bound invoker
→ real Broker
→ real A provider
```

直接 factory/handler 调用和 fake injection 不算生产验收。最终 two-launch 场景必须复用同一 userData/workspace，并覆盖 realpath/symlink/case alias、Ledger/Catalog/grant/operation namespace/Candidate lease 一致性。

## 10. 必须暂停并回到合同的情况

出现任一情况，停止 feature implementation：

- 需要改变 schema、descriptor、action ID、ACL、purpose、digest、receipt 或 FSM edge；
- package constants、generated matrix、OpenSpec 三者不一致；
- 需要修改另一 owner 的 path；
- semantic branch需要手改 lock/generated/checklist 才能过；
- manifest 仍是 V1/dual parser、module/package version 不等、dependency 是字符串、required export 没有 canonical descriptor、descriptor/implementation/type surface 在 source/packaged 漂移、definition/descriptor digest 同版本变化或降级、caller edge 由 ACL/action prefix/runtime scan 推断，或 release config 开始列 package；
- `sciforge.official` 没有包含完整 13→14 release cohort、把 cohort 错当成 6→7 Workbench 产品分类、丢失任一原 package contribution，或改写原 13 个 package 的 installed/enabled 选择；
- signed inventory 没有使用 existing official keyring 的 closed Ed25519 envelope，未绑定 release/build/channel/positive sequence，或 lower/same-sequence-drift 能绕过 `(inventorySequence, bodyDigest)` high-water；
- B 需要直接读 A DB、store、runner 或 validator；
- I 需要添加 Workflow Evolution 特判或修改领域状态；
- stable service仍能按 arbitrary Release/mutable `workflowId` 执行；
- system caller、operation owner 或 workspace 可以由 payload/options 伪造；
- 历史 PromotionDecision、invocation ID 或 receipt 被当作 current grant；
- outer scope settle 后 child 仍可能 commit；
- inventory generator 自动分配/复用 sequence、普通 PR 或 checkout 拿到 production private key、缺 protected signer evidence、signature child 含 semantic edit、final CI 不从 semantic parent 重算，或 Host 只保存 sequence/digest 而不保存 exact signed evidence、per-package high-water 与双向 identity tombstone；
- Agent runtime不能提供 stable dispatch token lookup、两层独立 tombstone、adapter-local pre-send `MAY_HAVE_BEEN_ACCEPTED`、single-shot application send、operation principal、Controller-only delivery、protected transferable buffer、真实 remote zero-retention attestation 或 raw retention `NONE`；
- 0.11P 未锁定 exact provider scope/法律技术证据/签名或 challenge PoC/吊销/no-retry transport/platform matrix；0.11S 缺 closed release input、purpose-scoped KMS/HSM signer/显式 sequence、exact-parent deterministic body/mechanical signature/final recompute、packaged static bundle、完整 high-water/rotation，或把 live nonce/attestation/evidence 塞进 bundle/configDigest，或允许 wrong-usage、rollback、same-sequence drift、unsigned/settings trust path；production Agent path 不是 root normal dependency `@sciforge/agent-operation-adapter` + 0.11S verified monotonic static trust bundle + fresh runtime attestation/revocation check + OS-vault credential + `ATTESTED_EPHEMERAL_V1`，或试图回退到 Codex/Claude/FullTrace/session-history lane；
- pre-P4 Agent delivery probe 可被 production 注册/选择、没有由 test harness 在跨 restart 的 production-inaccessible durable store 持有 synthetic recipe/frozen deps、持久化 domain data，或 0.11A/0.12/0.15 声称已经通过 B projection/COMMIT/ack recovery；
- sealed transient path无法证明 no-cache/no-trace/no-event/no-store/zero-retention/zeroization；
- Candidate text 能改变 Verifier system/context/tool/reference/file 边界；
- Candidate-bearing Run 没有 A terminal disposition receipt就准备 terminal/release lease；
- pending/destructive ambiguity 下允许 cancel、background retry、finalize、abort 或 rollback；
- provisional Catalog 在 finalize 前能被 stable caller解析；
- package lifecycle 在 `ACTIVATING` 之外 construction、让 private staging partial discoverable、绕过 immutable published snapshot/graph lifecycle lock、用 lost process-local disposer 代替 exact signed recovery contract/durable claims、未按 exclusive-Main startup matrix normalize，或 teardown 绕过 `QUIESCING/DISPOSING/TEARDOWN_FAILED`/zero-resource/same-attempt retry；
- publisher 绕过 per-operation execution fence/single-flight，在 `CLAIMED` 下打开/采用/删除已有 nonce object，未在 `enterPublish()` 后重证 staged exact identity/digest/link/type 与 final absent、未 durable `PUBLISHING` 就调用 native publish，或在没有 regular/non-reparse/single-link exact fenced final + nonce absent proof 时提交 `SUCCEEDED`；
- public publisher result 不符合 closed receipt/flattened read union、带 unknown/nested details，或从 result/exception/IPC/event/returned log/alternate channel 泄漏 Host-private diagnostic、nonce、file identity、publisher execution-attempt ID/epoch/revision、publish attempt、native/root handle、canonical path、registrar child/lease identity 或 occupancy/type/link evidence，或 lookup 自己取得 fence/resume；
- export 可能越过 canonical workspace、覆盖文件、跟随 symlink 或包含内部/敏感字段。

处理顺序：

1. 写短 decision record，列事实、选项、影响和推荐；
2. A、B review；
3. domain owner先提交 contract-only semantic commit；
4. I 建 combined train，重新生成 matrix/docs/lock；
5. 两个 feature branch再同步新的 integration SHA。

不得在聊天中保留未版本化的“临时约定”。

## 11. 当前执行顺序

现在按以下顺序工作：

1. `0.1 -> 0.2`：先保护 integration、固定 toolchain，再建立普通 merge-PR CI 和 license gate；任何 foundation train 都依赖这两个已合入 SHA。
2. `[I]` 准备 `0.7A + 0.8A + 0.8B + 0.8M`，`[A]` 独立准备 `0.8D`；0.8S 从 immutable 0.8M parent 建 closed input、authenticated `HostReleaseProvenanceV1`、显式 sequence 和 distinct KMS/HSM exact-parent signer evidence。只有 `0.8A + 0.8M + 0.8D` 都存在后，I 才准备 `0.8C`，再准备 `0.9`。八个 producer 不能单独 merge/activate/ship。0.2 后 0.11P 可独立做 feasibility preflight，但不属于基础门。
3. `0.8I` 原子集成 exact 八个 producer 加一个 mechanical commit，其中 0.8D unchanged；一次性合入 workspace/reservation、strict Manifest V2、13-member cohort、purpose-aware `OfficialVerificationKeyV2`/VERIFY_ONLY/provenance/KMS-HSM inventory、accepted security state、export/dependency/edge、Broker V2、全仓 ACL-purpose，以及所有 top-level `approval=confirmation` 的 sole `createOrGetProtectedInvocation` flow。
4. `0.8I` 后完成 `0.10` Host-owned package state/lifecycle/recovery、`0.10R` 完整五包 Host-resource primitive rewiring和 `0.11` generic Agent operation contract。0.7B 可并行但仅属于 8.5/P6 Publisher gate。0.11S 等 `0.8I+0.11P`，0.11A 等 `0.11+0.11P+0.11S`；这三项仅属于 pre-P4 Agent activation lane。
5. `0.11` 合入后，A 从含 `0.8I+0.11` 的 integration 实现 0.3/0.5→0.14A，Create Loop 因新 export 从 `1.0.0` 升 `1.1.0`。B 再从含 0.14A 的 integration 实现 0.4/0.6；合法 `1.0.0` zero-contribution shell 通过 ordinary public export dependency 成为第 14 个 cohort member、第 7 个 Workbench，形成 0.14B。
6. **开发门**：0.14A + 0.4 + 0.6 后，B 可开发 pure 2.3–2.6、2.8–2.10 stacked branches；2.7、production registration/merge/activation 仍禁止。`0.13 -> 0.14I` 在 0.14A/0.14B 后生成 matrix/oracle并证明二次零 diff。
7. `0.12` 只等待 `0.8I + 0.10 + 0.10R + 0.11 + 0.14B`，证明 basic 14-member cohort、Host lifecycle/resource rewiring、revisioned Main/renderer publication和generic Agent contract，不宣称 Publisher或real provider ready。`0.15` 只关闭基础 P1/P2 merge gate；0.7B和0.11P/S/A不在它的依赖中。
8. **基础合并门**：0.15 后才可合并 P1 production 与 B 2.1/2.2；pure branches 也只能在2.2后依次合入，2.11等完整 merged 2.3–2.10，2.12再等merged 2.11。**能力激活门**：3.10/3.11B/5.10显式依赖0.11P/0.11S/0.11A；`5.10A`、`5.10B` 仍按各自 owner deps，5.10通过 static-bundle→fresh-attestation→named-adapter real path 原子激活，任何 owner commit不得单独merge/activate/ship。
9. P5 readiness 的 `6.12` 还必须包含 5.10 activation evidence；P5 domain semantics 保持 production fail-closed，直到 `7.14C + 7.14D` 在 `7.14A/B` source/packaged 真实链和全部 fault evidence 下通过，并由 `7.15` 原子激活。
10. `8.1–8.8` 可以提前准备但不能在 `7.15` 前合入；独立 0.7B 必须先于8.5。8.3把B从`1.1.0`升到`1.2.0`，8.5使用同一unmerged semantic train，8.6只补higher 0.8S release input/protected signature。8.5/8.8的publisher evidence必须包含no-touch `CLAIMED`、fence/single-flight一winner、pre-`PUBLISHING` reproof、durable `PUBLISHING`、exact final+nonce-absence proof及closed public result。`8.9`形成唯一final P6 SHA；9.1–9.6从该SHA重跑，9.7只在全部evidence有效时mentor handoff。

Mentor handoff 是 9.7，只在 9.1–9.6 全部有真实 evidence 后准备，必须包含 baseline/final SHA、semantic/train commit map、任务状态、精确环境/命令/结果、source/packaged 证据、license evidence、残余风险和推荐 merge order。

## 附录 A. 外部仓库调研事实与复用边界

外部项目只提供设计/测试模式，不是 Stage1 合同来源。任何代码复用都必须先经过 package boundary、license policy、威胁模型和“不新增第二条 canonical path”审查；不得用外部 framework 绕过 Broker、Host profile、A Catalog 或 B Ledger。

| 项目 | 已确认事实 | Stage1 可借鉴 | 明确不复用 |
|---|---|---|---|
| [Awesome Self-Improving Agents](https://github.com/selfimproving-agent/awesome-Self-Improving-Agents) | 这是持续维护的研究资源/分类索引，区分 foundation-model improvement 与 prompt、memory、tool、full-scaffolding improvement | 用作术语、论文和 benchmark 检索入口 | 它不是 executable control plane，不作为 runtime dependency、验收证据或安全实现 |
| [A-Evolve](https://github.com/A-EVO-Lab/a-evolve) | Python 项目把 base agent、benchmark、evolver、artifacts/examples/tests 组织成通用自改进实验 infrastructure | 借鉴 frozen input、benchmark/evidence artifact、bounded iteration 的分层方式 | Stage1 不接入其自动 evolution runtime，不做 Candidate population、模型训练或零人工 Promotion；不能替代单一 A engine 与 B deterministic Controller |
| [Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit) | 提供 policy enforcement、identity/audit、sandbox/reliability/chaos 等模块；其 README 明确 policy middleware 与 Agent 可处同一进程，OS 级隔离仍需独立容器等边界 | 借鉴 fail-closed action policy、decision record、red-team/chaos/conformance test 组织方式 | 不把 middleware 声称为 Host/runtime/provider end-to-end isolation；不能替代 owner-bound invoker、`enterCommit()`、raw retention `NONE` 或 transient canary |
| [OpenHands](https://github.com/OpenHands/OpenHands) | 当前仓库提供 self-hosted Agent Canvas，可连接 local、Docker、VM、cloud 与 ACP-compatible agent backends，并支持长时运行/automation | 借鉴 backend adapter、operation identity、reconnect、containment 和 kill/restart 测试思路 | 不复用其会话/UI 状态作为 Run/Ledger 真相，不把 thread ID 当 operation principal，不引入第二套 Agent dispatch、Catalog 或 Workflow runner |

最终复用决策很简单：可以移植小型、通用、经过许可证和边界验证的测试技巧；不能整包引入另一个自演化框架、治理内核或 Agent runtime。Stage1 的唯一实现权威仍是当前 change 下的 proposal、design、tasks 和六份 specs。
