import { initAuth } from './auth.js';
import { router } from './router.js';
import { createIcons } from 'lucide';

// ============================================
// 应用入口
// ============================================

async function bootstrap() {
    await initAuth();
    router.handleRoute();

    // 每次路由切换后刷新图标
    window.addEventListener('hashchange', () => {
        setTimeout(() => createIcons(), 50);
    });

    // 全局每秒刷新一次图标（应对动态内容）
    setInterval(() => createIcons(), 2000);
}

bootstrap();
