// Planner 基础交互逻辑

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. 视图切换逻辑 (Board / Schedule)
    const tabButtons = document.querySelectorAll('.btn-tab');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // 这里可以添加逻辑来切换实际的内容显示，例如 toggle .kanban-board 的显示
            console.log(`Switched to ${button.innerText} view`);
        });
    });

    // 2. 次级菜单状态切换
    const contextItems = document.querySelectorAll('.context-item');
    contextItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // 如果是普通的导航项（不是 Pinned Plans 下的具体链接），可以单独处理
            contextItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });

    // 3. 简单的卡片点击反馈
    const cards = document.querySelectorAll('.task-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const title = card.querySelector('.task-title').innerText;
            console.log(`Opening task detail: ${title}`);
            // 这里可以弹出 Modal 或者侧边详情面板
        });
    });

    // 4. 模拟“添加任务”
    const addButtons = document.querySelectorAll('.col-actions span:first-child');
    addButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const columnName = btn.closest('.kanban-column').querySelector('h3').innerText;
            alert(`正在为 ${columnName} 模块添加新任务...`);
        });
    });

});
