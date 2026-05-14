/**
 * MatrixView import page.
 */
document.addEventListener('DOMContentLoaded', async () => {
    setupMatrixViewEvents();
    try {
        await TimeWhereDB.initDefaultSettings();
        await loadSavedMatrixViewImport();
    } catch (error) {
        setStatus(`页面初始化失败：${error.message}`, 'error');
    }
});

let currentImport = null;
let importInProgress = false;

function setupMatrixViewEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => {
        window.location.href = 'settings.html';
    });

    document.getElementById('matrixImportBtn')?.addEventListener('click', handleMatrixViewImport);
    document.getElementById('savePlansBtn')?.addEventListener('click', handleSavePlans);
    document.getElementById('planConfirmCloseBtn')?.addEventListener('click', () => closePlanConfirmModal(false));
    document.getElementById('planConfirmCancelBtn')?.addEventListener('click', () => closePlanConfirmModal(false));
    document.getElementById('planConfirmOkBtn')?.addEventListener('click', () => closePlanConfirmModal(true));
    document.getElementById('planConfirmModal')?.addEventListener('click', event => {
        if (event.target?.id === 'planConfirmModal') closePlanConfirmModal(false);
    });

    document.querySelectorAll('.matrixview-tab').forEach(tab => {
        tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    });
}

function activateTab(tabName) {
    document.querySelectorAll('.matrixview-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.getElementById('dayPanel')?.classList.toggle('active', tabName === 'day');
    document.getElementById('subjectPanel')?.classList.toggle('active', tabName === 'subject');
}

async function loadSavedMatrixViewImport() {
    const saved = await TimeWhereDB.getSetting(TimeWhereMatrixView.SETTINGS_IMPORT_KEY);
    if (saved?.records?.length) {
        currentImport = TimeWhereMatrixView.sanitizeMatrixViewData(saved);
        currentImport.imported_at = saved.imported_at || null;
        renderCurrentImport();
        setStatus(`已加载上次导入：${currentImport.records.length} 条课程记录`, 'info');
    }
}

async function handleMatrixViewImport() {
    if (importInProgress) return;
    const file = document.getElementById('matrixFileInput')?.files?.[0];
    if (!file) {
        setStatus('请先选择本地 MatrixView HTML/MHTML 文件（.mhtml/.html）', 'error');
        return;
    }

    setImportInProgress(true, '正在解析所选文件…');
    try {
        let parsed;
        if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
            const buffer = await file.arrayBuffer();
            parsed = await TimeWhereMatrixView.parseMatrixViewPdfArrayBuffer(buffer);
        } else {
            const text = await file.text();
            parsed = TimeWhereMatrixView.parseMatrixViewMime(text);
        }
        setStatus('正在校验课表结构…', 'info');
        if (parsed.parse_status === 'unsupported' && parsed.unsupported_reason === TimeWhereMatrixView.PDF_UNRELIABLE_EXPORT_TYPE) {
            clearCurrentImport();
            setStatus('PDF MatrixView 导入暂不可靠，请使用 PowerSchool 保存的 .mhtml/.html 页面导入。', 'error');
            return;
        }
        if (parsed.parse_status === 'failed_quality' && parsed.unsupported_reason === TimeWhereMatrixView.PDF_UNREADABLE_TEXT) {
            clearCurrentImport();
            setStatus('PDF 文本解析结果不可读，请重新导出 MatrixView PDF，或等待后续解析器增强。', 'error');
            return;
        }
        if (parsed.parse_status === 'failed_quality') {
            clearCurrentImport();
            setStatus(`MatrixView 表格结构校验失败：${parsed.unsupported_reason}`, 'error');
            return;
        }
        if (parsed.parse_status === 'unsupported') {
            clearCurrentImport();
            setStatus('当前文件不是 MatrixView 课表导出（检测为 PowerSchool StudentRecordExchange），请导出课表类文件后再导入', 'error');
            return;
        }
        if (!parsed.records.length) {
            clearCurrentImport();
            setStatus('未找到可导入的 MatrixView 课程记录', 'error');
            return;
        }

        setStatus('正在保存导入结果…', 'info');
        currentImport = {
            ...parsed,
            imported_at: new Date().toISOString()
        };
        await TimeWhereDB.setSetting(TimeWhereMatrixView.SETTINGS_IMPORT_KEY, currentImport);
        renderCurrentImport();
        const dayCount = currentImport.by_day?.length || 0;
        setStatus(`导入完成：${currentImport.records.length} 条记录，${currentImport.courses.length} 门课程，${dayCount} 个 A-H Day`, 'success');
    } catch (error) {
        clearCurrentImport();
        setStatus(`导入失败：${error.message}`, 'error');
    } finally {
        setImportInProgress(false);
    }
}

function clearCurrentImport() {
    currentImport = null;
    renderCurrentImport();
}

function setImportInProgress(inProgress, message = '') {
    importInProgress = inProgress;
    const importBtn = document.getElementById('matrixImportBtn');
    const fileInput = document.getElementById('matrixFileInput');
    if (importBtn) importBtn.disabled = inProgress;
    if (fileInput) fileInput.disabled = inProgress;
    if (inProgress && message) setStatus(message, 'info');
}

function renderCurrentImport() {
    renderDayPreview(currentImport?.by_day || []);
    renderSubjectPreview(currentImport?.courses || []);
    const saveBtn = document.getElementById('savePlansBtn');
    if (saveBtn) saveBtn.disabled = !(currentImport?.courses?.length);
}

