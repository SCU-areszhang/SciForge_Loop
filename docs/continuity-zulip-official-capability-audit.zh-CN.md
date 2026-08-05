# SciForge Continuity v1：Zulip 官方能力合同

> 状态：PR 0 官方能力冻结候选；核验日期 2026-08-05。
>
> 本文是 Zulip endpoint、method/path、请求/响应字段、feature/config、typed error、脱敏 fixture 和官方链接的唯一事实源。架构与执行计划只引用本文，不复制第二份 REST 合同。
>
> 证据仅来自 Zulip 官方 API 文档和 Help Center。PR 0 未取得 private test channel、临时凭据和明确外部写授权，因而所有仓库 fixtures 都是脱敏 contract fixture，不冒充真实 probe。

## 1. 结论与支持分层

- 官方原生能力：bot 身份、已订阅 private channel、topic、send/edit、paged history、临时 event queue、immutable sender/message ID、官方 Web/Android/iOS。
- 条件能力：旧消息 edit、完整 history、named topic metadata、retention、plan history、移动 Push；取决于 feature level、组织/channel 配置、bot subscription、权限、用户/设备设置和 Push 服务。
- SciForge 自建语义：`/sf`、业务授权、OCC、SQLite receipt/outbox/watermark、uncertain reconciliation、task card、同步健康。

Zulip 足以承载 v1，但不保证 exactly-once mutation/send、永久 history/edit 或强制 Push。任何预检证据缺失都必须 fail closed。

## 2. 当前生产实现状态

证据来自当前 [zulip-bot-runtime.ts](../src/main/zulip-bot-runtime.ts) 与 [测试](../src/main/zulip-bot-runtime.test.ts)。这是 PR 0 的现状基线，不是 PR 6 目标。

| 能力 | 当前实现 | 当前读取 | v1 缺口 |
|---|---|---|---|
| bot identity | 已有 `GET /users/me` | `user_id/email/full_name`；没有强制 `is_bot=true` | invalid bot typed error、authorized human sender 独立配置 |
| subscriptions | 已有 `GET /users/me/subscriptions` | 仅 `stream_id/name` | visibility、history baseline/permission、retention、topics policy |
| channel topics | 已有 `GET /users/me/{stream_id}/topics` | `name/max_id`，仅配置 UI | 不能证明 history 连续性或 named-topic policy |
| channel metadata | 未实现 | 无 | `GET /streams/{stream_id}` 复核 |
| queue register/live/delete | 已有单一 poll loop | `queue_id/last_event_id`、message event；delete best effort | feature/config、typed `BAD_EVENT_QUEUE_ID`、queue reset history gate |
| send | 已有 `POST /messages` | JSON `id`；发送 `type=stream` | durable outbox、headers、typed outcome、uncertain |
| history | 未实现 | 无 | paged raw Markdown、target watermark、gap typing |
| edit | 未实现 | 无 | content edit、content conflict、replacement card |
| error model | 通用 `Error` | 非 2xx/网络错误压平为文案 | finite typed errors/outcomes 与安全 diagnostics |

现有唯一 `ZulipBotRuntime` 必须被通用 Host Remote Messaging port 扩展；禁止建立第二个 client、poll loop 或 Continuity 网络层。

## 3. REST 最小接口合同

所有 path 以 `/api/v1` 为前缀。Host 持有凭据与 transport，domain 只收到 opaque refs、allowlisted fields 和下表 typed outcome。fixture 位于 [`docs/fixtures/continuity-zulip-v1/`](./fixtures/continuity-zulip-v1/)。

