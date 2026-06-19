-- UCAS_BOX 初始收藏品字典数据
-- 在 Supabase SQL Editor 中执行以填充初始物品

TRUNCATE TABLE public.items CASCADE;

INSERT INTO public.items (name, quality, image_name, description, drop_weight, item_type) VALUES
-- ============================================================
-- 收藏品 (collection)
-- ============================================================
-- 普通 (white)
('石头', 'white', '', '一块普通的石头', 3000, 'collection'),
('枯枝', 'white', '', '秋日从枝头落下的叹息', 2900, 'collection'),
('白色卡片', 'white', '', '无字，却写满了沉默', 2800, 'collection'),
('半张草稿纸', 'white', '', '答案早已随风散去', 2700, 'collection'),
('空教室的粉笔灰', 'white', '', '阳光里浮动的尘埃', 2600, 'collection'),
('过期借书证', 'white', '', '还书日期停在某个遥远的明天', 2500, 'collection'),
('银杏落叶', 'white', '', '金黄的一小块秋', 2400, 'collection'),

-- 稀有 (green)
('牢大国窖', 'green', '', '550ml', 1500, 'collection'),
('雁栖湖鹅卵石', 'green', '', '被湖水打磨了千年的圆润', 1400, 'collection'),
('图书馆占座纸条', 'green', '', '纸条还在，人已不知去向', 1300, 'collection'),
('期末复习PPT', 'green', '', '字字句句，皆是挣扎', 1200, 'collection'),
('导师的语音留言', 'green', '', '"这个课题很有意思"', 1100, 'collection'),
('咖啡', 'green', '', '七杯苦涩换一夜清醒', 1000, 'collection'),
('学术会议胸牌', 'green', '', '挂在胸口的半日身份', 850, 'collection'),

-- 珍奇 (blue)
('牢大的篮球', 'blue', '', '24号，永恒的传说', 600, 'collection'),
('导师的亲笔推荐信', 'blue', '', '字里行间的期许', 520, 'collection'),
('双非录取通知书', 'blue', '', '那年夏天，最心动的信封', 500, 'collection'),
('雁栖湖的星空', 'blue', '', '那天晚上，你指着北斗说像勺子', 420, 'collection'),

-- 史诗 (purple)
('双非毕业证', 'purple', '', '纸轻如鸿毛，重如前程', 300, 'collection'),
('RTX4090', 'purple', '', '算力的尽头是显卡', 280, 'collection'),
('诺奖得主合影', 'purple', '', '人群中踮脚也只拍到肩膀', 260, 'collection'),
('sci一区论文', 'purple', '', '熬夜熬出的星辰', 220, 'collection'),
('zq的亲笔签名', 'purple', '', '名人两个字，落笔成永恒', 200, 'collection'),

-- 传说 (orange)
('DEBUG', 'orange', '', '代码深处的一声叹息', 80, 'collection'),
('菲尔兹奖章', 'orange', '', '数学的圣杯，沉甸甸的荣耀', 70, 'collection'),
('图灵奖奖章', 'orange', '', '计算世界的最高加冕', 60, 'collection'),
('爱因斯坦的大脑', 'orange', '', '智慧的重量无法称量', 50, 'collection'),
('UCAS的时光胶囊', 'orange', '', '封存二十年的自己', 40, 'collection'),

-- 神圣 (red)
('ERROR', 'red', '', '世界的尽头是Bug', 2, 'collection'),
('创世者的骰子', 'red', '', '六面皆是命运，无人能猜', 2, 'collection'),

-- ============================================================
-- 消耗品 (consumable)
-- ============================================================
('改名卡', 'purple', '', '使用后可以修改你的昵称', 50, 'consumable')
-- ============================================================
-- 装备 (equipment)
-- ============================================================
