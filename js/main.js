import { initAuth } from './auth.js';
import { router } from './router.js';
import { createIcons, icons } from 'lucide';

// ============================================
// 应用入口
// ============================================

async function bootstrap() {
    await initAuth();
    router.handleRoute();

    // 初始化图标
    createIcons({ icons });

    // 每次路由切换后刷新图标
    window.addEventListener('hashchange', () => {
        setTimeout(() => createIcons({ icons }), 50);
    });

    // 全局每秒刷新一次图标（应对动态内容）
    setInterval(() => createIcons({ icons }), 2000);
}

bootstrap();