| Method/path | 请求合同 | 必须读取的成功响应/headers | Host typed error/outcome | 正确性用途 | Fixture IDs | 官方证据 |
|---|---|---|---|---|---|---|
| `GET /users/me` | 无业务参数 | `user_id`、`email`、`full_name`、`is_bot` | `unauthorized`、`invalid_bot_identity`、`transport_unavailable` | preflight；`is_bot` 必须为 true | `user-me-success`、`user-me-invalid` | [Get own user](https://zulip.com/api/get-own-user) |
| `GET /users/me/subscriptions` | 无业务参数 | `subscriptions[].stream_id/name/invite_only/is_web_public/history_public_to_subscribers/first_message_id/message_retention_days/topics_policy` | `unauthorized`、`target_not_subscribed`、`metadata_unsupported`、`transport_unavailable` | bot subscription、private/visibility、history baseline、effective retention、named topic | `subscriptions-private`、`subscriptions-protected-history`、`subscriptions-retention` | [Get subscribed channels](https://zulip.com/api/get-subscriptions) |
| `GET /streams/{stream_id}` | integer `stream_id` path | `stream.stream_id/name/invite_only/is_web_public/history_public_to_subscribers/first_message_id/message_retention_days/topics_policy` | `target_not_found`、`forbidden`、`metadata_unsupported`、`transport_unavailable` | link/provider-ready 复核；不能替代 subscription | `stream-private-valid`、`stream-public-rejected`、`stream-empty-topic-only` | [Get a channel by ID](https://zulip.com/api/get-stream-by-id) |
| `GET /users/me/{stream_id}/topics` | integer `stream_id`; 对支持的 server 使用 `allow_empty_topic_name=true` | `topics[].name/max_id` | `target_not_found`、`forbidden`、`metadata_unsupported` | UI/诊断；protected history 只能看到 subscription 后可访问 topics | `topics-list` | [Get topics in a channel](https://zulip.com/api/get-stream-topics) |
| `POST /register` | `event_types=["message"]`、`fetch_event_types=["realm"]`、`apply_markdown=false`、`all_public_streams=false`；不支持参数必须显式识别 | `queue_id`、`last_event_id`、`zulip_feature_level`、`zulip_version`；请求 realm fetch 时读取 `max_message_length/max_topic_length/event_queue_longpoll_timeout_seconds/realm_allow_message_editing/realm_message_content_edit_limit_seconds/realm_message_retention_days/realm_push_notifications_enabled` 和 `ignored_parameters_unsupported`（如存在） | `unauthorized`、`register_failed`、`metadata_unsupported`、`transport_unavailable` | lifecycle/preflight；queue cursor 绝非 durable history watermark | `register-valid`、`register-edit-disabled`、`register-legacy` | [Register an event queue](https://zulip.com/api/register-queue) |
| `GET /events` | `queue_id`、`last_event_id`、`dont_block=false`; client timeout 使用 register 返回的 long-poll timeout | `events[].id/type/message`; message 至少 `id/stream_id/subject/content/content_type/sender_id`；wire `subject` 规范化为 topic | `bad_event_queue`、`unauthorized`、`transport_unavailable` | live gate；event ID 只属于当前 queue | `events-live-raw-markdown`、`events-bad-queue` | [Get events](https://zulip.com/api/get-events) |
| `DELETE /events` | form/query `queue_id` | 官方成功为 JSON `result/msg`，不是强制 `204`；读取 `ignored_parameters_unsupported`（如存在） | `cleanup_failed`、`bad_event_queue`，均仅诊断 | best-effort cleanup；不改变业务 state/watermark/outbox | `delete-queue-success`、`delete-queue-bad-id` | [Delete an event queue](https://zulip.com/api/delete-queue) |
| `GET /messages` | `anchor`、`num_before`、`num_after`、channel/topic `narrow`、`apply_markdown=false`；跨页显式 `include_anchor`; 每页建议总数 ≤1000，绝不 >5000 | `anchor/found_anchor/found_oldest/found_newest/history_limited/messages[]/ignored_parameters_unsupported`；message 至少 `id/stream_id/subject/content/content_type/sender_id` | `history_gap_plan_limited`、`history_gap_retention`、`history_gap_subscription_boundary`、`history_gap_unknown`、`anchor_missing`、`page_malformed`、`unauthorized`、`transport_unavailable` | durable catch-up、marker reconciliation、target watermark | `history-single-complete`、`history-page-first/middle/last`、`history-anchor-overlap`、`history-anchor-missing`、`history-incomplete-direction`、`history-plan-limited`、三类明确 gap、unknown gap | [Get messages](https://zulip.com/api/get-messages) |
| `POST /messages` | `type=channel`（feature level ≥248；旧 server 使用官方兼容值 `stream`）、`to`、`topic`、`content` | JSON `id`; `X-RateLimit-Remaining/Limit/Reset` | `delivered`、`rate_limited`、`target_not_found`、`forbidden`、`payload_too_large`、`retryable_proven_unsent`、`uncertain` | durable outbox settle；timeout/缺响应不盲重发 | `send-success`、`send-429`、`send-timeout-uncertain` | [Send a message](https://zulip.com/api/send-message) |
| `PATCH /messages/{message_id}` | integer path、`content`; feature level ≥379 时可带 `prev_content_sha256` | success JSON、`ignored_parameters_unsupported`（如存在）、rate-limit headers | `delivered`、`edit_forbidden`、`edit_window_expired`、`message_not_found`、`content_conflict`、`rate_limited`、`uncertain` | card edit settle；不可编辑/不存在创建唯一 replacement intent | `edit-success`、`edit-forbidden`、`edit-expired`、`edit-not-found`、`edit-content-conflict` | [Edit a message](https://zulip.com/api/update-message) |

### 3.1 版本与配置规则

- `zulip_feature_level` 自 Zulip 3.0 feature level 3 起由 register 始终返回；更老/缺字段 fixture 必须视为 legacy，不允许猜当前能力。
- `max_message_length` 与 `max_topic_length` 只有 `fetch_event_types` 包含 `realm` 时保证返回；旧 feature level 的官方 fallback 只可在本文明确记录并用 fixture 测试，不得散落在执行计划。
- `topics_policy` 在 feature level 392 引入；`empty_topic_only` 在 404 引入。字段缺失不能证明 named topic 可用，因此 v1 link fail closed。
- channel `message_retention_days=null` 表示继承 realm；`-1` 表示无限。旧 realm `null` 同样按无限处理。必须计算 effective retention，不可只看 channel。
- `prev_content_sha256` 在 feature level 379 起可用，只是额外 provider concurrency guard；SciForge task OCC 仍以 Broker/SQLite revision 为准。
- rate-limit headers 在 API responses 提供；`X-RateLimit-Reset` 是解除限制的时间。只有实际出现时才消费 `Retry-After`，不能把它当 Zulip 必有字段。官方规则可配置并随 server/time 变化。
- official send 文档同时接受 `stream` 和 `channel`；Host 依据 feature level 选择已验证值，不把兼容选择暴露到 domain。

## 4. History 与 watermark 唯一算法

1. provider-ready、startup、reconnected 或 queue reset 时立即关闭该 target 的 handler/outbox/write，并建立有界 live buffer。
2. 从 SQLite durable target watermark 构造 channel+topic narrow；请求 `apply_markdown=false`。每页建议总消息数不超过 1000，绝不超过官方 5000 上限。
3. 按 immutable provider message ID 升序稳定排序；同页/跨页/anchor 重叠全部按 ID 去重。数组到达顺序或 event ID 不能证明连续。
4. 每页校验 response shape、`found_anchor`、`found_oldest`、`found_newest`、`history_limited` 与请求方向。若 `include_anchor=false`，`found_anchor=false` 是预期协议值但不能证明 anchor 存在；catch-up 的 anchor 连续性必须由相邻已知 message ID/页面证据单独证明。
5. 向旧端补基线直到该任务所需下界得到证明；向新端追赶直到 `found_newest=true`。`found_oldest=true` 只表示当前身份、当前 narrow 的可见最旧端，不证明 retention/订阅前历史完整。
6. 每条 message 先做 Host sender authorization，再分类为 claimed/legacy-eligible/ignored。History 普通消息永不重放为 Agent prompt。
7. claimed command 的 durable receipt 或 ignored audit 必须与 target watermark 在同一 SQLite 事务提交。未授权 ignored 不读取 task/binding/receipt，不保存 raw body/sender。
8. HTTP 200、整页成功、`found_newest=true`、event ID/last_event_id 前进均不能单独推进 target watermark。
9. 页面完整性和 gap 原因全部证明后，drain 经过相同去重/ingest 的 live buffer；然后按顺序开放 handler、outbox、remote write。
10. 任一 malformed、明确 gap 或 unknown gap 保留旧 watermark，进入 `recovery-gap`，冻结 target 全部 binding 的 remote write。

## 5. History gap 分类

| Typed reason | 必须证据 | 不能作为证据 | 行为 |
|---|---|---|---|
| `history_gap_plan_limited` | 当前 narrow 取到最旧端且 `history_limited=true` | 只看到较少消息、HTTP status、套餐名称猜测 | fail closed，提示 plan/history access |
| `history_gap_retention` | effective retention + watermark 时间/ID + 当前可见最老消息共同证明 retention 已删除所需区间；`history_limited` 可为 false | `found_oldest=true` 单独成立 | 保留 watermark 和有界事实，fail closed |
| `history_gap_subscription_boundary` | `history_public_to_subscribers=false` 或等价官方权限事实，结合 subscription baseline/`first_message_id` 与 watermark 证明订阅前不可见 | bot 当前已订阅、topics list 非空 | 用户重新建立明确 baseline 或换合格 channel 前 fail closed |
| `history_gap_unknown` | 现有 metadata/baseline 无法唯一归因，但连续性不能证明 | 猜最可能原因 | 有界诊断、fail closed、不推进 watermark |

三类明确 gap 互斥归因但可以同时存在风险信号；实现只能在证据充分时选具体类型。`history_limited=false` 不排除 retention/subscription gap。

## 6. 入站、出站与 typed outcome

Event queue 会被回收，`BAD_EVENT_QUEUE_ID` 要求重新 register；event IDs 单调但不连续，只属于当前 queue。queue reset 的唯一恢复是重新 register + history gate，不是保存/复用 queue cursor。

发送状态：

- HTTP success 且读取唯一 message `id`：`delivered`。
- 明确 429：`rate_limited`，按 rate-limit reset 安排持久 next attempt。
- transport 在请求发出前可证明未发送：`retryable_proven_unsent`。
- timeout、连接重置、响应缺失、未知服务端结果：`uncertain`；禁止自动重发。
- 确定 authorization/target/payload 错误：finite failed error。

Edit 被禁止、超过窗口、message not found 或 content conflict 均不允许循环 edit。前三类进入单一 replacement card intent；content conflict 先重新 observe canonical ref/revision，仍走同一 outbox，不覆盖新 card。

## 7. 移动通知合同

官方 Help Center 说明移动通知受 DMs/mentions/alerts 设置、“在线时也发送”设置、设备系统权限和 self-hosted Mobile Push Notification Service 影响。个人 mention 比 wildcard 更精确，但仍不能由 send API 强制 Push。

v1 冻结：card send/edit 仅投影状态；高信号 reminder 作为独立消息并对 authorized user 使用非静默个人 mention。验收时应用必须在后台或设备锁屏，由 bot/另一身份触发；Android/iOS 各保存系统通知截图/录屏。API 200、provider message ID、Zulip 消息可见或 Web 通知均不构成移动 Push 证据。

官方证据：[Mobile notifications](https://zulip.com/help/mobile-notifications)、[Mention a user or group](https://zulip.com/help/mention-a-user-or-group)、[HTTP headers](https://zulip.com/api/http-headers)。

## 8. PR 0 fixture 基线

所有 fixtures：

- 使用 `.invalid` 邮箱、opaque integer IDs 和 synthetic command/content；不含真实 server URL、凭据、用户、workspace 路径或原始消息。
- `_meta.provenance="synthetic-contract"`，明确不是 probe capture。
- `_meta.contract` 指向本文 endpoint/场景；header 名可保留，header 值为脱敏测试值。
- 未来真实 probe 只能在明确授权 private test channel 运行；提交前转成同 schema 的脱敏 fixture，并把 `_meta.provenance` 改成 `sanitized-authorized-probe`、记录 deployment category/server version/feature level，不保留域名或身份。

Fixture inventory：

| 文件 | 覆盖 |
|---|---|
| `identity-and-preflight.json` | bot success/invalid、private metadata、protected history、channel/realm retention、legacy feature、register/edit disabled、topics |
| `events-and-history.json` | live raw Markdown、`BAD_EVENT_QUEUE_ID`、单页/跨页、anchor overlap/dedupe、missing/incomplete direction、plan/retention/subscription/unknown gap |
| `send-and-edit.json` | send success/429/timeout uncertain、edit success/forbidden/expired/not-found/content conflict |

## 9. Web/Android/iOS 验收矩阵

| 场景 | Web | Android 真机 | iOS 真机 | 必须证据 |
|---|---:|---:|---:|---|
| `/sf tasks` 仅发现 authorized linked task | 必须 | 必须 | 必须 | taskId/status/vN/topic 对照；未 link 零泄漏 |
| card 可复制完整命令 | 必须 | 必须 | 必须 | 当前 vN/attention ID，无手拼 |
| continue/approval/input 至多一次 | 必须 | 必须 | 必须 | SQLite receipt + Runtime 证据 |
| old revision 无 mutation | 必须 | 必须 | 必须 | conflict 回执与 adapter 零调用 |
| Electron offline/catch-up | 必须 | 必须 | 必须 | offline/catching-up、history 后一次执行 |
| queue reset | 任一 | 任一 | 任一 | reset 后先 catch-up，watermark 不跳 |
| edit unavailable replacement | 必须 | 任一 | 任一 | 恰好一个新 canonical card |
| high-signal mobile Push | 配置/触发辅助 | 必须 | 必须 | 后台/锁屏系统通知与配置前提 |

缺少某真机时结论必须是“尚未验收/不在本次支持声明”。

## 10. 真实 probe blockers 与最小输入

PR 0 当前未执行任何外部写，以下仍是 blocker：

1. `D-15` stable marker 的 send → raw history 原样往返。
2. 实际 server 的 edit 成功、edit policy/window 拒绝与 replacement 触发。
3. register → live event → forced/自然 queue reset → history catch-up 的真实链路。
4. Android/iOS 后台或锁屏个人 mention Push。

完成它们所需最小用户输入：

- 明确书面授权一个仅供测试的 private channel/topic 和允许的测试时间窗；
- 测试 deployment category、server version/feature level，以及可安全删除的 synthetic test messages 规则；
- 从安全运行时配置提供临时 bot credential 和 authorized human immutable user ID，绝不写仓库/日志/报告；
- Android/iOS 真机、官方客户端账号、通知设置/设备权限和 self-hosted Push 服务状态；
- 同意可触发 edit-window/queue-reset/429 的非破坏性测试范围。若不授权 429，保留 synthetic contract fixture，不伪称真实验证。
