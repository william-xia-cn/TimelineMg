const LABELS = {
  plans: 'Plans',
  buckets: 'Buckets',
  labels: 'Labels',
  tasks: 'Tasks',
  containers: 'Containers',
  events: 'Calendar Events',
  settings: 'Settings'
};

function accountLabel(runtime) {
  const account = runtime.apiClient.getSession()?.account || {};
  return account.name || account.display_name || account.email || 'Google 账户';
}

function countText(summary) {
  return Object.keys(LABELS)
    .map(key => `${LABELS[key]}: ${Number(summary?.counts?.[key] || 0)}`)
    .join(' · ');
}

function skippedText(summary) {
  return `Habits: ${Number(summary?.skipped?.habits || 0)} · Daily Journals: ${Number(summary?.skipped?.daily_journals || 0)}`;
}

function ensurePanel(input) {
  let panel = document.getElementById('timewhereJsonImportPanel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'timewhereJsonImportPanel';
  panel.className = 'google-sync-preview';
  panel.hidden = true;
  input.closest('.setting-row')?.insertAdjacentElement('afterend', panel);
  return panel;
}

function button(label, action, className = 'action-btn') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.dataset.importAction = action;
  return element;
}

function appendText(panel, text, className = 'setting-desc') {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  panel.appendChild(element);
  return element;
}

function renderImportStatus(panel, stage, titleText, detailText = '', summary = null) {
  panel.hidden = false;
  panel.dataset.importStage = stage;
  panel.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = titleText;
  panel.appendChild(title);
  if (summary) appendText(panel, '已读取：' + countText(summary));
  if (detailText) appendText(panel, detailText);
}

function latestRollback(runs) {
  return (runs || []).find(run => run.can_rollback) || null;
}

function appendRollbackAction(panel, run) {
  if (!run?.can_rollback) return;
  const divider = document.createElement('div');
  divider.className = 'google-sync-preview-row';
  const meta = document.createElement('div');
  meta.className = 'google-sync-preview-meta';
  const title = document.createElement('span');
  title.className = 'google-sync-preview-title';
  title.textContent = '最近一次完整覆盖可撤销';
  const desc = document.createElement('span');
  desc.className = 'google-sync-preview-desc';
  desc.textContent = `回滚快照有效至 ${new Date(run.expires_at).toLocaleString()}`;
  meta.append(title, desc);
  const rollback = button('撤销上次覆盖', 'rollback', 'action-btn danger');
  rollback.dataset.replacementId = run.id;
  divider.append(meta, rollback);
  panel.appendChild(divider);
}

function renderPrepared(panel, runtime, prepared, rollbackRun = null) {
  panel.hidden = false;
  panel.dataset.importStage = 'ready';
  panel.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = 'Extension 备份已读取';
  panel.appendChild(title);
  appendText(panel, `目标账户：${accountLabel(runtime)}`);
  appendText(panel, countText(prepared.summary));
  appendText(panel, `暂不支持并将跳过：${skippedText(prepared.summary)}。原始文件不会上传。`);
  const merge = document.createElement('div');
  merge.className = 'google-sync-preview-row';
  const mergeMeta = document.createElement('div');
  mergeMeta.className = 'google-sync-preview-meta';
  mergeMeta.innerHTML = '<span class="google-sync-preview-title">同步导入</span><span class="google-sync-preview-desc">新增数据；相同数据跳过；差异进入冲突，不删除 Cloud 数据。</span>';
  merge.append(mergeMeta, button('同步导入', 'merge', 'action-btn primary'));
  const replace = document.createElement('div');
  replace.className = 'google-sync-preview-row';
  const replaceMeta = document.createElement('div');
  replaceMeta.className = 'google-sync-preview-meta';
  replaceMeta.innerHTML = '<span class="google-sync-preview-title">覆盖导入</span><span class="google-sync-preview-desc">以备份完整替换 Cloud 核心数据；Cloud 独有数据会被删除，执行前可查看差异。</span>';
  replace.append(replaceMeta, button('覆盖导入', 'replace', 'action-btn danger'));
  const actions = document.createElement('div');
  actions.className = 'google-sync-preview-actions';
  actions.appendChild(button('重新选择', 'reselect'));
  panel.append(merge, replace, actions);
  appendRollbackAction(panel, rollbackRun);
}

function diffText(counts) {
  return Object.keys(LABELS).map(key => {
    const value = counts?.[key] || {};
    return `${LABELS[key]}：新增 ${Number(value.create || 0)} · 替换 ${Number(value.replace || 0)} · 删除 ${Number(value.delete || 0)} · 相同 ${Number(value.unchanged || 0)}`;
  });
}