function renderDayPreview(days) {
    const target = document.getElementById('dayPreview');
    if (!target) return;
    if (!days.length) {
        target.className = 'matrixview-empty';
        target.textContent = '导入后显示 A-H Day 预览';
        return;
    }

    target.className = 'matrixview-table-wrap';
    target.innerHTML = `
        <table class="matrixview-table">
            <thead>
                <tr>
                    <th>A-H Day</th>
                    <th>Period</th>
                    <th>Subject in MatrixView</th>
                    <th>Teacher</th>
                    <th>Room</th>
                    <th>Terms</th>
                </tr>
            </thead>
            <tbody>
                ${days.flatMap(day => day.periods.map(period => `
                    <tr>
                        <td>${TimeWhereMatrixView.escapeHTML(day.day)}</td>
                        <td>${TimeWhereMatrixView.escapeHTML(period.period)}</td>
                        <td>${TimeWhereMatrixView.escapeHTML(period.subject_in_matrixview)}</td>
                        <td>${TimeWhereMatrixView.escapeHTML(period.teacher)}</td>
                        <td>${TimeWhereMatrixView.escapeHTML(period.room)}</td>
                        <td>${TimeWhereMatrixView.escapeHTML(period.terms)}</td>
                    </tr>
                `)).join('')}
            </tbody>
        </table>
    `;
}

function renderSubjectPreview(courses) {
    const target = document.getElementById('subjectPreview');
    if (!target) return;
    if (!courses.length) {
        target.className = 'matrixview-empty';
        target.textContent = '导入后显示学科预览';
        return;
    }

    target.className = 'matrixview-table-wrap';
    target.innerHTML = `
        <table class="matrixview-table">
            <thead>
                <tr>
                    <th>Subject</th>
                    <th>Subject in MatrixView</th>
                    <th>Teacher</th>
                    <th>Room</th>
                    <th>A-H Day / Period</th>
                </tr>
            </thead>
            <tbody>
                ${courses.map((course, index) => `
                    <tr>
                        <td>
                            <input
                                class="matrixview-subject-input"
                                data-index="${index}"
                                value="${TimeWhereMatrixView.escapeAttribute(course.subject)}"
                            >
                        </td>
                        <td>${TimeWhereMatrixView.escapeHTML(course.subject_in_matrixview)}</td>
                        <td>${TimeWhereMatrixView.escapeHTML(course.teacher)}</td>
                        <td>${TimeWhereMatrixView.escapeHTML(course.room)}</td>
                        <td>
                            ${course.meetings.map(meeting => `
                                <div class="matrixview-meeting">
                                    ${TimeWhereMatrixView.escapeHTML(meeting.day)} / ${TimeWhereMatrixView.escapeHTML(meeting.period)}
                                    ${meeting.terms ? ` · ${TimeWhereMatrixView.escapeHTML(meeting.terms)}` : ''}
                                </div>
                            `).join('')}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function handleSavePlans() {
    if (!currentImport?.courses?.length) {
        setStatus('请先导入 MatrixView 课表', 'error');
        return;
    }

    const mappings = currentImport.courses.map((course, index) => {
        const input = document.querySelector(`.matrixview-subject-input[data-index="${index}"]`);
        return {
            subject: input ? input.value.trim() : course.subject,
            subject_in_matrixview: course.subject_in_matrixview
        };
    });

    try {
        const preview = await TimeWhereMatrixView.previewSubjectPlanInitialization(TimeWhereDB, mappings);
        const confirmed = await showPlanConfirmModal(preview);
        if (!confirmed) {
            setStatus('已取消初始化，未修改 Plan 数据', 'info');
            return;
        }

        const result = await TimeWhereMatrixView.initializeSubjectPlans(TimeWhereDB, mappings);
        const uncertain = result.uncertainPlans.length
            ? `；保留 ${result.uncertainPlans.length} 个不确定 Plan`
            : '';
        setStatus(`已初始化 ${result.createdPlans.length} 个学科 Plan，确保 Other School Plan 存在${uncertain}`, 'success');
    } catch (error) {
        setStatus(`初始化失败：${error.message}`, 'error');
    }
}

let planConfirmResolve = null;

function showPlanConfirmModal(preview) {
    const modal = document.getElementById('planConfirmModal');
    if (!modal) return Promise.resolve(false);
    renderPlanConfirmList('confirmDeleteList', preview.deleteRebuildPlanNames);
    renderPlanConfirmList('confirmPreserveList', preview.preservedPlanNames);
    renderPlanConfirmList('confirmUncertainList', preview.uncertainPlanNames);
    modal.hidden = false;
    document.getElementById('planConfirmCancelBtn')?.focus();
    return new Promise(resolve => {
        planConfirmResolve = resolve;
    });
}

function closePlanConfirmModal(confirmed) {
    const modal = document.getElementById('planConfirmModal');
    if (modal) modal.hidden = true;
    if (planConfirmResolve) {
        const resolve = planConfirmResolve;
        planConfirmResolve = null;
        resolve(confirmed);
    }
}

function renderPlanConfirmList(targetId, names) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const values = Array.isArray(names) ? names.filter(Boolean) : [];
    if (!values.length) {
        target.innerHTML = '<span class="matrixview-pill empty">无</span>';
        return;
    }
    target.innerHTML = values.map(name => (
        `<span class="matrixview-pill">${TimeWhereMatrixView.escapeHTML(name)}</span>`
    )).join('');
}

function setStatus(message, type = 'info') {
    const status = document.getElementById('matrixStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
}
