---
name: feynman-modal-refactor
overview: 将学习心得的新建/编辑/评估功能从独立路由页面改为 Modal 弹窗，删除按钮移至 FeynmanCardList 且仅管理员可见
todos:
  - id: refactor-feynman-editor
    content: 将 FeynmanEditor 改造为 FeynmanEditorModal，使用 Modal 包裹，props 驱动，移除路由依赖，使用 useSnackbar
    status: completed
  - id: refactor-feynman-viewer
    content: 将 FeynmanCardView 改造为 FeynmanViewerModal，使用 Modal 包裹，props 驱动，移除路由依赖，使用 useSnackbar
    status: completed
  - id: add-delete-to-card-list
    content: 在 FeynmanCardList 中添加删除按钮（仅管理员可见），新增 onDelete prop
    status: completed
  - id: refactor-feynman-index
    content: 重写 Feynman/index.tsx 为控制中心，管理 editor/viewer/delete 状态，集成 Modal 弹窗逻辑
    status: completed
    dependencies:
      - refactor-feynman-editor
      - refactor-feynman-viewer
      - add-delete-to-card-list
  - id: cleanup-feynman-routes
    content: 在 main.tsx 中移除费曼的 3 个独立路由和对应 import
    status: completed
    dependencies:
      - refactor-feynman-index
---

## 产品概述
将学习心得的**新建/编辑**和**查看/评估**功能从独立路由页面重构为 Modal 弹窗，所有操作在列表页通过状态控制弹窗完成，无需额外路由。同时在卡片列表项中添加"删除"按钮，仅管理员可见。

## 核心功能
1. **新建学习心得**：点击列表页"添加心得"按钮，弹出 Modal 编辑器（size="lg"），包含学科选择、课题、三个费曼问题、记忆钩子（可折叠）、保存和保存并评估按钮
2. **编辑学习心得**：在查看器中点击编辑，或直接（未来扩展）打开编辑器 Modal（带预填数据）
3. **查看/评估学习心得**：点击卡片弹出 Modal 详情视图（size="xl"），包含心得内容展示、AI 评估结果（环形评分图）、AI 评估/重新评估按钮、AI 追问按钮
4. **删除学习心得**：在卡片列表项上显示删除按钮，仅管理员（isAdmin()）可见，点击触发确认后执行删除
5. **追问弹窗**：编辑器/查看器中的追问使用 Modal.tsx（size="sm"）实现
6. **路由精简**：移除 /feynman/new、/feynman/edit/:id、/feynman/:id 三个独立路由，所有操作通过 Modal 在列表页完成
7. **通知反馈**：使用全局 useSnackbar 替代 alert 进行操作反馈（成功/失败提示）


## 技术栈
- **前端框架**: React + TypeScript
- **路由**: react-router-dom
- **数据请求**: @tanstack/react-query
- **UI 组件**: Modal.tsx（通用弹窗）、Snackbar.tsx（通知）
- **状态管理**: React useState + useQuery
- **权限判断**: isAdmin()（基于 hostname）

## 实现方案

### 整体策略
将 `FeynmanEditor.tsx` 和 `FeynmanCardView.tsx` 从独立路由页面改造为可复用的 Modal 内容组件，由 `index.tsx`（列表页）通过 `editorCardId`/`viewerCardId` 状态控制弹窗显示。改造后所有操作集中在 `/feynman` 一个路由下。

### 核心改动

#### 1. FeynmanEditor → FeynmanEditorModal
- 改为纯内容组件，接收 `cardId?: number | null`（null=新建, number=编辑）、`onClose: () => void`、`onSaved?: () => void` props
- 使用 `Modal` 组件包裹，设置 `size="lg"`，自定义 `confirmLabel="保存"` 和 `confirmLabel="保存并评估"`（使用两个按钮的 footer 模式）
- 内部追问弹窗也改用 `Modal` 组件（size="sm"）
- 保存成功后调用 `onClose()` 关闭弹窗，父组件 `refetch()` 刷新列表
- 用 `useSnackbar` 替代 `alert`
- 移除所有 `useNavigate`/`useParams` 相关代码，通过 `cardId` prop 判断新建/编辑模式，通过 `feynmanApi.get(cardId)` 加载数据