function dangerousConfirmation({ title, description, counts, phrase }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal timewhere-json-replacement-confirm';
    const modal = document.createElement('div');
    modal.className = 'modal-content';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const heading = document.createElement('h3');
    heading.textContent = title;
    const warning = document.createElement('p');
    warning.className = 'setting-desc';
    warning.textContent = description;
    const list = document.createElement('div');
    list.className = 'google-sync-preview-list';
    for (const text of diffText(counts)) {
      const row = document.createElement('div');
      row.className = 'google-sync-preview-row';
      row.textContent = text;
      list.appendChild(row);
    }
    const instruction = document.createElement('label');
    instruction.className = 'setting-desc';
    instruction.textContent = `请输入“${phrase}”确认：`;
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.dataset.replacementConfirmation = 'true';
    const actions = document.createElement('div');
    actions.className = 'google-sync-preview-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'action-btn';
    cancel.textContent = '取消';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'action-btn danger';
    confirm.textContent = phrase;
    confirm.disabled = true;
    input.addEventListener('input', () => { confirm.disabled = input.value !== phrase; });
    const finish = value => {
      overlay.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(input.value === phrase));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish(false);
    });
    actions.append(cancel, confirm);
    modal.append(heading, warning, list, instruction, input, actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    input.focus();
  });
}

function conflictTitle(conflict) {
  if (conflict.entity_type === 'setting') return `设置：${conflict.entity_id || '未知设置'}`;
  return `${conflict.entity_type || '数据'}：${conflict.entity_id || '未知记录'}`;
}

