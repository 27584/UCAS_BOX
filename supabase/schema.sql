-- UCAS_BOX 完整数据库架构
-- 在 Supabase SQL Editor 中执行此文件以一键创建所有表、函数和策略
ALTER DATABASE postgres SET TIME ZONE 'Asia/Shanghai';
-- ============================================================
-- 1. 用户扩展表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    nickname TEXT,
    shells BIGINT DEFAULT 0,
    is_admin BOOLEAN DEFAULT false,
    last_open_at TIMESTAMPTZ DEFAULT '1970-01-01'::timestamptz,
    last_claim_at TIMESTAMPTZ DEFAULT now(),
    ad_claimed_at TIMESTAMPTZ DEFAULT NULL,
    -- 端午活动：在线时间追踪
    dragon_boat_online_total INT DEFAULT 0, -- 累计在线秒数
    dragon_boat_last_update TIMESTAMPTZ DEFAULT NULL, -- 上次更新时间
    dragon_boat_claimed_1min BOOLEAN DEFAULT false,
    dragon_boat_claimed_10min BOOLEAN DEFAULT false,
    dragon_boat_claimed_60min BOOLEAN DEFAULT false,
    dragon_boat_daily_reset TIMESTAMPTZ DEFAULT NULL, -- 每日重置时间
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 为已存在的表添加端午活动字段（兼容旧版PostgreSQL）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_online_total') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_online_total INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_last_update') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_last_update TIMESTAMPTZ DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_claimed_1min') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_claimed_1min BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_claimed_10min') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_claimed_10min BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_claimed_60min') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_claimed_60min BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'dragon_boat_daily_reset') THEN
        ALTER TABLE public.profiles ADD COLUMN dragon_boat_daily_reset TIMESTAMPTZ DEFAULT NULL;
    END IF;
END $$;

-- ============================================================
-- 1.5 端午活动进度表（独立表）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dragon_boat_progress (
    user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    online_total INT DEFAULT 0, -- 累计在线秒数
    last_update TIMESTAMPTZ DEFAULT NULL, -- 上次更新时间
    claimed_1min BOOLEAN DEFAULT false,
    claimed_10min BOOLEAN DEFAULT false,
    claimed_60min BOOLEAN DEFAULT false,
    daily_reset DATE DEFAULT NULL -- 每日重置日期
);

-- RLS for dragon_boat_progress
ALTER TABLE public.dragon_boat_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own dragon boat progress" ON public.dragon_boat_progress;
CREATE POLICY "Users can view own dragon boat progress" ON public.dragon_boat_progress FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own dragon boat progress" ON public.dragon_boat_progress;
CREATE POLICY "Users can update own dragon boat progress" ON public.dragon_boat_progress FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own dragon boat progress" ON public.dragon_boat_progress;
CREATE POLICY "Users can insert own dragon boat progress" ON public.dragon_boat_progress FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 1.6 彩票活动表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lottery_rounds (
    round_id BIGSERIAL PRIMARY KEY,
    round_number TEXT NOT NULL UNIQUE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    base_pool BIGINT DEFAULT 5000,
    rollover_pool BIGINT DEFAULT 0,
    final_pool BIGINT,
    winning_numbers TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'drawn')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lottery_tickets (
    id BIGSERIAL PRIMARY KEY,
    round_id BIGINT REFERENCES public.lottery_rounds ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE,
    numbers TEXT NOT NULL,
    quantity INT DEFAULT 1,
    is_winning BOOLEAN DEFAULT false,
    prize_level TEXT,
    prize_amount BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(round_id, user_id, numbers)
);

-- 为已存在的彩票表添加数量字段（兼容旧版PostgreSQL）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lottery_tickets' AND column_name = 'quantity') THEN
        ALTER TABLE public.lottery_tickets ADD COLUMN quantity INT DEFAULT 1;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.lottery_results (
    id BIGSERIAL PRIMARY KEY,
    round_id BIGINT REFERENCES public.lottery_rounds ON DELETE CASCADE,
    prize_level TEXT NOT NULL,
    pool_share NUMERIC NOT NULL,
    total_winners INT DEFAULT 0,
    total_people INT DEFAULT 0,
    rollover_amount BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 为已存在的开奖结果表添加人数字段
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lottery_results' AND column_name = 'total_people') THEN
        ALTER TABLE public.lottery_results ADD COLUMN total_people INT DEFAULT 0;
    END IF;
END $$;

-- RLS for lottery tables
ALTER TABLE public.lottery_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lottery_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lottery_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all lottery rounds" ON public.lottery_rounds;
CREATE POLICY "Users can view all lottery rounds" ON public.lottery_rounds FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view own lottery tickets" ON public.lottery_tickets;
CREATE POLICY "Users can view own lottery tickets" ON public.lottery_tickets FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert lottery tickets" ON public.lottery_tickets;
CREATE POLICY "Users can insert lottery tickets" ON public.lottery_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view all lottery results" ON public.lottery_results;
CREATE POLICY "Users can view all lottery results" ON public.lottery_results FOR SELECT USING (true);

-- ============================================================
-- 2. 收藏品字典
-- ============================================================
CREATE TABLE IF NOT EXISTS public.items (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    quality TEXT CHECK (quality IN ('white','green','blue','purple','orange','red')),
    image_name TEXT,
    description TEXT,
    drop_weight INT DEFAULT 100,
    item_type TEXT DEFAULT 'collection' CHECK (item_type IN ('collection', 'consumable', 'equipment', 'material', 'currency')),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'collection';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_item_type_check') THEN
        ALTER TABLE public.items ADD CONSTRAINT items_item_type_check CHECK (item_type IN ('collection', 'consumable', 'equipment', 'material', 'currency'));
    END IF;
END $$;

-- ============================================================
-- 3. 用户背包
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id BIGINT REFERENCES public.items(id),
    quantity INT DEFAULT 1,
    acquired_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, item_id)
);

