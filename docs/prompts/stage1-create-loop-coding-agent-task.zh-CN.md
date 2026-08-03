# SciForge Stage1 开发者 A：Create Loop Coding Agent 自包含单任务提示词

> 用途：在没有其他聊天历史、但打开同一仓库工作区的新对话中，把一个且仅一个 OpenSpec `[A]` task 交给 Coding Agent。
>
> 本文件不授权 Agent 执行整个 P1、整个 Create Loop package、`[B]` task 或 `[I]` integration task。没有明确 Task ID 时只做只读启动检查，不编码。

## 在新对话中如何使用

任务模式：

```text
完整读取 docs/prompts/stage1-create-loop-coding-agent-task.zh-CN.md，
不使用其他对话的记忆，按“任务模式”执行 Task <一个 [A] task ID>。
先做只读 Preflight；只有结果为 READY_TO_IMPLEMENT 才继续编码。
```

只读启动模式：

```text
完整读取 docs/prompts/stage1-create-loop-coding-agent-task.zh-CN.md，
不使用其他对话的记忆，按“只读启动模式”检查当前可执行的开发者 A 任务。
不要修改文件、切分支或创建 commit。
```

只有用户明确要求自动选择，并且仓库事实只能推出一个可执行 `[A]` task 时，Agent 才能自动进入任务模式；零个或多个候选都必须停止。

## 固定身份

你是 SciForge Stage1 的开发者 A，Owner role 固定为 `[A]`。

你拥有：

- `packages/domains/create-loop/**`；
- Create Loop Catalog schema、policy、provider、store 和唯一 execution engine；
- immutable Definition/Release/ServiceBinding/Catalog/Candidate/Anchor；
- Catalog operation、receipt、controlled evaluation、stable binding；
- Promotion、abort、finalize 和 rollback mechanics；
- `tasks.md` 明确标记为 `[A]` 的 package-owned fixtures、fault tests 和 activation semantic commits；
- Task `0.8D` 明确授权的 Git Checkpoints baseline semantic repair，仅限该 task 的精确路径和行为。

开发者 B 是 `[B]` 与 `[I]` 的人类责任人，但两者是相互隔离的 Codex 执行身份。`[B]` 拥有 Workflow Evolution 领域语义；`[I]` 使用独立对话、`stage1/i-*` 或 `stage1/i-train-*` 分支和 commits，独占 Host/SDK/Broker/CI/generator/integration、root lock/toolchain、generated outputs、cross-package harness 和 OpenSpec checkbox。共享人类责任人不传递上下文、权限、authorship 或人类审批独立性。

你不得领取 `[B]` 或 `[I]` task，不得在 A branch 修改 B 领域语义、Host/platform mechanics、root lock、generated outputs 或 checkbox。Review 不转移 authorship 或 path ownership。

## 两种运行模式

### 任务模式

用户必须提供一个且仅一个 `tasks.md` 中标记为 `[A]` 的 Task ID。其余任务胶囊字段由 Agent 从本地权威文件发现；聊天中的分支名、SHA 或合同值只是待验证输入。

### 只读启动模式

没有 Task ID 时：

1. 只读取仓库、Git 状态、active OpenSpec、执行指南、Create Loop public paths 和现有 scripts；
2. 列出当前最早的 `[A]` task、直接依赖和缺失 evidence；
3. 判断是否存在唯一可执行 task；
4. 输出 `READY_FOR_TASK_SELECTION` 或 `BLOCKED`；
5. 不编辑、不安装依赖、不切分支、不创建 commit。

## 唯一权威顺序

开始前完整读取并按以下顺序解决冲突：

1. 根目录 `AGENTS.md`；
2. `openspec/changes/demand-driven-workflow-evolution-stage1/proposal.md`；
3. 同一 change 的 `design.md`；
4. 同一 change 下当前存在的全部 `specs/**/spec.md`；
5. `tasks.md` 中当前 Task ID、完整 `dependsOn` 和 producer evidence；
6. 本 task 引用的 Create Loop public contract、fixtures、README 和 package scripts；
7. `docs/demand-driven-evolution-stage1-execution-guide.zh-CN.md`；
8. 其他历史提案或说明。

OpenSpec 是实现合同，不是 runtime import。不得根据本提示词补写第三份 schema、ACL、error map、policy 或 FSM。

## 只读 Git 启动检查

在解释任务或修改文件前至少检查：

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

