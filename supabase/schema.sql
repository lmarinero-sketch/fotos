-- ============================================
-- PhotoDrop — Database Schema (Supabase PostgreSQL)
-- ============================================

-- Órdenes / Tickets
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_code VARCHAR(10) UNIQUE NOT NULL,         -- PD-A7X9K2
    event_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    photographer_phone TEXT,
    status VARCHAR(20) DEFAULT 'awaiting_payment',
    -- Estados: awaiting_payment → payment_received → approved → sending → delivered
    --          awaiting_payment → expired (sin pago en 24hs)
    --          payment_received → rejected
    total_price INTEGER DEFAULT 0,                    -- En pesos (sin decimales)
    receipt_url TEXT,                                  -- URL del comprobante de pago
    whatsapp_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    download_count INTEGER DEFAULT 0                  -- Fotos efectivamente enviadas
);

-- Fotos individuales del pedido
CREATE TABLE order_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    photo_name TEXT NOT NULL,
    drive_file_id TEXT,                               -- Google Drive file ID
    drive_download_url TEXT,                           -- URL de descarga directa
    thumbnail_url TEXT,                                -- URL del thumbnail
    file_size BIGINT,
    sent_via_whatsapp BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX idx_orders_ticket ON orders(ticket_code);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_client ON orders(client_phone);
CREATE INDEX idx_photos_order ON order_photos(order_id);

-- RLS (Row Level Security)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_photos ENABLE ROW LEVEL SECURITY;

-- Service role tiene acceso total (edge functions)
-- Las políticas públicas solo para la web (si se usa como respaldo)
CREATE POLICY "Public can view approved orders"
    ON orders FOR SELECT
    USING (status IN ('approved', 'delivered'));

CREATE POLICY "Public can view photos of approved orders"
    ON order_photos FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM orders 
            WHERE orders.id = order_photos.order_id 
            AND orders.status IN ('approved', 'delivered')
        )
    );

-- Edge functions usan service_role_key que bypasea RLS
