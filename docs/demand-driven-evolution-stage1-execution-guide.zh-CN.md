# SciForge 需求驱动 Workflow 演进 Stage1：双人并行开发执行指南

> 状态：拟议执行基线，业务实现尚未开始
>
> 产品来源：[Stage1 正式总体方案](https://ecnw9f4vkfa6.feishu.cn/docx/PAWadfTCmonb4VxCf5jcTynKnec)，读取版本 `revision_id=44`（2026-07-30）
>
> 代码基线：`c6c6d754d8caa82ac6e82836f51292427a651ccd`（上游 `gui`）
>
> 对应 OpenSpec：[`demand-driven-workflow-evolution-stage1`](../openspec/changes/demand-driven-workflow-evolution-stage1/)

## 1. 先说结论

两位开发者不要分别沿当前的 `dev` 和 `gui` 历史开发，也不要按“一个人前端、一个人后端”拆分。正确做法是：

1. 从同一个 `gui` commit 建立个人或团队协作仓库；
2. 先用一个小 PR 冻结 Stage1 公共契约；
3. 开发者 A 完整拥有 Create Loop 的不可变 Catalog 生命周期；
4. 开发者 B 完整拥有新的 Workflow Evolution domain；
5. 两个 domain 只通过公共 contract 和 Capability Broker 协作；
6. 生成文件、锁文件和上游同步由一名集成负责人串行处理；
7. P1 与 P2 通过 contract fake 并行，公共 contract 稳定后再做唯一生产适配；
8. UI 放在持久控制面和 Catalog 闭环之后，不提前并行绘制最终页面。

这能把主要修改隔离为两个 ownership 岛：

```text
packages/domains/create-loop/**
        │ public catalog capability contract
        ▼
packages/domains/workflow-evolution/**
```

## 2. 权威来源与范围

遇到冲突时按以下顺序判断：

1. 根目录 [`AGENTS.md`](../AGENTS.md) 的架构和变更规则；
2. 飞书 Stage1 正式总体方案的固定产品边界；
3. 本指南的协作、Git 和 ownership 规则；
4. active OpenSpec 的功能要求、设计与任务；
5. [`domain-package-architecture.zh-CN.md`](./domain-package-architecture.zh-CN.md) 和 package 公共 contract；
6. 其他历史提案和说明。

[`sciforge-software-evolution-proposal.zh-CN.md`](./sciforge-software-evolution-proposal.zh-CN.md) 是更宽泛的 A+X 研究提案，不是 Stage1 实现合同。Stage1 只演进 Workflow Catalog，不做 SciForge 源码自修改、模型训练、真实 B_teacher、多 Candidate 种群或无人审批发布。

## 3. 当前仓库事实

### 3.1 Git 事实

- 当前 Stage1 checkout 是 linked worktree，不是独立 clone；修改 remote 会影响共享 common Git directory 的其他 worktree。
- 当前分支 `feature/demand-driven-evolution-stage1-gui` 与上游 `gui` 完全一致，尚无 Stage1 独有提交。
- 另一个本地 `feature/demand-driven-evolution-stage1` 跟踪 `dev`。
- `dev` 与 `gui` 没有 merge base，不能把它们作为两人的并行分支后再普通 merge。
- 当前 sibling worktree 有未提交修改，所以不得执行 `reset --hard`、`clean`、删除 worktree或原地“重新迁移仓库”。
- 上游 remote 是 `https://github.com/AGI4Sci/SciForge.git`；MIT 许可证允许复制和修改，但必须保留许可证与版权声明。

因此，最安全的协作落地点是一个新的独立 clone。不要在当前 linked worktree 中重命名 `origin`。

### 3.2 实现事实

Create Loop 已经是独立 domain package，并拥有 contract、Capability Broker definitions、运行时、持久状态和完整编辑器。不要再次拆包或添加专用 IPC/MCP/facade。

当前 Stage1 关键缺口为：

- `WorkflowV1` 同时包含图定义和 `lastStatus/runs` 等运行历史，不能作为不可变 Release；
- Create Loop 全局 `revision` 会因普通保存和运行历史变化，不能改名冒充 Anchor `generation`；
- `WorkflowRelease`、`WorkflowCatalogRevision`、`WorkflowCandidate` 和 `AnchorPointer` 尚不存在；
- `RequirementSpec`、`ChangeSpec`、`VerificationReport`、Evolution Ledger 和状态机尚不存在；
- Human Approval 当前是内存等待项，应用关闭会清空，不能承担跨重启 Gate；
- Candidate 节点白名单、私有 Runner、独立 Verifier、Promotion/Replay/Rollback 尚不存在；
- 当前没有普通 PR CI，现有 GitHub Actions 只覆盖 Pages 和 Release。

所以第一目标不是 Meta-Loop UI，而是 P0 契约、P1 Catalog 和 P2 durable controller。

## 4. 建立不打扰 mentor 的协作仓库

### 4.1 推荐方案：个人 Fork

Fork 不需要 mentor 仓库写权限，开发期间只向自己的 `origin` 推送；成果通过前不要向上游发 PR。

先在 GitHub 上 Fork `AGI4Sci/SciForge`，然后在**新目录**执行：

```bash
git clone <YOUR_FORK_URL> SciForge-stage1-team
cd SciForge-stage1-team
git remote add upstream https://github.com/AGI4Sci/SciForge.git
git remote set-url --push upstream DISABLED
git config remote.pushDefault origin
git fetch upstream --prune
git cat-file -e c6c6d754d8caa82ac6e82836f51292427a651ccd^{commit}
git switch -c stage1/integration c6c6d754d8caa82ac6e82836f51292427a651ccd
git push -u origin stage1/integration
git remote -v
```

在个人 Fork 中邀请同学为 collaborator，并保护 `stage1/integration`：

- 禁止直接 push 和 force-push；
- 只允许 PR 合入；
- 至少一名同伴 review；
- 必须解决 review conversation；
- 建立 CI 后要求 CI 通过。

不要手动运行 inherited Release workflow；正式 tag、Release 和发布仍由 mentor 仓库负责。

### 4.2 备选方案：独立私有仓库

如果现阶段不希望公开 Fork，可创建一个不带 README、License 或 `.gitignore` 的空私有仓库：

```bash
git clone https://github.com/AGI4Sci/SciForge.git SciForge-stage1-team
cd SciForge-stage1-team
git remote rename origin upstream
git remote set-url --push upstream DISABLED
git remote add origin <YOUR_PRIVATE_REPO_URL>
git config remote.pushDefault origin
git switch -c stage1/integration c6c6d754d8caa82ac6e82836f51292427a651ccd
git push -u origin stage1/integration
```

不要使用 `git push --mirror`。最终需要跨仓库 PR 时，再把已验证的 integration commit 推到个人 Fork 的 handoff 分支，或给 mentor 提供只读仓库、分支和不可变 SHA。

### 4.3 同事首次加入

```bash
git clone <TEAM_REPO_URL> SciForge-stage1-team
cd SciForge-stage1-team
git remote add upstream https://github.com/AGI4Sci/SciForge.git
git remote set-url --push upstream DISABLED
git config remote.pushDefault origin
git fetch --all --prune
git switch stage1/integration
git rev-parse HEAD
node --version
npm --version
npm ci
```

两人统一使用 Node `22.13.x` 和同一 npm 版本，并把版本写进第一次基线记录。仓库根要求 Node `>=22.12.0`，使用 `22.13.x` 同时满足独立文档站要求。

基线验证：

```bash
npm run capability:check
npm run lint
npm run typecheck
npm run test
npm run build
```

任何基线失败都应先记录为独立 issue；不要在第一个 Stage1 功能 PR 中顺手修复。

## 5. 分支和 PR 流程

### 5.1 固定分支

```text
upstream/gui                         mentor 只读基线
origin/stage1/integration            团队保护分支
origin/stage1/a-<task>-<topic>       A 独占 feature branch
origin/stage1/b-<task>-<topic>       B 独占 feature branch
origin/sync/upstream-gui-YYYYMMDD    集成负责人同步分支
```

每个任务从最新 integration 开始：

```bash
git fetch origin --prune
git switch stage1/integration
git pull --ff-only origin stage1/integration
git switch -c stage1/a-s1-110-catalog-contract
```

规则：

- 一项任务、一个 owner、一个 feature branch、一个主要主题；
- 不直接向 integration push；
- 不在共享分支 rebase 或 force-push；
- 每个 PR 必须写明基线 SHA、owned paths、验收结果和未解决风险；
- 公共 contract 变化必须单独 PR，消费者 PR 不得偷偷改 contract；
- Reviewer 检查实现边界，不能只看测试绿灯。

### 5.2 同步 mentor 上游

只指定一名集成负责人同步上游：

```bash
git fetch upstream --prune
git fetch origin --prune
git switch -c sync/upstream-gui-YYYYMMDD origin/stage1/integration
git merge --no-ff upstream/gui
```

解决一次冲突、跑完整验证，再通过 PR 合入 integration。只同步 `upstream/gui`；禁止混入无共同历史的 `upstream/dev`。共享 integration 一旦建立，不再 rebase 到新上游。

## 6. 两人 ownership

角色名可交换，但一个里程碑内不要交换路径。

| 角色 | 完整所有权 | 主要交付 | 禁止路径 |
|---|---|---|---|
| 开发者 A：Catalog/Runtime owner | `packages/domains/create-loop/**` | 纯 WorkflowDefinition、Release、CatalogRevision、Candidate、AnchorPointer、CAS、release-pinned execution、Candidate policy/private runner | 不实现 Requirement/Gap/Ledger/Promotion 决策；不改 Host-private `src/**` |
| 开发者 B：Evolution owner | `packages/domains/workflow-evolution/**` | 三文档 schema、四态 Coverage、GapKind、SQLite Ledger、状态机、durable Human Gate、Teacher No-op、Builder/Verifier 编排、可选 UI | 不读写 Create Loop `state.json`；不导入 Create Loop runtime；不直接切 Anchor |
| 集成负责人 | 根锁文件、生成文件、OpenSpec 状态、上游同步 | package composition、capability reference、集成测试、handoff | 不替 feature owner 改业务语义 |

Workflow Evolution 允许导入 Create Loop 的**公共 contract**，生产调用只能通过 `DomainMainSystemCapabilityInvoker` 进入 Capability Broker。测试可使用同一窄 port 的 fake，但生产只能有一个 adapter。

### 6.1 Shared hotspots

下列文件只能由集成负责人在集成 PR 中生成或更新：

- `package-lock.json`
- `src/shared/installed-domain-packages.ts`
- `src/main/modules/installed-domain-main.ts`
- `src/renderer/src/domain-modules/installed-domain-renderer.ts`
- `docs/generated/capabilities.md`
- 根 `package.json` 中确有必要的 workspace/dependency 变化

生成文件不得手改：

```bash
npm run domain-packages:generate
npm run capability:generate
```

以下路径默认不在 Stage1 首轮范围：

- `packages/domain-sdk/**`
- `src/main/runtime/agent-runtime/**`
- `src/main/capabilities/**`
- 现有 Evidence DAG / Project DAG
- 通用 Release、Pages 和旧文档清理

如果公共 SDK 真正阻塞 Stage1，先写独立决策和小 PR，不把平台重构夹进 domain PR。

## 7. 并行开发波次

### Gate 0：共同冻结，之后才编码

由 A 起草、B review，完成一个 contract-only PR：

- 冻结 rev44 术语与非目标；
- 冻结 `WorkflowDefinition/Release/CatalogRevision/Candidate/AnchorPointer`；
- 冻结 `RequirementSpec/ChangeSpec/VerificationReport`；
- 冻结 Coverage、GapKind、Evolution state；
- 冻结 Catalog capability IDs、输入输出、effect、approval 与幂等规则；
- 冻结 canonical JSON + SHA-256 digest 规则；
- 冻结 Candidate 白名单、预算和 side-effect policy；
- 加入四态 fixtures 和 stale CAS scenarios；
- 人工确认 OpenSpec 后合入 integration。

退出条件：双方可以仅凭 contract 和 fixtures 开发，不再口头猜字段。

### Wave 1：P1 与 P2 真正并行

开发者 A：

- 从 `WorkflowV1` 拆出不含运行历史的纯定义；
- 实现 append-only Release/Catalog 数据模型与 digest tests；
- 建立独立 Anchor generation，绝不复用现有 settings revision。

开发者 B：

- 创建 backend-only `@sciforge/domain-workflow-evolution`；
- 实现 SQLite Ledger schema、事务和重启恢复；
- 实现三文档结构化记录与确定性 Markdown renderer；
- 以冻结 Catalog port fake 编写状态机测试。

### Wave 2：各自闭环

开发者 A：

- 实现 stage candidate、read catalog、release-pinned execute；
- 实现 expected generation CAS 和 stale rejection；
- 将 draft preview 与稳定 release 执行汇入同一个内部 runner；
- 删除最终被替代的服务执行路径，不保留双 runtime。

开发者 B：

- 实现 COVERED/AMBIGUOUS/PARTIAL/NOT_COVERED 路由；
- 实现 durable WAITING_HUMAN / WAITING_RESOURCE；
- 实现 `TeacherEvidencePort` 和恒定 `BYPASSED` adapter；
- 保证 Markdown 不是状态真相。

### Integration Gate：唯一生产适配

- B 的 Catalog port 只增加一个 production adapter，经 system capability invoker 调 A；
- integration owner 统一生成 composition 和 capabilities；
- 联合测试重启、stale CAS、Candidate 失败时 Anchor 继续服务；
- 通过后才进入 P3–P6。

### P3–P6

- P3：COVERED 真实执行冻结 Release 并产生 Receipt，不创建 Candidate；
- P4：PARTIAL fork、NEW_WORKFLOW、私有 Candidate Runner 和最多 2–3 次修复；
- P5：独立 Verifier、sealed tests、人工 Promotion、CAS、Replay、Rollback；
- P6：Evolution UI、首个科研 Workflow 家族、3–5 条 Anchor、E2E、故障注入和审计导出。

详细任务和依赖见 OpenSpec [`tasks.md`](../openspec/changes/demand-driven-workflow-evolution-stage1/tasks.md)。

## 8. Coding Agent 任务包

每次只给 Agent 一个 task ID。复制以下模板并填满，不允许只说“完成 P1”：

```text
Task ID:
Goal:
Baseline commit:
Dependency commits:
Owned paths:
Read-only context paths:
Public contracts:
Required behavior:
Non-goals:
Forbidden changes:
Tests to add first:
Verification commands:
Stop conditions:
Handoff format:
```

建议 prompt：

```text
先完整读取根 AGENTS.md、当前 OpenSpec 和 owned package README。
在编码前列出假设、歧义和逐项可验证成功标准。
只修改 Owned paths；发现必须改公共 contract 或 shared hotspot 时停止并报告，
不要自行扩大范围。先写失败测试，再实现最小代码使测试通过。
不得新增平行 IPC、MCP、service、registry、state store 或 fallback。
完成后报告变更文件、测试命令与真实结果、残余风险和下一依赖 SHA。
```

Agent 的完成报告必须包含：

```text
Result:
Changed files:
Contract changes:
Tests added:
Commands run and result:
Unverified:
Risks:
Next dependency:
```

## 9. 验证阶梯

### PR 作者

Create Loop：

```bash
npm --workspace @sciforge/domain-create-loop run test
npm --workspace @sciforge/domain-create-loop run typecheck
npm run domain-packages:check
npm run capability:check
git diff --check
```

Workflow Evolution 创建后：

```bash
npm --workspace @sciforge/domain-workflow-evolution run test
npm --workspace @sciforge/domain-workflow-evolution run typecheck
npm run domain-packages:check
npm run capability:check
git diff --check
```

### 合入 integration 前

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

domain composition 或 Electron lifecycle 变化时追加：

```bash
npm run smoke:electron:source
```

里程碑和 mentor 交付前追加：

```bash
npm run typecheck --workspaces --if-present
npm run test --workspaces --if-present
npm run smoke:electron:packaged:build
npm run license:package-audit
```

根 `test/typecheck` 不覆盖所有 worker；若任务触及 worker，必须显式运行该 workspace 的 test/typecheck。

## 10. 冲突和决策协议

出现以下情况必须暂停 feature implementation：

- 公共 schema、capability ID、digest 或 state transition 需要改变；
- 两个 PR 需要修改同一个非生成文件；
- 任务需要进入另一位开发者的 owned path；
- 需要新增 Host-private import、专用 IPC/MCP 或第二个 store；
- Acceptance 只能通过降低标准、查看 sealed tests 或绕开 approval；
- 上游同步产生语义冲突而不只是机械冲突。

处理顺序：

1. 建一个短 decision record，写清事实、选项、影响和推荐；
2. 两人 review；
3. 如改变冻结 contract，先合 contract PR；
4. 两个 feature branch 再同步 integration；
5. 不在聊天里形成未版本化的“临时约定”。

## 11. Mentor 交付包

成果达到 Stage1 里程碑后再联系 mentor。交付包应包含：

- 上游基线 SHA；
- integration 最终 SHA；
- `upstream/gui..stage1/integration` commit range；
- OpenSpec proposal/design/tasks 与完成状态；
- 按 domain 列出的变更和 owner；
- 自动验证命令、环境和结果；
- UI 录像或 GIF（如有 UI）；
- packaged smoke 证据；
- 已知风险、非目标和后续任务；
- 推荐合并顺序。

Fork 模式下最终 PR：

```text
base: AGI4Sci/SciForge:gui
head: <YOUR_ACCOUNT>:stage1/integration
```

最终目标分支仍应由 mentor 确认；当前代码和产品方案都以 `gui` 为基线，不能照抄仓库中已与真实远端不一致的 `develop/master` 文档。

## 12. 现在就做的五件事

1. 创建个人 Fork 或私有协作仓库，并邀请同学；
2. 从固定 SHA 建立并保护 `stage1/integration`；
3. 统一 Node/npm，运行并保存基线验证结果；
4. 提交最小 PR CI，只做 `npm ci/lint/typecheck/test/build`；
5. 双方 review 本指南和 OpenSpec，完成 Gate 0 后再分头编码。