#### 2. FeynmanCardView → FeynmanViewerModal
- 改为 Modal 内容组件，接收 `cardId: number`、`onClose: () => void`、`onEdit?: (id: number) => void` props
- 使用 `Modal` 组件包裹，设置 `size="xl"`，`footer={false}`（自定义底部按钮区域）
- 内部追问弹窗改用 `Modal` 组件（size="sm"）
- 删除功能：点击删除按钮调用 `feynmanApi.delete()`，成功后关闭弹窗
- 编辑功能：点击编辑按钮调用 `onEdit(cardId)`，父组件切换状态
- 用 `useSnackbar` 替代 `alert`
- 移除所有 `useNavigate`/`useParams` 相关代码，通过 `cardId` prop 加载数据

#### 3. FeynmanCardList 添加删除按钮
- 新增 `onDelete: (id: number) => void` prop
- 导入 `isAdmin` 函数，在组件内判断权限
- 每个卡片右上角添加删除按钮（红色文字 "删除"），仅管理员可见
- 点击删除直接执行 `onDelete(card.id)`，由父组件处理确认逻辑（使用 Modal danger 模式或 confirm）

#### 4. index.tsx（列表页）作为控制中心
- 新增 `editorCardId: number | null`（null=新建模式, number=编辑模式, undefined=关闭）和 `viewerCardId: number | null` 状态
- "添加心得"按钮改为 `setEditorCardId(null)` 打开编辑器
- 点击卡片改为 `setViewerCardId(card.id)` 打开查看器
- 编辑按钮在查看器中调用 `setEditorCardId(card.id)` + 关闭查看器
- 删除确认使用 Modal danger 模式，删除成功后 `refetch()` 列表
- 使用 `useSnackbar` 提供成功/失败反馈

#### 5. main.tsx 移除费曼独立路由
- 删除 `/feynman/new`、`/feynman/edit/:id`、`/feynman/:id` 三条路由
- 仅保留 `/feynman` 一条路由指向 `<Feynman />`
- 删除 `FeynmanEditor` 和 `FeynmanCardView` 的 import

### 数据流
```
列表页 (index.tsx)
  ├─ state: editorCardId, viewerCardId, deleteTarget
  ├─ useFeynmanCards(subject) → cards, refetch
  ├─ 新建: editorCardId=-1(null) → <FeynmanEditorModal open cardId={null}>
  ├─ 编辑: editorCardId=id → <FeynmanEditorModal open cardId={id}>
  ├─ 查看: viewerCardId=id → <FeynmanViewerModal open cardId={id}>
  ├─ 删除确认: deleteTarget=id → <Modal danger> 确认删除
  └─ 删除执行: feynmanApi.delete(id) → refetch()
```

### 关键设计决策
- **Modal footer 自定义**: 编辑器需要"保存"和"保存并评估"两个按钮，使用 Modal 的 `footer` prop 传入自定义 footer
- **查看器 footer**: 查看器使用 `footer={false}`，在 children 内部实现自定义操作按钮
- **追问弹窗**: 使用独立的 `Modal` 组件（size="sm"），`footer` 自定义为关闭按钮
- **删除确认**: 使用 Modal 的 `danger` 模式，设置 `confirmLabel="确认删除"`

## 涉及文件

| 文件                                         | 操作 | 说明                                                                  |
| -------------------------------------------- | ---- | --------------------------------------------------------------------- |
| `apps/src/pages/Feynman/index.tsx`           | 修改 | 新增 editorCardId/viewerCardId 状态，Modal 控制逻辑，集成 useSnackbar |
| `apps/src/pages/Feynman/FeynmanEditor.tsx`   | 修改 | 改为 FeynmanEditorModal，使用 Modal 包裹，props 驱动，移除路由依赖    |
| `apps/src/pages/Feynman/FeynmanCardView.tsx` | 修改 | 改为 FeynmanViewerModal，使用 Modal 包裹，props 驱动，移除路由依赖    |
| `apps/src/pages/Feynman/FeynmanCardList.tsx` | 修改 | 添加删除按钮（管理员权限控制），新增 onDelete prop                    |
| `apps/src/main.tsx`                          | 修改 | 移除费曼的 3 个独立路由和对应 import                                  |


# Agent Extensions
无需使用任何 Agent Extension。
