ALTER TABLE users
  MODIFY COLUMN role ENUM('admin', 'photographer', 'client') NOT NULL DEFAULT 'client';

ALTER TABLE users ADD COLUMN photographer_status ENUM('pending', 'approved', 'rejected') NULL;
ALTER TABLE users ADD COLUMN public_slug VARCHAR(160) NULL;
ALTER TABLE galleries ADD COLUMN featured TINYINT(1) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX uniq_users_public_slug ON users (public_slug);

UPDATE galleries g
JOIN users u ON u.id = g.admin_id
SET g.featured = 1
WHERE u.role = 'admin';
