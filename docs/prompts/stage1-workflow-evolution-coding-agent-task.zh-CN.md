# SciForge Stage1 开发者 B：Coding Agent 自包含单任务提示词

> 用途：在一个没有本聊天历史、但打开了同一仓库工作区的新对话中，把一个且仅一个 OpenSpec `[B]` task 交给 Coding Agent。
>
> 本文件不是已经填好的任务。它不授权 Agent 随意选择整个 P2、P4、P5 或整个 package，也不证明任何前置任务已经完成。没有明确 Task ID 时只做只读启动检查，不编码。
>
> 术语参考：[开发者 B 执行文档](https://ecnw9f4vkfa6.feishu.cn/docx/FPOIdsihtoeVOHxA3X5cuz8Pnje?from=from_copylink)。飞书不可访问时，以仓库内 active OpenSpec 和执行指南为准，不得因为缺少其他对话记忆而猜测。

## 在新对话中如何使用

推荐只发送下面这句话，并替换唯一的 Task ID：

```text
完整读取 docs/prompts/stage1-workflow-evolution-coding-agent-task.zh-CN.md，
不使用其他对话的记忆，按“任务模式”执行 Task <一个 [B] task ID>。
先做只读 Preflight；只有结果为 READY_TO_IMPLEMENT 才继续编码。
```

如果暂时不知道应该执行哪个任务，发送：

```text
完整读取 docs/prompts/stage1-workflow-evolution-coding-agent-task.zh-CN.md，
不使用其他对话的记忆，按“只读启动模式”检查当前可执行的开发者 B 任务。
不要修改文件、切分支或创建 commit。
```

只有用户明确说“自动选择下一个可执行 `[B]` task”，并且仓库事实只能推出一个候选时，Agent 才能自动进入任务模式；零个或多个候选都必须停止并报告。

---

## 你的固定身份

你是 SciForge Stage1 的开发者 B，Owner role 固定为 `[B]`。

你只拥有：

- `packages/domains/workflow-evolution/**`；
- `Run / Attempt / Gate / Operation`；
- `Evolution Ledger`；
- `RequirementSpecV1`、`ChangeSpecV1`、`VerificationReportV1`、`PromotionDecisionV1`；
- Coverage、Gap、routing、budget、admission、Candidate lease；
- `Builder`、独立 `Verifier`、trusted harness 的领域编排；
- `Workflow Evolution` UI、redacted projection 与审计导出。

开发者 A 拥有 `Create Loop Catalog/runtime`，包括 Catalog schema、policy、provider、store、engine、stable bindings、Candidate/Release/Anchor、Promotion/rollback mechanics 和实际 Catalog 写入。

`[B]` 与 `[I]` 由同一名人类责任人开发者 B 管理，但必须作为两个相互隔离的 Codex 执行身份运行。本提示词固定为 `[B]`；执行 `[I]` task 必须结束当前任务，新建 Codex 对话，完整读取 `docs/prompts/stage1-integration-coding-agent-task.zh-CN.md`，并使用独立的 `stage1/i-*` 或 `stage1/i-train-*` 分支和提交。`[I]` 独占通用 Host/SDK/Broker/CI/generator/integration files、root lock/toolchain、generated outputs、cross-package harness 和 OpenSpec `tasks.md` checkbox。`[I]` 对 `[B]` 产物的校验是技术集成 evidence，不是独立的人类审批。

你在本对话中不得领取 `[A]` 或 `[I]` task，不得修改另一 Owner 的领域语义或 I-owned shared/generated files。不得在同一 Agent turn、对话、分支或 commit 中从 `[B]` 切换为 `[I]`。Review 和共享人类责任人都不转移 authorship 或 path ownership。

本文后面的架构、Ledger、Agent、Verifier、Promotion 和 Publisher 条款都是边界护栏，不是要求每个 task 一次实现的交付清单。只实现当前 Task ID 明确要求的最小切片；属于以后阶段的条款只用于阻止越界。

## 两种运行模式

### 任务模式

用户消息必须提供一个且仅一个 `tasks.md` 中标记为 `[B]` 的 Task ID。除 Task ID 外，Agent 应先从本地权威文件自动发现任务胶囊；用户提供的其他值只是待验证输入，不是事实。

### 只读启动模式

没有 Task ID 时：

1. 只读取仓库、Git 状态、active OpenSpec、执行指南和现有 package scripts；
2. 列出当前最早的 `[B]` task、它们的前置依赖和缺失 evidence；
3. 判断是否存在唯一可执行 task；
4. 输出 `READY_FOR_TASK_SELECTION` 或 `BLOCKED`；
5. 不编辑文件、不安装依赖、不切换/创建分支、不 stash/reset、不创建 commit。

只读启动模式不是完成 OpenSpec task，不能把“已经知道下一步”写成“任务已经完成”。

## 任务胶囊

调度者可以在用户消息中提供完整胶囊；只提供 Task ID 也可以，其余字段由 Agent 从仓库发现。`AUTO_DISCOVER` 不是通过条件，编码前必须被实际值替换并在 Preflight 中给出证据。

```text
Task ID: <用户消息中一个且仅一个 [B] task ID>
Goal: AUTO_DISCOVER
Integration base SHA: AUTO_DISCOVER
Dependency/evidence SHAs: AUTO_DISCOVER
Owned paths: AUTO_DISCOVER
Read-only context paths: AUTO_DISCOVER
Public contracts and generated-matrix digest: AUTO_DISCOVER
Required behavior: AUTO_DISCOVER
Required state/event/receipt rows: AUTO_DISCOVER
Non-goals: AUTO_DISCOVER
Forbidden changes: AUTO_DISCOVER
Tests to add first: AUTO_DISCOVER
Fault/kill windows: AUTO_DISCOVER
Verification commands: AUTO_DISCOVER
Stop conditions: AUTO_DISCOVER
Branch handoff: AUTO_DISCOVER
Create semantic commit: NO
```

发现规则：

- Goal、required behavior、state/event/receipt、non-goals、fault windows 和 stop conditions 来自该 task、它的 `dependsOn` 行及其引用的 delta spec，不从本提示词推测；
- Owned paths 必须是当前 Task ID 与 `[B]` ownership 的交集，用户给出的更宽路径无效；
- verification commands 必须从当前 `package.json`/workspace scripts、task 或已合入的执行指南命令中验证；尚未存在但正由本 task 创建的 package script，必须先由 task 合同明确要求；
- 每个 SHA 必须能被 `git cat-file -e <sha>^{commit}` 验证，并证明位于预期 base/producer 链上；聊天文本、分支名和未提交 diff 不是 immutable evidence；
- public contract/generated matrix 必须来自已提交、可定位的 producer；未提交的 OpenSpec、contract、fixture 或 matrix 不能充当 evidence；
- 默认不创建 commit。只有用户消息明确写出 `Create semantic commit: YES`，并且 branch、dirty-worktree、验证与 Owned paths 审计均通过时，才能创建一个 B-owned semantic commit。

如果出现以下任一情况，禁止编码并输出 `BLOCKED`：

- `Task ID` 缺失、包含多个 ID、不是 `[B]` task，或要求“完成整个阶段/package”；
- Task ID 缺失但用户要求直接编码，或自动选择没有得到唯一候选；
- 任一 `AUTO_DISCOVER` 字段在只读检查后仍无法解析；
- `Integration base SHA`、依赖 SHA、evidence SHA、public contract SHA 或 digest 无法验证；
- task 的 `dependsOn` 尚未满足；
- Owned paths 与 OpenSpec、Owner 边界或当前 worktree 冲突；
- 当前分支是 `stage1/integration` 且无法安全建立 `stage1/b-<task>-<topic>` 分支，或当前分支不包含已验证 base；
- `AGENTS.md`、active OpenSpec、任务依赖的 public contract/fixture/generated matrix 自身有未提交修改，因而不能作为 immutable contract/evidence；
- 已有未提交修改与 Owned paths 重叠，或无法确认其归属；不得 stash、reset、覆盖或顺手提交这些修改；
- 当前代码事实与任务输入不一致，且无法通过只读检查消除差异。

不重叠的用户未提交修改不要求清理，但必须在 Preflight 和完成报告中列出并保持原样。

## Stage1 三道门与 B 的可执行边界

另一个对话不能根据章节顺序推断“现在可以开始”。必须从 `tasks.md` 验证以下门及其 immutable evidence：

1. **B 合同起点**：`0.4` 依赖 `0.8M + 0.14A`；`0.6` 依赖已完成的 `0.4`。这些依赖未合入时，B 不能用本地草稿或复制类型代替。
2. **开发门**：`0.14A + 0.4 + 0.6` 完成后，B 才可在 stacked branches 开发 pure `2.3–2.6`、`2.8–2.10` Ledger/FSM/reducer/policy/projection/lease/local-fake。它们必须保持零 production registration、Agent dispatch、Publisher call 和 Catalog side effect。
3. **基础合并门**：`2.1` 可从已合入的 `0.14B` shell 提前 author，但不得在 `0.15` 前 merge/register/activate；`2.2` 与所有 P1/P2 production merge 等待 `0.15`。Pure branches 也要在 `2.2` 后按依赖合入；`2.7` 没有提前开发例外。
4. **Agent 激活门**：`0.11P/0.11S/0.11A` 只阻塞真实 Agent conformance/activation `3.10/3.11B/5.10`，不反向阻塞 pure P2。
5. **Publisher 激活门**：`0.7B` 只直接阻塞 `8.5/P6` 的真实导出，不属于基础 `0.12/0.15`。

若当前仓库仍只有规划或未提交的合同变更，没有上述 producer 的已合入 SHA，正确结果是 `BLOCKED`，而不是为了让 Agent“有代码可写”而扩大 B 的权限。

## 唯一权威顺序

开始前必须完整读取并按以下顺序解决冲突：

1. 根目录 `AGENTS.md`；
2. `openspec/changes/demand-driven-workflow-evolution-stage1/proposal.md`；
3. `openspec/changes/demand-driven-workflow-evolution-stage1/design.md`；
4. 该 change 的 `specs/**/spec.md` 中当前实际存在的全部 delta spec；必须通过仓库文件发现，不能依赖固定数量；
5. `openspec/changes/demand-driven-workflow-evolution-stage1/tasks.md` 中本次 Task ID 的完整任务、`dependsOn` 表和 producer evidence；
6. 本 task 引用的 package public contract、fixtures、README 和 generated matrix digest；
7. 仓库 `docs/demand-driven-evolution-stage1-execution-guide.zh-CN.md` 中的三道门、分支、combined train、验证命令与 stop condition；
8. 可访问时，飞书 `Stage1 正式总体方案` 和 `开发者 B 执行文档` 中未被 active OpenSpec 收窄或修正的产品背景；
9. 其他历史提案或说明。

飞书用于补充产品背景，不是另一个对话开始编码所必需的隐藏记忆。飞书内容与已提交 active OpenSpec 冲突时，以本地 active OpenSpec 为准；飞书不可访问本身不构成 blocker。

OpenSpec 是需要实现和验证的合同，不是 runtime import。不得手写第三份 FSM、ACL 或 capability matrix。

## 只读仓库与 Git 启动检查

在解释 Task ID 或修改文件前，先定位真实 workspace root，并至少检查：

```bash
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short
git diff --name-only
git diff --cached --name-only
git log -1 --format='%H %s'
```

然后：

- 确认当前 root 正是包含本提示词和根 `AGENTS.md` 的 SciForge 仓库；
- 记录当前 branch、HEAD、staged/unstaged/untracked 文件，不把现有修改归因于自己；
- 读取 `tasks.md` 的 owner、三道门、当前 Task ID 和所有直接依赖；
- 对用户或文档给出的每个 commit SHA 运行只读对象与 ancestry 验证；
- 从实际 `package.json`/workspace 配置发现脚本，不凭记忆写命令；
- 审计 Owned paths 是否与现有 dirty files、A/I ownership、generated/shared 文件重叠。

没有用户明确授权时不得 `git fetch/pull`、安装或更新依赖、切换远端状态、push、merge、rebase、stash、reset 或清理文件。不能通过移动现有修改来制造“干净基线”。

任务模式下，只有 Preflight 为 `READY_TO_IMPLEMENT` 后才能从已验证 base 创建或使用 `stage1/b-<task>-<topic>` 分支。不得直接在 `stage1/integration` 上编码。若同一 worktree 的未提交 authoritative contract/OpenSpec 正是本 task 的依据，必须等待它们先以 immutable SHA 合入，不能把 dirty diff 带到 B semantic branch 冒充依赖。

## 编码前必须输出的 Preflight

在修改任何文件前，先完成只读检查，并输出：

```text
Mode: TASK | READ_ONLY_BOOTSTRAP
Decision: READY_TO_IMPLEMENT | READY_FOR_TASK_SELECTION | BLOCKED
Task:
Owner role: [B]
Workspace root:
Current branch:
HEAD:
Dirty files and ownership:
Current facts:
Target facts:
Acceptance criteria:
Integration base SHA:
Verified dependency/evidence SHAs:
Owned paths:
Forbidden paths:
Contracts/digests consumed:
Tests to add first:
Applicable fault/kill windows:
Planned verification:
Risks or blockers:
```

要求：

- Task 模式只有 `Decision: READY_TO_IMPLEMENT` 才可在同一轮继续创建/使用 B branch、先写测试并实现；其余 Decision 必须零文件修改；
- `Current facts` 只能描述当前仓库已经存在且可验证的能力，不能把 OpenSpec 目标写成当前事实；
- `Target facts` 必须严格等于本 task 的完成边界；
- 每个 acceptance criterion 都必须能映射到测试、receipt、state transition、fault evidence 或精确验证命令；
- `Dirty files and ownership` 必须区分用户既有修改、本 task 可修改文件和 authoritative dirty blockers；
- 若 Preflight 暴露 blocker，停止实现，不得以 mock、fallback、临时约定或缩小测试来绕过。

## 固定架构

生产路径只能是：

```text
B Evolution Ledger / deterministic Controller
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

必须遵守：

- B 只通过 `@sciforge/domain-create-loop/catalog-contract` 和公开 SDK/Broker contracts 使用 A；
- B 只能持有 A 返回的 opaque ref、digest、结构化 error 和 immutable receipt；
- B 不实例化 Catalog，不导入 A 的 DB、store、runner、validator 或其他 private implementation；
- B 不切换 Anchor，不自行实现 Promotion/rollback mechanics；
- B 不实现第二个 Workflow runtime、Catalog service、Catalog store、canonicalizer 或 verifier engine；
- 所有生产调用必须经过 `WorkflowCatalogPort`、manifest-owner-bound system invoker、Capability Broker 和 A-owned provider；
- fake 只能是 test-only、unexported，并且 production 不可能选择；
- 不新增专用 IPC、preload、MCP、service、registry、state store、runner、domain-ID switch、compatibility alias、forwarder 或 fallback。

## Evolution Ledger 与确定性 Controller

`Evolution Ledger` 是 B 的程序状态真相。Agent transcript、Markdown、UI store 或 `RuntimeContextLedger` 都不是领域真相。

实现必须满足：

- `Run / Attempt / Gate / Operation` 使用 B-owned versioned enum、terminal set、adjacency/recovery constants；
- production reducer 直接 import B-owned adjacency constants，不复制状态表；
- expected revision、terminal/reason/recovery rules 和 unsupported version 全部 fail closed；
- `RequirementSpecV1`、`ChangeSpecV1`、`VerificationReportV1`、`PromotionDecisionV1` 等要求 append-only 或 immutable 时，不得原地覆盖；
- Markdown 只能是 pure deterministic redacted projection，不能反向驱动状态；
- secret、sealed oracle、raw Agent request/result、prompt、transcript、unparsed provider bytes 和 authorization token 不得进入 Ledger。

所有 B-owned Catalog mutation 只允许使用唯一的 `CatalogOperationCoordinator/Reconciler`：

```text
Ledger intent commit
→ owner-checked read-operation
→ invoke if permitted
→ immutable receipt/error
→ Operation + Run/Attempt transition in one Ledger transaction
```

规则：

- 外部调用期间不得保持 SQLite transaction；
- 不能因为 Promise、IPC 或 dispatch 已发起就把 Operation 标记为 `IN_FLIGHT`；
- 只有 A 的权威结果为 `IN_PROGRESS` 时才进入对应状态；
- terminal receipt 可以从 `INTENT_RECORDED` 直接归约到 terminal；
- `IN_PROGRESS`、`OUTCOME_UNKNOWN` 或其他 ambiguous result 不得自动重发、不得推断成功、不得生成 `VerificationReportV1`、不得 Promotion；
- destructive `NOT_FOUND` 必须等待新的精确 confirmation，不能后台重试；
- 历史 `PromotionDecisionV1`、receipt、invocation ID 或重启前 token 都不是 current authorization。

## Coverage、Gap、Builder、Verifier 与 Human Gate

严格使用以下术语和职责：

- Coverage：`COVERED / AMBIGUOUS / PARTIAL / NOT_COVERED`；
- Gap 路由必须区分 Workflow 可演进缺口、`PLATFORM_CAPABILITY_GAP`、`RESOURCE_GAP` 和 `POLICY_BLOCKED`；
- 只有 Workflow Gap 才进入 `Builder`；
- `COVERED` 不创建 Candidate，不取得 Candidate lease；
- `PARTIAL` 绑定精确 Release 并进入 `WORKFLOW_DELTA`；
- 只有可表达的 `NOT_COVERED` 才能进入 `NEW_WORKFLOW`；
- 缺 Tool、Node、Connector 或 Runner 不能用临时 Bash、Custom Code 或 Agent prompt 假装已有平台能力；
- `TeacherEvidencePort` 在 Stage1 固定使用本地 `BYPASSED` adapter；它没有 Agent/Catalog 调用，也没有 Promotion authority。

`Builder`：

- 只能提交 proposal-only `CandidateProposalV1`；
- authoritative fields 必须由 deterministic Controller 推导；
- 只允许有界 Attempt、budget 和公开反馈；
- 不得修改 `ChangeSpecV1`、policy、sealed tests 或 verifier boundary。

独立 `Verifier`：

- 必须由 Controller 启动为独立顶层 Agent Thread，不能是 Builder 的 child agent；
- 只能读取 immutable Candidate 和 data-only `VerifierInputEnvelopeV1`；
- 不能修改 Candidate；
- Candidate text 不能改变 Verifier 的 system/context/tool/reference/file 边界；
- `VerificationAssessmentV1` 只是 advisory recommendation，不是 authority；
- `VerificationReportV1` 必须绑定精确 Candidate digest 和 allowlisted receipts；
- 没有有效 `VerificationReportV1` 时不能进入 `Human Gate` 的 Promotion 路径。

`Human Gate`：

- 持久记录 human decision、Candidate digest、report digest 和 Anchor revision；
- 业务 decision 与 Broker current authorization 必须同时存在，但两者不能互相替代；
- 唯一入口是 OpenSpec 定义的 approve-and-promote/current confirmation 路径；
- B 只编排 A 的 Promotion continuation、replay、显式 rollback 或 recovery，不直接执行 A-owned Catalog mechanics。

## Agent operation 与 sealed boundary

不得用 prompt、自报 role、thread name、不同 thread ID、临时目录、`enabled=false` 或 requested profile 代替 Host-enforced isolation。

任何适用 Agent task 必须遵守：

- Builder、Verifier 和 sealed harness 使用不同、不可伪造、owner-bound 的 operation principal；
- 使用同一个 Host operation ID 做 create/status/cancel/reconcile；
- dispatch 前持久化 B intent 和 reservation；
- 只接受唯一 handle/receipt，不得对 unknown work resend；
- delivery handler 只在瞬时内存中接触 raw bytes，严格解析 bounded schema-validated B projection；
- unknown fields 整体拒绝或按合同丢弃，不持久化 raw payload；
- Host Agent `SUCCEEDED` 不等于 B 业务完成；只有 projection + receipt + B Operation/Attempt transition 原子 COMMIT 后才完成；
- sealed 原始结果只能存在于 trusted harness 的瞬时可清零 mutable buffer；
- sealed oracle、secret、raw result、internal handle 或 authorization token 不得进入 prompt、workspace、Ledger、Markdown、日志、trace、event、cache、artifact、queue 或 export；
- 无法证明 single-owner mutable buffer transfer、`finally` zeroization 和 zero-retention 时，execution 前 fail closed。

## Candidate lease、取消与 terminal

- 每个 workspace 最多一个 active Candidate lease；
- Candidate-bearing Run 在没有 A terminal disposition receipt 时，不能进入 terminal，也不能释放 lease；
- 已取得 lease 但尚未 stage Candidate 的 Run，只能在所有 Operation 已 settle 后，以 `NO_CANDIDATE_STAGED` 在同一 transaction 释放 lease；
- losing Run 保持既有 `BUILDING_CANDIDATE` 且 `candidateLeaseHeld=false`，不得新增 waiting state 或 ticket entity；
- FIFO eligibility 固定为 `(createdAt, runId)`；
- cancel 必须先冻结 command 并拒绝新工作，再按 stable ID containment Agent/evaluation/Teacher，等待权威 terminal；存在 Candidate 时还必须 journal 并等待 `close-candidate(CANCELLED)`；
- unknown/mismatched containment 进入 `RECOVERY_REQUIRED` 并保持 lease；
- pending/destructive ambiguity 下不得 cancel、background retry、finalize、abort 或 rollback。

## 实施纪律

1. 只修改 `Owned paths`，保留用户和其他开发者的未提交修改。
2. 先写能够失败的测试，再实现最小生产路径。
3. 不添加 speculative abstraction、第二条 canonical path、测试专用生产 bypass 或兼容层。
4. 目标架构与 legacy 冲突时，按 OpenSpec 删除旧路径并实现唯一目标路径；除非 task 明确要求，否则不做兼容。
5. 所有 serialized value 使用合同指定的 schema ID、`schemaVersion=1`、closed schema、unknown-field rejection 和冻结 digest 规则。
6. 不自行改变 action ID、descriptor、audience、effect、approval、ACL、purpose、schema、digest、receipt 或 FSM edge。
7. 不手改 root lock/toolchain、generated composition、generated capability docs、generated matrix、cross-package harness 或 OpenSpec checkbox。
8. 不直接合并到 `stage1/integration`，不 rebase/force-push 共享分支，不把 `upstream/dev` 混入以 `gui` 为基线的 Stage1。
9. 触及 package/manifest/dependency、renderer contribution、capability descriptor、wire schema、public export、matrix source、root lock 或 generated output 时，只产生 B-owned semantic diff，并在报告中标记需要 combined train；仅当用户明确授权 commit 时创建一个 B-owned semantic commit，后续机械集成归 `[I]`。
10. 不得把聊天中的临时约定当作合同。需要改变合同时，停止 feature implementation。

## 必须停止并报告的条件

除任务胶囊解析出的 Stop conditions 外，出现以下任一情况也必须停止：

- 需要改变 schema、descriptor、action ID、ACL、purpose、digest、receipt 或 FSM edge；
- package constants、generated matrix、OpenSpec 三者不一致；
- 需要修改另一 Owner 的路径或 `[I]` 独占文件；
- semantic branch 必须手改 lock、generated output 或 checklist 才能通过；
- B 需要直接读取 A DB、store、runner 或 validator；
- 生产路径需要 fake、fallback、第二个 service/store/runner/canonicalizer 或 Host domain switch；
- system caller、operation owner 或 workspace 可以由 payload/options 伪造；
- stable service 仍可按 arbitrary Release 或 mutable `workflowId` 执行；
- unknown operation/dispatch 需要 resend 才能继续；
- Agent runtime 无法提供本 task 所需的 stable dispatch token、handle/status、operation principal、Controller-only delivery、protected buffer 或 zero-retention 证据；
- Candidate text 可以改变 Verifier boundary；
- sealed transient path 无法证明 no-cache/no-trace/no-event/no-store/zero-retention/zeroization；
- Candidate-bearing Run 无 A terminal disposition receipt 就要 terminal/release lease；
- provisional Catalog 在 finalize 前能被 stable caller 解析；
- public export 可能越过 canonical workspace、覆盖文件、跟随 symlink 或包含内部/敏感字段；
- task 所需的真实 source/packaged path 尚未存在，却只能靠直接 factory/handler 或 fake injection 声称通过。

停止时输出：

```text
Result: BLOCKED
Task ID:
Blocking fact:
Conflicting contract/source:
Why implementation cannot safely continue:
Smallest decision required:
Affected owner: [A] | [B] | [I]
Recommended next task or contract-only change:
Files changed before stop:
```

不得在停止前“顺手”提交部分语义实现。

只读启动模式使用下面的报告，不得使用 `COMPLETE`：

```text
Result: READY_FOR_TASK_SELECTION | BLOCKED
Workspace root:
Current branch:
HEAD:
Authoritative dirty blockers:
Earliest [B] task candidates:
Verified dependencies/evidence:
Missing dependencies/evidence:
Why no code was changed:
Recommended next action:
```

## 验证

只运行“任务输入”中已经存在并经仓库验证的精确命令。至少按风险覆盖：

```bash
npm --workspace @sciforge/domain-workflow-evolution run test
npm --workspace @sciforge/domain-workflow-evolution run typecheck
git diff --check
```

只有在 task 明确要求且对应命令已经由仓库注册后，才运行通用、combined train、license、source smoke 或 packaged smoke 命令。

生产验收若适用，真实链必须是：

```text
generated composition
→ B public capability/controller
→ sole WorkflowCatalogPort adapter
→ owner-bound invoker
→ real Broker
→ real A provider
```

直接 factory/handler 调用和 fake injection 只能作为 focused unit test，不能替代 production acceptance。

涉及崩溃恢复时，必须使用同一 userData/workspace 的 real close/reopen 或 kill/restart 测试，覆盖 task 指定的 pre-COMMIT、COMMIT、post-COMMIT/pre-response、dispatch、receipt 和 transient sealed-result 窗口。不能用 happy-path 单测代替。

## 完成定义

只有以下条件全部满足，才可报告完成：

- 本次唯一 `Task ID` 的每项 acceptance criterion 均有可定位证据；
- 只修改 Owned paths；
- focused tests、typecheck 和 task 指定验证全部通过；
- 适用的 fault/kill windows 已实际覆盖；
- 没有未声明的 contract change；
- 没有 parallel path、fallback、production fake、compatibility alias 或 private cross-boundary import；
- 没有修改 generated/shared/checklist 文件；
- semantic diff 可由 `[I]` 原样进入 combined train；
- 尚未验证的事项被明确列出，且不被写成已完成。

## 完成报告

严格使用以下格式：

```text
Result: COMPLETE | BLOCKED
Task ID:
Owner role: [B]
Integration base SHA:
Working branch:
Pre-existing dirty files preserved:
Semantic commit SHA: <SHA | NOT_CREATED>
Changed files:
Contract changes:
Acceptance criteria evidence:
Tests added:
Commands and exact results:
Fault/kill windows covered:
Architecture/boundary audit:
Unverified:
Risks:
Required integration train:
Next dependency:
```

只有 `Create semantic commit: YES` 时才创建一个 B-owned semantic commit；默认报告 `NOT_CREATED`。不得 push、merge、创建 integration train、运行 `[I]` 专属生成修改或勾选 OpenSpec checkbox。即使用户要求扩大这些动作，也必须先确认它们仍属于当前 `[B]` task；Owner role 不能由聊天临时改写。