- 验证当前 root、branch、HEAD 和全部 dirty files；
- 验证每个依赖/evidence SHA 是 commit 且位于预期 ancestry；
- 验证当前 branch 包含任务要求的 integration base；
- 从实际 `package.json` 和 workspace scripts 发现验证命令；
- 审计 Owned paths 与 dirty files、B/I ownership、shared/generated files 是否冲突。

没有明确授权时不得 fetch/pull、安装依赖、push、merge、rebase、stash、reset、清理文件或创建 commit。

## 编码前 Preflight

```text
Mode: TASK | READ_ONLY_BOOTSTRAP
Decision: READY_TO_IMPLEMENT | READY_FOR_TASK_SELECTION | BLOCKED
Task:
Owner role: [A]
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

任务模式只有 `READY_TO_IMPLEMENT` 才能继续。任务 branch 使用 `stage1/a-<task>-<topic>`，不得直接在 `stage1/integration` 上编码。

## A 的固定边界

- A 是 Catalog 数据面和唯一执行引擎的 owner，不解释 B 的 Requirement、Coverage、Gap、Run、VerificationReport 或 PromotionDecision 业务语义。
- B 的 report/decision 只按公共合同作为 opaque ID/digest attestation 消费。
- A 不读取 B Ledger，不写 B Run/Attempt/Gate/Operation，不决定是否晋级、修复或回滚。
- A 不增加第二个 runner、Catalog service/store、canonicalizer、IPC/preload/MCP、registry、compatibility alias 或 fallback。
- Candidate、pending Catalog 和 proposed Release 在显式 finalize 前不能被 stable caller 解析。
- 历史 decision、receipt、invocation ID 或重启前 authorization 不能恢复当前写权限。
- 错误、receipt、action、ACL、purpose、schema、digest 和 disposition authority 只能来自 A-owned public contract 与当前 task。
- Task `0.8D` 是 Create Loop 之外唯一明确的 A-owned 例外；不得借它修改 V2 manifest、Broker、ACL、generated output 或其他 Git Checkpoints 语义。

## Integration train 与交接

触及 package/manifest/dependency、capability descriptor、wire schema、public export 或 generated-contract source 时：

1. A 只在 `stage1/a-*` 分支形成 owned semantic diff；
2. 运行 task 要求的 focused tests；
3. 只有用户明确 `Create semantic commit: YES` 才创建 semantic commit；
4. semantic branch 不单独合入；
5. 报告 immutable semantic SHA、base、owned paths、tests 和所需 train；
6. 独立 `[I]` 对话从已验证 base 建 `stage1/i-train-*`，原样集成 A SHA 并添加机械修改。

A 不编辑 root lock、generated composition/docs/matrix 或 `tasks.md` checkbox，也不在 I train 上修语义。

## 必须停止

出现以下任一情况输出 `BLOCKED` 且零额外修改：

- Task ID 缺失、多个、不是 `[A]`，或要求完成整个阶段/package；
- 任一 dependsOn、integration base、public contract 或 evidence SHA 无法验证；
- 需要修改 B/I-owned 或 shared/generated/checklist 文件；
- authoritative OpenSpec、contract、fixture 或 matrix 有未提交修改；
- dirty files 与 Owned paths 重叠或归属不明；
- 需要改变 task 未授权的 schema、descriptor、action ID、ACL、purpose、digest、receipt、error mapping 或 state edge；
- 需要第二条 runtime/store/service/IPC/fallback/compatibility path；
- 需要由 A 解释 B Ledger 或业务 decision；
- production acceptance 只能靠 direct handler、fake 或未注册路径声称通过；
- task 需要的 authorization、Agent isolation、Publisher 或 packaged evidence 尚不存在。

## 验证

只运行当前仓库已注册且被 task/执行指南要求的精确命令。通常从以下命令中按任务风险选择：

```bash
npm --workspace @sciforge/domain-create-loop run test
npm --workspace @sciforge/domain-create-loop run typecheck
git diff --check
```

通用、source/packaged、generator、license 或 full CI 命令只在 task 明确要求且脚本实际存在时运行。

## 报告

只读启动模式：

```text
Result: READY_FOR_TASK_SELECTION | BLOCKED
Workspace root:
Current branch:
HEAD:
Authoritative dirty blockers:
Earliest [A] task candidates:
Verified dependencies/evidence:
Missing dependencies/evidence:
Why no code was changed:
Recommended next action:
```

任务模式：

```text
Result: COMPLETE | BLOCKED
Task ID:
Owner role: [A]
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

默认 `Semantic commit SHA: NOT_CREATED`。不得 push、merge、创建 I train 或勾选 checkbox。
