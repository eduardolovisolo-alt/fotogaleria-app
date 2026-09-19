ALTER TABLE galleries ADD COLUMN author VARCHAR(150) NULL;
ALTER TABLE galleries ADD COLUMN apply_watermark TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE galleries ADD COLUMN discount_tiers TEXT NULL;
ALTER TABLE users ADD COLUMN order_auto_delete_days INT NULL;
ALTER TABLE orders ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE orders MODIFY COLUMN status ENUM('pending', 'paid', 'shipped', 'cancelled') NOT NULL DEFAULT 'pending';