-- ============================================================
-- 4. 市场订单
-- ============================================================
CREATE TABLE IF NOT EXISTS public.market_orders (
    id BIGSERIAL PRIMARY KEY,
    seller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id BIGINT REFERENCES public.items(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    price_per_unit BIGINT NOT NULL CHECK (price_per_unit > 0),
    type TEXT CHECK (type IN ('sell','buy')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. 系统邮件
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_mails (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. 投稿表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.item_submissions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quality TEXT CHECK (quality IN ('white','green','blue','purple','orange','red')) NOT NULL,
    description TEXT NOT NULL,
    drop_weight INT DEFAULT 100,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reward_shells BIGINT DEFAULT 0,
    admin_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. RLS 启用
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_mails ENABLE ROW LEVEL SECURITY;

-- RLS 策略
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view own inventory" ON public.inventory;
CREATE POLICY "Users can view own inventory"
    ON public.inventory FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can manage inventory" ON public.inventory;
CREATE POLICY "System can manage inventory"
    ON public.inventory FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Market orders public read" ON public.market_orders;
CREATE POLICY "Market orders public read"
    ON public.market_orders FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Users can manage own orders" ON public.market_orders;
CREATE POLICY "Users can manage own orders"
    ON public.market_orders FOR ALL
    USING (auth.uid() = seller_id)
    WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Users can view own mails" ON public.system_mails;
CREATE POLICY "Users can view own mails"
    ON public.system_mails FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own mails" ON public.system_mails;
CREATE POLICY "Users can update own mails"
    ON public.system_mails FOR UPDATE
    USING (auth.uid() = user_id);

ALTER TABLE public.item_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own submissions" ON public.item_submissions;
CREATE POLICY "Users can view own submissions"
    ON public.item_submissions FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert submissions" ON public.item_submissions;
CREATE POLICY "Users can insert submissions"
    ON public.item_submissions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 7. 触发器：注册后自动创建 profile
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    raw_nickname TEXT;
    clean_nickname TEXT;
BEGIN
    raw_nickname := COALESCE(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1));
    -- 移除HTML标签，防止XSS
    clean_nickname := regexp_replace(raw_nickname, '<[^>]*>', '', 'g');
    -- 限制长度
    clean_nickname := LEFT(clean_nickname, 20);
    INSERT INTO public.profiles (id, nickname)
    VALUES (NEW.id, clean_nickname);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 7. RPC 函数：领取挂机收益
-- ============================================================
DROP FUNCTION IF EXISTS public.claim_idle_rewards();
CREATE OR REPLACE FUNCTION public.claim_idle_rewards()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    last_claim TIMESTAMPTZ;
    now_time TIMESTAMPTZ := now();
    diff_seconds NUMERIC;
    diff_minutes NUMERIC;
    base_rate NUMERIC := 1;
    boost_rate NUMERIC := 0;
    total_rate NUMERIC;
    reward BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT last_claim_at INTO last_claim
    FROM public.profiles
    WHERE id = user_uuid
    FOR UPDATE;

    IF last_claim IS NULL THEN
        last_claim := now_time;
    END IF;

    SELECT COALESCE(SUM(
        CASE i.quality
            WHEN 'white' THEN 0 * inv.quantity
            WHEN 'green' THEN 0 * inv.quantity
            WHEN 'blue' THEN 1 * inv.quantity
            WHEN 'purple' THEN 5 * inv.quantity
            WHEN 'orange' THEN 10 * inv.quantity
            WHEN 'red' THEN 30 * inv.quantity
            ELSE 0
        END
    ), 0) INTO boost_rate
    FROM public.inventory inv
    JOIN public.items i ON inv.item_id = i.id
    WHERE inv.user_id = user_uuid AND i.item_type = 'collection';

    diff_seconds := GREATEST(EXTRACT(EPOCH FROM (now_time - last_claim)), 0);
    diff_seconds := LEAST(diff_seconds, 480 * 60); -- 最多计算8小时
    diff_minutes := diff_seconds / 60.0;
    total_rate := base_rate + boost_rate;
    reward := FLOOR(diff_minutes * total_rate);

    IF reward <= 0 THEN
        RETURN 0;
    END IF;

    UPDATE public.profiles
    SET shells = shells + reward,
        last_claim_at = now_time
    WHERE id = user_uuid;

    RETURN reward;
END;
$$;

-- ============================================================
-- 8. RPC 函数：开盒
-- ============================================================
DROP FUNCTION IF EXISTS public.open_box();
CREATE OR REPLACE FUNCTION public.open_box()
RETURNS TABLE(out_item_id BIGINT, out_item_name TEXT, out_item_quality TEXT, out_item_image TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    last_open TIMESTAMPTZ;
    now_time TIMESTAMPTZ := now();
    cooldown_seconds INT := 600; -- 10分钟
    total_weight INT;
    random_pick INT;
    selected_item RECORD;
    remaining INT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT profiles.last_open_at INTO last_open
    FROM public.profiles
    WHERE profiles.id = user_uuid
    FOR UPDATE;

    IF EXTRACT(EPOCH FROM (now_time - last_open)) < cooldown_seconds THEN
        RAISE EXCEPTION '冷却中，还需等待 % 秒', (cooldown_seconds - EXTRACT(EPOCH FROM (now_time - last_open)))::INT;
    END IF;

    -- 计算总权重（只计算有权重的物品）
    SELECT COALESCE(SUM(drop_weight), 0) INTO total_weight
    FROM public.items
    WHERE drop_weight > 0;

    IF total_weight <= 0 THEN
        RAISE EXCEPTION '暂无物品可掉落';
    END IF;

    -- 随机选择
    random_pick := floor(random() * total_weight) + 1;
    remaining := random_pick;

    FOR selected_item IN
        SELECT id, name, quality, image_name, drop_weight
        FROM public.items
        WHERE drop_weight > 0
        ORDER BY id
    LOOP
        remaining := remaining - selected_item.drop_weight;
        IF remaining <= 0 THEN
            EXIT;
        END IF;
    END LOOP;

    -- 写入 inventory
    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (user_uuid, selected_item.id, 1)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + 1;

    -- 更新开盒时间
    UPDATE public.profiles
    SET last_open_at = now_time
    WHERE id = user_uuid;

    out_item_id := selected_item.id;
    out_item_name := selected_item.name;
    out_item_quality := selected_item.quality;
    out_item_image := selected_item.image_name;
    RETURN NEXT;
END;
$$;

-- ============================================================
-- 9. RPC 函数：发布市场订单（仅出售）
-- ============================================================
DROP FUNCTION IF EXISTS public.place_market_order(BIGINT, BIGINT, INT);
CREATE OR REPLACE FUNCTION public.place_market_order(p_item_id BIGINT, p_price BIGINT, p_quantity INT DEFAULT 1)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    inv_quantity INT;
    new_order_id BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF p_price <= 0 OR p_quantity <= 0 THEN
        RAISE EXCEPTION '价格和数量必须大于0';
    END IF;

    -- 检查库存并锁定
    SELECT quantity INTO inv_quantity
    FROM public.inventory
    WHERE user_id = user_uuid AND item_id = p_item_id
    FOR UPDATE;

    IF inv_quantity IS NULL OR inv_quantity < p_quantity THEN
        RAISE EXCEPTION '库存不足';
    END IF;

    -- 扣除库存
    UPDATE public.inventory
    SET quantity = quantity - p_quantity
    WHERE user_id = user_uuid AND item_id = p_item_id;

    DELETE FROM public.inventory
    WHERE user_id = user_uuid AND item_id = p_item_id AND quantity <= 0;

    -- 创建订单
    INSERT INTO public.market_orders (seller_id, item_id, quantity, price_per_unit, type, status)
    VALUES (user_uuid, p_item_id, p_quantity, p_price, 'sell', 'active')
    RETURNING id INTO new_order_id;

    RETURN new_order_id;
END;
$$;

-- ============================================================
-- 10. RPC 函数：取消市场订单（下架）
-- ============================================================
DROP FUNCTION IF EXISTS public.cancel_market_order(BIGINT);
CREATE OR REPLACE FUNCTION public.cancel_market_order(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    order_rec RECORD;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT * INTO order_rec
    FROM public.market_orders
    WHERE id = p_order_id AND seller_id = user_uuid AND status = 'active'
    FOR UPDATE;

    IF order_rec IS NULL THEN
        RAISE EXCEPTION '订单不存在或无法取消';
    END IF;

    -- 退回物品
    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (user_uuid, order_rec.item_id, order_rec.quantity)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

    -- 更新订单状态
    UPDATE public.market_orders
    SET status = 'cancelled'
    WHERE id = p_order_id;
END;
$$;

-- ============================================================
-- 11. RPC 函数：购买订单
-- ============================================================
DROP FUNCTION IF EXISTS public.buy_market_order(BIGINT, INT);
CREATE OR REPLACE FUNCTION public.buy_market_order(p_order_id BIGINT, p_quantity INT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    buyer_uuid UUID := auth.uid();
    order_rec RECORD;
    item_name TEXT;
    total_price BIGINT;
    buyer_shells BIGINT;
    buy_qty INT;
    buyer_nickname TEXT;
BEGIN
    IF buyer_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    -- 获取买家昵称
    SELECT nickname INTO buyer_nickname FROM public.profiles WHERE id = buyer_uuid;

    SELECT mo.*, i.name AS item_name INTO order_rec
    FROM public.market_orders mo
    JOIN public.items i ON mo.item_id = i.id
    WHERE mo.id = p_order_id AND mo.status = 'active'
    FOR UPDATE;

    IF order_rec IS NULL THEN
        RAISE EXCEPTION '订单不存在或已失效';
    END IF;

    IF order_rec.seller_id = buyer_uuid THEN
        RAISE EXCEPTION '不能购买自己的订单';
    END IF;

    -- 默认购买全部
    buy_qty := COALESCE(p_quantity, order_rec.quantity);
    
    IF buy_qty <= 0 OR buy_qty > order_rec.quantity THEN
        RAISE EXCEPTION '购买数量无效';
    END IF;

    total_price := order_rec.price_per_unit * buy_qty;
    item_name := order_rec.item_name;

    -- 锁定买家余额
    SELECT shells INTO buyer_shells
    FROM public.profiles
    WHERE id = buyer_uuid
    FOR UPDATE;

    IF buyer_shells < total_price THEN
        RAISE EXCEPTION '果壳币不足';
    END IF;

    -- 扣买家钱
    UPDATE public.profiles
    SET shells = shells - total_price
    WHERE id = buyer_uuid;

    -- 给卖家钱
    UPDATE public.profiles
    SET shells = shells + total_price
    WHERE id = order_rec.seller_id;

    -- 给买家物品
    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (buyer_uuid, order_rec.item_id, buy_qty)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

    -- 如果购买全部，完成订单；否则减少订单数量
    IF buy_qty >= order_rec.quantity THEN
        -- 完成订单
        UPDATE public.market_orders
        SET status = 'completed'
        WHERE id = p_order_id;

        -- 给卖家发送系统邮件
        INSERT INTO public.system_mails (user_id, title, content)
        VALUES (
            order_rec.seller_id,
            '订单出售成功',
            '你上架的「' || item_name || '」已被「' || buyer_nickname || '」全部购买，获得 ' || total_price || ' 果壳币。'
        );
    ELSE
        -- 部分购买，减少订单数量
        UPDATE public.market_orders
        SET quantity = quantity - buy_qty
        WHERE id = p_order_id;

        -- 给卖家发送系统邮件
        INSERT INTO public.system_mails (user_id, title, content)
        VALUES (
            order_rec.seller_id,
            '订单部分出售',
            '你上架的「' || item_name || '」被「' || buyer_nickname || '」购买 ' || buy_qty || ' 件，获得 ' || total_price || ' 果壳币，剩余 ' || (order_rec.quantity - buy_qty) || ' 件。'
        );
    END IF;
END;
$$;

-- ============================================================
-- 12. RPC 函数：获取用户背包
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_inventory();
CREATE OR REPLACE FUNCTION public.get_user_inventory()
RETURNS TABLE(inv_id BIGINT, item_id BIGINT, quantity INT, acquired_at TIMESTAMP, item_name TEXT, item_quality TEXT, item_image TEXT, item_description TEXT, item_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    RETURN QUERY
    SELECT
        inv.id AS inv_id,
        inv.item_id,
        inv.quantity,
        inv.acquired_at AT TIME ZONE 'Asia/Shanghai' AS acquired_at,
        i.name AS item_name,
        i.quality AS item_quality,
        i.image_name AS item_image,
        i.description AS item_description,
        i.item_type AS item_type
    FROM public.inventory inv
    JOIN public.items i ON inv.item_id = i.id
    WHERE inv.user_id = user_uuid
    ORDER BY inv.acquired_at DESC;
END;
$$;

-- 使用改名卡修改昵称
CREATE OR REPLACE FUNCTION public.use_rename_card(p_new_nickname TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    item_def_id BIGINT;
    inv_id BIGINT;
    new_nickname TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    -- 检查昵称长度
    IF p_new_nickname IS NULL OR char_length(trim(p_new_nickname)) < 2 THEN
        RETURN jsonb_build_object('success', false, 'message', '昵称至少需要2个字符');
    END IF;
    
    IF char_length(trim(p_new_nickname)) > 20 THEN
        RETURN jsonb_build_object('success', false, 'message', '昵称不能超过20个字符');
    END IF;
    
    new_nickname := trim(p_new_nickname);
    
    -- 检查是否包含非法字符
    IF new_nickname LIKE '%<%' OR new_nickname LIKE '%>%' OR new_nickname LIKE '%''%' 
       OR new_nickname LIKE '%"%' OR new_nickname LIKE '%\\%' OR new_nickname LIKE '%%;(%' OR new_nickname LIKE '%)%' THEN
        RETURN jsonb_build_object('success', false, 'message', '昵称不能包含特殊字符');
    END IF;
    
    -- 查找改名卡物品定义
    SELECT id INTO item_def_id FROM public.items WHERE name = '改名卡' AND item_type = 'consumable';
    
    IF item_def_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '改名卡不存在');
    END IF;
    
    -- 检查用户是否拥有改名卡
    SELECT id INTO inv_id FROM public.inventory WHERE user_id = user_uuid AND item_id = item_def_id;
    
    IF inv_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '你没有改名卡');
    END IF;
    
       -- 扣除改名卡（数量减1，如果只剩1个则删除记录）
    UPDATE public.inventory SET quantity = quantity - 1 WHERE id = inv_id;
    DELETE FROM public.inventory WHERE id = inv_id AND quantity <= 0;
    
    -- 检查昵称是否已被使用
    IF EXISTS (SELECT 1 FROM public.profiles WHERE nickname = new_nickname AND id != user_uuid) THEN
        RETURN jsonb_build_object('success', false, 'message', '该昵称已被使用');
    END IF;
    
    -- 更新用户昵称
    UPDATE public.profiles SET nickname = new_nickname WHERE id = user_uuid;
    
    RETURN jsonb_build_object('success', true, 'message', '昵称修改成功', 'new_nickname', new_nickname);
END;
$$;

-- ============================================================
-- 13. RPC 函数：获取市场订单（分页+筛选）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_market_orders(INT, INT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.get_market_orders(
    p_page INT DEFAULT 1,
    p_limit INT DEFAULT 10,
    p_quality TEXT DEFAULT NULL,
    p_sort TEXT DEFAULT 'newest',
    p_search TEXT DEFAULT NULL,
    p_type TEXT DEFAULT NULL
)
RETURNS TABLE(
    order_id BIGINT,
    seller_id UUID,
    item_id BIGINT,
    quantity INT,
    price_per_unit BIGINT,
    type TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    item_name TEXT,
    item_quality TEXT,
    item_image TEXT,
    item_description TEXT,
    item_type TEXT,
    seller_nickname TEXT,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    offset_val INT;
    quality_order INT;
BEGIN
    offset_val := (COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 10);

    RETURN QUERY
    SELECT
        mo.id AS order_id,
        mo.seller_id,
        mo.item_id,
        mo.quantity,
        mo.price_per_unit,
        mo.type,
        mo.status,
        mo.created_at,
        i.name AS item_name,
        i.quality AS item_quality,
        i.image_name AS item_image,
        i.description AS item_description,
        i.item_type AS item_type,
        p.nickname AS seller_nickname,
        (
            SELECT COUNT(*) FROM public.market_orders mo2
            JOIN public.items i2 ON mo2.item_id = i2.id
            LEFT JOIN public.profiles p2 ON mo2.seller_id = p2.id
            WHERE mo2.status = 'active'
            AND (p_quality IS NULL OR i2.quality = p_quality)
            AND (p_type IS NULL OR i2.item_type = p_type)
            AND (p_search IS NULL OR i2.name ILIKE '%' || p_search || '%' OR p2.nickname ILIKE '%' || p_search || '%')
        )::BIGINT AS total_count
    FROM public.market_orders mo
    JOIN public.items i ON mo.item_id = i.id
    LEFT JOIN public.profiles p ON mo.seller_id = p.id
    WHERE mo.status = 'active'
    AND (p_quality IS NULL OR i.quality = p_quality)
    AND (p_type IS NULL OR i.item_type = p_type)
    AND (p_search IS NULL OR i.name ILIKE '%' || p_search || '%' OR p.nickname ILIKE '%' || p_search || '%')
    ORDER BY
        CASE COALESCE(p_sort, 'newest')
            WHEN 'price-low' THEN -mo.price_per_unit
            WHEN 'price-high' THEN mo.price_per_unit
            WHEN 'quality' THEN
                CASE i.quality
                    WHEN 'red' THEN 1
                    WHEN 'orange' THEN 2
                    WHEN 'purple' THEN 3
                    WHEN 'blue' THEN 4
                    WHEN 'green' THEN 5
                    WHEN 'white' THEN 6
                    ELSE 7
                END
            ELSE EXTRACT(EPOCH FROM mo.created_at)
        END DESC
    LIMIT p_limit
    OFFSET offset_val;
END;
$$;

-- ============================================================
-- 14. RPC 函数：获取图鉴进度
-- ============================================================
DROP FUNCTION IF EXISTS public.get_collection_progress();
CREATE OR REPLACE FUNCTION public.get_collection_progress()
RETURNS TABLE(item_id BIGINT, item_name TEXT, item_quality TEXT, item_image TEXT, item_description TEXT, item_type TEXT, owned BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    RETURN QUERY
    SELECT
        i.id,
        i.name,
        i.quality,
        i.image_name,
        i.description,
        i.item_type,
        COALESCE(inv.quantity, 0)::BIGINT AS owned
    FROM public.items i
    LEFT JOIN public.inventory inv ON inv.item_id = i.id AND inv.user_id = user_uuid
    ORDER BY
        CASE i.quality
            WHEN 'red' THEN 1
            WHEN 'orange' THEN 2
            WHEN 'purple' THEN 3
            WHEN 'blue' THEN 4
            WHEN 'green' THEN 5
            WHEN 'white' THEN 6
            ELSE 7
        END,
        i.id;
END;
$$;

-- ============================================================
-- 14. RPC 函数：领取广告奖励（每日限领一次，随机 1000-5000）
-- ============================================================
DROP FUNCTION IF EXISTS public.claim_ad_rewards();
CREATE OR REPLACE FUNCTION public.claim_ad_rewards()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    last_claim_date DATE;
    reward BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT ad_claimed_at::DATE INTO last_claim_date
    FROM public.profiles
    WHERE id = user_uuid;

    IF last_claim_date = CURRENT_DATE THEN
        RAISE EXCEPTION '今日已领取过广告奖励，请明天再来';
    END IF;

    reward := FLOOR(1000 + RANDOM() * 4000)::BIGINT;

    UPDATE public.profiles
    SET shells = shells + reward,
        ad_claimed_at = now()
    WHERE id = user_uuid;

    RETURN reward;
END;
$$;

-- ============================================================
-- 15. RPC 函数：获取当前挂机加成
-- ============================================================
DROP FUNCTION IF EXISTS public.get_idle_boost();
CREATE OR REPLACE FUNCTION public.get_idle_boost()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    boost_rate INT := 0;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    SELECT COALESCE(SUM(
        CASE i.quality
            WHEN 'white' THEN 0 * inv.quantity
            WHEN 'green' THEN 0 * inv.quantity
            WHEN 'blue' THEN 1 * inv.quantity
            WHEN 'purple' THEN 5 * inv.quantity
            WHEN 'orange' THEN 10 * inv.quantity
            WHEN 'red' THEN 30 * inv.quantity
            ELSE 0
        END
    ), 0) INTO boost_rate
    FROM public.inventory inv
    JOIN public.items i ON inv.item_id = i.id
    WHERE inv.user_id = user_uuid AND i.item_type = 'collection';

    RETURN boost_rate;
END;
$$;

-- ============================================================
-- 16. RPC 函数：获取用户邮件
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_mails();
CREATE OR REPLACE FUNCTION public.get_user_mails()
RETURNS TABLE(mail_id BIGINT, title TEXT, content TEXT, is_read BOOLEAN, created_at TIMESTAMP)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    RETURN QUERY
    SELECT
        sm.id AS mail_id,
        sm.title,
        sm.content,
        sm.is_read,
        sm.created_at AT TIME ZONE 'Asia/Shanghai' AS created_at
    FROM public.system_mails sm
    WHERE sm.user_id = user_uuid
    ORDER BY sm.created_at DESC;
END;
$$;

-- ============================================================
-- 17. RPC 函数：标记邮件已读
-- ============================================================
DROP FUNCTION IF EXISTS public.mark_mail_read(BIGINT);
CREATE OR REPLACE FUNCTION public.mark_mail_read(p_mail_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    UPDATE public.system_mails
    SET is_read = true
    WHERE id = p_mail_id AND user_id = user_uuid;
END;
$$;

-- ============================================================
-- 18. RPC 函数：检查是否为管理员
-- ============================================================
DROP FUNCTION IF EXISTS public.check_admin();
CREATE OR REPLACE FUNCTION public.check_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    is_admin BOOLEAN;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN false;
    END IF;

    SELECT profiles.is_admin INTO is_admin
    FROM public.profiles
    WHERE id = user_uuid;

    RETURN COALESCE(is_admin, false);
END;
$$;

-- ============================================================
-- 19. RPC 函数：获取所有用户（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_all_users();
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE(user_id UUID, nickname TEXT, shells BIGINT, is_admin BOOLEAN, created_at TIMESTAMP)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    RETURN QUERY
    SELECT
        p.id AS user_id,
        p.nickname,
        p.shells,
        p.is_admin,
        p.created_at AT TIME ZONE 'Asia/Shanghai' AS created_at
    FROM public.profiles p
    ORDER BY p.created_at DESC;
END;
$$;

-- ============================================================
-- 20. RPC 函数：给用户添加物品（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_add_item(UUID, BIGINT, INT);
CREATE OR REPLACE FUNCTION public.admin_add_item(p_user_id UUID, p_item_id BIGINT, p_quantity INT DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (p_user_id, p_item_id, p_quantity)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

    -- 发送系统邮件通知
    INSERT INTO public.system_mails (user_id, title, content)
    SELECT
        p_user_id,
        '收到管理员发放的物品',
        '管理员向您发放了「' || i.name || '」×' || p_quantity || '，请查看背包。'
    FROM public.items i
    WHERE i.id = p_item_id;
END;
$$;

-- ============================================================
-- 21. RPC 函数：获取所有收藏品（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_get_items();
CREATE OR REPLACE FUNCTION public.admin_get_items()
RETURNS TABLE(item_id BIGINT, name TEXT, quality TEXT, image_name TEXT, description TEXT, drop_weight INT, item_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    RETURN QUERY
    SELECT i.id AS item_id, i.name, i.quality, i.image_name, i.description, i.drop_weight, i.item_type
    FROM public.items i
    ORDER BY i.id;
END;
$$;

-- ============================================================
-- 22. RPC 函数：添加物品（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_add_item_definition(TEXT, TEXT, TEXT, TEXT, INT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_add_item_definition(
    p_name TEXT,
    p_quality TEXT,
    p_image_name TEXT,
    p_description TEXT,
    p_drop_weight INT,
    p_item_type TEXT DEFAULT 'collection'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    new_id BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    INSERT INTO public.items (name, quality, image_name, description, drop_weight, item_type)
    VALUES (p_name, p_quality, p_image_name, p_description, p_drop_weight, p_item_type)
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

-- ============================================================
-- 23. RPC 函数：获取系统统计（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_system_stats();
CREATE OR REPLACE FUNCTION public.get_system_stats()
RETURNS TABLE(total_users BIGINT, total_items BIGINT, total_orders BIGINT, total_mails BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM public.profiles)::BIGINT AS total_users,
        (SELECT COUNT(*) FROM public.items)::BIGINT AS total_items,
        (SELECT COUNT(*) FROM public.market_orders)::BIGINT AS total_orders,
        (SELECT COUNT(*) FROM public.system_mails)::BIGINT AS total_mails;
END;
$$;

-- ============================================================
-- 24. RPC 函数：提交物品投稿
-- ============================================================
DROP FUNCTION IF EXISTS public.submit_item(TEXT, TEXT, TEXT, INT);
CREATE OR REPLACE FUNCTION public.submit_item(
    p_name TEXT,
    p_quality TEXT,
    p_description TEXT,
    p_drop_weight INT DEFAULT 100
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    new_id BIGINT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    INSERT INTO public.item_submissions (user_id, name, quality, description, drop_weight)
    VALUES (user_uuid, p_name, p_quality, p_description, p_drop_weight)
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

-- ============================================================
-- 25. RPC 函数：获取我的投稿
-- ============================================================
DROP FUNCTION IF EXISTS public.get_my_submissions();
CREATE OR REPLACE FUNCTION public.get_my_submissions()
RETURNS TABLE(id BIGINT, name TEXT, quality TEXT, description TEXT, drop_weight INT, status TEXT, reward_shells BIGINT, admin_note TEXT, created_at TIMESTAMP)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.name,
        s.quality,
        s.description,
        s.drop_weight,
        s.status,
        s.reward_shells,
        s.admin_note,
        s.created_at AT TIME ZONE 'Asia/Shanghai' AS created_at
    FROM public.item_submissions s
    WHERE s.user_id = user_uuid
    ORDER BY s.created_at DESC;
END;
$$;

-- ============================================================
-- 26. RPC 函数：获取待审核投稿（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_pending_submissions();
CREATE OR REPLACE FUNCTION public.get_pending_submissions()
RETURNS TABLE(id BIGINT, user_id UUID, nickname TEXT, name TEXT, quality TEXT, description TEXT, drop_weight INT, status TEXT, reward_shells BIGINT, admin_note TEXT, created_at TIMESTAMP)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.user_id,
        p.nickname,
        s.name,
        s.quality,
        s.description,
        s.drop_weight,
        s.status,
        s.reward_shells,
        s.admin_note,
        s.created_at AT TIME ZONE 'Asia/Shanghai' AS created_at
    FROM public.item_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.status = 'pending'
    ORDER BY s.created_at ASC;
END;
$$;

-- ============================================================
-- 27. RPC 函数：审核通过投稿（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.approve_submission(BIGINT, BIGINT);
CREATE OR REPLACE FUNCTION public.approve_submission(p_submission_id BIGINT, p_reward_shells BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    submitter_id UUID;
    submitter_nickname TEXT;
    item_name TEXT;
    item_quality TEXT;
    item_description TEXT;
    item_drop_weight INT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    SELECT s.user_id, s.name, s.quality, s.description, s.drop_weight, p.nickname
    INTO submitter_id, item_name, item_quality, item_description, item_drop_weight, submitter_nickname
    FROM public.item_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.id = p_submission_id AND s.status = 'pending';

    IF submitter_id IS NULL THEN
        RAISE EXCEPTION '投稿不存在或已处理';
    END IF;

    INSERT INTO public.items (name, quality, image_name, description, drop_weight)
    VALUES (item_name, item_quality, '', item_description, item_drop_weight);

    UPDATE public.item_submissions
    SET status = 'approved', reward_shells = p_reward_shells, updated_at = now()
    WHERE id = p_submission_id;

    UPDATE public.profiles
    SET shells = shells + p_reward_shells
    WHERE id = submitter_id;

    INSERT INTO public.system_mails (user_id, title, content)
    VALUES (submitter_id, '投稿通过',
        '恭喜！您投稿的「' || item_name || '」已通过审核，获得 ' || p_reward_shells || ' 果壳币奖励！');
END;
$$;

-- ============================================================
-- 28. RPC 函数：拒绝投稿（管理员）
-- ============================================================
DROP FUNCTION IF EXISTS public.reject_submission(BIGINT, TEXT);
CREATE OR REPLACE FUNCTION public.reject_submission(p_submission_id BIGINT, p_admin_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    submitter_id UUID;
    item_name TEXT;
BEGIN
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION '未登录';
    END IF;

    IF NOT public.check_admin() THEN
        RAISE EXCEPTION '无权限';
    END IF;

    SELECT s.user_id, s.name
    INTO submitter_id, item_name
    FROM public.item_submissions s
    WHERE s.id = p_submission_id AND s.status = 'pending';

    IF submitter_id IS NULL THEN
        RAISE EXCEPTION '投稿不存在或已处理';
    END IF;

    UPDATE public.item_submissions
    SET status = 'rejected', admin_note = p_admin_note, updated_at = now()
    WHERE id = p_submission_id;

    INSERT INTO public.system_mails (user_id, title, content)
    VALUES (submitter_id, '投稿未通过',
        '您投稿的「' || item_name || '」未通过审核。原因：' || COALESCE(p_admin_note, '无'));
END;
$$;

-- ============================================================
-- 29. RPC 函数：使用端午节福袋
-- ============================================================
DROP FUNCTION IF EXISTS public.use_dragon_boat_bag();
CREATE OR REPLACE FUNCTION public.use_dragon_boat_bag()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    bag_item_id BIGINT;
    inv_id BIGINT;
    selected_item RECORD;
    total_weight NUMERIC;
    random_pick NUMERIC;
    remaining NUMERIC;
    item_row RECORD;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;
    
    -- 查找端午节福袋物品定义
    SELECT id INTO bag_item_id FROM public.items WHERE name = '端午节福袋' AND item_type = 'consumable';
    
    IF bag_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '端午节福袋不存在');
    END IF;
    
    -- 检查用户是否拥有福袋
    SELECT id INTO inv_id FROM public.inventory WHERE user_id = user_uuid AND item_id = bag_item_id;
    
    IF inv_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '你没有端午节福袋');
    END IF;
    
    -- 计算端午收藏品的总权重
    -- 如果drop_weight全为0，则使用固定权重：白色100，绿色80，蓝色50，紫色30，橙色15，红色5
    SELECT COALESCE(SUM(
        CASE 
            WHEN i.drop_weight > 0 THEN i.drop_weight
            WHEN i.quality = 'white' THEN 100
            WHEN i.quality = 'green' THEN 80
            WHEN i.quality = 'blue' THEN 50
            WHEN i.quality = 'purple' THEN 30
            WHEN i.quality = 'orange' THEN 15
            WHEN i.quality = 'red' THEN 5
            ELSE 50
        END
    ), 0) INTO total_weight
    FROM public.items i
    WHERE i.item_type = 'collection' AND i.name IN ('粽子', '艾草香囊', '龙舟模型', '五彩绳', '雄黄酒', '离骚');
    
    IF total_weight <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', '端午节收藏品暂不可用');
    END IF;
    
    -- 随机选择
    random_pick := floor(random() * total_weight) + 1;
    remaining := random_pick;
    
    FOR item_row IN
        SELECT i.id, i.name, i.quality, i.image_name, 
            CASE 
                WHEN i.drop_weight > 0 THEN i.drop_weight
                WHEN i.quality = 'white' THEN 100
                WHEN i.quality = 'green' THEN 80
                WHEN i.quality = 'blue' THEN 50
                WHEN i.quality = 'purple' THEN 30
                WHEN i.quality = 'orange' THEN 15
                WHEN i.quality = 'red' THEN 5
                ELSE 50
            END AS effective_weight
        FROM public.items i
        WHERE i.item_type = 'collection' AND i.name IN ('粽子', '艾草香囊', '龙舟模型', '五彩绳', '雄黄酒', '《离骚》')
        ORDER BY i.id
    LOOP
        remaining := remaining - item_row.effective_weight;
        IF remaining <= 0 THEN
            selected_item := item_row;
            EXIT;
        END IF;
    END LOOP;
    
    IF selected_item IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '端午节福袋暂不可用');
    END IF;
    
    -- 扣除一个福袋（只减数量，不删除整行）
    UPDATE public.inventory SET quantity = quantity - 1 WHERE id = inv_id;

    -- 如果数量为0，删除该行
    DELETE FROM public.inventory WHERE id = inv_id AND quantity <= 0;
    
    -- 给用户随机收藏品
    INSERT INTO public.inventory (user_id, item_id, quantity)
    VALUES (user_uuid, selected_item.id, 1)
    ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
    DO UPDATE SET quantity = public.inventory.quantity + 1;
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', '恭喜获得「' || selected_item.name || '」！',
        'item_id', selected_item.id,
        'item_name', selected_item.name,
        'item_quality', selected_item.quality,
        'item_image', selected_item.image_name
    );
END;
$$;

-- ============================================================
-- 30. RPC 函数：端午活动 - 更新在线时间并领取在线礼包
-- ============================================================
DROP FUNCTION IF EXISTS public.claim_dragon_boat_online();
CREATE OR REPLACE FUNCTION public.claim_dragon_boat_online()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    now_time TIMESTAMPTZ := now();
    is_dragon_boat BOOLEAN;
    v_online_total INT;
    v_last_update TIMESTAMPTZ;
    v_daily_reset DATE;
    bag_item_id BIGINT;
    selected_item RECORD;
    v_claimed_1min BOOLEAN;
    v_claimed_10min BOOLEAN;
    v_claimed_60min BOOLEAN;
    claimed_1 BOOLEAN := false;
    claimed_10 BOOLEAN := false;
    claimed_60 BOOLEAN := false;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;
    
    -- 检查是否为端午期间（6月19日）
    is_dragon_boat := CURRENT_DATE = '2026-06-19';
    
    IF NOT is_dragon_boat THEN
        RETURN jsonb_build_object('success', false, 'message', '端午活动已结束', 'is_dragon_boat', false);
    END IF;
    
    -- 获取或初始化活动进度
    SELECT online_total, last_update, claimed_1min, claimed_10min, claimed_60min, daily_reset
    INTO v_online_total, v_last_update, v_claimed_1min, v_claimed_10min, v_claimed_60min, v_daily_reset
    FROM public.dragon_boat_progress
    WHERE user_id = user_uuid;
    
    -- 如果没有记录，插入新记录
    IF v_online_total IS NULL THEN
        INSERT INTO public.dragon_boat_progress (user_id, online_total, last_update, claimed_1min, claimed_10min, claimed_60min, daily_reset)
        VALUES (user_uuid, 0, now_time, false, false, false, CURRENT_DATE);
        v_online_total := 0;
        v_last_update := now_time;
        v_claimed_1min := false;
        v_claimed_10min := false;
        v_claimed_60min := false;
        v_daily_reset := CURRENT_DATE;
    END IF;
    
    -- 检查是否需要重置（每日重置）
    IF v_daily_reset IS NULL OR v_daily_reset < CURRENT_DATE THEN
        UPDATE public.dragon_boat_progress 
        SET claimed_1min = false,
            claimed_10min = false,
            claimed_60min = false,
            daily_reset = CURRENT_DATE,
            last_update = now_time
        WHERE user_id = user_uuid;
        v_claimed_1min := false;
        v_claimed_10min := false;
        v_claimed_60min := false;
        v_daily_reset := CURRENT_DATE;
    END IF;
    
    -- 计算新增在线时间（最多计算到60分钟）
    IF v_last_update IS NOT NULL THEN
        v_online_total := v_online_total + LEAST(EXTRACT(EPOCH FROM (now_time - v_last_update))::INT, 3600);
    END IF;
    v_online_total := LEAST(v_online_total, 3600);
    
    -- 更新在线时间
    UPDATE public.dragon_boat_progress 
    SET online_total = v_online_total,
        last_update = now_time
    WHERE user_id = user_uuid;
    
    -- 查找端午福袋物品定义
    SELECT id INTO bag_item_id FROM public.items WHERE name = '端午节福袋' AND item_type = 'consumable';
    
    IF bag_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '端午节福袋不存在');
    END IF;
    
    -- 检查并领取1分钟奖励
    IF v_online_total >= 60 AND NOT v_claimed_1min THEN
        INSERT INTO public.inventory (user_id, item_id, quantity)
        VALUES (user_uuid, bag_item_id, 1)
        ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
        DO UPDATE SET quantity = public.inventory.quantity + 1;
        
        UPDATE public.dragon_boat_progress SET claimed_1min = true WHERE user_id = user_uuid;
        claimed_1 := true;
    END IF;
    
    -- 检查并领取10分钟奖励
    IF v_online_total >= 600 AND NOT v_claimed_10min THEN
        INSERT INTO public.inventory (user_id, item_id, quantity)
        VALUES (user_uuid, bag_item_id, 2)
        ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
        DO UPDATE SET quantity = public.inventory.quantity + 2;
        
        UPDATE public.dragon_boat_progress SET claimed_10min = true WHERE user_id = user_uuid;
        claimed_10 := true;
    END IF;
    
    -- 检查并领取60分钟奖励
    IF v_online_total >= 3600 AND NOT v_claimed_60min THEN
        INSERT INTO public.inventory (user_id, item_id, quantity)
        VALUES (user_uuid, bag_item_id, 3)
        ON CONFLICT ON CONSTRAINT inventory_user_id_item_id_key
        DO UPDATE SET quantity = public.inventory.quantity + 3;
        
        UPDATE public.dragon_boat_progress SET claimed_60min = true WHERE user_id = user_uuid;
        claimed_60 := true;
    END IF;
    
    -- 更新返回结果
    RETURN jsonb_build_object(
        'success', true,
        'online_total', v_online_total,
        'claimed_1min', claimed_1 OR v_claimed_1min,
        'claimed_10min', claimed_10 OR v_claimed_10min,
        'claimed_60min', claimed_60 OR v_claimed_60min
    );
END;
$$;

-- ============================================================
-- 31. RPC 函数：彩票 - 获取当前期次
-- ============================================================
DROP FUNCTION IF EXISTS public.get_lottery_round();
CREATE OR REPLACE FUNCTION public.get_lottery_round()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    current_round RECORD;
    user_ticket_count INT := 0;
    time_left INT;
BEGIN
    -- 查找当前活跃期次
    SELECT * INTO current_round FROM public.lottery_rounds
    WHERE status = 'active' OR (status = 'closed' AND winning_numbers IS NULL)
    ORDER BY public.lottery_rounds.round_id DESC
    LIMIT 1;

    -- 如果没有期次，创建新期次
    IF current_round IS NULL THEN
        INSERT INTO public.lottery_rounds (round_number, start_time, end_time, base_pool, rollover_pool, status)
        VALUES (
            'R' || to_char(now(), 'YYYYMMDDHH24MI'),
            now(),
            now() + INTERVAL '8 hours',
            5000,
            0,
            'active'
        )
        RETURNING * INTO current_round;
    END IF;

    -- 检查期次是否已过期需要关闭
    IF current_round.status = 'active' AND current_round.end_time < now() THEN
        UPDATE public.lottery_rounds SET status = 'closed' WHERE round_id = current_round.round_id;
        current_round.status := 'closed';
    END IF;

    -- 计算剩余时间
    IF current_round.status = 'active' THEN
        time_left := GREATEST(0, EXTRACT(EPOCH FROM (current_round.end_time - now())));
    ELSE
        time_left := 0;
    END IF;

    -- 统计用户已购彩票数（按数量计算）
    IF user_uuid IS NOT NULL THEN
        SELECT COALESCE(SUM(lottery_tickets.quantity), 0) INTO user_ticket_count FROM public.lottery_tickets
        WHERE lottery_tickets.round_id = current_round.round_id AND lottery_tickets.user_id = user_uuid;
    END IF;

    RETURN jsonb_build_object(
        'round_id', current_round.round_id,
        'round_number', current_round.round_number,
        'start_time', current_round.start_time AT TIME ZONE 'Asia/Shanghai',
        'end_time', current_round.end_time AT TIME ZONE 'Asia/Shanghai',
        'base_pool', current_round.base_pool,
        'rollover_pool', current_round.rollover_pool,
        'total_pool', current_round.base_pool + current_round.rollover_pool,
        'winning_numbers', current_round.winning_numbers,
        'status', current_round.status,
        'time_left', time_left,
        'user_ticket_count', user_ticket_count,
        'max_tickets', 30,
        'ticket_price', 100
    );
END;
$$;

-- ============================================================
-- 32. RPC 函数：彩票 - 购买彩票
-- ============================================================
DROP FUNCTION IF EXISTS public.buy_lottery_ticket(numbers TEXT);
DROP FUNCTION IF EXISTS public.buy_lottery_ticket(numbers TEXT, quantity INT);
DROP FUNCTION IF EXISTS public.buy_lottery_ticket(numbers TEXT, p_quantity INT);
DROP FUNCTION IF EXISTS public.buy_lottery_ticket(p_numbers TEXT, p_quantity INT);
CREATE OR REPLACE FUNCTION public.buy_lottery_ticket(p_numbers TEXT, p_quantity INT DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    current_round RECORD;
    ticket_price BIGINT := 100;
    max_tickets INT := 30;
    user_ticket_count INT := 0;
    existing_quantity INT := 0;
    total_cost BIGINT;
    clean_numbers TEXT;
    char_arr TEXT[];
    i INT;
    j INT;
    has_duplicate BOOLEAN := false;
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    -- 验证数量参数
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        p_quantity := 1;
    END IF;
    IF p_quantity > 10 THEN
        RETURN jsonb_build_object('success', false, 'message', '单次最多购买10注');
    END IF;

    -- 获取当前期次
    SELECT * INTO current_round FROM public.lottery_rounds
    WHERE status = 'active'
    ORDER BY public.lottery_rounds.round_id DESC
    LIMIT 1;

    IF current_round IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '暂无可用期次');
    END IF;

    IF current_round.end_time < now() THEN
        RETURN jsonb_build_object('success', false, 'message', '本期已结束');
    END IF;

    -- 验证号码格式
    clean_numbers := UPPER(TRIM(p_numbers));
    
    IF LENGTH(clean_numbers) != 6 THEN
        RETURN jsonb_build_object('success', false, 'message', '请选择6个号码');
    END IF;

    IF clean_numbers !~ '^[0-9A-F]{6}$' THEN
        RETURN jsonb_build_object('success', false, 'message', '号码只能包含0-9和A-F');
    END IF;

    -- 检查是否有重复字符
    char_arr := REGEXP_SPLIT_TO_ARRAY(clean_numbers, '');
    FOR i IN 1..6 LOOP
        FOR j IN (i+1)..6 LOOP
            IF char_arr[i] = char_arr[j] THEN
                has_duplicate := true;
                EXIT;
            END IF;
        END LOOP;
        IF has_duplicate THEN EXIT; END IF;
    END LOOP;

    IF has_duplicate THEN
        RETURN jsonb_build_object('success', false, 'message', '号码不能重复');
    END IF;

    clean_numbers := (
        SELECT string_agg(c, '') FROM (
            SELECT unnest(REGEXP_SPLIT_TO_ARRAY(clean_numbers, '')) AS c
            ORDER BY c
        ) AS t
    );

    -- 检查限购（按数量计算）
    SELECT COALESCE(SUM(lt.quantity), 0) INTO user_ticket_count FROM public.lottery_tickets lt
    WHERE lt.round_id = current_round.round_id AND lt.user_id = user_uuid;

    -- 检查是否已有相同号码，获取现有数量
    SELECT COALESCE(lt.quantity, 0) INTO existing_quantity FROM public.lottery_tickets lt
    WHERE lt.round_id = current_round.round_id AND lt.user_id = user_uuid AND lt.numbers = clean_numbers;

    -- 计算购买后的总数量
    IF user_ticket_count + p_quantity > max_tickets THEN
        RETURN jsonb_build_object('success', false, 'message', '单期限购30注，当前已购' || user_ticket_count || '注');
    END IF;

    total_cost := ticket_price * p_quantity;

    -- 检查余额
    PERFORM 1 FROM public.profiles WHERE id = user_uuid AND shells >= total_cost FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', '果壳币不足，需要' || total_cost || '果壳币');
    END IF;

    -- 扣除果壳币
    UPDATE public.profiles SET shells = shells - total_cost WHERE id = user_uuid;

    -- 添加到奖池
    UPDATE public.lottery_rounds SET base_pool = base_pool + total_cost WHERE round_id = current_round.round_id;

    -- 插入或更新彩票记录（合并相同号码）
    INSERT INTO public.lottery_tickets (round_id, user_id, numbers, quantity)
    VALUES (current_round.round_id, user_uuid, clean_numbers, p_quantity)
    ON CONFLICT (round_id, user_id, numbers) DO UPDATE
    SET quantity = lottery_tickets.quantity + EXCLUDED.quantity;

    RETURN jsonb_build_object(
        'success', true,
        'message', '购买成功',
        'numbers', clean_numbers,
        'quantity', p_quantity,
        'total_quantity', existing_quantity + p_quantity,
        'round_number', current_round.round_number,
        'remaining_tickets', max_tickets - user_ticket_count - p_quantity,
        'cost', total_cost
    );
END;
$$;

-- ============================================================
-- 33. RPC 函数：彩票 - 开奖
-- ============================================================
DROP FUNCTION IF EXISTS public.draw_lottery_round(BIGINT);
DROP FUNCTION IF EXISTS public.draw_lottery_round(BIGINT, TEXT);
CREATE OR REPLACE FUNCTION public.draw_lottery_round(p_round_id BIGINT, custom_numbers TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
    v_round RECORD;
    v_winning_numbers TEXT;
    v_total_pool BIGINT;
    v_tickets RECORD;
    v_matched_count INT;
    v_prize_level TEXT;
    v_prize_amount BIGINT;
    v_pool_share NUMERIC;
    v_winners INT;
    v_people INT;
    v_rollover_amount BIGINT;
    v_winner RECORD;
    v_prize_details TEXT;
    v_total_prize BIGINT;
    v_total_prize_distributed BIGINT;
    v_prize_pool_share BIGINT;
    
    prizes JSONB := '[{"level":"特等奖","matches":[6],"share":0.3},{"level":"一等奖","matches":[5],"share":0.2},{"level":"二等奖","matches":[4],"share":0.15},{"level":"三等奖","matches":[3],"share":0.15},{"level":"幸运奖","matches":[1,2],"share":0.2}]';
    v_prize RECORD;
BEGIN
    SELECT * INTO v_round FROM public.lottery_rounds WHERE lottery_rounds.round_id = p_round_id;

    IF v_round IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '期次不存在');
    END IF;

    IF v_round.status = 'drawn' THEN
        RETURN jsonb_build_object('success', false, 'message', '已开奖');
    END IF;

    IF v_round.end_time > now() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = user_uuid AND is_admin = true) THEN
        RETURN jsonb_build_object('success', false, 'message', '权限不足');
    END IF;

    IF custom_numbers IS NOT NULL THEN
        v_winning_numbers := UPPER(TRIM(custom_numbers));
        IF LENGTH(v_winning_numbers) != 6 OR v_winning_numbers !~ '^[0-9A-F]{6}$' THEN
            RETURN jsonb_build_object('success', false, 'message', '自定义号码格式错误');
        END IF;
        -- 排序自定义号码
        v_winning_numbers := (
            SELECT string_agg(c, '') FROM (
                SELECT unnest(REGEXP_SPLIT_TO_ARRAY(v_winning_numbers, '')) AS c
                ORDER BY c
            ) AS t
        );
    ELSE
        -- 随机生成6个不重复的号码并排序
        v_winning_numbers := (
            SELECT string_agg(c, '' ORDER BY c) FROM (
                SELECT c FROM unnest(ARRAY['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F']) AS c
                ORDER BY random()
                LIMIT 6
            ) AS t
        );
    END IF;

    v_total_pool := v_round.base_pool + v_round.rollover_pool;
    v_rollover_amount := 0;
    v_total_prize_distributed := 0;

    -- 计算每个奖项的中奖情况，同时累计未中奖滚存和中奖后剩余
    FOR v_prize IN SELECT * FROM jsonb_to_recordset(prizes) AS x(level TEXT, matches INT[], share NUMERIC) LOOP
        v_winners := 0;
        v_people := 0;
        v_prize_pool_share := FLOOR(v_total_pool * v_prize.share);
        
        SELECT COALESCE(SUM(lt.quantity), 0) INTO v_winners 
        FROM public.lottery_tickets lt
        WHERE lt.round_id = p_round_id 
        AND lt.is_winning = false
        AND (SELECT CAST(COUNT(*) AS INT) FROM unnest(REGEXP_SPLIT_TO_ARRAY(lt.numbers, '')) AS n 
             WHERE n = ANY(REGEXP_SPLIT_TO_ARRAY(v_winning_numbers, ''))) = ANY(v_prize.matches);
        
        SELECT COUNT(DISTINCT lt.user_id) INTO v_people 
        FROM public.lottery_tickets lt
        WHERE lt.round_id = p_round_id 
        AND lt.is_winning = false
        AND (SELECT CAST(COUNT(*) AS INT) FROM unnest(REGEXP_SPLIT_TO_ARRAY(lt.numbers, '')) AS n 
             WHERE n = ANY(REGEXP_SPLIT_TO_ARRAY(v_winning_numbers, ''))) = ANY(v_prize.matches);
        
        IF v_winners > 0 THEN
            v_prize_amount := v_prize_pool_share / v_winners;
            v_total_prize_distributed := v_total_prize_distributed + v_prize_pool_share;
            
            UPDATE public.lottery_tickets t
            SET is_winning = true,
                prize_level = v_prize.level,
                prize_amount = v_prize_amount * t.quantity
            WHERE t.round_id = p_round_id
            AND t.is_winning = false
            AND (SELECT CAST(COUNT(*) AS INT) FROM unnest(REGEXP_SPLIT_TO_ARRAY(t.numbers, '')) AS n 
                 WHERE n = ANY(REGEXP_SPLIT_TO_ARRAY(v_winning_numbers, ''))) = ANY(v_prize.matches);
        ELSE
            v_rollover_amount := v_rollover_amount + v_prize_pool_share;
        END IF;

        INSERT INTO public.lottery_results (round_id, prize_level, pool_share, total_winners, total_people, rollover_amount)
        VALUES (p_round_id, v_prize.level, v_prize.share, v_winners, v_people, v_prize_pool_share);
    END LOOP;

    -- 更新本期为已开奖，并记录最终奖池和剩余滚存
    UPDATE public.lottery_rounds 
    SET winning_numbers = v_winning_numbers,
        status = 'drawn',
        final_pool = v_total_pool,
        rollover_pool = v_rollover_amount
    WHERE lottery_rounds.round_id = p_round_id;

    -- 创建新期次，滚存 = 本期剩余未分配金额
    INSERT INTO public.lottery_rounds (round_number, start_time, end_time, base_pool, rollover_pool, status)
    VALUES (
        'R' || to_char(now(), 'YYYYMMDDHH24MI'),
        now(),
        now() + INTERVAL '8 hours',
        5000,
        v_rollover_amount,
        'active'
    );

    -- 发放奖金
    UPDATE public.profiles p
    SET shells = shells + COALESCE((SELECT SUM(prize_amount) FROM public.lottery_tickets t WHERE t.user_id = p.id AND t.round_id = p_round_id), 0)
    WHERE EXISTS (SELECT 1 FROM public.lottery_tickets t WHERE t.user_id = p.id AND t.round_id = p_round_id AND t.is_winning = true);

    -- 给中奖用户发送邮件通知
    FOR v_winner IN SELECT DISTINCT t.user_id FROM public.lottery_tickets t WHERE t.round_id = p_round_id AND t.is_winning = true LOOP
        -- 获取用户中奖详情
        SELECT array_to_string(array_agg(t.prize_level || ' ' || t.prize_amount || '果壳币'), '，') INTO v_prize_details
        FROM public.lottery_tickets t WHERE t.user_id = v_winner.user_id AND t.round_id = p_round_id AND t.is_winning = true;
        
        SELECT SUM(t.prize_amount) INTO v_total_prize FROM public.lottery_tickets t WHERE t.user_id = v_winner.user_id AND t.round_id = p_round_id AND t.is_winning = true;
        
        INSERT INTO public.system_mails (user_id, title, content)
        VALUES (
            v_winner.user_id,
            '恭喜中奖！',
            '你在第 ' || v_round.round_number || ' 期彩票中获奖项：' || COALESCE(v_prize_details, '') || '，总计获得 ' || COALESCE(v_total_prize, 0) || ' 果壳币。'
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', '开奖完成',
        'round_id', p_round_id,
        'winning_numbers', v_winning_numbers,
        'total_pool', v_total_pool
    );
END;
$$;

-- ============================================================
-- 34. RPC 函数：彩票 - 获取往期开奖记录
-- ============================================================
DROP FUNCTION IF EXISTS public.get_lottery_history(limit_num INT);
CREATE OR REPLACE FUNCTION public.get_lottery_history(limit_num INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF limit_num IS NULL OR limit_num <= 0 THEN
        limit_num := 10;
    END IF;

    RETURN (
        SELECT jsonb_agg(row) FROM (
            SELECT 
                r.round_id,
                r.round_number,
                r.end_time AT TIME ZONE 'Asia/Shanghai' AS end_time,
                r.winning_numbers,
                COALESCE(r.final_pool, r.base_pool + r.rollover_pool) AS total_pool,
                r.status,
                (SELECT jsonb_agg(
                    jsonb_build_object(
                        'prize_level', lr.prize_level,
                        'pool_share', lr.pool_share,
                        'total_winners', lr.total_winners,
                        'total_people', lr.total_people,
                        'rollover_amount', lr.rollover_amount
                    )
                ) FROM public.lottery_results lr WHERE lr.round_id = r.round_id) AS results,
                (SELECT jsonb_agg(
                    jsonb_build_object(
                        'numbers', lt.numbers,
                        'quantity', lt.quantity,
                        'is_winning', lt.is_winning,
                        'prize_level', lt.prize_level,
                        'prize_amount', lt.prize_amount
                    )
                ) FROM public.lottery_tickets lt 
                 WHERE lt.round_id = r.round_id AND lt.user_id = user_uuid) AS user_tickets
            FROM public.lottery_rounds r
            WHERE r.status = 'drawn'
            ORDER BY r.round_id DESC
            LIMIT limit_num
        ) AS row
    );
END;
$$;

-- ============================================================
-- 35. RPC 函数：彩票 - 获取用户彩票（修复模糊列round_id）
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_tickets(BIGINT);
DROP FUNCTION IF EXISTS public.get_user_tickets(p_round_id BIGINT);
CREATE OR REPLACE FUNCTION public.get_user_tickets(p_round_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid UUID := auth.uid();
BEGIN
    IF user_uuid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', '请先登录');
    END IF;

    RETURN (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', data.id,
                'numbers', data.numbers,
                'quantity', data.quantity,
                'is_winning', data.is_winning,
                'prize_level', data.prize_level,
                'prize_amount', data.prize_amount,
                'created_at', data.created_at
            )
        ) FROM (
            SELECT 
                t.id,
                t.numbers,
                t.quantity,
                t.is_winning,
                t.prize_level,
                t.prize_amount,
                t.created_at
            FROM public.lottery_tickets t
            WHERE t.user_id = user_uuid AND t.round_id = p_round_id
            ORDER BY t.created_at DESC
        ) AS data
    );
END;
$$;
