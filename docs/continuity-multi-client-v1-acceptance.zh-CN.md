# SciForge Continuity v1 验收剧本

> 状态：PR 0 冻结候选。架构见 [v1 权威设计](./continuity-multi-client-v1.zh-CN.md)，Zulip 条件能力见 [官方能力核验](./continuity-zulip-official-capability-audit.zh-CN.md)。

## 1. 证据规则

每次执行建立 `<date>-<environment>-<AC-ID>` 证据包，记录构建 SHA、packaged/source、OS、Electron 版本、Zulip server/feature level、Web/Android/iOS 客户端版本和脱敏测试 target ID。自动化日志保存命令、退出码和关键断言；人工证据保存带时间的截图/录屏、操作记录和 SQLite/Runtime 的脱敏核对结果。

结论只允许：`通过`、`失败`、`尚未验收/不在本次支持声明`。缺设备、权限、realm 或真实证据不是通过。消息 API 返回成功、Zulip 中消息可见或 card 更新，均不能代替移动 Push 已到达的系统通知证据。

## AC-01 现有 thread 幂等回填

- 前置条件：含至少一个既有 AgentRuntime thread 的干净测试 profile；记录 `(runtimeId, threadId)`。
- 操作步骤：启动 Electron 完成 backfill；关闭并重启两次；触发 snapshot/replay/live 交界重复事件。
- 预期结果：同一 source pair 始终只有一个 taskId，重启不重复，revision 只因语义变化递增。
- 自动化或人工：自动化为主，packaged smoke 人工复核。
- 必须保存的证据：task 唯一约束查询、source receipt、三次 snapshot、构建 SHA。
- 失败判定：出现重复 task、taskId 漂移、重复 event 导致 revision 增长或未回填。

## AC-02 Electron 本地闭环

- 前置条件：已完成幂等回填的 task，包含 Goal/Todo、attention、Decision 和 version ref 测试输入。
- 操作步骤：打开接力中心；切换 task；记录决定；打开原 thread；触发状态和 checkpoint 更新。
- 预期结果：接力中心与原 thread 的状态、全部 attention、Decision 时间线和 checkpoint 一致，只有 canonical capabilities 被调用。
- 自动化或人工：renderer/contract 自动化 + Electron 人工。
- 必须保存的证据：UI 截图、capability invocation/audit、task/event 快照。
- 失败判定：信息缺失/错 task、renderer 直读 SQLite/私有 IPC、Decision 被覆盖或 UI 状态漂移。

## AC-03 手机 continue 只执行一次

- 前置条件：authorized user、已 link task、当前 card 为 `vN`、healthy target。
- 操作步骤：从官方移动端复制 card 的 `/sf continue --at vN ...`；提交；对同 immutable message 做 live/history/重放。
- 预期结果：只创建一个 Turn；同 command ID 重放返回第一次结果；三端看到一个新 revision。
- 自动化或人工：入站/receipt 自动化 + Android 或 iOS 真机。
- 必须保存的证据：原命令截图、command receipt、Runtime turn ID/计数、三端 revision。
- 失败判定：零次或多次执行、服务器偷偷补 revision、即时回复绕过 outbox、重放改变语义。

## AC-04 Approval 重复抑制

- 前置条件：task 有一个 pending approval 和短 ID；authorized target healthy。
- 操作步骤：同一 approve 消息经 live/history/worker retry 共注入 100 次，并在 settle 边界重启。
- 预期结果：adapter resolve 最多一次；receipt 可重放；attention 只闭合一次；不明结果为 `uncertain`。
- 自动化或人工：自动化 fault test；任一官方客户端人工一次。
- 必须保存的证据：100 次输入计数、唯一 invocation/adapter call、receipt/event、最终 card。
- 失败判定：重复批准、uncertain 自动重发、attention 丢失或旧 revision 被执行。

## AC-05 旧 revision 冲突

- 前置条件：保存 `vN` 完整命令，然后使 task 前进至 `vN+1`。
- 操作步骤：提交保存的旧命令；按返回的新 card/回执复制新命令重试。
- 预期结果：旧命令无 mutation，返回安全最新摘要与可复制新命令；新命令至多执行一次。
- 自动化或人工：Broker/domain 自动化 + Web/移动人工。
- 必须保存的证据：前后 task/event/receipt、adapter spy、冲突回执截图。
- 失败判定：旧命令执行、泄漏未授权字段、服务端自动改写 revision 或缺少可操作恢复命令。

## AC-06 在线三端一致

- 前置条件：packaged Electron、Zulip Web、至少一部官方移动客户端同时登录；网络正常。
- 操作步骤：Electron link task；Web 和移动打开 card；任一端触发一次合法语义变更。
- 预期结果：三端显示同 taskId、status、`vN`、attention/version ref；Zulip 为可重建投影。
- 自动化或人工：人工，辅以 ledger 检查。
- 必须保存的证据：同一时间窗三端截图、SQLite snapshot、provider message IDs。
- 失败判定：任一端标识/状态/revision 不一致、card 反向成为事实源或未 link task 外发。

