/**
 * 日历视图协助脚本
 * 用于未来可能的数据绑定以及简单的交互控制
 */

document.addEventListener('DOMContentLoaded', () => {
    // 侧边栏交互
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.nav-item.active').forEach(n => n.classList.remove('active'));
            this.classList.add('active');
        });
    });

    /**
     * 辅助函数：根据时间计算事件卡片的绝对顶部距离(top)和高度(height)
     * 假设：日历从 6:00 开始，每小时占据 60px。
     * 因此：高度 = 持续时间(分钟) * 1px
     *       Top偏移 = (开始时间的小时数 - 6) * 60px + 开始时间的分钟数 * 1px
     * @param {string} startTime - 如 "08:00", "14:15"
     * @param {number} durationMinutes - 持续时长(分钟)
     */
    function calculateEventPosition(startTime, durationMinutes) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const topPx = (hours - 6) * 60 + minutes;
        const heightPx = Math.max(durationMinutes, 20); // 最小给20px高度
        return {
            top: `${topPx}px`,
            height: `${heightPx}px`
        };
    }

    // 示例打印：
    // console.log("8:00 开始 75 分钟的课程:", calculateEventPosition("08:00", 75)); // top: 120px, height: 75px
});