function compactValue(value) {
  const text = JSON.stringify(value ?? null);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

async function openConflictReview(runtime, platform) {
  document.querySelector('.timewhere-json-conflict-review')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'modal timewhere-json-conflict-review';
  const modal = document.createElement('div');
  modal.className = 'modal-content';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  const heading = document.createElement('h3');
  heading.textContent = '处理导入冲突';
  const list = document.createElement('div');
  list.className = 'google-sync-preview-list';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'action-btn';
  close.textContent = '关闭';
  close.addEventListener('click', () => overlay.remove());

  const refresh = async () => {
    const conflicts = await runtime.getMigrationConflicts();
    list.replaceChildren();
    if (!conflicts.length) {
      appendText(list, '没有待处理的导入冲突。');
      return;
    }
    for (const conflict of conflicts) {
      const row = document.createElement('div');
      row.className = 'google-sync-preview-row google-sync-conflict-row';
      const meta = document.createElement('div');
      meta.className = 'google-sync-preview-meta';
      const title = document.createElement('span');
      title.className = 'google-sync-preview-title';
      title.textContent = conflictTitle(conflict);
      const local = document.createElement('span');
      local.className = 'google-sync-preview-desc';
      local.textContent = `导入：${compactValue(conflict.local)}`;
      const cloud = document.createElement('span');
      cloud.className = 'google-sync-preview-desc';
      cloud.textContent = `Cloud：${compactValue(conflict.cloud)}`;
      meta.append(title, local, cloud);
      const actions = document.createElement('div');
      actions.className = 'google-sync-preview-actions';
      for (const [resolution, label] of [['use_cloud', '保留 Cloud'], ['use_local', '使用导入'], ['skip', '跳过']]) {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'action-btn';
        choice.textContent = label;
        choice.addEventListener('click', async () => {
          choice.disabled = true;
          try {
            await runtime.resolveMigrationConflict(conflict.id, resolution);
            await refresh();
            platform.showToast('导入冲突已处理', 'success');
          } catch (error) {
            platform.showToast('冲突处理失败：' + error.message, 'error');
          } finally {
            choice.disabled = false;
          }
        });
        actions.appendChild(choice);
      }
      row.append(meta, actions);
      list.appendChild(row);
    }
  };

  modal.append(heading, list, close);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  await refresh();
}

function appendResultActions(panel, conflictCount, rollbackRun = null) {
  const actions = document.createElement('div');
  actions.className = 'google-sync-preview-actions';
  actions.append(
    button('查看 Plan 和任务', 'view-tasks', 'action-btn primary'),
    button('重新选择', 'reselect')
  );
  if (conflictCount > 0) {
    const conflicts = button(`处理冲突 (${conflictCount})`, 'conflicts');
    actions.appendChild(conflicts);
  }
  panel.appendChild(actions);
  appendRollbackAction(panel, rollbackRun);
}

function renderMergeResult(panel, result, conflictCount, rollbackRun = null) {
  panel.hidden = false;
  panel.dataset.importStage = 'completed';
  panel.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = conflictCount ? '同步导入完成，存在待处理冲突' : '同步导入完成';
  panel.appendChild(title);
  appendText(panel, countText({ counts: result.migration.counts || {} }));
  appendText(panel, `未导入：${skippedText(result.summary)}`);
  appendText(panel, result.verification?.status === 'verified' ? 'Cloud 已接收并核对全部可导入实体。' : 'Cloud 写入数量未通过核对。');
  appendResultActions(panel, conflictCount, rollbackRun);
}

function renderReplacementResult(panel, result, rollbackRun = null) {
  panel.hidden = false;
  panel.dataset.importStage = 'completed';
  panel.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = result.replacement.action_type === 'rollback' ? '覆盖撤销完成' : '完整覆盖完成';
  panel.appendChild(title);
  for (const text of diffText(result.replacement.counts)) appendText(panel, text);
  appendText(panel, `新的同步游标：${result.replacement.sync_cursor}。回滚快照有效至 ${new Date(result.replacement.rollback_expires_at).toLocaleString()}。`);
  appendResultActions(panel, 0, rollbackRun);
}

export function installExtensionImportUi(runtime, platform) {
  const initialize = async () => {
    const chooseButton = document.getElementById('importJsonBtn');
    const input = document.getElementById('importJsonInput');
    if (!chooseButton || !input || input.dataset.timewhereJsonImportBound === 'true') return;
    input.dataset.timewhereJsonImportBound = 'true';

    const panel = ensurePanel(input);
    const handledFiles = new WeakSet();
    let prepared = null;
    let rollbackRun = null;
    let busy = false;

    const refreshRollback = async () => {
      rollbackRun = latestRollback(await runtime.listReplacementRuns());
      return rollbackRun;
    };

    const chooseFile = () => {
      input.value = '';
      input.click();
    };

    chooseButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!runtime.hasSession()) {
        renderImportStatus(panel, 'failed', '导入失败', '请先使用 Google 登录 TimeWhere Cloud。');
        platform.showToast('请先使用 Google 登录 TimeWhere Cloud', 'error');
        return;
      }
      chooseFile();
    }, true);

    const handleFileSelection = event => {
      event.stopImmediatePropagation();
      const file = event.target?.files?.[0] || input.files?.[0];
      if (!file || handledFiles.has(file) || busy) return;
      handledFiles.add(file);
      busy = true;
      (async () => {
        renderImportStatus(panel, 'reading', '正在读取 Extension 备份', '正在校验文件格式和可导入数据。');
        prepared = await runtime.prepareExtensionBackup(file);
        input.value = '';
        await refreshRollback();
        renderPrepared(panel, runtime, prepared, rollbackRun);
      })().catch(error => {
        input.value = '';
        prepared = null;
        const code = error?.code || 'invalid_extension_backup';
        renderImportStatus(panel, 'failed', '读取失败', `${code}：${error?.message || '无法读取备份文件'}。`);
        platform.showToast('导入失败：' + (error?.message || code), 'error');
      }).finally(() => { busy = false; });
    };

    input.addEventListener('input', handleFileSelection, true);
    input.addEventListener('change', handleFileSelection, true);

    panel.addEventListener('click', event => {
      const action = event.target.closest('[data-import-action]');
      if (!action || busy) return;
      event.preventDefault();
      event.stopPropagation();
      const name = action.dataset.importAction;

      (async () => {
        if (name === 'reselect') {
          chooseFile();
          return;
        }
        if (name === 'view-tasks') {
          window.location.href = '../tasks/tasks.html';
          return;
        }
        if (name === 'conflicts') {
          await openConflictReview(runtime, platform);
          return;
        }
        if (name === 'merge') {
          if (!prepared) throw new Error('请先选择 Extension 备份');
          busy = true;
          renderImportStatus(panel, 'submitting', '正在同步导入', '正在安全合并到 TimeWhere Cloud。', prepared.summary);
          const result = await runtime.commitExtensionBackup(prepared);
          const conflicts = await runtime.getMigrationConflicts();
          await refreshRollback();
          renderMergeResult(panel, result, conflicts.length, rollbackRun);
          await globalThis.TimeWhereGoogleSync?.appendGoogleSyncHistory?.({
            status: result.migration.status,
            reason: 'json_import_merge',
            conflict_count: conflicts.length,
            finished_at: new Date().toISOString()
          });
          platform.showToast(conflicts.length ? '同步导入完成，请处理冲突' : '同步导入成功', 'success');
          return;
        }
        if (name === 'replace') {
          if (!prepared) throw new Error('请先选择 Extension 备份');
          busy = true;
          renderImportStatus(panel, 'previewing', '正在生成覆盖预览', '正在比较备份与当前 Cloud 数据。', prepared.summary);
          const preview = await runtime.previewExtensionReplacement(prepared);
          const confirmed = await dangerousConfirmation({
            title: '完整覆盖 TimeWhere Cloud',
            description: 'Cloud 独有的 Plan、Bucket、Label、Task、Container、Calendar Event 和产品设置将被删除。执行前会自动保存 30 天回滚快照。',
            counts: preview.replacement.counts,
            phrase: '覆盖导入'
          });
          if (!confirmed) {
            await refreshRollback();
            renderPrepared(panel, runtime, prepared, rollbackRun);
            return;
          }
          renderImportStatus(panel, 'replacing', '正在完整覆盖 Cloud 数据', '请保持页面打开，期间普通写操作会被暂时阻止。', prepared.summary);
          const result = await runtime.commitExtensionReplacement(prepared, preview.replacement.replacement_id, '覆盖导入');
          await refreshRollback();
          renderReplacementResult(panel, result, rollbackRun);
          await globalThis.TimeWhereGoogleSync?.appendGoogleSyncHistory?.({
            status: 'completed',
            reason: 'json_import_replacement',
            finished_at: new Date().toISOString()
          });
          platform.showToast('完整覆盖完成', 'success');
          return;
        }
        if (name === 'rollback') {
          const originalId = action.dataset.replacementId || rollbackRun?.id;
          if (!originalId) throw new Error('没有可用的回滚快照');
          busy = true;
          renderImportStatus(panel, 'previewing_rollback', '正在生成撤销预览', '正在比较覆盖前快照与当前 Cloud 数据。');
          const preview = await runtime.previewReplacementRollback(originalId);
          const confirmed = await dangerousConfirmation({
            title: '撤销上次完整覆盖',
            description: '撤销会把 Cloud 核心数据恢复到上次覆盖前，同时先备份当前状态。',
            counts: preview.counts,
            phrase: '撤销覆盖'
          });
          if (!confirmed) {
            if (prepared) renderPrepared(panel, runtime, prepared, rollbackRun);
            else renderImportStatus(panel, 'cancelled', '已取消撤销', 'Cloud 数据没有变化。');
            return;
          }
          renderImportStatus(panel, 'rolling_back', '正在撤销上次覆盖', '当前状态会先生成新的回滚快照。');
          const replacement = await runtime.commitReplacementRollback(preview.replacement_id, '撤销覆盖');
          await refreshRollback();
          renderReplacementResult(panel, { replacement }, rollbackRun);
          platform.showToast('已撤销上次覆盖', 'success');
        }
      })().catch(error => {
        const code = error?.code || 'import_failed';
        if (code === 'replacement_preview_stale') {
          if (name === 'rollback') {
            renderImportStatus(panel, 'stale', 'Cloud 数据已变化，需要重新预览', '覆盖预览生成后其他页面写入了新数据。请再次点击撤销，系统会按最新数据重新计算差异。');
            appendRollbackAction(panel, rollbackRun);
          } else if (prepared) {
            renderPrepared(panel, runtime, prepared, rollbackRun);
            const notice = document.createElement('p');
            notice.className = 'setting-desc';
            notice.textContent = 'Cloud 数据在预览后发生变化；请重新点击覆盖导入生成最新差异。';
            panel.prepend(notice);
          }
          platform.showToast('Cloud 数据已变化，请重新预览', 'error');
          return;
        }
        renderImportStatus(panel, 'failed', '导入操作失败', `${code}：${error?.message || '未知错误'}。未确认成功前不要关闭原始备份。`, prepared?.summary || null);
        platform.showToast('导入失败：' + (error?.message || code), 'error');
      }).finally(() => { busy = false; });
    });

    if (runtime.hasSession()) {
      try {
        await refreshRollback();
        if (rollbackRun) {
          renderImportStatus(panel, 'idle', 'Extension JSON 数据导入', '请选择备份文件，或撤销最近一次完整覆盖。');
          appendRollbackAction(panel, rollbackRun);
        }
      } catch (error) {
        console.warn('[TimeWhere Cloud] replacement history unavailable:', error.message);
      }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}