## AC-07 Electron 离线命令 catch-up

- 前置条件：healthy linked task、已记录 target watermark；可完全关闭 Electron。
- 操作步骤：关闭 Electron；在 Zulip 发合法命令；确认无 Runtime 执行；重启 Electron并观察 `catching-up` 到 `online`。
- 预期结果：离线期间不执行；重启 history 连续性证明后执行一次；catch-up 前 handler/outbox/write 关闭。
- 自动化或人工：自动化 history gate + Web/移动人工。
- 必须保存的证据：离线时间线、Runtime 零调用、history pages/watermark transaction、最终唯一 receipt。
- 失败判定：离线实时执行、catch-up 前执行、重复执行、HTTP 200/event ID 单独推进 watermark。

## AC-08 发送中崩溃与 uncertain

- 前置条件：可注入 outbox claim/send/settle crash point；PR 7 reconciliation 已启用时另测 marker。
- 操作步骤：分别在 enqueue、claim、请求前、响应后/settle 前强制退出并重启；执行唯一 history marker 核对。
- 预期结果：明确未发送才 retry；响应不明保持 `uncertain`；唯一 marker 收敛 delivered，多/零匹配不盲发。
- 自动化或人工：自动化 fault matrix + 桌面诊断人工。
- 必须保存的证据：每个 crash point 的 outbox attempt/revision、provider history、审计 event。
- 失败判定：自动重复发送、证据被删除、task/delivery revision 混用或状态不可审计。

## AC-09 未授权零泄漏

- 前置条件：authorized 与 unauthorized immutable sender；现存和不存在 task/topic 样例。
- 操作步骤：unauthorized sender 分别对两类目标提交 `/sf`；重复 live/history；测试 display name/email 伪装。
- 预期结果：在 task/binding/receipt 读取前静默 `ignored`；无 direct send/outbox/Agent 调用；两类行为同形。
- 自动化或人工：安全自动化为主。
- 必须保存的证据：repository/Agent/direct-send 零调用 spy、仅 opaque target/message-order 的有界 ignored audit。
- 失败判定：任何回复、时序/错误差异暴露 task、raw body/sender 持久化或进入 legacy Agent path。

## AC-10 敏感信息零外泄

- 前置条件：注入路径、credential-like、session、reasoning、stdout canary。
- 操作步骤：覆盖 task/projector/provider error/card/outbox/diagnostics/log；递归扫描 DB/WAL/SHM 和输出。
- 预期结果：只出现 allowlist 安全摘要；全部 canary 在禁止位置零命中。
- 自动化或人工：自动化扫描 + card 人工。
- 必须保存的证据：canary 清单、扫描命令/退出码、脱敏 card/diagnostic。
- 失败判定：任一 secret、个人路径、reasoning、原始消息或工具日志出现在持久/远程/日志载体。

## AC-11 桌面通知准确导航

- 前置条件：两个 task、通知偏好开启；可注入 native notification click。
- 操作步骤：分别触发高信号通知；在 hidden/loading/reload/no-session 状态点击。
- 预期结果：统一 Workbench command 打开正确 task 和原 thread；ready generation 前缓冲，旧 generation 不执行。
- 自动化或人工：自动化 fake + macOS/Windows 各人工证据（发布声明涉及的平台）。
- 必须保存的证据：notification ID/event、navigation command、目标 task/thread 截图。
- 失败判定：打开错误 task、只 reveal 窗口、丢导航、重复通知或存在旧专用 IPC 旁路。

## AC-12 在线传播延迟

- 前置条件：正常网络、healthy provider、稳定测试负载；定义 start/end 观测点。
- 操作步骤：至少 30 次从各入口触发合法状态变化，记录 Electron commit 到 Web/移动 card 可见时间。
- 预期结果：状态同步 P95 不超过 5 秒；Push 延迟不计入此指标。
- 自动化或人工：自动化时间戳采集 + 人工抽查。
- 必须保存的证据：原始脱敏样本、P50/P95/max、时钟/网络说明。
- 失败判定：P95 超标、只报告平均值、把 Push 或未完成样本排除而不说明。

## AC-13 `/sf tasks` 任务发现

- 前置条件：同 target 有 authorized user、已 link active/recent tasks、未 link tasks，并准备无权 sender。
- 操作步骤：Web/Android/iOS 分别输入 `/sf tasks`；计时至定位指定 task；无权 sender重复。
- 预期结果：只返回 authorized target 已 link 的有界任务，含 taskId/status/`vN`/topic/安全摘要；未 link/无权零泄漏；用户 30 秒内定位。
- 自动化或人工：授权限界自动化 + 三端人工。
- 必须保存的证据：各端索引截图/计时、返回 task 集与 ledger binding 对照、无权零回复。
- 失败判定：出现全局/未 link task、无权可探测、超过 30 秒或必须依赖桌面查 ID。

## AC-14 命令可操作

- 前置条件：分别准备 continue、Decision、单/多 approval/input 状态。
- 操作步骤：在 card/index 逐项复制显示的完整命令，不手工补字符；执行并再测过期命令。
- 预期结果：完整命令包含当前 `vN` 和正确 attention 短 ID；continue/decide/approve/reject/input 均可复制执行；冲突提示给出新完整命令。
- 自动化或人工：card renderer golden + Web/Android/iOS 人工。
- 必须保存的证据：每类 card/index 与粘贴内容、receipt/结果。
- 失败判定：要求用户拼 revision/ID、命令歧义、显示旧语法、attention 指错或冲突不可恢复。

## AC-15 同步健康可见且诚实

- 前置条件：可控制在线、断网、catch-up、明确 gap、uncertain 五类状态。
- 操作步骤：逐一切换状态，在桌面与 `/sf status` 查看；gap/离线时尝试写命令。
- 预期结果：`online/offline/catching-up/recovery-gap/uncertain` 可区分，显示最后成功同步时间和写可用性；离线/gap 不显示“已执行”。
- 自动化或人工：state contract 自动化 + 三端人工。
- 必须保存的证据：每状态两端截图、写入 gate/Runtime 零调用、时间字段来源。
- 失败判定：混淆状态、缺最后同步时间、gap 仍开放写或把 accepted/queued 表述为 executed。

## AC-16 packaged Electron + Web + Android + iOS 真机端到端

- 前置条件：packaged Electron；Zulip Web；Android 真机；iOS 真机；authorized private test channel；版本/配置已记录。
- 操作步骤：四端完成发现任务→查看 card→复制命令→桌面执行一次→三端观察新 revision；再覆盖桌面离线重启、旧 revision、queue reset。
- 预期结果：每个平台业务脚本全通过，queue reset 先 catch-up；每个 mutation 恰好一次。
- 自动化或人工：真机人工为必需，自动化只辅助。
- 必须保存的证据：packaged SHA、四端连续录屏/截图、receipt/Runtime/watermark、客户端与 server 版本。
- 失败判定：任一声明支持的平台缺真机证据或任一步失败。缺设备时必须记为“尚未验收/不在本次支持声明”。

## AC-17 移动 Push 独立验收

- 前置条件：Android/iOS 真机；分别记录用户通知设置、设备系统权限、客户端登录、自托管 Mobile Push Notification Service 状态；应用置后台或锁屏。
- 操作步骤：由 bot/另一身份发送对 authorized user 的非静默个人 mention 高信号提醒；Android、iOS 各执行；记录接收时间。
- 预期结果：声明支持的设备出现系统通知；不满足配置时产品显示 `notification-unavailable`，不承诺 Push。
- 自动化或人工：必须真机人工。
- 必须保存的证据：设置/权限/Push 服务脱敏记录、后台/锁屏系统通知截图或录屏、发送时间与 provider message ID。
- 失败判定：只保存 API 200、send response、card/消息可见、前台消息或模拟器证据；缺任一前提却宣称通过。

## 2. 真机支持矩阵模板

| 平台 | 版本/设备 | 任务发现 | 命令可操作 | 健康可见 | 真机 E2E | 移动 Push | 证据包 | 支持声明 |
|---|---|---|---|---|---|---|---|---|
| Packaged Electron | 待执行时记录 | 尚未验收 | 尚未验收 | 尚未验收 | 尚未验收 | 触发端 | 未生成 | 不在 PR 0 支持声明 |
| Zulip Web | 待执行时记录 | 尚未验收 | 尚未验收 | 尚未验收 | 尚未验收 | 配置端 | 未生成 | 不在 PR 0 支持声明 |
| Android 真机 | 待执行时记录 | 尚未验收 | 尚未验收 | 尚未验收 | 尚未验收 | 尚未验收 | 未生成 | 不在 PR 0 支持声明 |
| iOS 真机 | 待执行时记录 | 尚未验收 | 尚未验收 | 尚未验收 | 尚未验收 | 尚未验收 | 未生成 | 不在 PR 0 支持声明 |

## 3. 单次证据记录模板

```text
AC ID：
日期/执行人：
branch/commit/build：
Electron/source-or-packaged/OS：
Zulip deployment category/server version/feature level：
Web/Android/iOS version and device：
脱敏 target/binding/task IDs：
前置条件核对：
步骤与时间戳：
实际结果：
自动化日志：
截图/录屏：
SQLite/Runtime/provider 交叉证据：
结论：通过 / 失败 / 尚未验收/不在本次支持声明
偏差与后续：
```
